/**
 * Descargas de la app móvil — única fuente de verdad.
 *
 * Tanto la landing pública (`/`) como el acceso minimalista dentro del portal
 * (botón del header en admin y cliente) leen de AQUÍ. Así el enlace del APK se
 * cambia en un solo lugar y no queda desincronizado entre páginas.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * DÓNDE VIVE EL APK: GitHub Releases (repo público IztBLack/constructorproMulti)
 * ─────────────────────────────────────────────────────────────────────────────
 * Se eligió GitHub Releases y NO Google Drive: Drive muestra una pantalla
 * intermedia de advertencia ("este archivo es demasiado grande para analizarlo…
 * podría dañar tu computadora / Descargar de todos modos") para ejecutables
 * grandes como un APK, y no se puede saltar de forma fiable. GitHub sirve el
 * asset directo (Content-Type application/vnd.android.package-archive), sin
 * advertencia y desde un dominio de confianza. (Supabase Storage se descartó:
 * el plan Free topa en 50 MB por archivo y el APK pesa ~79 MB.)
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * EL ENLACE NO SE ACTUALIZA A MANO — apunta a `releases/latest/download/…`
 * ─────────────────────────────────────────────────────────────────────────────
 * GitHub resuelve esa ruta al asset del release MÁS RECIENTE, así que publicar
 * el release ES la actualización del portal: no hay que tocar este archivo ni
 * desplegar la web para que la gente empiece a bajar la versión nueva.
 *
 * Antes la URL venía clavada a un tag (`…/download/v1.0.2/constructorpro-1.0.2.apk`)
 * y actualizarla era un paso manual aparte; el portal se quedó sirviendo la 1.0.2
 * mientras el móvil ya iba en la 1.0.6. Un paso que hay que acordarse de hacer
 * acaba olvidándose, así que se eliminó el paso en vez de documentarlo mejor.
 *
 * ⚠️ LA ÚNICA REGLA: el asset debe llamarse SIEMPRE `constructorpro.apk`, sin el
 * número de versión en el nombre. La ruta `latest/download/<archivo>` busca por
 * nombre exacto: si un release lo sube como `constructorpro-1.0.7.apk`, este
 * enlace devuelve 404 aunque el release exista. La versión va en el TAG y en el
 * título del release, no en el nombre del archivo.
 *
 * CÓMO PUBLICAR UNA VERSIÓN NUEVA (y con eso el portal queda al día solo):
 *  1. Sube `version:` en `pubspec.yaml` (nombre + build number).
 *  2. Compila el APK:  `.\build_release.ps1`
 *     Sale en: build\app\outputs\flutter-apk\app-release.apk
 *  3. Cópialo como `constructorpro.apk` (nombre estable, ver la regla de arriba).
 *  4. Publica el release (necesita `gh` autenticado):
 *        gh release create v1.0.7 constructorpro.apk `
 *          --repo IztBLack/constructorproMulti --title "ConstructorPro 1.0.7 (Android)"
 *  5. Listo: el portal ya sirve esa versión. Aquí solo se toca `tamanoAprox` si
 *     el peso del APK cambió de forma notoria.
 */

interface ConfigDescargas {
  android: {
    /** URL de descarga directa del APK. Vacía ('') ⇒ se muestra "Próximamente". */
    url: string;
    /**
     * Tamaño aproximado para avisar al usuario. p.ej. '79 MB'
     *
     * No hay campo `version` a propósito: sería un número escrito a mano que
     * envejece en cuanto se publica un release (justamente lo que dejó al portal
     * anunciando la 1.0.2 durante semanas). La versión exacta se ve en el
     * release de GitHub y dentro de la app; el portal solo promete "la última".
     */
    tamanoAprox: string;
  };
  ios: {
    /** Aún sin definir la vía de instalación en iPhone (TestFlight / PWA). */
    disponible: boolean;
    /** Enlace cuando exista (TestFlight, etc.). Vacío mientras tanto. */
    url: string;
  };
}

export const DESCARGAS: ConfigDescargas = {
  android: {
    url: 'https://github.com/IztBLack/constructorproMulti/releases/latest/download/constructorpro.apk',
    tamanoAprox: '79 MB',
  },
  ios: {
    disponible: false,
    url: '',
  },
};

/** Enlace de descarga del APK de Android, o `null` si aún no se ha publicado. */
export function enlaceApkAndroid(): string | null {
  return DESCARGAS.android.url || null;
}

/** Enlace de la app de iPhone, o `null` mientras no esté disponible. */
export function enlaceAppIos(): string | null {
  if (!DESCARGAS.ios.disponible || !DESCARGAS.ios.url) return null;
  return DESCARGAS.ios.url;
}
