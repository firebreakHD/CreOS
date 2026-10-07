import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  outputFileTracingExcludes: {
    "*": ["./data/**/*", "./.test-data/**/*", "./.env*", "./.git/**/*", "./creatoros/**/*", "./tests/**/*", "**/integrations.key", "**/integrations.vault.json", "**/creatoros_brain_export*.json"],
  },
  poweredByHeader: false,
  reactStrictMode: true,
  turbopack: { root: process.cwd() },
};

export default nextConfig;
