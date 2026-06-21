import { DataSource } from "typeorm";
import type { PostgresConnectionOptions } from "typeorm/driver/postgres/PostgresConnectionOptions";
import { dataSourceOptions } from "@repo/database";
import { seed } from "./tenants.seed";
import { seedOAuth } from "./oauth.seed";

async function runSeeds(): Promise<void> {
  const dbUrl = process.env.DB_URL ?? process.env.DATABASE_URL;
  const useSSL = process.env.DB_SSL === "true" || process.env.DATABASE_SSL === "true";
  const pgBase = dataSourceOptions as PostgresConnectionOptions;

  const connectionOverride: Partial<PostgresConnectionOptions> = dbUrl
    ? { url: dbUrl, host: undefined, port: undefined, username: undefined, password: undefined, database: undefined }
    : {};

  const dataSource = new DataSource({
    ...pgBase,
    ...connectionOverride,
    ssl: useSSL ? { rejectUnauthorized: false } : (pgBase.ssl ?? false),
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
