import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Both ship runtime assets (fonts, worker modules) that must be resolved from
  // node_modules instead of being bundled into the server output.
  serverExternalPackages: ["@react-pdf/renderer", "pdfjs-dist"],
};

export default nextConfig;
