import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // pdfjs-dist se carga en runtime del server (import de la build legacy .mjs)
  // para el import de estados de cuenta en PDF; no debe bundlearse.
  serverExternalPackages: ['pdfjs-dist'],

  async headers() {
    return [
      {
        // `sw.js` no debe cachearse: si el navegador sirve una copia vieja del
        // service worker, una corrección (por ejemplo, dejar de cachear algo que
        // no debía cachearse) nunca llega al dispositivo.
        source: '/sw.js',
        headers: [
          { key: 'Cache-Control', value: 'no-cache, no-store, must-revalidate' },
          { key: 'Service-Worker-Allowed', value: '/' },
        ],
      },
    ];
  },
};

export default nextConfig;
