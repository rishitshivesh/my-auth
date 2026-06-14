// apps/auth-service/src/modules/oauth/scripts/seed-oauth-client.ts

import { NestFactory } from "@nestjs/core";
import { AppModule } from "@/core/app.module";
import { OAuthClientService } from "@/modules/oauth/services/oauth-client.service";

/**
 * Seed first-party OAuth client for Scrolloop Sentry Admin Portal
 */
async function seedOAuthClient() {
  const app = await NestFactory.createApplicationContext(AppModule);

  const clientService = app.get(OAuthClientService);

  // Get default tenant ID (you may need to query this)
  const tenantId = "your-tenant-id-here"; // TODO: Get from database

  try {
    // Create Scrolloop Sentry Admin Portal client
    const { client, clientSecret } = await clientService.createClient({
      tenantId,
      name: "Scrolloop Sentry Admin Portal",
      description: "First-party admin portal for Scrolloop Sentry",
      clientType: "public", // SPA doesn't have server
      grantTypes: ["authorization_code", "refresh_token"],
      redirectUris: [
        "http://localhost:3000/callback",
        "http://localhost:3000/auth/callback",
        "https://admin.sentry.scrolloop.com/callback",
      ],
      postLogoutRedirectUris: [
        "http://localhost:3000",
        "https://admin.sentry.scrolloop.com",
      ],
      allowedOrigins: ["http://localhost:3000", "https://admin.sentry.scrolloop.com"],
      allowedScopes: ["openid", "profile", "email", "offline_access"],
      defaultScopes: ["openid", "profile", "email"],
      requirePkce: true, // MUST for public clients
      requireConsent: false, // First-party app
      isFirstParty: true,
      accessTokenTtl: 900, // 15 minutes
      refreshTokenTtl: 604800, // 7 days
      idTokenTtl: 3600, // 1 hour
    });

    console.log("✅ Created Scrolloop Sentry Admin Portal client:");
    console.log("   Client ID:", client.clientId);
    console.log("   Client Type:", client.clientType);
    console.log("   Grant Types:", client.grantTypes);
    console.log("   Redirect URIs:", client.redirectUris);
    console.log("   Require PKCE:", client.requirePkce);

    // Create a confidential client for testing
    const { client: backendClient, clientSecret: backendSecret } =
      await clientService.createClient({
        tenantId,
        name: "Scrolloop Sentry Backend Service",
        description: "Backend service for machine-to-machine auth",
        clientType: "confidential",
        grantTypes: ["client_credentials"],
        redirectUris: [], // Not needed for M2M
        allowedScopes: ["users:read", "users:write", "api:read", "api:write"],
        defaultScopes: ["users:read", "api:read"],
        requirePkce: false,
        requireConsent: false,
        isFirstParty: true,
        accessTokenTtl: 3600, // 1 hour for M2M
      });

    console.log("\n✅ Created Scrolloop Sentry Backend Service client:");
    console.log("   Client ID:", backendClient.clientId);
    console.log("   Client Secret:", backendSecret);
    console.log("   ⚠️  SAVE THIS SECRET - IT WILL NOT BE SHOWN AGAIN!");
    console.log("   Client Type:", backendClient.clientType);
    console.log("   Grant Types:", backendClient.grantTypes);

    // Create a third-party client example
    const { client: thirdPartyClient, clientSecret: thirdPartySecret } =
      await clientService.createClient({
        tenantId,
        name: "Example Third-Party App",
        description: "Example third-party application",
        logoUrl: "https://example.com/logo.png",
        websiteUrl: "https://example.com",
        privacyPolicyUrl: "https://example.com/privacy",
        termsOfServiceUrl: "https://example.com/terms",
        clientType: "confidential",
        grantTypes: ["authorization_code", "refresh_token"],
        redirectUris: ["https://example.com/callback"],
        allowedScopes: ["openid", "profile", "email"],
        requirePkce: false,
        requireConsent: true, // Third-party MUST show consent
        isFirstParty: false,
        accessTokenTtl: 900,
        refreshTokenTtl: 604800,
      });

    console.log("\n✅ Created Example Third-Party App client:");
    console.log("   Client ID:", thirdPartyClient.clientId);
    console.log("   Client Secret:", thirdPartySecret);
    console.log("   Client Type:", thirdPartyClient.clientType);
    console.log("   Require Consent:", thirdPartyClient.requireConsent);
  } catch (error) {
    console.error("❌ Error seeding OAuth clients:", error);
  }

  await app.close();
}

// Run seed
seedOAuthClient()
  .then(() => {
    console.log("\n✅ OAuth client seeding complete");
    process.exit(0);
  })
  .catch((error) => {
    console.error("❌ Fatal error:", error);
    process.exit(1);
  });
