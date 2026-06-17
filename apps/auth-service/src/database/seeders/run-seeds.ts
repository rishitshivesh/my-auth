import { DataSource } from "typeorm";
import {
  Tenant,
  Role,
  Permission,
  User,
  UserRole,
  OAuthClient,
} from "@repo/database";
import { seed } from "./tenants.seed";
import { seedOAuth } from "./oauth.seed";

async function runSeeds(): Promise<void> {
  const dataSource = new DataSource({
    type: "postgres",
    url: process.env.DATABASE_URL,
    entities: [Tenant, Role, Permission, User, UserRole, OAuthClient],
    ssl:
      process.env.DATABASE_SSL === "true"
        ? { rejectUnauthorized: false }
        : false,
  });

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
