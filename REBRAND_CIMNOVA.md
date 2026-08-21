# Rebrand: ConstructorPro → Cimnova

Rama: `rebrand/cimnova`. Commit original 2026-08-06; reaplicado sobre `main` el 2026-08-20.

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

## Por qué se dejó ConstructorPro (verificado 2026-08-20)

Los dos dominios que de verdad importaban están tomados:

- `constructorpro.com` — redirige a HugeDomains; un inversor lo vende en
  **$2,995 USD**. No hay sitio real detrás.
- `constructorpro.com.mx` — registrado (NS de GoDaddy), sirve una página vacía.
- Libres quedaban solo `constructorpro.mx`, `.app`, `.io` y `.net`.

Además el nombre está saturado en el mismo giro (ConstruccionPro, Contractor Pro
App, Constructor Technology AG, Build Construct Pro), y "Constructor" + "Pro" es
una combinación descriptiva: de las más difíciles de registrar ante el IMPI y de
las más difíciles de defender. `Cimnova`, al ser un término inventado, no tiene
ninguno de los dos problemas. Sus dominios seguían libres al 2026-08-20.

## Pendientes (manuales / externos)

1. **Registrar dominios**: `cimnova.mx` + `cimnova.app` (y `.com`/`.com.mx` si se
   desea). Confirmar disponibilidad en el registrador: lo verificado aquí es
   ausencia de NS, que es señal fuerte pero no prueba de registro.
2. **Registro de marca en el IMPI** (clase correspondiente); confirmar en MARCANET.
3. **Supabase (dashboard)**: renombrar proyecto (cosmético), plantillas/sender de
   correo de Auth, **Redirect URLs** del nuevo dominio. NO cambiar el project ref.
4. **Deploy web** al nuevo dominio (Vercel) + redirect 301 desde el anterior.
5. **GitHub**: nombre de repo/releases y del APK. ⚠️ El asset de cada release debe
   seguir llamándose `constructorpro.apk`: es la ruta que el portal sirve
   (`releases/latest/download/constructorpro.apk`). Cambiarlo rompe la descarga.
6. **Tiendas** (si aplica): listados de Play/App Store.

## Ya hecho

- **2026-08-20** — reaplicado sobre `main` (35 commits por delante de la base
  original). Conflictos resueltos en `web/src/lib/descargas.ts` (se conservó la
  URL `releases/latest` de main) y `build_release.ps1` (cosmético).
- Barrido de lo que entró después: doc de auditoría, ejemplo de `gh release` del
  README y la carpeta `web/design-system/constructorpro` → `cimnova`.
- **Verificación**: `tsc --noEmit` limpio, 109/109 tests de la web,
  `dart analyze lib test` sin errores ni warnings (los 6 `info` de `onReorder`
  son preexistentes en `main`, ajenos al rebrand).
