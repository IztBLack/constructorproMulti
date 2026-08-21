# 🏗️ Cimnova (Flutter)

App **multiplataforma (Android + iOS)** para la gestión integral de obras de
construcción: cotizaciones, presupuestos, equipo, asistencia, nómina, flujo de caja
y reportes PDF. **100% offline** (SQLite local).

Versión Flutter de la app original Android (Kotlin). **Paridad funcional ~100%**
con varias mejoras nuevas.

> **Plataformas:** Android + iOS (un solo código) · **Offline 100%** · **Última actualización:** junio 2026

---

## 1. Stack

| Componente | Tecnología |
|---|---|
| Lenguaje / UI | Dart + Flutter (Material 3) |
| Estado / DI | **Riverpod** |
| Base de datos | **Drift** (SQLite, reactivo, type-safe) |
| Navegación | Navigator + `IndexedStack` (shell de 5 pestañas) |
| PDF | `pdf` + `printing` · Visor: `pdfx` |
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
  IVA%/descuento%, export PDF.

### Equipo (Colaboradores)
CRUD de colaboradores: activar/inactivar, contacto de emergencia, **historial de obras**,
buscar, ordenar (nombre/puesto/obra). **Asignación multi-obra**: un colaborador puede
estar en varias obras a la vez (chips), asignar/desvincular desde la propia lista.

#### Cuadrillas (equipos de colaboradores)
Capa organizativa encima de los colaboradores: una **cuadrilla** agrupa trabajadores por
**especialidad** (albañilería, acero, cimbra, instalaciones, acabados, mixta) bajo un
**cabo** (jefe de cuadrilla). Es **global por empresa** y **rota entre obras** mediante
asignaciones con fechas, conservando el historial.

- **Gestión** (icono de grupos en Equipo): crear/editar, agregar/quitar miembros, marcar
  el cabo, asignar/desasignar obras.
- **Pase de lista agrupado**: los trabajadores se listan bajo su cuadrilla, con acción
  **"marcar toda la cuadrilla"**. La asistencia sigue siendo individual.
- **Destajo por cuadrilla**: se captura una **bolsa** (obra, concepto, total) y se reparte
  por **porcentaje** entre los miembros; genera un destajo por persona, así la **nómina lo
  suma sin cambios**.

También disponible en la **web admin** (`/admin/cuadrillas`), salvo el pase de lista.
Detalle de diseño y decisiones en [`docs/cuadrillas_diseno.md`](docs/cuadrillas_diseno.md).

### Resumen (dashboard)
Selector **Mes/Año**, contadores (obras/equipo/cotizaciones), **KPI Pipeline** (valor de
cotizaciones pendientes), **accesos rápidos** (pase de lista, cotizar, equipo, catálogo),
**flujo por periodo**, **distribución del gasto** (nómina/material/otros), **saldo por obra**
(con # de equipo y tap al detalle), **reportes globales PDF** (flujo, nómina, presupuestos,
asistencias).

### Config
Tema, recordatorio de nómina, **Puestos**, **Catálogo (CRUD + cargar oficial)**,
**Personalizar PDF** (logo, color, marca de agua, firma, compacto), **IVA por defecto**,
datos de prueba, respaldo export/import, reporte de errores, **zona de peligro**.

### Pase de lista (cross-obra)
Pantalla dedicada para pasar lista de **todas las obras activas** en un día. Los
trabajadores aparecen **agrupados por cuadrilla**, con acción para marcar a todo el equipo.

---

## 4. Datos (Drift)

17 tablas: `obras, puestos, colaboradores, obra_colaborador, asistencias, destajos,
cuadrillas, cuadrilla_miembro, asignacion_cuadrilla_obra, cotizaciones, secciones,
partidas, pagos, movimientos, catalogo_conceptos, archivos_cotizacion, obra_presupuesto`.
Catálogo base sembrado desde `assets/catalogo_base.json`.

Esquema local en **v7** (`schemaVersion`), con snapshots en `drift_schemas/` y prueba de
migración en `test/data/migration_v7_test.dart`. Espejo en Supabase vía
`supabase/migrations/` (cuadrillas = `0015_cuadrillas.sql`).

**Continuidad de datos:** `BackupService` importa/exporta el mismo esquema JSON que la app
Kotlin → migración de datos sin pérdida.

---

## 5. Compilar y correr

```bash
flutter pub get
dart run build_runner build        # genera código de Drift
flutter analyze
flutter test                       # tests de lógica (nómina/flujo/presupuesto)
flutter run -d <android>           # correr en dispositivo

# Cargar demo completo al arrancar:
flutter run --dart-define=LOAD_DEMO=true
```

### Publicar una versión de Android (y con eso, el portal)

El botón de descarga del portal apunta a
`releases/latest/download/constructorpro.apk`, una ruta que GitHub resuelve al
**release más reciente**. Publicar el release *es* actualizar el portal: no hay
que editar código de la web ni volver a desplegarla.

