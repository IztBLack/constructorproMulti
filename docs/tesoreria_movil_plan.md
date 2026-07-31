# Capa de tesorería en el móvil — plan (paridad con web 0016–0025)

> Rama: `claude/mobile-ux-improvement-3b65fb`. Plan verificado contra el código el
> 2026-07-28: las diez migraciones del servidor (`supabase/migrations/0016–0025`),
> el esquema Drift del móvil (`lib/data/tables/tables.dart`, `schemaVersion 7`), el
> motor de sync (`lib/core/sync/sync_service.dart`) y el arnés de pruebas de
> migración (`test/data/migration_v7_test.dart`, `drift_schemas/`).
>
> **Estado: PLAN. Nada de esta capa está implementado en el móvil.** Lo que sí está
> hecho y commiteado en esta rama es la fase visual (diseño + buscador/filtros +
> indicador de sync) y la auditoría que confirmó que las ediciones sí sincronizan
> (`0c5b9f2`). Ver `MEMORY.md → sistema-diseno-movil`.
>
> **Decisiones del dueño (2026-07-28), ya tomadas y bakeadas en este plan:**
> 1. Comprobantes (T2) → **Storage real** (bucket, paridad con web), no local.
> 2. Rol contador (T4) → **T4-mínimo** (ocultar acciones que el rol no puede
>    escribir; el servidor sigue siendo la autoridad de RLS).

## 0. Qué de las diez migraciones toca al móvil y qué NO

La mitad de las 0016–0025 son **puramente de servidor** (RLS, rate-limit, magic
links). El móvil no replica RLS — Supabase la aplica en el push. Reparto:

| Mig. | Qué es | ¿Trabajo en móvil? |
|---|---|---|
| 0016 | Trigger: máx. 1 jornada/día sumando obras | **Sí, robustez de sync (T0)** — el push del móvil puede ser rechazado |
| 0017 | IVA congelado por cotización + `empresa_config` + renombrar empresa | **Sí, bug de datos (T1)**; `empresa_config` fuera de alcance |
| 0018 | Módulo usuarios/roles + RLS | No — servidor + web; el móvil solo canjea códigos |
| 0019 | Aislamiento entre empresas (RLS) | No — solo servidor |
| 0020 | Rate-limit del canje + colaborador no borra caja (RLS) | No directo — se relaciona con T4 |
| 0021 | Código de invitación a 6 dígitos | No — el móvil ya acepta 6 dígitos |
| 0022 | Rol **contador** (tesorería) | **T4** — el móvil no tiene conciencia de rol |
| 0023 | Nota de conciliación de caja por obra (`obra_caja_nota`) | **Sí, función nueva (T3)** |
| 0024 | Comprobante (imagen/PDF) por movimiento + bucket Storage | **Sí, función nueva (T2)** |
| 0025 | Invitar socios por correo (magic link) | No — flujo web puro |

**El trabajo real del móvil son cinco piezas: T1 (IVA), T2 (comprobantes), T3
(nota), T4 (rol), T0 (robustez sync 0016).** Lo demás es del servidor y ya está en
producción.

## Mecánica común: subir una versión de esquema Drift (exacto)

Cada fase que toca la base repite estos pasos. Se listan una vez; las fases los
referencian.

1. `app_database.dart`: `schemaVersion` **7 → 8** (una sola vez para T1+T2+T3).
2. En `onUpgrade`, bloque `if (from < 8) { … }` que añade columnas/tablas
   **verificando existencia primero** (patrón `pragma_table_info` /
   `sqlite_master` ya usado en v5–v7) y al final llama `await
   _instalarTriggersSync();` — **obligatorio**: `createTable`/`addColumn` no
   instalan el trigger `mark_pending`.
3. Regenerar snapshot y arnés:
   - `dart run drift_dev schema dump lib/core/db/app_database.dart drift_schemas/`
     → crea `drift_schema_v8.json`.
   - `dart run drift_dev schema generate drift_schemas/ test/generated_migrations/`
     → crea `schema_v8.dart`.
4. `test/data/migration_v7_to_v8_test.dart` calcado de `migration_v7_test.dart`:
   inserta datos en v7, migra a v8, verifica esquema contra snapshot y que los
   datos viejos sobreviven.
5. **Tabla nueva** → agregarla a `SyncService.pushOrder` (`sync_service.dart`) **y**
   a la lista de `SyncMetadata.resetAll()` (`sync_metadata.dart`). El pull/push
   iteran `pushOrder`, así sincroniza sola.
6. **Columna nueva en tabla existente** → no toca el sync: el pull ya filtra a
   columnas locales y el push manda `SELECT *`. Al agregarla en Drift **con el
   mismo nombre snake_case que el servidor**, empieza a viajar sola.

