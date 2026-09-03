import type { NextConfig } from "next";

const marketingConfig: NextConfig = {
  // Cloudflare Pages serves the public marketing surface as static assets.
  output: "export",
  distDir: "out",
  reactStrictMode: true,
  env: {
    // The console is deployed separately from the public marketing site.
    NEXT_PUBLIC_MARKETING_ONLY: "true",
  },
};

export default marketingConfig;
