import { DataSource, Repository, EntityManager, QueryRunner } from "typeorm";
import { Tenant, Role, Permission, User, UserRole, RolePermission, buildDataSourceOptions } from "@repo/database";
import { PasswordService } from "@repo/security";
import type { PostgresConnectionOptions } from "typeorm/driver/postgres/PostgresConnectionOptions";

const PLATFORM_NAME = process.env["SENTRY_PLATFORM_NAME"] ?? "Scrolloop Sentry";
const PLATFORM_SLUG = process.env["SENTRY_PLATFORM_SLUG"] ?? "sentry";
const PLATFORM_ROLE = `${PLATFORM_SLUG}-internal`;

/**
 * Seed the platform tenant, system roles, and permissions.
 * Does NOT create any users — that is done via `npm run setup` (CLI) or the /setup wizard.
 *
 * Safe to re-run: all inserts are idempotent (slug/name uniqueness checks).
 */
export async function seed(existingDataSource?: DataSource): Promise<void> {
  let dataSource: DataSource;
  let queryRunner: QueryRunner | null = null;
  let ownsConnection = false;

  if (existingDataSource) {
    dataSource = existingDataSource;
  } else {
    dataSource = new DataSource({
      ...buildDataSourceOptions(),
      migrationsRun: false,
    } as PostgresConnectionOptions);
    await dataSource.initialize();
    ownsConnection = true;
    console.log("🔌 Connected to database");
  }

  try {
    queryRunner = dataSource.createQueryRunner();
    await queryRunner.connect();

    const schemaName = `fk_${PLATFORM_SLUG}`;
    await queryRunner.query(`CREATE SCHEMA IF NOT EXISTS "${schemaName}"`);

    const tables = [
      "users",
      "sessions",
      "roles",
      "permissions",
      "user_roles",
      "role_permissions",
      "mfa_settings",
      "webauthn_credentials",
      "security_events",
      "oauth_clients",
      "oauth_authorization_codes",
      "oauth_access_tokens",
      "oauth_refresh_tokens",
      "oauth_consents",
      "tenant_branding",
      "tenant_social_providers",
      "social_link_requests",
      "policies",
      "groups",
      "user_groups",
      "group_policies",
      "user_policies",
      "role_policies",
      "user_social_connections",
      "user_invites",
      "webhook_endpoints",
      "webhook_deliveries",
      "saml_service_providers",
      "scim_tokens",
      "ldap_connections",
      "tenant_mfa_policy",
    ];

    for (const table of tables) {
      await queryRunner.query(
        `CREATE TABLE IF NOT EXISTS "${schemaName}"."${table}" (LIKE template."${table}" INCLUDING ALL)`
      );
    }

    // Recreate foreign key constraints in the newly cloned tenant schema
    const fkQuery = `
      SELECT
          tc.table_name,
          kcu.column_name,
          ccu.table_schema AS foreign_table_schema,
          ccu.table_name AS foreign_table_name,
          ccu.column_name AS foreign_column_name,
          tc.constraint_name,
          rc.update_rule,
          rc.delete_rule
      FROM
          information_schema.table_constraints AS tc
          JOIN information_schema.key_column_usage AS kcu
            ON tc.constraint_name = kcu.constraint_name
            AND tc.table_schema = kcu.table_schema
          JOIN information_schema.constraint_column_usage AS ccu
            ON ccu.constraint_name = tc.constraint_name
            AND ccu.constraint_schema = tc.table_schema
          JOIN information_schema.referential_constraints AS rc
            ON rc.constraint_name = tc.constraint_name
            AND rc.constraint_schema = tc.table_schema
      WHERE tc.constraint_type = 'FOREIGN KEY' AND tc.table_schema = 'template'
    `;

    interface ForeignKeyRow {
      table_name: string;
      column_name: string;
      foreign_table_schema: string;
      foreign_table_name: string;
      foreign_column_name: string;
      constraint_name: string;
      update_rule: string;
      delete_rule: string;
    }

    const fkeys = (await queryRunner.query(fkQuery)) as ForeignKeyRow[];

    const existingConstraints = (await queryRunner.query(
      `SELECT constraint_name FROM information_schema.table_constraints WHERE table_schema = $1`,
      [schemaName],
    )) as Array<{ constraint_name: string }>;
    const existingConstraintNames = new Set(existingConstraints.map((c) => c.constraint_name));

    for (const fk of fkeys) {
      if (existingConstraintNames.has(fk.constraint_name)) {
        continue;
      }
      const targetSchema = fk.foreign_table_schema === "template" ? schemaName : fk.foreign_table_schema;
      const addFkQuery = `
        ALTER TABLE "${schemaName}"."${fk.table_name}"
        ADD CONSTRAINT "${fk.constraint_name}"
        FOREIGN KEY ("${fk.column_name}")
        REFERENCES "${targetSchema}"."${fk.foreign_table_name}" ("${fk.foreign_column_name}")
        ON UPDATE ${fk.update_rule}
        ON DELETE ${fk.delete_rule}
      `;
      try {
        await queryRunner.query(addFkQuery);
      } catch (err: unknown) {
        const errMsg = err instanceof Error ? err.message : String(err);
        if (!errMsg.includes("already exists")) {
          throw err;
        }
      }
    }

    await queryRunner.query(`SET search_path TO "${schemaName}", public, extensions`);

    const tenantRepo = queryRunner.manager.getRepository(Tenant);

    // ── 1. Platform tenant ──────────────────────────────────────────
    console.log(`🏢 Seeding platform tenant (${PLATFORM_SLUG})...`);

    const adminPortalOrigin = process.env["ADMIN_PORTAL_ORIGIN"];
    const allowedOrigins = ["http://localhost:3000"];
    if (adminPortalOrigin) allowedOrigins.push(adminPortalOrigin);

    let platformTenant = await tenantRepo.findOne({ where: { slug: PLATFORM_SLUG } });
    if (!platformTenant) {
      platformTenant = await tenantRepo.save(tenantRepo.create({
        name: PLATFORM_NAME,
        slug: PLATFORM_SLUG,
        environment: "production",
        active: true,
        featureFlags: {
          mfaRequired: false,
          passwordlessEnabled: true,
          socialProvidersEnabled: false,
        },
        allowedOrigins,
      }));
      console.log(`  ✅ Created platform tenant: ${platformTenant.name} (${platformTenant.slug})`);
    } else {
      console.log(`  ⏭️  Platform tenant exists: ${platformTenant.name}`);
    }

    // TS non-null assertion: guaranteed non-null after the block above
    const tenant: Tenant = platformTenant;

    // ── 2. System roles ─────────────────────────────────────────────
    console.log("👥 Seeding roles...");
    const roleRepo = queryRunner.manager.getRepository(Role);

    const systemRoles = [
      { name: "Owner",     description: "Full access to everything in the organization",  isSystem: true  },
      { name: "Admin",     description: "Administrative access with some limitations",     isSystem: true  },
      { name: "Member",    description: "Basic member access",                             isSystem: true  },
      { name: "Developer", description: "Access to API keys and developer tools",          isSystem: false },
      { name: "Viewer",    description: "Read-only access",                                isSystem: false },
    ];

    // Platform-internal superadmin role (only on platform tenant)
    const internalRoleExists = await roleRepo.findOne({
      where: { name: PLATFORM_ROLE, tenantId: tenant.id },
    });
    if (!internalRoleExists) {
      await roleRepo.save(roleRepo.create({
        name: PLATFORM_ROLE,
        description: `${PLATFORM_NAME} platform superadmin — grants full portal access`,
        tenantId: tenant.id,
        isSystem: true,
      }));
      console.log(`  ✅ Created role: ${PLATFORM_SLUG}/${PLATFORM_ROLE}`);
    }

    for (const roleData of systemRoles) {
      const exists = await roleRepo.findOne({
        where: { name: roleData.name, tenantId: tenant.id },
      });
      if (!exists) {
        await roleRepo.save(roleRepo.create({ ...roleData, tenantId: tenant.id }));
        console.log(`  ✅ Created role: ${PLATFORM_SLUG}/${roleData.name}`);
      }
    }

    // ── 3. Permissions ──────────────────────────────────────────────
    console.log("🔐 Seeding permissions...");
    const permissionRepo = queryRunner.manager.getRepository(Permission);

    const basePermissions = [
      // Users
      { resource: "user",         action: "create",   description: "Create users"              },
      { resource: "user",         action: "read",     description: "View users"                },
      { resource: "user",         action: "update",   description: "Update users"              },
      { resource: "user",         action: "delete",   description: "Delete users"              },
      { resource: "user",         action: "impersonate", description: "Impersonate users"      },
      // Roles
      { resource: "role",         action: "create",   description: "Create roles"              },
      { resource: "role",         action: "read",     description: "View roles"                },
      { resource: "role",         action: "update",   description: "Update roles"              },
      { resource: "role",         action: "delete",   description: "Delete roles"              },
      { resource: "role",         action: "assign",   description: "Assign roles to users"     },
      // Permissions
      { resource: "permission",   action: "read",     description: "View permissions"          },
      { resource: "permission",   action: "assign",   description: "Assign permissions to roles" },
      // Tenant
      { resource: "tenant",       action: "read",     description: "View tenant settings"      },
      { resource: "tenant",       action: "update",   description: "Update tenant settings"    },
      { resource: "tenant",       action: "delete",   description: "Delete tenant"             },
      // OAuth clients
      { resource: "oauth_client", action: "create",   description: "Create OAuth clients"      },
      { resource: "oauth_client", action: "read",     description: "View OAuth clients"        },
      { resource: "oauth_client", action: "update",   description: "Update OAuth clients"      },
      { resource: "oauth_client", action: "delete",   description: "Delete OAuth clients"      },
      // Providers
      { resource: "provider",     action: "create",   description: "Add identity providers"    },
      { resource: "provider",     action: "read",     description: "View identity providers"   },
      { resource: "provider",     action: "update",   description: "Update identity providers" },
      { resource: "provider",     action: "delete",   description: "Remove identity providers" },
      // Audit
      { resource: "audit",        action: "read",     description: "View audit logs"           },
      { resource: "audit",        action: "export",   description: "Export audit logs"         },
      // Settings
      { resource: "settings",     action: "read",     description: "View settings"             },
      { resource: "settings",     action: "update",   description: "Update settings"           },
    ];

    for (const permData of basePermissions) {
      const permName = `${permData.resource}:${permData.action}`;
      const exists = await permissionRepo.findOne({
        where: { tenantId: tenant.id, name: permName },
      });
      if (!exists) {
        await permissionRepo.save(permissionRepo.create({
          ...permData,
          name: permName,
          tenantId: tenant.id,
        }));
        console.log(`  ✅ Created permission: ${permName}`);
      }
    }

    // Ensure wildcard permission exists on platform tenant and is assigned to the platform superadmin role
    let wildcardPermission = await permissionRepo.findOne({
      where: { tenantId: tenant.id, name: "*:*" },
    });
    if (!wildcardPermission) {
      wildcardPermission = await permissionRepo.save(permissionRepo.create({
        resource: "*",
        action: "*",
        name: "*:*",
        description: "Full wildcard permission — grants access to all resources and actions",
        tenantId: tenant.id,
      }));
      console.log("  ✅ Created wildcard permission: *:*");
    }

    const internalRole = await roleRepo.findOne({
      where: { name: PLATFORM_ROLE, tenantId: tenant.id },
    });
    if (internalRole) {
      const rolePermissionRepo = queryRunner.manager.getRepository(RolePermission);
      const hasWildcardPermission = await rolePermissionRepo.findOne({
        where: { tenantId: tenant.id, roleId: internalRole.id, permissionId: wildcardPermission.id },
      });
      if (!hasWildcardPermission) {
        await rolePermissionRepo.save(rolePermissionRepo.create({
          tenantId: tenant.id,
          roleId: internalRole.id,
          permissionId: wildcardPermission.id,
          assignedAt: new Date(),
        }));
        console.log(`  ✅ Assigned *:* permission to role: ${PLATFORM_ROLE}`);
      }
    }

    // ── 4. Superadmin user (env-gated, CI/staging only) ─────────────
    await seedSuperadmin(queryRunner.manager, tenant, roleRepo);

    console.log("");
    console.log("✅ Seeding complete!");
    console.log(`   Platform: ${PLATFORM_NAME} (${PLATFORM_SLUG})`);
    console.log(`   Roles: ${systemRoles.length + 1} (including ${PLATFORM_ROLE})`);
    console.log(`   Permissions: ${basePermissions.length}`);
    console.log("");
    console.log("Next step: run `npm run setup` to create the first admin user.");
    console.log("");
  } catch (error) {
    console.error("❌ Seeding failed:", error);
    throw error;
  } finally {
    if (queryRunner) {
      await queryRunner.release();
    }
    if (ownsConnection) {
      await dataSource.destroy();
    }
  }
}

