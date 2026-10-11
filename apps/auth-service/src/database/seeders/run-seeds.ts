import { DataSource } from "typeorm";
import type { PostgresConnectionOptions } from "typeorm/driver/postgres/PostgresConnectionOptions";
import { buildDataSourceOptions } from "@repo/database";
import { seed } from "./tenants.seed";
import { seedOAuth } from "./oauth.seed";

async function runSeeds(): Promise<void> {
  // Connection, TLS and pool settings come from the shared builder in
  // @repo/database (DB_URL | DATABASE_URL | DATABASE_*, DB_SSL, DB_SSL_CA ...).
  const dataSource = new DataSource({
    ...buildDataSourceOptions(),
    migrationsRun: false,
  } as PostgresConnectionOptions);

  await dataSource.initialize();
  console.log("🔌 Connected to database");

  try {
    // Step 1: Tenants, roles, permissions, and optional superadmin
    await seed(dataSource);

    // Step 2: OAuth clients for the sentry tenant
    console.log("🔑 Seeding OAuth clients...");
    await seedOAuth(dataSource);

    console.log("\n✅ All seeds completed successfully");
  } catch (error) {
    console.error("❌ Seed run failed:", error);
    throw error;
  } finally {
    await dataSource.destroy();
  }
}

runSeeds().catch((error) => {
  console.error("❌ Fatal error:", error);
  process.exit(1);
});