```powershell
.\build_release.ps1        # deja build\app\outputs\flutter-apk\constructorpro.apk
gh release create v1.0.7 build\app\outputs\flutter-apk\constructorpro.apk `
  --repo IztBLack/constructorproMulti --title "Cimnova 1.0.7 (Android)"
```

⚠️ **El asset debe llamarse siempre `constructorpro.apk`**, sin la versión en el
nombre: el enlace del portal lo busca por nombre exacto y un
`constructorpro-1.0.7.apk` haría que devolviera 404. La versión va en el tag y en
el título del release. `build_release.ps1` ya deja la copia con el nombre correcto
y te imprime el comando; el enlace vive en `web/src/lib/descargas.ts`.

Esto sustituye al flujo anterior, en el que la URL estaba clavada a un tag y había
que actualizarla a mano: se olvidaba, y el portal siguió ofreciendo la 1.0.2
mientras la app ya iba en la 1.0.6.

**iOS sin Mac (app nativa):** GitHub Actions (`.github/workflows/ios-build.yml`) compila
un IPA sin firmar en un runner macOS y lo publica en un Release rodante con tag
`sidestore` + un `apps.json`. Se instala con **SideStore** agregando esa fuente una sola
vez: las actualizaciones se aplican desde el iPhone, sin PC. SideStore auto-renueva el
certificado de 7 días del Apple ID gratuito por Wi-Fi (Sideloadly es el flujo de
respaldo, y exige reconectar la PC cada semana).

Esta vía sirve para uso propio; **no** para distribuir a clientes (cada uno necesitaría
su Apple ID y una PC para el alta). Para clientes iOS, mientras no haya cuenta de Apple
Developer (~$99 USD/año, que habilitaría TestFlight), la vía es la **PWA** de la web
(ver `web/PWA.md`).

---

## 6. Paridad vs app Kotlin (original)

Estado: **paridad funcional ~100%**. Todo el flujo operativo está cubierto, con varias
mejoras nuevas.

### ✅ Implementado (con paridad o mejorado)

| Área | Función |
|---|---|
| Obras | CRUD · detalle 4 pestañas · **switcher entre obras** |
| Equipo | CRUD · activar/inactivar · contacto emergencia · **historial de obras** · buscar · ordenar (nombre/puesto/obra) · **crear inline al asignar** · **multi-obra (chips + asignar/desvincular desde la lista)** |
| Cuadrillas ⭐ | **nuevo (no existía en Kotlin)**: equipos por especialidad con cabo · membresía N:M con historial · asignación a obra con fechas · pase de lista agrupado · **destajo por cuadrilla con reparto por %** · también en web admin |
| Asistencia | pase de lista por día · **vista semanal (grid)** · resumen semanal · **pase de lista unificado cross-obra** · **agrupado por cuadrilla** |
| Nómina | cálculo semanal (16 tests de paridad) · detalle por día · agregar/**eliminar destajo** · **registrar en caja** · PDF |
| Flujo de caja | entradas/salidas · **gasto ligado a partida** · PDF |
| Cotizaciones | CRUD · estados · duplicar · vincular/convertir a obra · **IVA% y descuento configurables** |
| Presupuesto | secciones/partidas · **importar texto** · **clave automática** · **autocompletado catálogo** · **ajuste global de precios** · **avance por partida (aportado/%)** |
| Pagos | **unificados** (pagos + entradas de caja) |
| Archivos | **fotos/planos PDF con visor** |
| Catálogo | CRUD · búsqueda · **cargar catálogo oficial** |
| PDF | **logo, color, marca de agua, pie, firma, empresa, mayúsculas, modo compacto** · **diálogo de opciones por reporte** |
| Reportes globales | **flujo, nómina (por semana elegible), presupuestos, asistencias** |
| Dashboard | **selector Mes/Año** · accesos rápidos · **KPI Pipeline** · **distribución del gasto** · saldo por obra (con # equipo + tap) |
| Config | tema · recordatorio de nómina · **zona de peligro** · respaldo · IVA por defecto |
| Transversal | crash logger local · respaldo JSON (puente desde Kotlin) · datos de prueba |

### 🟡 Diferencias menores / decisiones de diseño

- **Config de PDF por documento** (`pdfConfigJson` por obra/cotización): se cubre con el
  diálogo de opciones por reporte; no se persiste override por entidad.
- **Diccionario de claves:** portado (~90 prefijos); el original tenía algunos más raros.
- **Editor de presupuesto a nivel obra (legacy):** en Flutter el presupuesto vive bajo
  Cotización (se "convierte en obra").
- **Importar conceptos de versiones anteriores** (catálogo): no portado.

### 🔧 Calidad
- `flutter analyze`: sin issues.
- Tests de paridad de lógica (nómina, flujo, presupuesto) en `test/logic/`.
- APK verificado en Android (tableta) e iOS (iPhone vía Sideloadly).

---

## 7. Roadmap

- **Fase 5 — Release:** firma Android (keystore), ícono/nombre, versión, política de
  privacidad, build de tiendas.
- **Nube + sync offline-first:** plan deliberado aparte (documento local de planeación).
