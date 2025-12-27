import AppDataSource from "@repo/database/src/data-source";
import { seedTenants } from "./tenants.seed";

async function runSeeds() {
  await AppDataSource.initialize();
  await seedTenants(AppDataSource);
  await AppDataSource.destroy();
  console.log("✅ Seeds completed");
}

runSeeds();
