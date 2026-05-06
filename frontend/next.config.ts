import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  reactStrictMode: true,
  serverExternalPackages: [],
  experimental: {
    proxyTimeout: 120_000,
  },
  async redirects() {
    return [
      {
        source: "/interview-simulator",
        destination: "/agents",
        permanent: true,
      },
    ];
  },
  async rewrites() {
    const backendUrl =
      process.env.BACKEND_INTERNAL_URL || "http://localhost:8300";
    const simUrl =
      process.env.INTERVIEW_SIM_INTERNAL_URL || "http://interview-simulator:8000";
    return [
      {
        source: "/api/sim/:path*",
        destination: `${simUrl}/api/sim/:path*`,
      },
      {
        source: "/api/:path*",
        destination: `${backendUrl}/api/:path*`,
      },
    ];
  },
};

export default nextConfig;
