import { DataSource } from "typeorm";
import { Tenant, Role, Permission, User, UserRole } from "@repo/database";
import { PasswordService } from "@repo/security";

/**
 * Seed tenants, roles, permissions, and (optionally) a superadmin user.
 *
 * If called without an existing DataSource the function creates its own
 * connection, runs the seed, and destroys it when done.  When called from
 * run-seeds.ts an already-initialised DataSource is passed so we reuse it.
 */
export async function seed(existingDataSource?: DataSource): Promise<void> {
  let dataSource: DataSource;
  let ownsConnection = false;

  if (existingDataSource) {
    dataSource = existingDataSource;
  } else {
    dataSource = new DataSource({
      type: "postgres",
      url: process.env.DATABASE_URL,
      entities: [Tenant, Role, Permission, User, UserRole],
      ssl:
        process.env.DATABASE_SSL === "true"
          ? { rejectUnauthorized: false }
          : false,
    });
    await dataSource.initialize();
    ownsConnection = true;
    console.log("🔌 Connected to database");
  }

  try {
    // ==================================================
    // 1. Seed Tenants
    // ==================================================
    console.log("🏢 Seeding tenants...");

    const tenants = [
      {
        name: "Scrolloop Sentry",
        slug: "sentry",
        subdomain: "sentry",
        status: "active",
        plan: "enterprise",
        settings: {
          platformName: "Scrolloop Sentry",
        },
        featureFlags: {
          mfaRequired: true,
          passwordlessEnabled: true,
          socialProvidersEnabled: false,
        },
        allowedOrigins: ['http://localhost:3000', 'https://admin.sentry.scrolloop.com'],
        isActive: true,
        environment: "production",
      },
      {
        name: "Default Organization",
        slug: "default",
        subdomain: "default",
        status: "active",
        plan: "free",
        settings: {},
        featureFlags: {
          mfaRequired: false,
          passwordlessEnabled: true,
          socialProvidersEnabled: true,
        },
        isActive: true,
        environment: "production",
      },
      {
        name: "Acme Corporation",
        slug: "acme",
        subdomain: "acme",
        customDomain: "auth.acme.com",
        customDomainVerified: false,
        status: "active",
        plan: "professional",
        settings: {
          branding: {
            logo: "https://acme.com/logo.png",
            primaryColor: "#FF6B35",
          },
        },
        featureFlags: {
          mfaRequired: true,
          passwordlessEnabled: true,
          socialProvidersEnabled: true,
          samlEnabled: true,
        },
        isActive: true,
        environment: "production",
      },
      {
        name: "Startup Inc",
        slug: "startup",
        subdomain: "startup",
        status: "trial",
        plan: "starter",
        settings: {
          allowSignup: true,
          requireEmailVerification: true,
          mfaRequired: true,
        },
        featureFlags: {
          mfaRequired: false,
          passwordlessEnabled: false,
          socialProvidersEnabled: true,
        },
        isActive: true,
        environment: "production",
        trialEndsAt: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000), // 14 days
      },
    ];

    const tenantRepo = dataSource.getRepository(Tenant);

    for (const tenantData of tenants) {
      const existing = await tenantRepo.findOne({
        where: { slug: tenantData.slug },
      });
      if (!existing) {
        const tenant = tenantRepo.create(tenantData);
        await tenantRepo.save(tenant);
        console.log(`  ✅ Created tenant: ${tenant.name} (${tenant.slug})`);
      } else {
        console.log(`  ⏭️  Tenant exists: ${existing.name}`);
      }
    }

    // ==================================================
    // 2. Seed Roles (per tenant)
    // ==================================================
    console.log("👥 Seeding roles...");

    const allTenants = await tenantRepo.find();
    const roleRepo = dataSource.getRepository(Role);

    const systemRoles = [
      {
        name: "Owner",
        description: "Full access to everything in the organization",
        isSystem: true,
      },
      {
        name: "Admin",
        description: "Administrative access with some limitations",
        isSystem: true,
      },
      {
        name: "Member",
        description: "Basic member access",
        isSystem: true,
      },
      {
        name: "Developer",
        description: "Access to API keys and developer tools",
        isSystem: false,
      },
      {
        name: "Viewer",
        description: "Read-only access",
        isSystem: false,
      },
    ];

    // Seed sentry-internal role for the sentry tenant only
    const sentryTenant = allTenants.find((t) => t.slug === "sentry");
    if (sentryTenant) {
      const existing = await roleRepo.findOne({
        where: { name: "sentry-internal", tenantId: sentryTenant.id },
      });
      if (!existing) {
        const role = roleRepo.create({
          name: "sentry-internal",
          description:
            "Scrolloop Sentry platform superadmin — grants access to the admin portal",
          tenantId: sentryTenant.id,
          isSystem: true,
        });
        await roleRepo.save(role);
        console.log(`  ✅ Created role: sentry/sentry-internal`);
      }
    }

    for (const tenant of allTenants) {
      for (const roleData of systemRoles) {
        const existing = await roleRepo.findOne({
          where: { name: roleData.name, tenantId: tenant.id },
        });

        if (!existing) {
          const role = roleRepo.create({
            ...roleData,
            tenantId: tenant.id,
          });
          await roleRepo.save(role);
          console.log(`  ✅ Created role: ${tenant.slug}/${role.name}`);
        }
      }
    }

    // ==================================================
    // 3. Seed Permissions (per tenant)
    // ==================================================
    console.log("🔐 Seeding permissions...");

    const permissionRepo = dataSource.getRepository(Permission);

    const basePermissions = [
      // User management
      { resource: "user", action: "create", description: "Create users" },
      { resource: "user", action: "read", description: "View users" },
      { resource: "user", action: "update", description: "Update users" },
      { resource: "user", action: "delete", description: "Delete users" },
      {
        resource: "user",
        action: "impersonate",
        description: "Impersonate users",
      },

      // Role management
      { resource: "role", action: "create", description: "Create roles" },
      { resource: "role", action: "read", description: "View roles" },
      { resource: "role", action: "update", description: "Update roles" },
      { resource: "role", action: "delete", description: "Delete roles" },
      {
        resource: "role",
        action: "assign",
        description: "Assign roles to users",
      },

      // Permission management
      {
        resource: "permission",
        action: "read",
        description: "View permissions",
      },
      {
        resource: "permission",
        action: "assign",
        description: "Assign permissions to roles",
      },

      // Tenant management
      {
        resource: "tenant",
        action: "read",
        description: "View tenant settings",
      },
      {
        resource: "tenant",
        action: "update",
        description: "Update tenant settings",
      },
      { resource: "tenant", action: "delete", description: "Delete tenant" },

      // OAuth client management
      {
        resource: "oauth_client",
        action: "create",
        description: "Create OAuth clients",
      },
      {
        resource: "oauth_client",
        action: "read",
        description: "View OAuth clients",
      },
      {
        resource: "oauth_client",
        action: "update",
        description: "Update OAuth clients",
      },
      {
        resource: "oauth_client",
        action: "delete",
        description: "Delete OAuth clients",
      },

      // Provider management
      {
        resource: "provider",
        action: "create",
        description: "Add identity providers",
      },
      {
        resource: "provider",
        action: "read",
        description: "View identity providers",
      },
      {
        resource: "provider",
        action: "update",
        description: "Update identity providers",
      },
      {
        resource: "provider",
        action: "delete",
        description: "Remove identity providers",
      },

      // Audit logs
      { resource: "audit", action: "read", description: "View audit logs" },
      { resource: "audit", action: "export", description: "Export audit logs" },

      // Settings
      { resource: "settings", action: "read", description: "View settings" },
      {
        resource: "settings",
        action: "update",
        description: "Update settings",
      },
    ];

    for (const tenant of allTenants) {
      for (const permData of basePermissions) {
        const existing = await permissionRepo.findOne({
          where: {
            tenantId: tenant.id,
            resource: permData.resource,
            action: permData.action,
          },
        });

        if (!existing) {
          const permission = permissionRepo.create({
            ...permData,
            tenantId: tenant.id,
          });
          await permissionRepo.save(permission);
          console.log(
            `  ✅ Created permission: ${tenant.slug}/${permission.resource}:${permission.action}`,
          );
        }
      }
    }

    // ==================================================
    // 4. Seed Superadmin User (optional — env-gated)
    // ==================================================
    await seedSuperadmin(dataSource, sentryTenant ?? null, roleRepo);

    console.log("");
    console.log("✅ Seeding complete!");
    console.log("");
    console.log("📊 Summary:");
    console.log(`   Tenants: ${allTenants.length}`);
    console.log(`   Roles per tenant: ${systemRoles.length}`);
    console.log(`   Permissions per tenant: ${basePermissions.length}`);
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

// ---------------------------------------------------------------------------
// Superadmin creation helper
// ---------------------------------------------------------------------------

async function seedSuperadmin(
  dataSource: DataSource,
  sentryTenant: Tenant | null,
  roleRepo: ReturnType<DataSource["getRepository"]>,
): Promise<void> {
  const email = process.env.SEED_SUPERADMIN_EMAIL;
  const password = process.env.SEED_SUPERADMIN_PASSWORD;

  if (!email || !password) {
    const missing = !email ? "SEED_SUPERADMIN_EMAIL" : "SEED_SUPERADMIN_PASSWORD";
    console.warn(`⚠️  ${missing} not set — no superadmin created`);
    return;
  }

  if (!sentryTenant) {
    console.warn(
      "⚠️  Sentry tenant not found — cannot create superadmin",
    );
    return;
  }

  console.log("👤 Seeding superadmin user...");

  // Switch to fk_sentry schema so the user lands in the correct tenant schema
  await dataSource.query(`SET search_path TO "fk_sentry", public`);

  const userRepo = dataSource.getRepository(User);
  const userRoleRepo = dataSource.getRepository(UserRole);

  // Idempotent: skip if user already exists
  const existing = await userRepo.findOne({
    where: { tenantId: sentryTenant.id, email },
  });

  if (existing) {
    console.log(`  ⏭️  Superadmin already exists: ${email}`);
    await dataSource.query(`SET search_path TO public`);
    return;
  }

  const passwordHash = await PasswordService.hash(password);

  const user = userRepo.create({
    tenantId: sentryTenant.id,
    email,
    emailVerified: true,
    firstName: "Super",
    lastName: "Admin",
    displayName: "Super Admin",
    primaryAuthMethod: "password",
    passwordHash,
    status: "active",
    isActive: true,
    mfaEnabled: false,
    failedLoginAttempts: 0,
    forcePasswordChange: false,
    passwordHistory: [],
    metadata: { seeded: true },
  });

  await userRepo.save(user);
  console.log(`  ✅ Created superadmin: ${email}`);

  // Assign all roles in the sentry tenant
  const allSentryRoles = await roleRepo.find({
    where: { tenantId: sentryTenant.id },
  });

  for (const role of allSentryRoles) {
    const existingAssignment = await userRoleRepo.findOne({
      where: { userId: user.id, roleId: role.id },
    });

    if (!existingAssignment) {
      const userRole = userRoleRepo.create({
        tenantId: sentryTenant.id,
        userId: user.id,
        roleId: role.id,
        reason: "Seeded superadmin",
        metadata: { source: "seed" },
      });
      await userRoleRepo.save(userRole);
      console.log(`  ✅ Assigned role: ${role.name}`);
    }
  }

  // Reset search_path back to public
  await dataSource.query(`SET search_path TO public`);
}

// ============================================================
// Standalone entry point (for running this file directly)
// ============================================================
if (require.main === module) {
  seed()
    .then(() => {
      console.log("✅ Done");
      process.exit(0);
    })
    .catch((error) => {
      console.error("❌ Error:", error);
      process.exit(1);
    });
}
