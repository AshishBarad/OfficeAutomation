import type { NextConfig } from "next";
import path from "path";

const nextConfig: NextConfig = {
  // Pin the Turbopack workspace root to this directory.
  // Without this, Turbopack detects a stray package-lock.json in the home
  // directory and tries to scan it, hitting an OS permission error and crashing.
  turbopack: {
    root: path.resolve(__dirname),
  },
};

export default nextConfig;
