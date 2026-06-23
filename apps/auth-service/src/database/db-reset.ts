import { DataSource } from "typeorm";
import type { PostgresConnectionOptions } from "typeorm/driver/postgres/PostgresConnectionOptions";
import { dataSourceOptions } from "@repo/database";
import { seed } from "./seeders/tenants.seed";
import { seedOAuth } from "./seeders/oauth.seed";
import * as readline from "readline";

async function askQuestion(query: string): Promise<string> {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  return new Promise((resolve) =>
    rl.question(query, (ans) => {
      rl.close();
      resolve(ans);
    })
  );
}

async function runReset(): Promise<void> {
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
    // 1. Fetch all schemas
    const schemasRaw = await dataSource.query(`
      SELECT schema_name FROM information_schema.schemata 
      WHERE schema_name = 'public' 
         OR schema_name = 'template' 
         OR schema_name LIKE 'fk_%';
    `) as Array<{ schema_name: string }>;

    const schemas = schemasRaw.map(r => r.schema_name);

    console.log("\n⚠️  WARNING: You are about to reset the database.");
    console.log("The following schemas (and ALL their tables) will be dropped and recreated:");
    schemas.forEach(s => console.log(`  - ${s}`));

    const skipPrompt = process.argv.includes("--yes") || process.argv.includes("-y");
    if (!skipPrompt) {
      const response = await askQuestion("\nType 'YES' to confirm and proceed: ");
      if (response !== "YES") {
        console.log("❌ Reset aborted by user.");
        return;
      }
    } else {
      console.log("\nSkipping confirmation prompt (--yes active).");
    }

    console.log("\n🚀 Starting database reset...");

    // 2. Drop fk_* and template schemas
    for (const schema of schemas) {
      if (schema !== "public") {
        console.log(`  🔥 Dropping schema: ${schema}`);
        await dataSource.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
      }
    }

    // 3. Drop and recreate public schema
    console.log("  🔥 Recreating public schema...");
    try {
      await dataSource.query(`DROP SCHEMA IF EXISTS public CASCADE`);
      await dataSource.query(`CREATE SCHEMA public`);
      await dataSource.query(`GRANT ALL ON SCHEMA public TO public`);
    } catch (err: unknown) {
      const errMsg = err instanceof Error ? err.message : String(err);
      if (errMsg.includes("permission denied") || errMsg.includes("must be owner")) {
        console.log("  ⚠️  Permission denied to drop public schema. Clean-dropping all public tables/types instead...");
        await dropAllInPublicSchema(dataSource);
      } else {
        throw err;
      }
    }

    // 4. Run migrations
    console.log("\n⚙️  Running database migrations...");
    await dataSource.runMigrations();
    console.log("  ✅ Migrations complete!");

    // 5. Run seeders
    console.log("\n🌱 Seeding database...");
    await seed(dataSource);
    console.log("🔑 Seeding OAuth clients...");
    await seedOAuth(dataSource);

    console.log("\n✅ Database reset and seeding completed successfully!");
  } catch (error) {
    console.error("❌ Database reset failed:", error);
    throw error;
  } finally {
    await dataSource.destroy();
  }
}

async function dropAllInPublicSchema(dataSource: DataSource): Promise<void> {
  // Drop all tables
  const tables = await dataSource.query(`
    SELECT table_name FROM information_schema.tables 
    WHERE table_schema = 'public' AND table_type = 'BASE TABLE';
  `) as Array<{ table_name: string }>;

  for (const t of tables) {
    console.log(`    - Dropping table public."${t.table_name}"`);
    await dataSource.query(`DROP TABLE IF EXISTS "public"."${t.table_name}" CASCADE`);
  }

  // Drop all user-defined types (enums, etc.)
  const types = await dataSource.query(`
    SELECT typname FROM pg_type t 
    JOIN pg_namespace n ON n.oid = t.typnamespace 
    WHERE n.nspname = 'public' AND typtype = 'e';
  `) as Array<{ typname: string }>;

  for (const ty of types) {
    console.log(`    - Dropping type public."${ty.typname}"`);
    await dataSource.query(`DROP TYPE IF EXISTS "public"."${ty.typname}" CASCADE`);
  }
}

runReset().catch((error) => {
  console.error("❌ Fatal error:", error);
  process.exit(1);
});