// ─── Superadmin helper (CI/staging only) ────────────────────────────────────

async function seedSuperadmin(
  manager: EntityManager,
  platformTenant: Tenant,
  roleRepo: Repository<Role>,
): Promise<void> {
  const email = process.env["SEED_SUPERADMIN_EMAIL"];
  const password = process.env["SEED_SUPERADMIN_PASSWORD"];

  if (!email || !password) {
    console.log("ℹ️  SEED_SUPERADMIN_EMAIL not set — skipping user creation (use `npm run setup`)");
    return;
  }

  console.log("👤 Seeding superadmin user (CI mode)...");

  const userRepo = manager.getRepository(User);
  const userRoleRepo = manager.getRepository(UserRole);

  const existing = await userRepo.findOne({
    where: { tenantId: platformTenant.id, email },
  });
  if (existing) {
    console.log(`  ⏭️  Superadmin already exists: ${email}`);
    return;
  }

  const passwordHash = await PasswordService.hash(password);
  const user = await userRepo.save(userRepo.create({
    tenantId: platformTenant.id,
    email,
    emailVerified: true,
    firstName: "Super",
    lastName: "Admin",
    displayName: "Super Admin",
    primaryAuthMethod: "password",
    passwordHash,
    isActive: true,
    mfaEnabled: false,
    failedLoginAttempts: 0,
    forcePasswordChange: false,
    passwordHistory: [],
    metadata: { seeded: true },
  }));
  console.log(`  ✅ Created superadmin: ${email}`);

  const allRoles = await roleRepo.find({ where: { tenantId: platformTenant.id } });
  for (const role of allRoles) {
    const exists = await userRoleRepo.findOne({ where: { userId: user.id, roleId: role.id } });
    if (!exists) {
      await userRoleRepo.save(userRoleRepo.create({
        tenantId: platformTenant.id,
        userId: user.id,
        roleId: role.id,
        reason: "Seeded superadmin",
        metadata: { source: "seed" },
      }));
    }
  }
  console.log(`  ✅ Roles assigned`);
}

// ── Standalone entry point ───────────────────────────────────────────────────
if (require.main === module) {
  seed().then(() => process.exit(0)).catch(() => process.exit(1));
}
