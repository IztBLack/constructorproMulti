/**
 * Descargas de la app móvil — única fuente de verdad.
 *
 * Tanto la landing pública (`/`) como el acceso minimalista dentro del portal
 * (botón del header en admin y cliente) leen de AQUÍ. Así el enlace del APK se
 * cambia en un solo lugar y no queda desincronizado entre páginas.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * CÓMO PUBLICAR EL APK EN GOOGLE DRIVE (mientras no esté en tiendas)
 * ─────────────────────────────────────────────────────────────────────────────
 *  1. Compila el APK universal:  `.\build_release.ps1`
 *     Sale en: build\app\outputs\flutter-apk\app-release.apk
 *  2. Súbelo a Google Drive (idealmente a una carpeta "ConstructorPro / APKs").
 *     Sugerencia: renómbralo con versión, p.ej. constructorpro-1.0.0.apk
 *  3. Clic derecho → Compartir → Acceso general: "Cualquier persona con el
 *     enlace" → rol "Lector". (Sin esto, la descarga pedirá iniciar sesión.)
 *  4. Copia el enlace. Se ve así:
 *        https://drive.google.com/file/d/XXXXXXXXXXXXXXXXX/view?usp=sharing
 *     El ID es el trozo entre /d/ y /view  →  XXXXXXXXXXXXXXXXX
 *  5. Pega ese ID en `android.driveFileId` de abajo y rellena versión/tamaño.
 *
 * Por qué guardamos el ID y no la URL: el enlace que da "Compartir" abre la
 * vista previa de Drive, no descarga. Con el ID construimos el enlace de
 * DESCARGA DIRECTA (ver `enlaceApkAndroid`), que además incluye `confirm=t`
 * para saltar la pantalla intermedia de "Google no analizó este archivo" que
 * aparece con archivos grandes como un APK.
 */

interface ConfigDescargas {
  android: {
    /** ID del archivo APK en Google Drive. Vacío ('') ⇒ se muestra "Próximamente". */
    driveFileId: string;
    /** Versión visible (informativa). p.ej. '1.0.0' */
    version: string;
    /** Tamaño aproximado para avisar al usuario. p.ej. '48 MB' */
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
    driveFileId: '1iUt7B15ts0qcNu89yhA93hre_VBXzSnn',
    version: '1.0.2',
    tamanoAprox: '79 MB',
  },
  ios: {
    disponible: false,
    url: '',
  },
};

/**
 * Enlace de DESCARGA DIRECTA del APK desde Google Drive, o `null` si aún no se
 * ha publicado (`driveFileId` vacío).
 *
 * Usa el host `drive.usercontent.google.com`, que es el que sirve el binario
 * (no la vista previa), y `confirm=t` para saltar el aviso de análisis de
 * archivos grandes.
 */
export function enlaceApkAndroid(): string | null {
  const id = DESCARGAS.android.driveFileId;
  if (!id) return null;
  return `https://drive.usercontent.google.com/download?id=${id}&export=download&confirm=t`;
}

/** Enlace de la app de iPhone, o `null` mientras no esté disponible. */
export function enlaceAppIos(): string | null {
  if (!DESCARGAS.ios.disponible || !DESCARGAS.ios.url) return null;
  return DESCARGAS.ios.url;
}
