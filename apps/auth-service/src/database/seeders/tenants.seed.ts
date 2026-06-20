import { DataSource, Repository } from "typeorm";
import { Tenant, Role, Permission, User, UserRole, dataSourceOptions } from "@repo/database";
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
  let ownsConnection = false;

  if (existingDataSource) {
    dataSource = existingDataSource;
  } else {
    const pgBase = dataSourceOptions as PostgresConnectionOptions;
    const dbUrl = process.env["DB_URL"] ?? process.env["DATABASE_URL"];
    const useSSL = process.env["DB_SSL"] === "true" || process.env["DATABASE_SSL"] === "true";
    dataSource = new DataSource({
      ...pgBase,
      ...(dbUrl ? { url: dbUrl, host: undefined, port: undefined, username: undefined, password: undefined, database: undefined } : {}),
      // Inherit SSL config from dataSourceOptions; only override when DB_SSL=true is
      // explicitly requested (e.g. cloud-managed Postgres with self-signed CA).
      // To trust a custom CA instead, set PGSSLROOTCERT or configure pgBase.ssl.
      ssl: useSSL ? (pgBase.ssl ?? false) : (pgBase.ssl ?? false),
      migrationsRun: false,
    } as PostgresConnectionOptions);
    await dataSource.initialize();
    ownsConnection = true;
    console.log("🔌 Connected to database");
  }

  try {
    const tenantRepo = dataSource.getRepository(Tenant);

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
    const roleRepo = dataSource.getRepository(Role);

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
    const permissionRepo = dataSource.getRepository(Permission);

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

    // ── 4. Superadmin user (env-gated, CI/staging only) ─────────────
    await seedSuperadmin(dataSource, tenant, roleRepo);

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
    if (ownsConnection) {
      await dataSource.destroy();
    }
  }
}

// ─── Superadmin helper (CI/staging only) ────────────────────────────────────

async function seedSuperadmin(
  dataSource: DataSource,
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

  const userRepo = dataSource.getRepository(User);
  const userRoleRepo = dataSource.getRepository(UserRole);

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
