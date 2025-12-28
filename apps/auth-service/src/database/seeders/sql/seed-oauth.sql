-- ============================================================
-- Fort Knox: Create Tenant & Seed OAuth Clients
-- ============================================================
-- Tenant: "NexaTech Industries" - A futuristic tech company
-- Subdomain: nexatech
-- ============================================================

-- Generate UUIDs (PostgreSQL)
-- You can replace these with actual UUIDs
DO $$
DECLARE
tenant_id UUID := gen_random_uuid();
  admin_user_id UUID := gen_random_uuid();
  admin_portal_client_id UUID := gen_random_uuid();
  backend_service_client_id UUID := gen_random_uuid();
  third_party_client_id UUID := gen_random_uuid();
  admin_password_hash TEXT;
BEGIN

  -- ============================================================
  -- 1. CREATE TENANT
  -- ============================================================

INSERT INTO tenants (
    id,
    name,
    slug,
    active,
    settings,
    created_at,
    updated_at
) VALUES (
             tenant_id,
             'NexaTech Industries',
             'nexatech',
             true,
             jsonb_build_object(
                     'branding', jsonb_build_object(
                     'logo_url', 'https://nexatech.io/logo.png',
                     'primary_color', '#00D4FF',
                     'secondary_color', '#FF006E'
                                 ),
                     'features', jsonb_build_object(
                             'mfa_enabled', true,
                             'oauth2_enabled', true,
                             'sso_enabled', true
                                 )
             ),
             NOW(),
             NOW()
         );

RAISE NOTICE '✅ Created tenant: NexaTech Industries (%))', tenant_id;

  -- ============================================================
  -- 2. CREATE ADMIN USER
  -- ============================================================

  -- Password hash for "NexaTech2024!@#" (Argon2id)
  -- You'll need to generate this using your PasswordService
  -- For now, using a placeholder
  admin_password_hash := '$argon2id$v=19$m=65536,t=3,p=4$placeholder';

INSERT INTO users (
    id,
    tenant_id,
    email,
    password_hash,
    first_name,
    last_name,
    email_verified,
    is_active,
    created_at,
    updated_at
) VALUES (
             admin_user_id,
             tenant_id,
             'admin@nexatech.io',
             admin_password_hash,
             'Nexa',
             'Admin',
             true,
             true,
             NOW(),
             NOW()
         );

RAISE NOTICE '✅ Created admin user: admin@nexatech.io (%))', admin_user_id;

  -- ============================================================
  -- 3. CREATE OAUTH CLIENT: NexaTech Portal (SPA)
  -- ============================================================

INSERT INTO oauth_clients (
    id,
    tenant_id,
    client_id,
    client_secret_hash,
    client_type,
    name,
    description,
    logo_url,
    website_url,
    privacy_policy_url,
    terms_of_service_url,
    grant_types,
    redirect_uris,
    post_logout_redirect_uris,
    allowed_origins,
    token_endpoint_auth_method,
    require_pkce,
    allowed_scopes,
    default_scopes,
    access_token_ttl,
    refresh_token_ttl,
    id_token_ttl,
    authorization_code_ttl,
    rotate_refresh_tokens,
    application_type,
    subject_type,
    require_consent,
    is_first_party,
    is_active,
    created_by,
    created_at,
    updated_at
) VALUES (
             admin_portal_client_id,
             tenant_id,
             'nexatech_portal_' || substr(md5(random()::text), 1, 16),
             NULL, -- Public client (no secret)
             'public',
             'NexaTech Portal',
             'Official NexaTech admin dashboard and user portal',
             'https://portal.nexatech.io/logo.png',
             'https://portal.nexatech.io',
             'https://nexatech.io/privacy',
             'https://nexatech.io/terms',
             ARRAY['authorization_code', 'refresh_token']::text[],
             ARRAY[
                 'http://localhost:3000/callback',
             'http://localhost:3000/auth/callback',
             'https://portal.nexatech.io/callback',
             'https://portal.nexatech.io/auth/callback'
                 ]::text[],
             ARRAY[
                 'http://localhost:3000',
             'https://portal.nexatech.io'
                 ]::text[],
             ARRAY[
                 'http://localhost:3000',
             'https://portal.nexatech.io'
                 ]::text[],
             'none', -- Public client
             true, -- PKCE required
             ARRAY['openid', 'profile', 'email', 'offline_access']::text[],
             ARRAY['openid', 'profile', 'email']::text[],
             900, -- 15 minutes
             604800, -- 7 days
             3600, -- 1 hour
             600, -- 10 minutes
             true,
             'spa',
             'public',
             false, -- First-party, no consent needed
             true,
             true,
             admin_user_id,
             NOW(),
             NOW()
         );

RAISE NOTICE '✅ Created OAuth client: NexaTech Portal (public, PKCE)';

  -- ============================================================
  -- 4. CREATE OAUTH CLIENT: NexaTech API (M2M)
  -- ============================================================

  -- Generate client secret for confidential client
  -- In production, use your PasswordService to hash this
  -- Secret: "nexatech_secret_" || random

