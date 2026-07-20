import type { MetadataRoute } from 'next';

/**
 * Manifest de la PWA (convención de archivo de metadata de Next 16:
 * `app/manifest.ts` → se sirve en `/manifest.webmanifest`).
 *
 * `start_url` apunta a `/campo`, no a `/admin`, porque la app instalada existe
 * sobre todo para pasar lista en obra. Y es la única pantalla que abre **sin
 * señal**: su HTML es estático y está precacheada por el service worker,
 * mientras que `/admin` se renderiza en el servidor y sin red termina en
 * `/offline`. Arrancar en `/campo` es lo que hace útil a la app instalada.
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'ConstructorPro',
    short_name: 'ConstructorPro',
    description: 'Gestión de obras: nómina, asistencia, cotizaciones y pagos.',
    start_url: '/campo',
    scope: '/',
    display: 'standalone',
    orientation: 'portrait',
    lang: 'es-MX',
    dir: 'ltr',
    // Fondo de la pantalla de arranque, antes del primer pintado. Es el
    // `Background` del design system (`web/design-system/constructorpro/MASTER.md`),
    // por decisión de marca.
    //
    // Ojo al probar en dispositivo: la UI web real es clara (`bg-neutral-50`), así
    // que al abrir la app se pasa de este fondo oscuro a una interfaz clara. Si ese
    // destello molesta en el iPhone, el arreglo es volver a `#FFFFFF`.
    background_color: '#0F172A',
    // `theme_color` = barra de estado del sistema. Es el Primary del design system
    // (`web/design-system/constructorpro/MASTER.md`), no el azul del ícono móvil.
    theme_color: '#1E293B',
    icons: [
      {
        src: '/icons/icon-192.png',
        sizes: '192x192',
        type: 'image/png',
        purpose: 'any',
      },
      {
        src: '/icons/icon-512.png',
        sizes: '512x512',
        type: 'image/png',
        purpose: 'any',
      },
      {
        src: '/icons/icon-maskable-192.png',
        sizes: '192x192',
        type: 'image/png',
        purpose: 'maskable',
      },
      {
        src: '/icons/icon-maskable-512.png',
        sizes: '512x512',
        type: 'image/png',
        purpose: 'maskable',
      },
    ],
  };
}
