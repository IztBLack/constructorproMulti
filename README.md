# 🏗️ ConstructorPro (Flutter)

App **multiplataforma (Android + iOS)** para la gestión integral de obras de
construcción: cotizaciones, presupuestos, equipo, asistencia, nómina, proyección de
raya, flujo de caja, notas de trato y reportes PDF.

**Offline-first**: la fuente de verdad es SQLite local (Drift) y la app funciona
completa **sin cuenta y sin señal**. Si se conecta una cuenta, sincroniza con
Supabase y comparte base de datos con la **web** (`web/`, Next.js): oficina en
`/admin` y portal de lectura para clientes en `/cliente`.

Versión Flutter de la app original Android (Kotlin). **Paridad funcional ~100%**
con la Kotlin, y paridad activa —módulo por módulo— con la web.

> **Plataformas:** Android + iOS (un solo código) · **Offline-first** ·
> **App:** `1.3.1+18` · **Esquema local Drift:** v13 · **Última actualización:** agosto 2026

---

## 1. Stack

| Componente | Tecnología |
|---|---|
| Lenguaje / UI | Dart + Flutter (Material 3) |
| Estado / DI | **Riverpod** |
| Base de datos | **Drift** (SQLite, reactivo, type-safe) |
| Nube (opcional) | **Supabase** (`supabase_flutter`) + `connectivity_plus` |
| Navegación | Navigator + `IndexedStack` (shell de 5 pestañas) |
| PDF | `pdf` + `printing` · Visor: `pdfx` |
| Importación | `excel` + `csv` (estado de cuenta de la obra) · `file_picker` |
| Notificaciones | `flutter_local_notifications` + `timezone` |
| Compartir / archivos | `share_plus`, `file_picker`, `image_picker` |
| Preferencias | `shared_preferences` |
| Errores | log local + **Sentry** (solo si se compila con `SENTRY_DSN`) |
| Fechas/moneda | `intl` (locale es_MX) |

Varias dependencias están **fijadas a propósito** (`pdf`, `printing`, `archive`)
porque subirlas rompe la compatibilidad con `excel`. El porqué está comentado en
[`pubspec.yaml`](pubspec.yaml): léelo antes de actualizarlas.

---

## 2. Arquitectura (Clean Architecture)

```
lib/
├── main.dart                  Arranque, crash logger, tema, locale
├── core/
│   ├── db/app_database.dart   Drift: 21 tablas, schemaVersion 13, triggers de sync
│   ├── sync/                  Motor offline-first: push/pull, roles, conflictos
│   ├── storage/               Rutas de la app y comprobantes de movimiento
│   ├── theme/                 Tema claro/oscuro (M3) + paleta compartida con la web
│   ├── format/                Moneda/fechas es_MX + helpers de semana
│   ├── settings/              Tema + recordatorio de nómina (Notifier)
│   ├── notifications/         Servicio de notificaciones locales
│   ├── crash/                 CrashLogger (local; Sentry si hay DSN)
│   └── pdf/                   Config de PDF + textos_finales.dart (párrafo final)
├── data/
│   ├── tables/tables.dart     Definición de las 21 tablas Drift
│   ├── repositories*.dart     Repositorios (obra, cotización, cuadrilla, nota, mantenimiento)
│   ├── orden_personalizado.dart  Orden manual de listas (columna `orden` + modo por lista)
│   ├── textos_pdf_service.dart   Textos de PDF a nivel empresa
│   ├── pdf_config_service.dart   Config de PDF persistida (no del teléfono)
│   ├── backup/                Import/Export JSON y ZIP (puente desde Kotlin)
│   ├── demo_data.dart         Datos de prueba completos
│   └── providers.dart         Providers Riverpod
├── domain/
│   ├── models/models.dart     Modelos puros para la lógica
│   ├── logic/                 Nómina, proyección, flujo, presupuesto, estado de cuenta,
│   │                          notas de obra, salario por periodo
│   ├── import/                Parser de estado de cuenta (Excel/CSV), dedup, reconciliación
│   ├── mappers.dart           Drift rows → modelos de dominio
│   ├── clave_generator.dart   Generador automático de claves de partida
│   └── text_import_parser.dart Importar presupuesto desde texto
├── pdf/pdf_service.dart       10 reportes PDF (por obra y globales)
└── presentation/             obras · cotizaciones · colaboradores · cuadrillas · asistencia
                              nomina (+proyección) · notas · resumen · configuraciones · onboarding
```

