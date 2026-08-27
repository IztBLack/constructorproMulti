import type { MetadataRoute } from 'next';
import { BORRADOR_LEGAL, RUTAS_LEGALES } from '@/lib/legal/datos';
import { RUTAS_PUBLICAS, urlSitio } from '@/lib/sitio';

/**
 * Sitemap (convención de metadata de Next: `app/sitemap.ts` → `/sitemap.xml`).
 *
 * Solo las rutas públicas de `RUTAS_PUBLICAS`. No se listan rutas con sesión:
 * un sitemap que anuncia `/admin` es una lista de puertas para quien la lea.
 *
 * Mientras el cuerpo legal siga en borrador, las páginas legales tampoco se
 * listan. El `noindex` de `metadataBorrador()` ya basta para que no se indexen;
 * esto es para no pedirle activamente a Google que vaya a leer una página que
 * acto seguido le va a decir que se dé la vuelta.
 */
export default function sitemap(): MetadataRoute.Sitemap {
  const base = urlSitio();
  const ahora = new Date();

  const ocultas: readonly string[] = BORRADOR_LEGAL ? RUTAS_LEGALES : [];

  return RUTAS_PUBLICAS.filter((ruta) => !ocultas.includes(ruta)).map((ruta) => ({
    url: ruta === '/' ? base : `${base}${ruta}`,
    lastModified: ahora,
    changeFrequency: ruta === '/' ? ('monthly' as const) : ('yearly' as const),
    priority: ruta === '/' ? 1 : 0.5,
  }));
}
