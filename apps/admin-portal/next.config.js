/** @type {import('next').NextConfig} */
const nextConfig = {
  transpilePackages: [
    "@repo/ui",
    "@fortknox/sdk",
    "@fortknox/types",
    "@repo/shared",
    "@repo/security",
    "@scrolloop/admin-client",
    "@scrolloop/sentry-config",
    "@scrolloop/types"
  ],
  env: {
    SENTRY_TENANT_ID: process.env.SENTRY_TENANT_ID,
  },
};

export default nextConfig;
