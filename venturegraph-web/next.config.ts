import type { NextConfig } from "next";
import path from "node:path";

const nextConfig: NextConfig = {
  // Allow IDE browser-preview proxy in dev
  allowedDevOrigins: ["127.0.0.1", "localhost", "192.168.56.1"],
  // Disable Turbopack for production build (use webpack — more stable for SSR + Recharts)
  // Turbopack is used for `dev` via the --turbopack flag in package.json
};

export default nextConfig;