**Contrato de lógica de negocio** (fijado con tests de paridad contra Kotlin y contra la web):
- **Nómina:** semana lunes→domingo; DIA = Σ fracciones × salario; DESTAJO = Σ montos.
- **Proyección:** *no recalcula nómina*; arma asistencias/destajos sintéticos y llama al
  mismo `NominaCalculator`, así una semana sin ajustes da el mismo número que la raya real.
- **Flujo:** saldo = Σ entradas − Σ salidas.
- **Presupuesto:** subtotal → descuento% → IVA% → total → saldo; % aportado por partida.
- **Notas de obra:** la app **sugiere**, el dueño **decide** (todo monto se puede fijar a mano).
- **Párrafo final de los PDF:** tres niveles —documento → empresa → integrado—, gana el
  más específico; puerto exacto de `web/src/lib/pdf/textos-finales.ts`.

Los archivos que son **puerto en Dart de un archivo de la web** lo dicen en su
encabezado y tienen un test que fija los mismos números. Si tocas uno, toca el otro.

---

## 3. Módulos / pantallas

**Navegación inferior:** Obras · Cotizar · Equipo · Resumen · Config.

### Obras → detalle (4 pestañas + menú)
- **Equipo:** asignar colaboradores (+ crear inline), desvincular (baja lógica).
- **Asistencia:** vista **Día** o **Semana (grid)** editable; resumen semanal.
- **Nómina:** cálculo semanal; detalle por día; agregar/eliminar destajo; **registrar en caja**.
- **Caja:** entradas/salidas, **gasto ligado a partida**, **comprobante por movimiento**,
  nota de caja de la obra, PDF.
- **Menú:** **importar movimientos** (estado de cuenta Excel/CSV, con detección de
  duplicados y reconciliación contra el presupuesto), **notas de trato** y
  **proyectar la nómina** (solo para roles con acceso a sueldos).
- Switcher **"cambiar a obra"**; export PDF (Nómina / Caja / Estado de cuenta).

### Cotizar → detalle (3 pestañas)
- **Presupuesto:** secciones/partidas, **importar desde texto**, **clave automática**,
  **autocompletado de catálogo**, **ajuste global de precios**, **subtotal por sección**,
  avance por partida (aportado/%).
- **Pagos:** unificados (pagos manuales + entradas de caja ligadas).
- **Archivos:** fotos/planos PDF con visor.
- Estados (BORRADOR→ENVIADA→ACEPTADA→RECHAZADA), duplicar, vincular/convertir a obra,
  IVA%/descuento%, **párrafo final editable**, export PDF.

### Equipo (Colaboradores)
CRUD de colaboradores: activar/inactivar, contacto de emergencia, **historial de obras**,
buscar, ordenar (nombre/puesto/obra) o **orden manual**. **Asignación multi-obra**: un
colaborador puede estar en varias obras a la vez (chips), asignar/desvincular desde la
propia lista. El **sueldo vive en su propia tabla con vigencia por periodo**
(`colaborador_sueldo`), así una nómina vieja no cambia al subirle el sueldo a alguien.

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

### Pase de lista (cross-obra)
Pantalla dedicada para pasar lista de **todas las obras activas** en un día. Los
trabajadores aparecen **agrupados por cuadrilla**, con acción para marcar a todo el
equipo, **alta rápida (+)** y **quitar de la obra** sin salir de ahí. El orden dentro de
la cuadrilla se **arrastra con long-press** y se guarda (`cuadrilla_miembro.orden`).

### Proyección de nómina
Tabla semanal de la **raya esperada**: escenario editable (días, destajo extra, anticipos,
descuentos) sobre lo ya capturado, con PDF. Reusa el calculador real; no hay una segunda
fórmula que pueda divergir. Solo para roles con acceso a sueldos.

