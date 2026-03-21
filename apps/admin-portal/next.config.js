/** @type {import('next').NextConfig} */
const nextConfig = {
  transpilePackages: ["@repo/ui"],
  env: {
    FORTKNOX_TENANT_ID: process.env.FORTKNOX_TENANT_ID,
  },
};

export default nextConfig;
