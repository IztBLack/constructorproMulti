# 🏗️ ConstructorPro (Flutter)

App **multiplataforma (Android + iOS)** para la gestión integral de obras de
construcción: cotizaciones, presupuestos, equipo, asistencia, nómina, flujo de caja
y reportes PDF. **100% offline** (SQLite local).

Versión Flutter de la app original Android (Kotlin), con paridad funcional ~95%+ y
mejoras nuevas.

## Stack
Flutter · Riverpod · Drift (SQLite) · pdf/printing · flutter_local_notifications.

## Correr
```bash
flutter pub get
dart run build_runner build
flutter run                                  # en un dispositivo
flutter run --dart-define=LOAD_DEMO=true     # con datos de prueba
flutter test                                 # tests de lógica (nómina/flujo/presupuesto)
```

## iOS sin Mac
El workflow `.github/workflows/ios-build.yml` compila un IPA (sin firmar) en un runner
macOS de GitHub Actions; se instala en el iPhone con Sideloadly + Apple ID gratuito.

## Documentación
- [DOCUMENTACION.md](DOCUMENTACION.md) — arquitectura, módulos, datos.
- [PARIDAD.md](PARIDAD.md) — estado de paridad vs la app Kotlin.