INSERT INTO oauth_clients (
    id,
    tenant_id,
    client_id,
    client_secret_hash,
    client_type,
    name,
    description,
    grant_types,
    redirect_uris,
    token_endpoint_auth_method,
    require_pkce,
    allowed_scopes,
    default_scopes,
    access_token_ttl,
    refresh_token_ttl,
    id_token_ttl,
    authorization_code_ttl,
    rotate_refresh_tokens,
    application_type,
    subject_type,
    require_consent,
    is_first_party,
    is_active,
    created_by,
    created_at,
    updated_at
) VALUES (
             backend_service_client_id,
             tenant_id,
             'nexatech_api_' || substr(md5(random()::text), 1, 16),
             '$argon2id$v=19$m=65536,t=3,p=4$placeholder_secret_hash', -- TODO: Hash actual secret
             'confidential',
             'NexaTech API Service',
             'Backend API for machine-to-machine authentication',
             ARRAY['client_credentials']::text[],
             ARRAY[]::text[], -- No redirect URIs for M2M
             'client_secret_basic',
             false, -- PKCE not needed for confidential clients
             ARRAY['users:read', 'users:write', 'api:read', 'api:write', 'admin:all']::text[],
             ARRAY['api:read', 'users:read']::text[],
             3600, -- 1 hour for M2M
             86400, -- 1 day (even though not used for client_credentials)
             3600, -- 1 hour
             600, -- 10 minutes
             false,
             'web',
             'public',
             false,
             true,
             true,
             admin_user_id,
             NOW(),
             NOW()
         );

RAISE NOTICE '✅ Created OAuth client: NexaTech API Service (confidential, M2M)';

  -- ============================================================
  -- 5. CREATE OAUTH CLIENT: External Partner App
  -- ============================================================

INSERT INTO oauth_clients (
    id,
    tenant_id,
    client_id,
    client_secret_hash,
    client_type,
    name,
    description,
    logo_url,
    website_url,
    privacy_policy_url,
    terms_of_service_url,
    grant_types,
    redirect_uris,
    post_logout_redirect_uris,
    allowed_origins,
    token_endpoint_auth_method,
    require_pkce,
    allowed_scopes,
    default_scopes,
    access_token_ttl,
    refresh_token_ttl,
    id_token_ttl,
    authorization_code_ttl,
    rotate_refresh_tokens,
    application_type,
    subject_type,
    require_consent,
    is_first_party,
    is_active,
    created_by,
    created_at,
    updated_at
) VALUES (
             third_party_client_id,
             tenant_id,
             'partner_app_' || substr(md5(random()::text), 1, 16),
             '$argon2id$v=19$m=65536,t=3,p=4$placeholder_partner_secret', -- TODO: Hash actual secret
             'confidential',
             'QuantumSync Analytics',
             'Third-party analytics platform integrated with NexaTech',
             'https://quantumsync.io/logo.png',
             'https://quantumsync.io',
             'https://quantumsync.io/privacy',
             'https://quantumsync.io/terms',
             ARRAY['authorization_code', 'refresh_token']::text[],
             ARRAY[
                 'https://quantumsync.io/auth/callback',
             'https://app.quantumsync.io/callback'
                 ]::text[],
             ARRAY[
                 'https://quantumsync.io',
             'https://app.quantumsync.io'
                 ]::text[],
             ARRAY[
                 'https://quantumsync.io',
             'https://app.quantumsync.io'
                 ]::text[],
             'client_secret_post',
             false, -- Confidential client, PKCE optional
             ARRAY['openid', 'profile', 'email']::text[],
             ARRAY['openid', 'profile']::text[],
             900,
             604800,
             3600,
             600,
             true,
             'web',
             'public',
             true, -- Third-party MUST show consent
             false,
             true,
             admin_user_id,
             NOW(),
             NOW()
         );

RAISE NOTICE '✅ Created OAuth client: QuantumSync Analytics (third-party, requires consent)';

  -- ============================================================
  -- 6. OUTPUT SUMMARY
  -- ============================================================

  RAISE NOTICE '
═══════════════════════════════════════════════════════════════
  🎉 NEXATECH INDUSTRIES - TENANT CREATED SUCCESSFULLY
═══════════════════════════════════════════════════════════════

📋 Tenant Details:
   Name: NexaTech Industries
   Slug: nexatech
   Tenant ID: %
   Active: true

👤 Admin User:
   Email: admin@nexatech.io
   Password: NexaTech2024!@# (hash placeholder)
   User ID: %

🔐 OAuth Clients Created:

   1️⃣  NexaTech Portal (SPA - Public Client)
      Type: Public (PKCE Required)
      Grant Types: authorization_code, refresh_token
      Scopes: openid, profile, email, offline_access
      Redirect URIs:
        - http://localhost:3000/callback
        - https://portal.nexatech.io/callback

   2️⃣  NexaTech API Service (M2M - Confidential)
      Type: Confidential (Client Credentials)
      Grant Types: client_credentials
      Scopes: users:*, api:*, admin:all
      Use Case: Backend service authentication

   3️⃣  QuantumSync Analytics (Third-Party)
      Type: Confidential
      Grant Types: authorization_code, refresh_token
      Consent Required: YES
      Scopes: openid, profile, email

═══════════════════════════════════════════════════════════════
🚀 Next Steps:
   1. Update password hash for admin user
   2. Update client secret hashes
   3. Test OAuth flows
   4. Configure custom domain (if needed)
═══════════════════════════════════════════════════════════════
', tenant_id, admin_user_id;

END $$;

-- ============================================================
-- VERIFICATION QUERIES
-- ============================================================

-- Check tenant
SELECT
    id,
    name,
    slug,
    active,
    created_at
FROM tenants
WHERE slug = 'nexatech';

-- Check admin user
SELECT
    id,
    email,
    first_name,
    last_name,
    email_verified,
    is_active
FROM users
WHERE email = 'admin@nexatech.io';

-- Check OAuth clients
SELECT
    client_id,
    name,
    client_type,
    grant_types,
    require_pkce,
    require_consent,
    is_first_party,
    is_active
FROM oauth_clients
WHERE tenant_id = (SELECT id FROM tenants WHERE slug = 'nexatech')
ORDER BY created_at;