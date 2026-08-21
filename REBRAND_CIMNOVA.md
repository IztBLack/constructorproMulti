# Rebrand: ConstructorPro → Cimnova

Rama: `rebrand/cimnova` (basada en `main`). Fecha: 2026-08-06.

**Cimnova** = "cimiento" + "-nova". Conserva el espíritu del acrónimo CIME
(Construcción, Ingeniería y Manejo Empresarial). Dominios verificados **libres**
en el momento del cambio: `cimnova.mx`, `cimnova.app`, `cimnova.com`,
`cimnova.com.mx`.

## Qué cambió en el código

- **Nombre visible** en todas las superficies de usuario: `ConstructorPro` → `Cimnova`.
  - Android: `android:label`.
  - iOS: `CFBundleDisplayName` / `CFBundleName` + textos de permisos (cámara, fotos).
  - Flutter: `MaterialApp.title`, clase `ConstructorProApp` → `CimnovaApp`, tutorial,
    crash logger, nombre por defecto de empresa en PDFs, textos de respaldo.
  - Web (Next.js): `metadata.title`, `manifest.ts` (`name`/`short_name`), docs.
  - `privacy_policy.html`, READMEs y docs.
- **Íconos de app** regenerados desde el logo maestro (armex de castillo + zapata
  isométrica + nodo ámbar sobre fondo `#141414`): Android mipmaps, iOS AppIcon set,
  y PWA web (incluye variante *maskable* con safe-zone). Maestro: `assets/branding/`.
- Total: ~97 archivos de texto + 42 íconos.

## Qué se CONSERVÓ a propósito (no tocar sin plan)

- **`applicationId` / package Android** `com.mario.constructorpro` — cambiarlo rompe
  la actualización de la APK ya instalada (se distribuye por GitHub Releases).
- **Nombre del paquete Dart** `name: constructorpro` en `pubspec.yaml` — lo usan los
  `import package:constructorpro/...`; es identificador interno, no visible.
- **Nombre npm** `constructorpro_web` (web/package.json) — interno.
- **Firma de respaldos** en `lib/data/backup/backup_service.dart`: los respaldos nuevos
  se firman como `'Cimnova'`, pero **se sigue aceptando la firma antigua `'ConstructorPro'`**
  al importar, para no romper respaldos existentes de los usuarios.
- URLs/dominios en minúsculas (`constructorpro-tawny...`) — se cambian al migrar el deploy.

## Pendientes (manuales / externos)

1. **Registrar dominios**: `cimnova.mx` + `cimnova.app` (y `.com`/`.com.mx` si se desea).
2. **Registro de marca en el IMPI** (clase correspondiente).
3. **Supabase (dashboard)**: renombrar proyecto (cosmético), plantillas/sender de correo
   de Auth, **Redirect URLs** del nuevo dominio. NO cambiar el project ref.
4. **Deploy web** al nuevo dominio (Vercel) + redirect 301 desde el dominio anterior.
5. **GitHub**: nombre de repo/releases, README, nombre del archivo APK.
6. **Verificar build**: `flutter analyze` + build de Android/iOS (no se corrió aquí).
7. **Tiendas** (si aplica): listados de Play/App Store.