## T1 — IVA congelado por cotización *(bug de datos; máxima prioridad)*

**El bug, confirmado:** `cotizacion_detail_screen.dart:259` y `:304` leen
`ref.read/watch(ivaPorcentajeProvider)` —un global en SharedPreferences— y se lo
pasan a `PresupuestoCalculator.calcular(ivaPercentage: …)`. Si cambias el IVA
global, **el total de toda cotización pasada se recalcula**. Una cotización
aceptada al 16 % aparece de pronto con otro total. El servidor ya lo resolvió en
0017 con `cotizaciones.iva_porcentaje default 16`.

**Cambios exactos:**
1. Esquema (v8): en `Cotizaciones` (`tables.dart`) añadir
   `RealColumn get ivaPorcentaje => real().withDefault(const Constant(16.0))();`.
   Nombre en BD: `iva_porcentaje` (coincide con el servidor → sincroniza sola). El
   default 16 rellena filas viejas con la tasa que ya tenían quemada en código:
   **ningún total cambia al migrar**, igual que en el servidor.
2. Alta de cotización: al crear (`_dialog` de `cotizaciones_screen.dart`) y en
   `duplicar`/`convertirEnObra` de `repositories_cotizacion.dart`, **tomar foto**
   del `ivaPorcentajeProvider` actual y escribirla en `ivaPorcentaje`. Nunca
   volver a leer el global para una cotización existente.
3. Cálculo: en las dos llamadas de `cotizacion_detail_screen.dart`, cambiar
   `ivaPercentage: ref.read(ivaPorcentajeProvider)` por
   `ivaPercentage: cot.ivaPorcentaje`. `PresupuestoCalculator` no cambia.
4. El global pasa a ser **solo el valor por defecto de nuevas** — como
   `empresa_config.iva_porcentaje` del servidor. Ajustar la etiqueta de Config
   (`config_screen.dart:79`) a "IVA por defecto (nuevas cotizaciones)".
5. Test: editar el IVA global **no** altera el total de una cotización ya creada;
   una nueva nace con el global vigente.

**Fuera:** `empresa_config` como tabla sincronizada. El "IVA por defecto" ya vive
en SharedPreferences y funciona; traerlo duplicaría el valor con reglas de
precedencia nuevas.

## T2 — Comprobante (imagen/PDF) por movimiento → **Storage**

**Estado:** el servidor (0024) añadió `movimientos.comprobante_uri text` + bucket
privado `comprobantes`. El móvil **no usa Supabase Storage en ningún lado**; sus
adjuntos de cotización se guardan **solo local** (`image_picker`/`file_picker` →
copia a documentos → ruta vía `AppPaths`, ver `cotizacion_detail_screen.dart:1011`).
Paquetes ya disponibles: `image_picker`, `file_picker`, `pdfx`, `supabase_flutter`
(incluye cliente Storage).

**Decisión tomada: Storage real (paridad con web).** El archivo debe llegar a la
oficina; una foto que se queda en el teléfono no cumple su propósito.

**Cambios exactos:**
1. Esquema (v8): en `Movimientos` añadir
   `TextColumn get comprobanteUri => text().nullable()();`. Nombre en BD:
   `comprobante_uri`. La columna sincroniza sola (movimientos ya está en
   `pushOrder`).
2. Subida a Storage (capacidad nueva en el móvil):
   - Ruta del objeto **`<empresa_id>/<obra_id>/<uuid>.<ext>`** — el patrón que
     exige la policy del bucket en el servidor (`(storage.foldername(name))[1]`).
   - Subir con el cliente Storage de `supabase_flutter`; guardar esa ruta en
     `comprobante_uri`.
   - **Encolado offline:** el móvil es offline-first. La subida debe encolarse y
     reintentarse cuando haya red, en la misma línea que el `SyncController`; hasta
     que suba, el `comprobante_uri` local puede apuntar a un archivo temporal y
     marcarse pendiente de subida. Definir el mecanismo de cola como parte de esta
     fase (es la pieza más grande de las cinco por esto).
3. Ver el comprobante: generar **signed URL** desde la ruta y abrir/renderizar
   (imagen con `Image.network`; PDF con `pdfx`).
4. UI: en `_movDialog` y en la fila de movimiento de la pestaña Caja
   (`obra_detail_screen.dart`), botón "Adjuntar comprobante" (cámara/galería/PDF,
   reusando el flujo de adjuntos) y miniatura tocable si ya tiene uno.
5. Alcance de rol (del servidor 0024): comprobantes solo para oficina —admin,
   supervisor, contador—; colaborador y cliente NO. Se apoya en T4.

**Nota:** es la única fase que requiere una capacidad nueva de plataforma (Storage
con cola offline); conviene tratarla como fase propia después de T1/T3.

