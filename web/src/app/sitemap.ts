import type { MetadataRoute } from 'next';
import { RUTAS_PUBLICAS, urlSitio } from '@/lib/sitio';

/**
 * Sitemap (convención de metadata de Next: `app/sitemap.ts` → `/sitemap.xml`).
 *
 * Solo las rutas públicas de `RUTAS_PUBLICAS`. No se listan rutas con sesión:
 * un sitemap que anuncia `/admin` es una lista de puertas para quien la lea.
 */
export default function sitemap(): MetadataRoute.Sitemap {
  const base = urlSitio();
  const ahora = new Date();

  return RUTAS_PUBLICAS.map((ruta) => ({
    url: ruta === '/' ? base : `${base}${ruta}`,
    lastModified: ahora,
    changeFrequency: ruta === '/' ? ('monthly' as const) : ('yearly' as const),
    priority: ruta === '/' ? 1 : 0.5,
  }));
}
