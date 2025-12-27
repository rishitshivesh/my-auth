// Create seed script: apps/auth-service/src/database/seeds/tenants.seed.ts
import { DataSource } from "typeorm";
import { Tenant } from "@repo/database";

export async function seedTenants(dataSource: DataSource) {
  const tenantRepo = dataSource.getRepository(Tenant);

  // Create test tenants
  const tenants = [
    {
      slug: "acme",
      name: "Acme Corporation",
      environment: "production",
      active: true,
    },
    {
      slug: "startup",
      name: "Startup Inc",
      environment: "production",
      active: true,
    },
    {
      slug: "test",
      name: "Test Tenant",
      environment: "development",
      active: true,
    },
  ];

  for (const data of tenants) {
    const exists = await tenantRepo.findOne({ where: { slug: data.slug } });
    if (!exists) {
      await tenantRepo.save(tenantRepo.create(data));
      console.log(`✅ Created tenant: ${data.slug}`);
    }
  }
}
