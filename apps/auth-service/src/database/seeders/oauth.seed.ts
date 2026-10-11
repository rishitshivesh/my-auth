import { DataSource, DataSourceOptions } from "typeorm";
import {
  Tenant,
  OAuthClient,
  Role,
  Permission,
  User,
  UserRole,
  buildDataSourceOptions,
} from "@repo/database";
import * as crypto from "crypto";
import { PasswordService } from "@repo/security";

/**
 * Seed OAuth clients for the sentry tenant.
 *
 * Clients are inserted directly into the fk_sentry schema by setting
 * search_path before each write. The DataSource must already be initialized.
 */
export async function seedOAuth(dataSource: DataSource): Promise<void> {
  // ------------------------------------------------------------------
  // 1. Resolve the sentry tenant (public schema)
  // ------------------------------------------------------------------
  const tenantRepo = dataSource.getRepository(Tenant);
  const sentryTenant = await tenantRepo.findOne({ where: { slug: "sentry" } });

  if (!sentryTenant) {
    console.warn(
      "⚠️  Tenant with slug 'sentry' not found — skipping OAuth seed.",
    );
    return;
  }

  const tenantId = sentryTenant.id;
  console.log(`🔑 Found sentry tenant: ${sentryTenant.name} (${tenantId})`);

  // ------------------------------------------------------------------
  // 2. Switch to the fk_sentry schema so OAuth clients land there
  // ------------------------------------------------------------------
  await dataSource.query(`SET search_path TO "fk_sentry", public`);

  const clientRepo = dataSource.getRepository(OAuthClient);

  // ------------------------------------------------------------------
  // 3. Sentry Admin Portal — public SPA, PKCE required
  // ------------------------------------------------------------------
  const portalClientId = "sentry_admin_portal";

  const existingPortal = await clientRepo.findOne({
    where: { tenantId, clientId: portalClientId },
  });

  if (!existingPortal) {
    const portal = clientRepo.create({
      tenantId,
      clientId: portalClientId,
      clientType: "public",
      name: "Sentry Admin Portal",
      description: "First-party admin portal for Scrolloop Sentry",
      grantTypes: ["authorization_code", "refresh_token"],
      redirectUris: [
        "http://localhost:3000/u/auth/callback",
        "https://admin.sentry.scrolloop.com/u/auth/callback",
      ],
      postLogoutRedirectUris: [
        "http://localhost:3000",
        "https://admin.sentry.scrolloop.com",
      ],
      allowedOrigins: [
        "http://localhost:3000",
        "https://admin.sentry.scrolloop.com",
      ],
      allowedScopes: ["openid", "profile", "email", "offline_access"],
      defaultScopes: ["openid", "profile", "email"],
      requirePkce: true,
      requireConsent: false,
      isFirstParty: true,
      accessTokenTtl: 900,
      refreshTokenTtl: 604800,
      idTokenTtl: 3600,
      authorizationCodeTtl: 600,
      rotateRefreshTokens: true,
      isActive: true,
    });
    await clientRepo.save(portal);
    console.log(`  ✅ Created OAuth client: ${portal.name} (${portal.clientId})`);
  } else {
    console.log(
      `  ⏭️  OAuth client exists: ${existingPortal.name} (${existingPortal.clientId})`,
    );
  }

  // ------------------------------------------------------------------
  // 4. Sentry Backend Service — confidential M2M, client_credentials
  // ------------------------------------------------------------------
  const backendClientId = "sentry_backend";

  const existingBackend = await clientRepo.findOne({
    where: { tenantId, clientId: backendClientId },
  });

  if (!existingBackend) {
    const backendSecret = crypto.randomBytes(32).toString("hex");
    const backendSecretHash = await PasswordService.hash(backendSecret);

    const backend = clientRepo.create({
      tenantId,
      clientId: backendClientId,
      clientSecretHash: backendSecretHash,
      clientType: "confidential",
      name: "Sentry Backend Service",
      description: "Backend service for machine-to-machine auth",
      grantTypes: ["client_credentials"],
      redirectUris: [],
      allowedScopes: ["users:read", "users:write", "api:read", "api:write"],
      defaultScopes: ["users:read", "api:read"],
      requirePkce: false,
      requireConsent: false,
      isFirstParty: true,
      accessTokenTtl: 3600,
      refreshTokenTtl: 604800,
      idTokenTtl: 3600,
      authorizationCodeTtl: 600,
      rotateRefreshTokens: true,
      isActive: true,
    });
    await clientRepo.save(backend);
    console.log(`  ✅ Created OAuth client: ${backend.name} (${backend.clientId})`);
    console.log(`     ⚠️  CLIENT SECRET (save this — shown only once):`);
    console.log(`     ${backendSecret}`);
  } else {
    console.log(
      `  ⏭️  OAuth client exists: ${existingBackend.name} (${existingBackend.clientId})`,
    );
  }

  // ------------------------------------------------------------------
  // 5. Example Third-Party App — confidential, consent required
  // ------------------------------------------------------------------
  const thirdPartyClientId = "example_client";

  // Demo client only — confidential client with PKCE disabled pointing at
  // example.com. Never seeded unless explicitly requested.
  const seedExampleClients = /^(1|true|yes|on)$/i.test(
    process.env.SEED_EXAMPLE_CLIENTS ?? "",
  );

  const existingThirdParty = seedExampleClients
    ? await clientRepo.findOne({
        where: { tenantId, clientId: thirdPartyClientId },
      })
    : null;

  if (!seedExampleClients) {
    console.log(
      "  ⏭️  Skipping example third-party client (set SEED_EXAMPLE_CLIENTS=true to seed it)",
    );
  } else if (!existingThirdParty) {
    const thirdPartySecret = crypto.randomBytes(32).toString("hex");
    const thirdPartySecretHash = await PasswordService.hash(thirdPartySecret);

    const thirdParty = clientRepo.create({
      tenantId,
      clientId: thirdPartyClientId,
      clientSecretHash: thirdPartySecretHash,
      clientType: "confidential",
      name: "Example Third-Party App",
      description: "Example third-party application",
      logoUrl: "https://example.com/logo.png",
      websiteUrl: "https://example.com",
      privacyPolicyUrl: "https://example.com/privacy",
      termsOfServiceUrl: "https://example.com/terms",
      grantTypes: ["authorization_code", "refresh_token"],
      redirectUris: ["https://example.com/callback"],
      allowedScopes: ["openid", "profile", "email"],
      requirePkce: false,
      requireConsent: true,
      isFirstParty: false,
      accessTokenTtl: 900,
      refreshTokenTtl: 604800,
      idTokenTtl: 3600,
      authorizationCodeTtl: 600,
      rotateRefreshTokens: true,
      isActive: true,
    });
    await clientRepo.save(thirdParty);
    console.log(
      `  ✅ Created OAuth client: ${thirdParty.name} (${thirdParty.clientId})`,
    );
    console.log(`     ⚠️  CLIENT SECRET (save this — shown only once):`);
    console.log(`     ${thirdPartySecret}`);
  } else {
    console.log(
      `  ⏭️  OAuth client exists: ${existingThirdParty.name} (${existingThirdParty.clientId})`,
    );
  }

  // ------------------------------------------------------------------
  // 6. Reset search_path back to public
  // ------------------------------------------------------------------
  await dataSource.query(`SET search_path TO public`);
}

// ============================================================
// Standalone entry point (for running this file directly)
// ============================================================
async function run(): Promise<void> {
  const dataSource = new DataSource({
    ...buildDataSourceOptions(),
    entities: [Tenant, OAuthClient, Role, Permission, User, UserRole],
    migrations: [],
  } as DataSourceOptions);

  await dataSource.initialize();
  console.log("🔌 Connected to database");

  try {
    console.log("🔑 Seeding OAuth clients...");
    await seedOAuth(dataSource);
    console.log("\n✅ OAuth seeding complete");
  } catch (error) {
    console.error("❌ OAuth seeding failed:", error);
    throw error;
  } finally {
    await dataSource.destroy();
  }
}

// Run only when executed directly (not imported as a module)
if (require.main === module) {
  run()
    .then(() => process.exit(0))
    .catch((error) => {
      console.error("❌ Fatal error:", error);
      process.exit(1);
    });
}
