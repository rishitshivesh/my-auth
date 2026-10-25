/** @type {import('next').NextConfig} */
const nextConfig = {
  // The e2e harness builds into its own directory so it never clobbers a developer's `.next`.
  distDir: process.env.NEXT_DIST_DIR || ".next",
  // Emails link to /verify-email and /reset-password (FRONTEND_URL + path); the pages live under /u.
  async redirects() {
    return [
      { source: "/verify-email", destination: "/u/verify-email", permanent: false },
      { source: "/reset-password", destination: "/u/reset-password", permanent: false },
    ];
  },
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