## T3 — Nota de conciliación de caja por obra *(la más contenida)*

**Estado:** el servidor (0023) creó `obra_caja_nota (obra_id PK, empresa_id, nota,
…)` — texto libre de conciliación por obra ("DIFERENCIA A FAVOR $20,957 CON…").
Tabla 1-a-1 con obra, con columnas de sync estándar. Es tabla aparte y no columna
en `obras` porque la contadora (0022) solo tiene **lectura** sobre `obras` y RLS es
por fila, no por columna.

**Cambios exactos:**
1. Esquema (v8): tabla nueva `ObraCajaNota` en `tables.dart` con
   `TextColumn get obraId => text()();` (PK),
   `TextColumn get nota => text().withDefault(const Constant(''))();` + mixin
   `SyncCols`. En `onUpgrade`, `createTable`.
2. Sync: agregar `'obra_caja_nota'` a `pushOrder` (**después de `obras`** por la
   FK) y a `resetAll()`.
3. Repo: `ObraCajaNotaRepository` con `watch(obraId)` y `upsert(obraId, nota)` — el
   trigger `mark_pending` cubre la edición.
4. UI: en la pestaña Caja del detalle de obra, tarjeta "Nota de conciliación"
   editable (campo multilínea) al pie del resumen.
5. Test: alta/edición marca `pending` (blindar con un caso).

## T4 — Conciencia de rol *(T4-mínimo, decisión tomada)*

**El problema, concreto:** el móvil hoy **no tiene concepto de rol** — asume acceso
total (admin). Con la RLS del servidor ya en producción (0018/0020/0022), si un
**contador** o **colaborador** inicia sesión en el móvil, la UI le ofrece editar
obras/cotizaciones que su rol no puede escribir. Esas escrituras se guardan local,
el push **las rechaza**, quedan en `sync_status='error'`… **y el indicador de sync
recién construido las muestra como error.** Es una interacción real entre lo nuevo
y este hueco.

**Alcance tomado: T4-mínimo.**
- Leer el rol del usuario (consulta a `usuarios_empresa`, ya accesible por RLS),
  guardarlo en un provider, y en el móvil **ocultar/deshabilitar** las acciones que
  el rol no permite. Para **contador**: caja (movimientos + pagos) sí; obras,
  cotizaciones, presupuesto, catálogo, nómina → solo lectura; usuarios y config →
  nada. Espeja el alcance de 0022.
- No replica RLS (el servidor sigue siendo la autoridad); solo evita ofrecer
  botones que terminarán en error. Es lo que hace que el indicador de sync no
  mienta.

**Fuera (T4-completo):** gestión de usuarios en móvil (invitar/rol/baja). Trabajo
de oficina que la web ya cubre; sobra en un teléfono de campo.

## T0 — Robustez del sync frente al trigger 0016 *(transversal, pequeña)*

**El problema:** 0016 puso en el servidor un trigger que rechaza acumular >1
jornada/día sumando todas las obras. La llave única del móvil es
`(colaborador, obra, fecha)` — **no cuenta entre obras**. Si se da el caso, el push
se rechaza, la fila queda `error`. Con el indicador nuevo ahora **se ve** el error,
lo cual es bueno, pero conviene **prevenirlo**.

**Cambios:** en el pase de lista (`pase_lista_screen.dart`) y en
`AsistenciaRepository.setFraccion`, validar antes de escribir que la suma de
fracciones del colaborador ese día (todas las obras) no pase de 1, con un mensaje
que nombre la otra obra — espejando lo que el trigger hace en el servidor. Misma
regla, del lado del cliente, para que el error nunca nazca.

## Orden de ejecución

Una sola subida de esquema **v7 → v8** agrupa T1 + T3 (+ la columna de T2), para no
fragmentar la migración en tres saltos:

1. **T1 (IVA)** — bug de datos; primero.
2. **T3 (nota)** — la más contenida; misma v8.
3. **T2 (comprobante)** — la columna entra en v8; el flujo Storage + cola offline es
   su propia fase.
4. **T4-mínimo (rol)** — cierra la interacción con el indicador de sync.
5. **T0 (sync 0016)** — robustez, sin prisa.

Cada fase: `flutter analyze` limpio + suite en verde + APK release probado, y su
commit por separado.

## Anexo — PDF estilo web + estado de cuenta del cliente *(fase aparte, notas)*

Peticiones del dueño (2026-07-28), registradas para la fase de PDF. No implementadas.