### Notas de obra (tratos con socios)
Tratos de palabra con constructoras o socios que **no están en el sistema**: renglones de
concepto, deducción, pago o texto; total y saldo sugeridos y **fijables a mano**; estado
abierta/liquidada y PDF. Misma aritmética que la web.

### Resumen (dashboard)
Selector **Mes/Año**, contadores (obras/equipo/cotizaciones), **KPI Pipeline** (valor de
cotizaciones pendientes), **accesos rápidos** (pase de lista, proyección, cotizar, equipo,
catálogo), **flujo por periodo**, **distribución del gasto** (nómina/material/otros),
**saldo por obra** (con # de equipo y tap al detalle), **reportes globales PDF** (flujo,
nómina, presupuestos, asistencias).

### Config
Tema (auto/claro/oscuro), recordatorio de nómina, **Puestos y salarios**, **Catálogo
(CRUD + cargar oficial)**, **Personalizar PDF** (logo, color, marca de agua, firma,
empresa, compacto; se guarda en la cuenta, no en el teléfono), **IVA por defecto**,
**Sincronización en la nube**, datos de prueba, respaldo export/import (JSON y ZIP con
binarios), tutorial de uso, reporte de errores, **zona de peligro**.

---

## 4. Datos (Drift)

**21 tablas**: `obras, puestos, colaboradores, colaborador_sueldo, obra_colaborador,
asistencias, destajos, cuadrillas, cuadrilla_miembro, asignacion_cuadrilla_obra,
cotizaciones, secciones, partidas, pagos, movimientos, catalogo_conceptos,
archivos_cotizacion, obra_presupuesto, obra_caja_nota, nota_obra, nota_obra_renglon`.
Catálogo base sembrado desde `assets/catalogo_base.json`.

Esquema local en **v13** (`schemaVersion`), con snapshots en `drift_schemas/` y **una
prueba de migración por versión** (`test/data/migration_desde_v6..v12_test.dart`): cada
salto se prueba con datos dentro, no solo comparando esquemas.

Espejo en Supabase vía `supabase/migrations/` (**0001 → 0033**). Hitos útiles para
ubicarse: cuadrillas `0015`, una jornada máxima por día `0016`, usuarios y roles `0018`,
aislamiento entre empresas `0019`, rol contador `0022`, comprobantes `0024`, orden
personalizado `0026`, sueldo en tabla aparte `0027`, notas de obra `0031`, texto final del
documento `0032`+`0033`.

**Continuidad de datos:** `BackupService` importa/exporta el mismo esquema JSON que la app
Kotlin → migración de datos sin pérdida.

---

## 5. Nube: sync offline-first (opcional)

Config → **Sincronización en la nube**. Contrato del motor (`lib/core/sync/`):

- **Drift/SQLite es la fuente de verdad**; el motor solo reconcilia con Supabase.
- **Push** de filas `pending` en **orden topológico de FK** (padres→hijos), upsert
  idempotente por PK. Las **ediciones** también viajan: un trigger por tabla remarca
  `pending` en cada UPDATE.
- **Pull incremental** por tabla con cursor `server_updated_at` (árbitro = reloj del
  servidor) y **LWW por fila**, conservando el cambio local si es más nuevo.
- **Tombstones:** `deleted_at` viaja como un campo más; nunca se borra físico.
- **Relleno dirigido de columnas nuevas** (`columnasPorLlenar`): cuando una migración
  agrega una columna que el servidor ya tiene llena, se copia del servidor *antes* del
  primer push, para que un NULL local no borre datos buenos de la oficina.
- **Conflictos de jornada:** el servidor rechaza más de una jornada por persona y día
  (regla de negocio, no un fallo de red). Esas filas quedan en `sync_status='conflict'` y
  se resuelven a mano en una pantalla que muestra los dos registros con nombres
  (Eliminar / Omitir / Subir).

