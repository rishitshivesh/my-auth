/**
 * Demo seeder — populates sample tenants for local development and demos.
 *
 * NOT run by default. Use:  npm run db:seed:demo
 *
 * Safe to re-run: all inserts are idempotent.
 */
import { DataSource, Repository } from "typeorm";
import { Tenant, Role, Permission } from "@repo/database";
import type { PostgresConnectionOptions } from "typeorm/driver/postgres/PostgresConnectionOptions";
import { dataSourceOptions } from "@repo/database";

const DEMO_TENANTS = [
  {
    name: "Acme Corp",
    slug: "acme",
    environment: "staging",
    featureFlags: { mfaRequired: false, passwordlessEnabled: true, socialProvidersEnabled: true },
    allowedOrigins: ["http://localhost:3001"],
  },
  {
    name: "Startup Inc",
    slug: "startup",
    environment: "development",
    featureFlags: { mfaRequired: false, passwordlessEnabled: false, socialProvidersEnabled: false },
    allowedOrigins: ["http://localhost:3002"],
  },
  {
    name: "Default Org",
    slug: "default",
    environment: "development",
    featureFlags: { mfaRequired: false, passwordlessEnabled: false, socialProvidersEnabled: false },
    allowedOrigins: ["http://localhost:3003"],
  },
];

const SYSTEM_ROLES = [
  { name: "Owner",     description: "Full access to everything in the organization",  isSystem: true  },
  { name: "Admin",     description: "Administrative access with some limitations",     isSystem: true  },
  { name: "Member",    description: "Basic member access",                             isSystem: true  },
  { name: "Developer", description: "Access to API keys and developer tools",          isSystem: false },
  { name: "Viewer",    description: "Read-only access",                                isSystem: false },
];

const BASE_PERMISSIONS = [
  { resource: "user",         action: "create",     description: "Create users"                },
  { resource: "user",         action: "read",       description: "View users"                  },
  { resource: "user",         action: "update",     description: "Update users"                },
  { resource: "user",         action: "delete",     description: "Delete users"                },
  { resource: "user",         action: "impersonate", description: "Impersonate users"          },
  { resource: "role",         action: "create",     description: "Create roles"                },
  { resource: "role",         action: "read",       description: "View roles"                  },
  { resource: "role",         action: "update",     description: "Update roles"                },
  { resource: "role",         action: "delete",     description: "Delete roles"                },
  { resource: "role",         action: "assign",     description: "Assign roles to users"       },
  { resource: "permission",   action: "read",       description: "View permissions"            },
  { resource: "permission",   action: "assign",     description: "Assign permissions to roles" },
  { resource: "tenant",       action: "read",       description: "View tenant settings"        },
  { resource: "tenant",       action: "update",     description: "Update tenant settings"      },
  { resource: "tenant",       action: "delete",     description: "Delete tenant"               },
  { resource: "oauth_client", action: "create",     description: "Create OAuth clients"        },
  { resource: "oauth_client", action: "read",       description: "View OAuth clients"          },
  { resource: "oauth_client", action: "update",     description: "Update OAuth clients"        },
  { resource: "oauth_client", action: "delete",     description: "Delete OAuth clients"        },
  { resource: "provider",     action: "create",     description: "Add identity providers"      },
  { resource: "provider",     action: "read",       description: "View identity providers"     },
  { resource: "provider",     action: "update",     description: "Update identity providers"   },
  { resource: "provider",     action: "delete",     description: "Remove identity providers"   },
  { resource: "audit",        action: "read",       description: "View audit logs"             },
  { resource: "audit",        action: "export",     description: "Export audit logs"           },
  { resource: "settings",     action: "read",       description: "View settings"               },
  { resource: "settings",     action: "update",     description: "Update settings"             },
];

async function seedTenant(
  dataSource: DataSource,
  tenantData: (typeof DEMO_TENANTS)[number],
): Promise<void> {
  const tenantRepo = dataSource.getRepository(Tenant);
  const roleRepo: Repository<Role> = dataSource.getRepository(Role);
  const permissionRepo = dataSource.getRepository(Permission);

  let tenant = await tenantRepo.findOne({ where: { slug: tenantData.slug } });
  if (!tenant) {
    tenant = await tenantRepo.save(tenantRepo.create({
      name: tenantData.name,
      slug: tenantData.slug,
      environment: tenantData.environment,
      active: true,
      featureFlags: tenantData.featureFlags,
      allowedOrigins: tenantData.allowedOrigins,
    }));
    console.log(`  ✅ Created tenant: ${tenant.name} (${tenant.slug})`);
  } else {
    console.log(`  ⏭️  Tenant exists: ${tenant.name}`);
  }

  for (const roleData of SYSTEM_ROLES) {
    const exists = await roleRepo.findOne({ where: { name: roleData.name, tenantId: tenant.id } });
    if (!exists) {
      await roleRepo.save(roleRepo.create({ ...roleData, tenantId: tenant.id }));
    }
  }

  for (const permData of BASE_PERMISSIONS) {
    const permName = `${permData.resource}:${permData.action}`;
    const exists = await permissionRepo.findOne({ where: { tenantId: tenant.id, name: permName } });
    if (!exists) {
      await permissionRepo.save(permissionRepo.create({
        ...permData,
        name: permName,
        tenantId: tenant.id,
      }));
    }
  }
}

export async function seedDemo(existingDataSource?: DataSource): Promise<void> {
  let dataSource: DataSource;
  let ownsConnection = false;

  if (existingDataSource) {
    dataSource = existingDataSource;
  } else {
    const pgBase = dataSourceOptions as PostgresConnectionOptions;
    const dbUrl = process.env["DB_URL"] ?? process.env["DATABASE_URL"];
    dataSource = new DataSource({
      ...pgBase,
      ...(dbUrl ? { url: dbUrl, host: undefined, port: undefined, username: undefined, password: undefined, database: undefined } : {}),
      // Inherit SSL config from dataSourceOptions (configured via env/TypeORM options).
      // To use a custom CA cert instead of disabling verification, set PGSSLROOTCERT.
      ssl: pgBase.ssl ?? false,
      migrationsRun: false,
    } as PostgresConnectionOptions);
    await dataSource.initialize();
    ownsConnection = true;
    console.log("🔌 Connected to database");
  }

  try {
    console.log("🏢 Seeding demo tenants...");
    for (const t of DEMO_TENANTS) {
      await seedTenant(dataSource, t);
    }
    console.log(`\n✅ Demo seeding complete! (${DEMO_TENANTS.length} tenants)`);
  } catch (error) {
    console.error("❌ Demo seeding failed:", error);
    throw error;
  } finally {
    if (ownsConnection) await dataSource.destroy();
  }
}

if (require.main === module) {
  seedDemo().then(() => process.exit(0)).catch(() => process.exit(1));
}