**A. Motores DISTINTOS (dato duro, define el alcance).** La **web** genera PDF
armando **HTML + CSS** y renderizándolo con **Chromium headless** (puppeteer,
`web/src/lib/pdf/render-html-to-pdf.ts`); el esqueleto/estilo común vive en
`web/src/lib/pdf/documento-base.ts` (`BASE_CSS`, `@page` Letter, `--accent`,
clases `.doc/.doc-header/.totales/.stat-box/...`). El **móvil** usa el paquete
`pdf` de Dart (`lib/pdf/pdf_service.dart`), que construye el PDF con **widgets**,
no con HTML/CSS. No se puede compartir código ni correr Chromium en el teléfono, y
el móvil genera **offline** (su ventaja). Por eso "que el móvil use el estándar de
la web" = **re-implementar la estética** de la web con los widgets del paquete
`pdf`: header con color de acento, tipografía, estilo de tablas, cajas de totales,
pie. Queda estéticamente igual (lo que el dueño aceptó como mínimo), pero es una
reconstrucción visual, no un copiar-pegar. Es la pieza más grande del lote.

**B. PDF con vista de CLIENTE (solo entradas).** El dueño quiere que la oficina
(admin) pueda generar el PDF que ve el cliente — p. ej. de la caja, mostrando
**solo ENTRADAS** (pagos recibidos), nunca salidas/gastos/nómina. Espeja la regla
del portal del cliente en la web (el cliente NUNCA ve SALIDA; RLS 0010, ver
[[portal-cliente-estado-cuenta-obra]]). El dato ya existe en móvil
(`EstadoCuentaCalculator`: `costoTotal`, `recibido`, `pendiente`, `porTipo` =
entradas agrupadas). **Principio de seguridad:** construirlo con un método
DEDICADO `PdfService.estadoCuentaCliente(...)` alimentado SOLO con entradas +
presupuesto, NO reusar `flujoCaja` con un flag "ocultar salidas" (un cambio futuro
filtraría gastos al cliente). Contenido: encabezado, total del contrato, lista de
pagos recibidos (entradas), saldo por cobrar. Nada más.

**Cómo combinan:** B se implementa DENTRO de A. Al reescribir el estilo, todos los
documentos comparten la misma base visual (como `documento-base.ts`), y de un solo
esfuerzo salen los documentos internos restilizados + el nuevo de cliente. Se
relaciona con T4 (a futuro solo oficina lo genera; en móvil T4-mínimo basta con que
sea acción de admin). Ver [[mobile-desactualizacion-vs-web]] (el móvil va ADELANTE
en PDF; esta fase es estética + un documento nuevo, NO recortar capacidad).

**C. Es para AMBAS plataformas, no solo móvil (dueño, 2026-07-28).** La oficina debe
poder generar el PDF de cliente y MANDARLO (WhatsApp u otro medio), sobre todo para
clientes que NO están registrados en la plataforma (no pueden verlo en el portal).
Estado real hallado en el código:
  - **Web YA tiene el builder** `web/src/lib/pdf/estado-cuenta-pdf.ts` (entradas-only)
    pero SOLO expuesto al **cliente registrado**
    (`app/cliente/obras/[id]/estado-cuenta/descargar/route.ts`). El PDF de obra del
    **admin** (`app/admin/obras/[id]/pdf`) usa el documento de caja INTERNO
    (`construirCajaDocumentoHtml`, con salidas) — no sirve para el cliente.
  - **Tarea web (baja):** exponer el builder existente en el lado admin — una acción
    "descargar/enviar estado de cuenta del cliente" en `admin/obras/[id]`, gated a
    admin/oficina. Reusa `estado-cuenta-pdf.ts`; NO hay que escribir el documento de
    nuevo. Cierra el hueco para clientes no registrados.
  - **Tarea móvil:** el `PdfService.estadoCuentaCliente` de (B).
  - **Compartir:** el móvil ya comparte con `Printing.sharePdf`/share_plus (llega a
    WhatsApp, correo, etc.) — sale gratis. En web es descargar y enviar a mano; un
    enlace público compartible sería una mejora aparte, más grande.
Nota de paridad: casi todo lo demás del lote (IVA, nota, archivar, borrado…) la web
YA lo tenía; el móvil venía alcanzando. Este PDF de cliente-desde-admin es el único
ítem que falta en AMBAS.

## Qué NO se hace (y por qué)

- **Replicar RLS en el móvil** — el servidor es la autoridad; duplicarla es
  superficie de bug.
- **`empresa_config` como tabla sincronizada** — el "IVA por defecto" ya vive bien
  en SharedPreferences.
- **Gestión de usuarios / invitar socios en móvil** (0018/0025) — trabajo de
  oficina; la web lo cubre.
- **Rate-limit y aislamiento entre empresas** (0019/0020) — solo servidor, ya en
  producción.
- **PDF** — el móvil ya va adelante de la web; no se toca.
