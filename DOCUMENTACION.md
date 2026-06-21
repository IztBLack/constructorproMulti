# 📱 ConstructorPro (Flutter) — Documentación Técnica

> **Plataformas:** Android + iOS (un solo código) · **Offline 100%** (SQLite local)
> **Última actualización:** junio 2026

Versión multiplataforma de ConstructorPro (originalmente app Android nativa en
Kotlin). Gestión integral de obras: cotizaciones, presupuestos, equipo, asistencia,
nómina, flujo de caja y reportes PDF.

---

## 1. Stack

| Componente | Tecnología |
|---|---|
| Lenguaje / UI | Dart + Flutter (Material 3) |
| Estado / DI | **Riverpod** |
| Base de datos | **Drift** (SQLite, reactivo, type-safe) |
| Navegación | Navigator + `IndexedStack` (shell de 5 pestañas) |
| PDF | `pdf` + `printing` |
| Visor PDF | `pdfx` |
| Notificaciones | `flutter_local_notifications` + `timezone` |
| Compartir / archivos | `share_plus`, `file_picker`, `image_picker` |
| Preferencias | `shared_preferences` |
| Fechas/moneda | `intl` (locale es_MX) |

---

## 2. Arquitectura (Clean Architecture)

```
lib/
├── main.dart                  Arranque, crash logger, tema, locale
├── core/
│   ├── db/app_database.dart   Drift: 13 tablas + seed del catálogo
│   ├── theme/                 Tema claro/oscuro (Material 3)
│   ├── format/                Moneda/fechas es_MX + helpers de semana
│   ├── settings/              Tema + recordatorio de nómina (Notifier)
│   ├── notifications/         Servicio de notificaciones locales
│   ├── crash/                 CrashLogger (offline)
│   └── pdf/pdf_config.dart    Config de PDF (logo, color, marca de agua…)
├── data/
│   ├── tables/tables.dart     Definición de las 13 tablas Drift
│   ├── repositories*.dart     Repositorios (obra, cotización, mantenimiento…)
│   ├── backup/                Import/Export JSON (puente desde Kotlin)
│   ├── demo_data.dart         Datos de prueba completos
│   └── providers.dart         Providers Riverpod
├── domain/
│   ├── models/models.dart     Modelos puros para la lógica
│   ├── logic/                 Calculadores: nómina, flujo, presupuesto
│   ├── mappers.dart           Drift rows → modelos de dominio
│   ├── clave_generator.dart   Generador automático de claves de partida
│   └── text_import_parser.dart Importar presupuesto desde texto
├── pdf/pdf_service.dart       Generación de los reportes PDF
└── presentation/             Pantallas (obras, cotizaciones, equipo, resumen, config…)
```

**Contrato de lógica de negocio** (verificado con 16 tests de paridad contra Kotlin):
- **Nómina:** semana lunes→domingo; DIA = Σ fracciones × salario; DESTAJO = Σ montos.
- **Flujo:** saldo = Σ entradas − Σ salidas.
- **Presupuesto:** subtotal → descuento% → IVA% → total → saldo; % aportado por partida.

---

## 3. Módulos / pantallas

**Navegación inferior:** Obras · Cotizar · Equipo · Resumen · Config.

### Obras → detalle (4 pestañas)
- **Equipo:** asignar colaboradores (+ crear inline), desvincular (baja lógica).
- **Asistencia:** vista **Día** o **Semana (grid)** editable; resumen semanal.
- **Nómina:** cálculo semanal; detalle por día; agregar/eliminar destajo; **registrar en caja**.
- **Caja:** entradas/salidas, **gasto ligado a partida**, PDF.
- Switcher **"cambiar a obra"**; export PDF (Nómina/Caja).

### Cotizar → detalle (3 pestañas)
- **Presupuesto:** secciones/partidas, **importar desde texto**, **clave automática**,
  **autocompletado de catálogo**, **ajuste global de precios**, avance por partida (aportado/%).
- **Pagos:** unificados (pagos manuales + entradas de caja ligadas).
- **Archivos:** fotos/planos PDF con visor.
- Estados (BORRADOR→ENVIADA→ACEPTADA→RECHAZADA), duplicar, vincular/convertir a obra,
  IVA%/descuento%, export PDF (IVA, descuento, avance).

### Equipo
CRUD de colaboradores: activar/inactivar, contacto de emergencia, **historial de obras**,
buscar, ordenar (nombre/puesto/obra).

### Resumen (dashboard)
Selector **Mes/Año**, contadores, **accesos rápidos** (pase de lista, cotizar, equipo, catálogo),
**flujo por periodo**, **distribución del gasto** (nómina/material/otros), saldo por obra,
**reportes globales PDF** (flujo, nómina, presupuestos, asistencias).

### Config
Tema, recordatorio de nómina, **Puestos**, **Catálogo (CRUD + cargar oficial)**,
**Personalizar PDF** (logo, color, marca de agua, firma, compacto), **IVA por defecto**,
datos de prueba, respaldo export/import, reporte de errores, **zona de peligro**.

### Pase de lista (cross-obra)
Pantalla dedicada para pasar lista de **todas las obras activas** en un día.

---

## 4. Datos (Drift)

13 tablas: `obras, puestos, colaboradores, obra_colaborador, asistencias, destajos,
cotizaciones, secciones, partidas, pagos, movimientos, catalogo_conceptos, archivos_cotizacion`.
Catálogo base de **239 conceptos** sembrado desde `assets/catalogo_base.json`.

**Continuidad de datos:** `BackupService` importa/exporta el mismo esquema JSON que la app
Kotlin → migración de datos sin pérdida.

---

## 5. Compilar y correr

```bash
flutter pub get
dart run build_runner build        # genera código de Drift
flutter analyze
flutter test                       # 16 tests de lógica
flutter run -d <android>           # correr en dispositivo

# Cargar demo completo al arrancar:
flutter run --dart-define=LOAD_DEMO=true
```

**iOS sin Mac:** GitHub Actions (`.github/workflows/ios-build.yml`) compila un IPA sin
firmar en un runner macOS; se instala en el iPhone con Sideloadly (Apple ID gratuito).

---

## 6. Estado de paridad vs app Kotlin

Paridad funcional **~95%+**. Detalle completo y diferencias menores en
[PARIDAD.md](PARIDAD.md).
