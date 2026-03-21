import { DataSource } from "typeorm";
import { Tenant, Role, Permission } from "@repo/database";
import * as crypto from "crypto";

export async function seed() {
  // Connect to database
  const dataSource = new DataSource({
    type: "postgres",
    url: process.env.DATABASE_URL,
    entities: [Tenant, Role, Permission],
    ssl:
      process.env.DATABASE_SSL === "true"
        ? { rejectUnauthorized: false }
        : false,
  });

  await dataSource.initialize();
  console.log("🔌 Connected to database");

  try {
    // ==================================================
    // 1. Seed Tenants
    // ==================================================
    console.log("🏢 Seeding tenants...");

    const tenants = [
      {
        name: "Fort Knox",
        slug: "fortknox",
        subdomain: "fortknox",
        status: "active",
        plan: "enterprise",
        settings: {
          platformName: "Fort Knox",
        },
        featureFlags: {
          mfaRequired: true,
          passwordlessEnabled: true,
          socialProvidersEnabled: false,
        },
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

    // Seed fortknox-internal role for the fortknox tenant only
    const fortknoxTenant = allTenants.find((t) => t.slug === "fortknox");
    if (fortknoxTenant) {
      const existing = await roleRepo.findOne({
        where: { name: "fortknox-internal", tenantId: fortknoxTenant.id },
      });
      if (!existing) {
        const role = roleRepo.create({
          name: "fortknox-internal",
          description: "Fort Knox platform superadmin — grants access to the admin portal",
          tenantId: fortknoxTenant.id,
          isSystem: true,
        });
        await roleRepo.save(role);
        console.log(`  ✅ Created role: fortknox/fortknox-internal`);
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
    await dataSource.destroy();
  }
}

// Run seed
seed()
  .then(() => {
    console.log("✅ Done");
    process.exit(0);
  })
  .catch((error) => {
    console.error("❌ Error:", error);
    process.exit(1);
  });
