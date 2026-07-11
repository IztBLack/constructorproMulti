import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // pdfjs-dist se carga en runtime del server (import de la build legacy .mjs)
  // para el import de estados de cuenta en PDF; no debe bundlearse.
  serverExternalPackages: ['pdfjs-dist'],
};

export default nextConfig;