**Roles** (espejo de la web): `admin`, `supervisor`, `colaborador`, `contador`, `cliente`.
Dos puertas separadas, y la diferencia entre ellas es deliberada:
- **Editar operación** — regla conservadora: solo se bloquea a `contador` y `colaborador`.
  Ante un rol desconocido o un fallo de red se concede (que rechace el push, no la UI).
- **Ver sueldos** (nómina y proyección) — **lista blanca**: `admin`, `supervisor`,
  `contador`. Un rol nuevo tiene que pedir ese permiso explícitamente.

Sin sesión no hay restricción: ese caso es la instalación local de un solo dueño.

---

## 6. La web hermana (`web/`)

Next.js 16 + React 19 + Tailwind, **online-directa contra Supabase** (sin API propia), con
PWA instalable —la vía iOS mientras no haya cuenta de Apple Developer—:

- **`/admin`** — oficina: obras, equipo, nómina, **proyección**, cotizaciones, cuadrillas,
  catálogo, notas, clientes, usuarios, ajustes, importación y PDFs.
- **`/cliente`** — portal de solo lectura: sus cotizaciones (aceptar/rechazar) y el
  **estado de cuenta por obra**, aislado por RLS.

Detalle en [`web/README.md`](web/README.md), despliegue en [`web/DEPLOY.md`](web/DEPLOY.md)
y PWA en [`web/PWA.md`](web/PWA.md).

---

## 7. Compilar y correr

```bash
flutter pub get
dart run build_runner build        # genera código de Drift
flutter analyze --no-fatal-infos lib
flutter test                       # suite completa (42 archivos de test)
flutter run -d <android>           # correr en dispositivo

# Cargar demo completo al arrancar:
flutter run --dart-define=LOAD_DEMO=true
```

**CI** (`.github/workflows/calidad.yml`): en cada push a `main` y en cada PR corren dos
jobs independientes —móvil (`build_runner` + `analyze` + **suite completa**) y web
(`tsc` + `eslint` + `vitest` + `next build`)—. Existe desde agosto de 2026, después de que
dos tests de migración estuvieran en rojo meses sin que nadie se enterara.

### Publicar una versión de Android (y con eso, el portal)

El botón de descarga del portal apunta a
`releases/latest/download/constructorpro.apk`, una ruta que GitHub resuelve al
**release más reciente**. Publicar el release *es* actualizar el portal: no hay
que editar código de la web ni volver a desplegarla.

```powershell
.\build_release.ps1        # deja build\app\outputs\flutter-apk\constructorpro.apk
gh release create v1.3.1 build\app\outputs\flutter-apk\constructorpro.apk `
  --repo IztBLack/constructorproMulti --title "ConstructorPro 1.3.1 (Android)"
