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
 * CÓMO PUBLICAR UNA VERSIÓN NUEVA:
 *  1. Compila el APK:  `.\build_release.ps1`
 *     Sale en: build\app\outputs\flutter-apk\app-release.apk
 *  2. Renómbralo con versión, p.ej. constructorpro-1.0.3.apk
 *  3. Crea el Release y sube el asset (necesita `gh` autenticado):
 *        gh release create v1.0.3 constructorpro-1.0.3.apk `
 *          --repo IztBLack/constructorproMulti --title "ConstructorPro 1.0.3 (Android)"
 *  4. Actualiza `android` de abajo: `url`, `version` y `tamanoAprox`.
 *     La URL de descarga directa de un asset tiene esta forma:
 *        https://github.com/<owner>/<repo>/releases/download/<tag>/<archivo>.apk
 */

interface ConfigDescargas {
  android: {
    /** URL de descarga directa del APK. Vacía ('') ⇒ se muestra "Próximamente". */
    url: string;
    /** Versión visible (informativa). p.ej. '1.0.2' */
    version: string;
    /** Tamaño aproximado para avisar al usuario. p.ej. '79 MB' */
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
    url: 'https://github.com/IztBLack/constructorproMulti/releases/download/v1.0.2/constructorpro-1.0.2.apk',
    version: '1.0.2',
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
