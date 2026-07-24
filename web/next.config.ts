import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // pdfjs-dist se carga en runtime del server (import de la build legacy .mjs)
  // para el import de estados de cuenta en PDF; no debe bundlearse.
  // puppeteer-core + @sparticuz/chromium generan el PDF de cotización con Chromium
  // headless: tampoco deben bundlearse (traen binarios y rutas nativas).
  serverExternalPackages: ['pdfjs-dist', 'puppeteer-core', '@sparticuz/chromium'],

  // Fuerza a incluir el binario de Chromium (archivos .br) en el trazado de la
  // función que genera el PDF; sin esto, el file-tracing de Next puede dejarlo
  // fuera y la función falla en runtime al buscar el ejecutable.
  outputFileTracingIncludes: {
    '/admin/cotizaciones/[id]/pdf/descargar/route': [
      './node_modules/@sparticuz/chromium/**',
    ],
  },

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