```

⚠️ **El asset debe llamarse siempre `constructorpro.apk`**, sin la versión en el
nombre: el enlace del portal lo busca por nombre exacto y un
`constructorpro-1.3.1.apk` haría que devolviera 404. La versión va en el tag y en
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
(ver [`web/PWA.md`](web/PWA.md)).

---

## 8. Paridad vs app Kotlin (original)

Estado: **paridad funcional ~100%**. Todo el flujo operativo está cubierto, con varias
mejoras nuevas.

### ✅ Implementado (con paridad o mejorado)

| Área | Función |
|---|---|
| Obras | CRUD · detalle 4 pestañas · **switcher entre obras** · archivar |
| Equipo | CRUD · activar/inactivar · contacto emergencia · **historial de obras** · buscar · ordenar u **orden manual** · **crear inline al asignar** · **multi-obra (chips + asignar/desvincular desde la lista)** · **sueldo con vigencia por periodo** |
| Cuadrillas ⭐ | **nuevo (no existía en Kotlin)**: equipos por especialidad con cabo · membresía N:M con historial · asignación a obra con fechas · pase de lista agrupado · **destajo por cuadrilla con reparto por %** · también en web admin |
| Asistencia | pase de lista por día · **vista semanal (grid)** · resumen semanal · **pase de lista unificado cross-obra** · **agrupado por cuadrilla** · **alta rápida y orden arrastrable** |
| Nómina | cálculo semanal (tests de paridad) · detalle por día · agregar/**eliminar destajo** · **registrar en caja** · PDF |
| Proyección ⭐ | **nueva**: raya esperada de la semana con escenario editable (destajo extra, anticipos, descuentos) · PDF |
| Flujo de caja | entradas/salidas · **gasto ligado a partida** · **comprobante por movimiento** · **importar estado de cuenta (Excel/CSV) con dedup** · PDF |
| Notas de obra ⭐ | **nuevas**: tratos con socios externos · renglones concepto/deducción/pago/texto · total y saldo fijables · PDF |
| Cotizaciones | CRUD · estados · duplicar · vincular/convertir a obra · **IVA% y descuento configurables** · **párrafo final editable** |
| Presupuesto | secciones/partidas · **importar texto** · **clave automática** · **autocompletado catálogo** · **ajuste global de precios** · **subtotal por sección** · **avance por partida (aportado/%)** |
| Pagos | **unificados** (pagos + entradas de caja) |
| Archivos | **fotos/planos PDF con visor** |
| Catálogo | CRUD · búsqueda · **cargar catálogo oficial** |
| PDF | **logo, color, marca de agua, pie, firma, empresa, mayúsculas, modo compacto** · **diálogo de opciones por reporte** · **párrafo final en 3 niveles, idéntico al de la web** |
| Reportes globales | **flujo, nómina (por semana elegible), presupuestos, asistencias** |
| Dashboard | **selector Mes/Año** · accesos rápidos · **KPI Pipeline** · **distribución del gasto** · saldo por obra (con # equipo + tap) |
| Config | tema · recordatorio de nómina · **sync en la nube** · **zona de peligro** · respaldo JSON/ZIP · IVA por defecto · tutorial |
| Transversal | crash logger local (+ Sentry opcional) · respaldo JSON (puente desde Kotlin) · datos de prueba · **sync offline-first con roles y resolución de conflictos** |

### 🟡 Diferencias menores / decisiones de diseño

- **Diccionario de claves:** portado (~90 prefijos); el original tenía algunos más raros.
- **Editor de presupuesto a nivel obra (legacy):** en Flutter el presupuesto vive bajo
  Cotización (se "convierte en obra").
- **Importar conceptos de versiones anteriores** (catálogo): no portado.
- **Notas de trato en el menú y no en una quinta pestaña:** la `TabBar` es fija y con
  cuatro títulos cortos ya reparte justo el ancho.

---

## 9. Calidad

- `flutter analyze --no-fatal-infos lib`: sin errores ni advertencias (lo verifica el CI).
- **42 archivos de test**: lógica (nómina, proyección, flujo, presupuesto, estado de
  cuenta, notas, textos finales, permisos por rol), datos (7 migraciones de Drift, sync,
  conflictos, soft-delete), importación (Excel/CSV), PDF, contraste AA del tema y widgets.
- APK verificado en Android (tableta) e iOS (iPhone, vía SideStore/PWA).
- Auditorías y planes vivos en [`docs/`](docs): ECC, UX de navegación, paridad web↔móvil,
  sync, cuadrillas, tesorería.

---

## 10. Pendientes (TODO)

- **Pase de lista de la web (`/campo`)** — le faltan el toggle de modo y el orden manual
  que el móvil ya tiene; es el último hueco conocido de paridad de campo.
- **Rebranding a Cimnova** — trabajo hecho y verificado, **pospuesto** hasta comprar el
  dominio; el repo sigue diciendo ConstructorPro a propósito.
- **Páginas legales** (`/privacidad`, `/terminos`) — publicadas **sin indexar** mientras
  falten los datos legales que solo el dueño puede decidir.
- **Cuenta de Apple Developer** — mientras no exista, iOS va por SideStore (uso propio) o
  PWA (clientes). Con ella se abre TestFlight.
- **Finanzas móviles desde notificaciones bancarias** — idea a futuro: asociar
  cuenta↔banco y registrar movimientos leyendo las notificaciones push en Android (iOS no
  puede). No iniciado.
