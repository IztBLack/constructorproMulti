/**
 * URL pública del sitio — fuente única para metadata, robots y sitemap.
 *
 * NO se clava el dominio a mano: hoy es un `*.vercel.app` y el proyecto tiene
 * pendiente decidir dominio propio (ver la nota de marca en el README). Un
 * dominio escrito en tres archivos distintos es un dominio que se queda viejo
 * en dos de ellos.
 *
 * Orden de resolución:
 *  1. `NEXT_PUBLIC_SITE_URL` — el dominio definitivo, cuando exista. Mándala.
 *  2. `VERCEL_PROJECT_PRODUCTION_URL` — la que Vercel inyecta sola y apunta
 *     SIEMPRE a producción, incluso al construir un preview. Es justo lo que
 *     queremos para las URLs canónicas: un preview no debe anunciarse a sí
 *     mismo como el sitio bueno.
 *  3. localhost — desarrollo.
 */
export function urlSitio(): string {
  const explicita = process.env.NEXT_PUBLIC_SITE_URL;
  if (explicita) return explicita.replace(/\/$/, '');

  const vercel = process.env.VERCEL_PROJECT_PRODUCTION_URL;
  if (vercel) return `https://${vercel}`;

  return 'http://localhost:3000';
}

/**
 * Rutas públicas indexables. Todo lo demás del sitio vive detrás de sesión
 * (`/admin`, `/cliente`) o es maquinaria de autenticación, y se bloquea en
 * `robots.ts`.
 */
export const RUTAS_PUBLICAS = ['/', '/privacidad', '/terminos', '/soporte'] as const;
