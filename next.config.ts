import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Output standalone build for Docker/Azure App Service deployment
  output: "standalone",

  // Security headers
  headers: async () => [
    {
      source: "/(.*)",
      headers: [
        { key: "X-Frame-Options", value: "DENY" },
        { key: "X-Content-Type-Options", value: "nosniff" },
        { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
        {
          key: "Permissions-Policy",
          value: "camera=(), microphone=(), geolocation=()",
        },
      ],
    },
  ],

  // Strict mode for catching issues early
  reactStrictMode: true,
};

export default nextConfig;
