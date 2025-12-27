import AppDataSource from "@repo/database/src/data-source";
import { seed } from "./tenants.seed";

async function runSeeds() {
  await AppDataSource.initialize();
  await seed();
  await AppDataSource.destroy();
  console.log("✅ Seeds completed");
}

runSeeds();
