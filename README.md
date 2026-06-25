# 🏗️ ConstructorPro (Flutter)

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
Pantalla dedicada para pasar lista de **todas las obras activas** en un día.

---

## 4. Datos (Drift)

13 tablas: `obras, puestos, colaboradores, obra_colaborador, asistencias, destajos,
cotizaciones, secciones, partidas, pagos, movimientos, catalogo_conceptos, archivos_cotizacion`.
Catálogo base sembrado desde `assets/catalogo_base.json`.

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

**iOS sin Mac:** GitHub Actions (`.github/workflows/ios-build.yml`) compila un IPA sin
firmar en un runner macOS; se instala en el iPhone con Sideloadly (Apple ID gratuito,
certificado de 7 días).

---

## 6. Paridad vs app Kotlin (original)

Estado: **paridad funcional ~100%**. Todo el flujo operativo está cubierto, con varias
mejoras nuevas.

### ✅ Implementado (con paridad o mejorado)

| Área | Función |
|---|---|
| Obras | CRUD · detalle 4 pestañas · **switcher entre obras** |
| Equipo | CRUD · activar/inactivar · contacto emergencia · **historial de obras** · buscar · ordenar (nombre/puesto/obra) · **crear inline al asignar** · **multi-obra (chips + asignar/desvincular desde la lista)** |
| Asistencia | pase de lista por día · **vista semanal (grid)** · resumen semanal · **pase de lista unificado cross-obra** |
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
