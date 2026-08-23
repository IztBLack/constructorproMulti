import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // pdfjs-dist se carga en runtime del server (import de la build legacy .mjs)
  // para el import de estados de cuenta en PDF; no debe bundlearse.
  // puppeteer-core + @sparticuz/chromium generan el PDF de cotización con Chromium
  // headless: tampoco deben bundlearse (traen binarios y rutas nativas).
  serverExternalPackages: ['pdfjs-dist', 'puppeteer-core', '@sparticuz/chromium'],

  // Fuerza a incluir el binario de Chromium (carpeta bin/*.br) en el trazado de
  // la función que genera el PDF. Sin esto, el file-tracing de Next solo sigue los
  // .js de @sparticuz/chromium (los que se `require`) y deja fuera el binario, que
  // se carga por una ruta calculada en runtime → la función truena buscándolo.
  //
  // La clave es un glob de RUTA (picomatch): los corchetes del segmento dinámico
  // van ESCAPADOS (`\\[id\\]`), si no picomatch los toma como clase de caracteres
  // y no hace match. Los valores se resuelven desde la raíz del proyecto (web/).
  outputFileTracingIncludes: {
    '/admin/cotizaciones/\\[id\\]/pdf/descargar': [
      './node_modules/@sparticuz/chromium/**/*',
    ],
    '/admin/obras/\\[id\\]/pdf/descargar': [
      './node_modules/@sparticuz/chromium/**/*',
    ],
    '/cliente/obras/\\[id\\]/estado-cuenta/descargar': [
      './node_modules/@sparticuz/chromium/**/*',
    ],
    '/cliente/cotizaciones/\\[id\\]/pdf/descargar': [
      './node_modules/@sparticuz/chromium/**/*',
    ],
    '/admin/obras/\\[id\\]/nomina/pdf/descargar': [
      './node_modules/@sparticuz/chromium/**/*',
    ],
    // Nota de obra (trato con un socio): mismo Chromium, misma necesidad.
    '/admin/obras/\\[id\\]/notas/\\[notaId\\]/pdf/descargar': [
      './node_modules/@sparticuz/chromium/**/*',
    ],
    // PDF de estado de cuenta del cliente generado desde el lado admin/oficina:
    // también renderiza con Chromium, así que necesita empaquetar el binario o
    // da 500 en producción (Vercel).
    '/admin/obras/\\[id\\]/estado-cuenta-cliente/descargar': [
      './node_modules/@sparticuz/chromium/**/*',
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
