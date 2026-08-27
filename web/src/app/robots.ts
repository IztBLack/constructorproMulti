import type { MetadataRoute } from 'next';
import { urlSitio } from '@/lib/sitio';

/**
 * `robots.txt` (convención de metadata de Next: `app/robots.ts` → `/robots.txt`).
 *
 * Aquí lo importante NO es el SEO, es el cierre: sin este archivo, Google puede
 * indexar `/campo` —que es HTML estático precacheado por el service worker, así
 * que responde 200 sin sesión— y también `/login`, `/offline` y las pantallas de
 * recuperación de contraseña. Nada de eso debe aparecer en un buscador.
 *
 * Ojo: `Disallow` NO es un control de acceso, es una petición que los buscadores
 * respetan por convención. La protección real de `/admin` y `/cliente` sigue
 * siendo el middleware + la RLS de Postgres; esto solo evita que las URLs se
 * publiquen.
 */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: '*',
      allow: '/',
      disallow: [
        '/admin',
        '/cliente',
        '/campo',
        '/auth',
        '/onboarding',
        '/login',
        '/recuperar',
        '/nueva-contrasena',
        '/offline',
      ],
    },
    sitemap: `${urlSitio()}/sitemap.xml`,
  };
}
