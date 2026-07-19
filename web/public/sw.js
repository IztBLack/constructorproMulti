/**
 * Service worker de ConstructorPro — shell offline mínimo.
 *
 * ============================================================
 * REGLA DE SEGURIDAD (multi-tenant): NUNCA cachear respuestas
 * autenticadas.
 * ============================================================
 * Esta app es multi-tenant: cada usuario pertenece a una empresa distinta y
 * varios usuarios pueden compartir el mismo dispositivo/navegador. Guardar en
 * `Cache Storage` el cuerpo de una respuesta de `/admin`, `/cliente`, `/auth`,
 * un payload RSC, una Server Action o cualquier llamada a Supabase permitiría
 * servirle a un usuario los datos de la empresa de otro. Es una fuga de datos
 * entre empresas.
 *
 * Por eso este SW solo cachea recursos públicos e inmutables:
 *   - `/_next/static/*` (assets con hash en el nombre)
 *   - `/icons/*` y el favicon
 *   - la página `/offline` (estática, sin datos)
 *
 * Las navegaciones van *siempre* a la red primero y su respuesta NUNCA se
 * guarda; si la red falla se sirve `/offline` desde el precache.
 */

const CACHE = 'constructorpro-v1';
const OFFLINE_URL = '/offline';

/** Recursos precacheados en `install`. Todos públicos y sin datos de usuario. */
const PRECACHE_URLS = [
  OFFLINE_URL,
  '/icons/icon-192.png',
  '/icons/icon-512.png',
  '/icons/icon-maskable-192.png',
  '/icons/icon-maskable-512.png',
  '/icons/apple-touch-icon.png',
];

/**
 * Prefijos de rutas cuyo cuerpo jamás debe tocar el caché.
 * Es una lista de denegación explícita además de la de permitidos: si alguien
 * agrega una regla nueva más abajo, esta sigue siendo la última barrera.
 */
const RUTAS_PROHIBIDAS = ['/admin', '/cliente', '/auth', '/api', '/login', '/onboarding'];

function esRutaAutenticada(url) {
  return RUTAS_PROHIBIDAS.some(
    (prefijo) => url.pathname === prefijo || url.pathname.startsWith(prefijo + '/'),
  );
}

/** ¿Es un recurso público, inmutable y seguro de cachear? */
function esEstaticoCacheable(url) {
  if (esRutaAutenticada(url)) return false;
  return (
    url.pathname.startsWith('/_next/static/') ||
    url.pathname.startsWith('/icons/') ||
    url.pathname === '/favicon.ico'
  );
}

self.addEventListener('install', (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(CACHE);
      // `addAll` es todo-o-nada; si un ícono falta preferimos no romper la
      // instalación completa, así que cacheamos uno por uno tolerando fallos.
      await Promise.all(
        PRECACHE_URLS.map((url) =>
          cache.add(new Request(url, { cache: 'reload' })).catch(() => undefined),
        ),
      );
      // Activamos de inmediato: el SW no cachea nada sensible, así que no hay
      // riesgo de que una versión nueva sirva datos viejos de otro usuario.
      await self.skipWaiting();
    })(),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      const nombres = await caches.keys();
      await Promise.all(
        nombres
          .filter((nombre) => nombre.startsWith('constructorpro-') && nombre !== CACHE)
          .map((nombre) => caches.delete(nombre)),
      );
      await self.clients.claim();
    })(),
  );
});

/** Cache-first para estáticos con hash: si está en caché no se vuelve a pedir. */
async function cacheFirst(request) {
  const cache = await caches.open(CACHE);
  const enCache = await cache.match(request);
  if (enCache) return enCache;

  const respuesta = await fetch(request);
  // Solo guardamos respuestas completas y correctas (nada de 206 ni opacas).
  if (respuesta && respuesta.status === 200 && respuesta.type === 'basic') {
    cache.put(request, respuesta.clone());
  }
  return respuesta;
}

/**
 * Network-first para navegaciones. La respuesta NO se guarda nunca: puede ser
 * una página de `/admin` con datos de una empresa concreta.
 */
async function navegacionConFallback(request) {
  try {
    return await fetch(request);
  } catch {
    const cache = await caches.open(CACHE);
    const offline = await cache.match(OFFLINE_URL);
    if (offline) return offline;
    return new Response(
      '<!doctype html><meta charset="utf-8"><title>Sin conexión</title><p>Sin conexión.</p>',
      { status: 503, headers: { 'Content-Type': 'text/html; charset=utf-8' } },
    );
  }
}

self.addEventListener('fetch', (event) => {
  const { request } = event;

  // Solo GET del mismo origen. Todo lo demás (POST de Server Actions, Supabase,
  // terceros) pasa de largo sin que el SW lo toque.
  if (request.method !== 'GET') return;

  let url;
  try {
    url = new URL(request.url);
  } catch {
    return;
  }
  if (url.origin !== self.location.origin) return;

  if (request.mode === 'navigate') {
    event.respondWith(navegacionConFallback(request));
    return;
  }

  if (esEstaticoCacheable(url)) {
    event.respondWith(cacheFirst(request));
    return;
  }

  // Resto (payloads RSC, prefetch, rutas autenticadas, cualquier otra cosa):
  // sin intervención del SW → van directo a la red y no se cachean.
});
