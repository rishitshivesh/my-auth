/** @type {import('next').NextConfig} */
const nextConfig = {
  transpilePackages: [
    "@repo/ui",
    "@fortknox/sdk",
    "@fortknox/types",
    "@repo/shared",
    "@repo/security"
  ],
  env: {
    SENTRY_TENANT_ID: process.env.SENTRY_TENANT_ID,
  },
};

export default nextConfig;
