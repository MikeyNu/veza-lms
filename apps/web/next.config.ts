import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  poweredByHeader: false,
  reactStrictMode: true,
  typedRoutes: true,
  transpilePackages: ["@veza/contracts", "@veza/ui"],
};

export default nextConfig;
