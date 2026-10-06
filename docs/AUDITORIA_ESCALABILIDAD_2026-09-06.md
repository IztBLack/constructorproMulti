# Auditoría de escalabilidad y plan de modularización

**Fecha:** 2026-09-06 · **Alcance:** monorepo completo (Flutter `lib/`, web `web/`,
Supabase `supabase/migrations/`, CI, tests) · **Base:** `main` @ `16d7bf4`

---

## 0. Veredicto en una página

El proyecto está **sano de producto y flojo de plataforma**. La lógica de negocio
es correcta, está aislada en `domain/logic` y `lib/data`, y tiene una red de tests
excelente **del lado móvil**. Lo que no está construido es la capa que aguanta
*más* usuarios, *más* filas y *más* gente tocando el código:

| Dimensión | Estado | Techo actual estimado |
|---|---|---|
| Corrección funcional | ✅ sólida | — |
| Seguridad / aislamiento | ✅ sólida (0019 cerró los cruces) | — |
| **Rendimiento de la base** | ⚠️ sin índices de consulta | se nota a ~10 k filas/tabla |
| **Sync móvil** | ⚠️ sin paginación, N+1 por fila | **1 000 filas por tabla por ciclo** |
| **Consultas de la web** | ⚠️ agregación en JS, sin caché de request | dashboard degrada lineal |
| **Multi-empresa por usuario** | ❌ no soportado (se toma la primera) | 1 empresa por cuenta |
| Modularidad del código | ⚠️ pantallas-dios de 1 000–1 900 líneas | dolor al tocar, no al correr |
| Tests de la web | ❌ 1 819 líneas para 43 090 de código; `src/app` sin un solo test | riesgo por release |

Los tres números que resumen el problema:

- **`lib/presentation/obras/obra_detail_screen.dart` — 1 851 líneas, una sola clase
  `State` con 25 métodos** y las cuatro pestañas de la obra dentro.
- **`_pullTabla` ([`sync_service.dart:512`](../lib/core/sync/sync_service.dart#L512))
  hace un `SELECT` local y un `INSERT` por cada fila traída, sin transacción, con
  `.limit(1000)` y sin bucle de paginación.**
- **Ningún índice sobre `obra_id` / `fecha` / `cotizacion_id`.** Los únicos 21 índices
  existentes son el cursor de pull `(empresa_id, server_updated_at)` y algunos de
  cuadrillas y notas.

Nada de esto es urgente hoy con una constructora y ~34 colaboradores. Todo esto es
lo que se rompe al pasar de *una* constructora a *diez*.

---

## 1. Lo que está bien y no hay que tocar

Conviene fijarlo antes de proponer cambios, para no "refactorizar" lo que ya funciona:

1. **La separación `domain/logic` ↔ `data` ↔ `presentation` en el móvil es real**, no
   decorativa. `NominaCalculator`, `FlujoCalculator`, `PresupuestoCalculator` y
   `ProyeccionNomina` son funciones puras testeadas sin base de datos.
2. **La proyección reusa el calculador de nómina real** en vez de tener una segunda
   fórmula. Es la decisión de diseño más valiosa del repo: elimina de raíz la clase
   de bug más cara (dos números que deberían coincidir y no coinciden).
3. **El RLS está bien pensado.** La migración `0019` cierra la familia completa de
   cruces entre empresas (escritura que valida la fila pero no el padre) y lo
   documenta con el ataque concreto. Eso es mejor que la media del mercado.
4. **El contrato de sync está escrito** en el encabezado de `SyncService`, incluidos
   sus límites conocidos. El mecanismo de `columnasPorLlenar` para migraciones que
   agregan columnas ya llenas en el servidor es una solución fina a un problema real.
5. **La red de tests del móvil**: 42 archivos, 31 194 líneas, con una prueba de
   migración por versión de esquema (v6→v13) que corre con datos dentro.
6. **El CI (`calidad.yml`) existe y separa móvil de web** en dos jobs independientes.
7. **La capa `lib/presentation/common/`** ya es un sistema de diseño de 17 widgets
   (`AppCard`, `EmptyStateView`, `confirmDialog`, `MoneyText`…). La base para
   descomponer las pantallas grandes ya está puesta.

---

## 2. Hallazgos — techos de escala (base de datos)

### E1 · Faltan todos los índices de consulta · **alto** · *coste: 1 migración*

`0002_schema.sql` crea, para las 13 tablas base, **un solo índice**:
`(empresa_id, server_updated_at)` — el cursor de pull. No hay ninguno para las
consultas que la app hace todo el día:

| Consulta real | Índice que necesita | ¿Existe? |
|---|---|---|
| asistencias de una obra en una semana | `asistencias (obra_id, fecha)` | ❌ |
| asistencias de una persona en un rango | `asistencias (colaborador_id, fecha)` | ❌ |
| destajos de una obra en un rango | `destajos (obra_id, fecha)` | ❌ |
| movimientos de caja de una obra | `movimientos (obra_id, fecha)` | ❌ |
| secciones de una cotización | `secciones (cotizacion_id)` | ❌ |
| partidas de una sección | `partidas (seccion_id)` | ❌ |
| pagos de una cotización | `pagos (cotizacion_id)` | ❌ |
| equipo de una obra | `obra_colaborador (obra_id)` / `(colaborador_id)` | ❌ |
| archivos de una cotización | `archivos_cotizacion (cotizacion_id)` | ❌ |

Hoy Postgres resuelve cada una con un *seq scan* de la tabla entera. Con 300
movimientos no se nota; con 300 000 (10 empresas × 3 años) cada carga de la pestaña
Caja lee la tabla completa. **Es el arreglo con mejor relación valor/esfuerzo de
toda la auditoría**: una migración, sin cambio de código, sin riesgo.

Todos deben ser índices **parciales sobre filas vivas** (`where deleted_at is null`),
porque el esquema nunca borra físico y los tombstones crecen para siempre.

### E2 · Las políticas RLS se evalúan por fila · **alto** · *coste: 1 migración*

[`0003_rls.sql:18`](../supabase/migrations/0003_rls.sql#L18) genera para las 13
tablas:

```sql
using (public.auth_tiene_rol(empresa_id, 'admin','supervisor','colaborador'))
```

`auth_tiene_rol` recibe `empresa_id` **de la fila**, así que Postgres no puede
sacarla del bucle: ejecuta la subconsulta contra `usuarios_empresa` **una vez por
cada fila candidata**. Es el antipatrón de RLS documentado por Supabase.

La forma equivalente y cacheable es invertir la dirección:

```sql
using (empresa_id in (select public.auth_empresa_ids_con_rol('admin','supervisor','colaborador')))
```

Así el planificador la evalúa como *InitPlan*: **una vez por consulta**, no por fila.
Combinado con E1, el efecto es multiplicativo (índice + una sola evaluación de
permiso). No cambia la semántica de seguridad: el conjunto de filas permitidas es
idéntico.

### E3 · Consultas sin cota superior en la web · **medio-alto**

[`dashboard.ts:96`](../web/src/lib/data/dashboard.ts#L96):

```ts
export async function listMovimientosEmpresa() {
  const { data, error } = await supabase.from('movimientos').select('*').is('deleted_at', null);
```

Trae **todos los movimientos de la historia de la empresa**, con todas sus columnas,
para sumarlos en JavaScript en `saldoPorObra`. Dos problemas encadenados:

1. El transporte crece sin límite (payload y memoria de la función serverless).
2. PostgREST puede tener `db-max-rows` configurado; si lo hay, la respuesta se
   **trunca en silencio** y el saldo sale mal sin ningún error. Hay que verificarlo
   en el proyecto de Supabase antes que nada.

La forma correcta es una **vista o RPC que agregue en Postgres**
(`sum(...) filter (where tipo='ENTRADA')` agrupado por `obra_id`) y devuelva una fila
por obra. De paso deja de exponer columnas que la UI no usa.

En todo el `src/` sólo hay **12 usos de `.limit()`/`.range()`** en 302 archivos: la
paginación es la excepción, no la regla. Las listas de obras, colaboradores,
movimientos y partidas se traen enteras.

### E4 · Un usuario = una empresa, por construcción · **medio (bloqueante de producto)**

[`empresa.ts:12`](../web/src/lib/data/empresa.ts#L12) resuelve la empresa del usuario
con `order('created_at').limit(1)`, y el comentario reconoce el problema: si alguien
pertenece a dos empresas, se toma **la más antigua**. No es un fallo de seguridad
—RLS sigue filtrando— pero significa que:

- un contador externo no puede llevar dos constructoras,
- un dueño con dos razones sociales no puede separarlas,
- no hay conmutador de empresa en la UI ni `empresa_id` en la sesión.

Esto es exactamente "aumentar la escala de uso": es el techo del **modelo de negocio**,
no del rendimiento. Se resuelve con una empresa activa en la sesión (cookie firmada o
claim de JWT) y un selector, más el mismo `empresa_id` propagado a todas las lecturas.

---

## 3. Hallazgos — el motor de sync (móvil)

### S1 · El pull no pagina · **alto**

[`sync_service.dart:512`](../lib/core/sync/sync_service.dart#L512):

```dart
final serverRows = await client.from(name).select()
    .gt('server_updated_at', cursorTs)
    .order('server_updated_at')
    .limit(1000);
```

No hay bucle. Si el servidor tiene 5 000 filas nuevas, un ciclo trae 1 000 y hacen
falta cinco sincronizaciones para converger — sin que la UI lo diga. En la primera
instalación de un dispositivo contra una empresa con historia, esto es "la app dice
que sincronizó y faltan datos".

**Arreglo:** `while` sobre páginas hasta que la página venga incompleta.

### S2 · Empate de `server_updated_at` en el borde de página · **medio**

El cursor es `gt(server_updated_at)` a secas. Dos filas selladas en el mismo
milisegundo, una en la página 1 y otra en la 2, y la segunda **se salta para
siempre**. `SyncMetadata` ya guarda un `cursorId`… que la consulta nunca usa. El
arreglo es el cursor compuesto que la estructura de datos ya anticipa:
`order('server_updated_at').order('id')` + filtro `(sut, id) > (cursorTs, cursorId)`.

### S3 · N+1 local y sin transacción · **alto (rendimiento)**

Por **cada fila** traída, `_pullTabla` hace:

1. un `customSelect` para leer `sync_status`/`updated_at` (decisión LWW),
2. un `customUpdate` con `INSERT OR REPLACE`.

Son **2 000 round-trips a SQLite por página de 1 000 filas**, cada uno notificando a
los streams de Drift → la UI se re-renderiza cientos de veces durante un sync. Y como
no hay transacción, un fallo a mitad deja el pull a medias con el cursor sin avanzar
(se repite todo el trabajo al reintentar).

**Arreglo:** una transacción por página + un `SELECT ... WHERE id IN (...)` que traiga
en un solo viaje el estado local de las filas de la página + `batch()` de Drift para
los upserts.

### S4 · SQL construido por interpolación de nombres de tabla · **bajo (higiene)**

`"SELECT sync_status, updated_at FROM $name WHERE $whereSql"`. Hoy `name` viene
siempre de una lista constante (`pushOrder`), así que no es explotable, pero es la
clase de patrón que deja de ser seguro el día que alguien lo llama con un nombre
dinámico. Vale un comentario que fije la invariante, o una validación contra la lista.

---

## 4. Hallazgos — modularidad y limpieza del código

### M1 · Pantallas-dios en el móvil · **alto (mantenibilidad)**

| Archivo | Líneas | Problema |
|---|---|---|
| `presentation/obras/obra_detail_screen.dart` | **1 851** | 4 pestañas + 12 `showDialog` + comprobantes + PDF en una `State` |
| `presentation/nomina/proyeccion_screen.dart` | **1 756** | 20 widgets privados en un archivo |
| `presentation/cotizaciones/cotizacion_detail_screen.dart` | **1 176** | 3 pestañas + 9 diálogos |
| `pdf/pdf_service.dart` | **1 082** | 10 reportes + primitivas de estilo en una clase estática |
| `data/backup/backup_service.dart` | 826 | export/import JSON + ZIP |
| `presentation/colaboradores/colaboradores_screen.dart` | 822 | lista + CRUD + asignación + orden |

En el conjunto hay **38 `AlertDialog` escritos a mano** y **73
`TextEditingController`** repartidos por las pantallas: cada diálogo de captura se
reimplementa. `presentation/common/` ya tiene `confirmDialog`, pero no hay un
`formDialog` genérico.

Y en la web el mismo patrón: `app/admin/proyeccion/tabla-proyeccion.tsx` con **1 129
líneas** y `app/campo/pase-lista.tsx` con **794**.

Nada de esto afecta al rendimiento. Afecta a **cuántas cosas puedes cambiar por
semana sin romper otra**, que es la otra mitad de "escalar".

### M2 · La lógica de negocio está duplicada a mano en dos lenguajes · **alto (riesgo)**

~1 612 líneas de Dart en `lib/domain/logic/` tienen un gemelo de ~1 141 líneas en
`web/src/lib/data/`:

| Dart | TypeScript |
|---|---|
| `nomina_calculator.dart` (120) | `nomina-calculo.ts` (119) |
| `proyeccion_nomina.dart` (407) + `models_proyeccion.dart` (632) | `proyeccion-nomina.ts` (653) |
| `notas_obra_calculo.dart` (182) | `notas-obra-calculo.ts` (164) |
| `salario_periodo.dart` (63) | `salario.ts` (56) |
| `core/pdf/textos_finales.dart` | `pdf/textos-finales.ts` (149) |

La paridad se sostiene con **tests escritos dos veces**, uno en cada suite, con los
casos copiados a mano. Funciona hoy porque hay una persona que se acuerda de tocar
los dos. No sobrevive a un segundo desarrollador.

**No propongo unificar el lenguaje** (portar la nómina a WASM o mover el cálculo al
servidor rompería el offline-first, que es el valor central del móvil). Propongo lo
barato: **vectores dorados compartidos en JSON**, en `contracts/`, leídos por
`flutter test` y por `vitest`. Un caso nuevo se agrega una vez y **las dos suites
fallan a la vez** si alguna plataforma diverge. Es ~1 día de trabajo y elimina la
categoría completa de "divergió y nadie se enteró".

### M3 · La web tiene 43 090 líneas y 1 819 de test · **alto**

Y **cero tests en `src/app/`** — donde viven los 3 381 líneas de Server Actions que
escriben nómina, sueldos, cuadrillas y movimientos. El móvil tiene más líneas de test
que de código (31 194 vs 28 003); la web tiene una relación de **1:24**.

Sumado a que **no hay validación de entrada**: 103 `formData.get(...)` crudos, sin
`zod` ni equivalente, con `Number(...)` directo sobre texto del usuario. RLS protege
el *aislamiento*, pero no impide guardar un salario `NaN` o una fecha inválida.

### M4 · Sin caché de request en la web · **medio (latencia)**

30 llamadas a `supabase.auth.getUser()` y 55 a `getEmpresaUsuario()` en el código, y
**ni un solo `cache()` de React**. Cada componente de servidor que necesita saber
quién eres hace su propio viaje al servidor de Auth **y** su propia consulta a
`usuarios_empresa`. En una página con cuatro componentes de servidor son ocho
round-trips que deberían ser dos.

Envolver ambas funciones en `cache()` de React es un cambio de **dos líneas** que
deduplica por petición. Es el arreglo más barato de toda la lista.

### M5 · Configuración de lint por defecto · **bajo**

`analysis_options.yaml` es el archivo que genera `flutter create`, con todos los
ejemplos comentados: sólo `flutter_lints`. No hay `strict-casts`, no se excluyen los
`.g.dart` del análisis, no hay `custom_lint` + `riverpod_lint` (que detectaría
providers mal usados en un proyecto que vive de Riverpod). En la web, `eslint-config-next`
tal cual, sin reglas de import order ni de límite de complejidad.

### M6 · PDF: dos implementaciones y una serverless cara · **medio**

El móvil dibuja con `pdf` (Dart); la web renderiza HTML y lo imprime con
**puppeteer-core + @sparticuz/chromium** en Vercel — 7 rutas distintas empaquetan el
binario de Chromium (ver `next.config.ts`). Eso significa arranques en frío de
cientos de MB y un límite de memoria por cada PDF que alguien pida. Con volumen, es
la primera factura que sorprende.

No hay que unificarlo ahora (el HTML da mejor tipografía y el Dart funciona sin red),
pero sí **aislarlo**: una sola ruta de generación con cola/reintento en lugar de
siete, para poder mover el motor después sin tocar siete sitios.

---

## 5. Áreas de oportunidad todavía sin tocar

Ordenadas por lo que desbloquean, no por dificultad:

1. **Empresa activa conmutable** (E4). Sin esto no hay despacho contable, ni grupo con
   dos razones sociales, ni cuenta demo separada.
2. **Onboarding autoservicio con datos de ejemplo.** Existe `demo_data.dart` en el
   móvil; la web no tiene equivalente. Un alta nueva llega a un tablero vacío.
3. **Auditoría de cambios (quién tocó qué).** Con varias personas por empresa, la
   pregunta "¿quién bajó ese sueldo?" no tiene respuesta hoy. Una tabla `evento_auditoria`
   alimentada por trigger es barata y se vuelve obligatoria en cuanto haya empleados.
4. **Trazas de rendimiento.** Sentry está activo en ambas plataformas pero con
   `tracesSampleRate: 0` — se captura *qué* se rompe, nunca *qué va lento*. Subirlo a
   0.1 en la web da la lista real de consultas lentas en una semana.
5. **Archivado / particionado de datos viejos.** Nada expira nunca: asistencias,
   movimientos y tombstones crecen indefinidamente y el sync los arrastra a cada
   dispositivo nuevo. Un `snapshot` por año o un filtro de "últimos N meses" en el
   pull inicial evita que instalar la app en 2029 signifique bajar 2026.
6. **Límites y cuotas.** Hay `file_size_limit` en los buckets y control de intentos en
   el canje de código (`0020`), pero ninguna cuota por empresa (nº de obras, de
   almacenamiento, de PDFs/mes). Es el andamio de cualquier plan de precios.
7. **Pase de lista de campo en la web (offline).** Ya identificado en notas previas:
   sigue sin conmutador ni orden arrastrable, a diferencia del móvil.
8. **Exportación contable (CFDI / capa fiscal).** Hoy la salida es PDF para humanos.
   Un `.xlsx`/`.csv` con el layout que pide un contador es lo que convierte la app en
   herramienta de la administración, no sólo de la obra.

---

## 6. Arquitectura objetivo

No es un rediseño. Es **la misma arquitectura, cortada más fino**, y una pieza nueva
(`contracts/`) que no existía.

```
constructorpro/
├── contracts/                      ◀── NUEVO. Fuente única de verdad del dominio.
│   ├── nomina/*.golden.json            Vectores dorados: entrada → salida esperada.
│   ├── proyeccion/*.golden.json        Los lee flutter test Y vitest.
│   ├── notas/*.golden.json
│   └── README.md                       "Un caso nuevo se agrega aquí, no en un test."
│
├── lib/                            MÓVIL — corte por FEATURE, no por capa técnica
│   ├── core/                       (sin cambios: db, sync, theme, format, crash)
│   │   └── sync/
│   │       ├── sync_service.dart       ◀── se queda como orquestador
│   │       ├── pull_paginado.dart      ◀── NUEVO: paginación + cursor compuesto
│   │       └── pull_batch.dart         ◀── NUEVO: LWW en lote + transacción
│   ├── domain/                     (sin cambios: lógica pura, ya está bien)
│   ├── data/                       (sin cambios: repositorios por agregado)
│   ├── pdf/
│   │   ├── kit/                        ◀── NUEVO: header, footer, firmas, tema, tabla
│   │   └── reportes/                   ◀── un archivo por reporte (10)
│   └── features/                   ◀── sustituye a presentation/<pantalla>.dart
│       ├── obra/
│       │   ├── obra_detail_screen.dart     ~200 líneas: sólo Scaffold + TabBar
│       │   ├── tabs/equipo_tab.dart
│       │   ├── tabs/asistencia_tab.dart
│       │   ├── tabs/nomina_tab.dart
│       │   ├── tabs/caja_tab.dart
│       │   ├── dialogs/movimiento_dialog.dart
│       │   ├── dialogs/destajo_dialog.dart
│       │   └── controllers/obra_detail_controller.dart   ◀── Notifier: acciones sin UI
│       ├── cotizacion/  (mismo corte)
│       ├── proyeccion/  (mismo corte)
│       └── ...
│
└── web/src/
    ├── lib/
    │   ├── sesion.ts               ◀── NUEVO: getUsuario()/getEmpresaActiva() con cache()
    │   ├── validacion/             ◀── NUEVO: esquemas de entrada por acción
    │   └── data/                       (sin cambios de forma; + funciones agregadas en SQL)
    └── app/<ruta>/
        ├── page.tsx                    servidor: sólo composición y Promise.all
        ├── actions.ts                  validar → autorizar → delegar a lib/data
        └── _componentes/*.tsx          ◀── cliente, uno por bloque (< 250 líneas)
```

### Las cuatro reglas que sostienen el corte

1. **Una pantalla no sabe escribir en la base.** La pantalla muestra y despacha
   intenciones; un `Notifier` por feature hace la escritura. Hoy `obra_detail_screen`
   hace las dos cosas, y por eso mide 1 851 líneas.
2. **Un archivo, un motivo para cambiar.** Si tocar la caja te obliga a abrir el
   archivo de la nómina, el corte está mal.
3. **Todo número que exista en las dos plataformas nace de `contracts/`.** No se
   escribe un caso de prueba de nómina en Dart: se escribe un `.golden.json` y las dos
   suites lo consumen.
4. **La base agrega; el cliente presenta.** Ninguna suma que pueda hacer Postgres se
   trae a JavaScript o a Dart en forma de filas.

### Lo que explícitamente NO se propone

- **No** cambiar Riverpod, Drift, Next.js ni Supabase. Están bien elegidos.
- **No** meter una API propia entre la web y Supabase. RLS es el guardián y funciona;
  una API intermedia duplicaría las reglas de permiso.
- **No** unificar el motor de PDF ahora.
- **No** portar la lógica a un lenguaje común. El coste supera al beneficio y rompe el
  offline-first.
- **No** introducir `go_router` como parte de esta obra: los 36 `MaterialPageRoute` son
  molestos pero no bloquean nada. Anotado para después.

---

## 7. Plan de ejecución

Seis fases. **Cada una es independiente y desplegable por su cuenta**; si el plan se
abandona en la fase 3, lo hecho sigue valiendo. Van ordenadas por
*valor entregado ÷ riesgo*, no por dependencia técnica.

---

### Fase 0 · Medir antes de tocar · ~medio día · riesgo nulo

Sin esto, las fases siguientes son fe.

1. Verificar en Supabase si `db-max-rows` está configurado (**si lo está, E3 no es un
   riesgo futuro: es un bug de saldo activo hoy**).
2. Sembrar una base de staging con volumen realista de 10 empresas × 3 años
   (script en `tools/`): ~50 k asistencias, ~30 k movimientos, ~5 k partidas.
3. Capturar tiempos base con `explain (analyze, buffers)` de las 8 consultas de la
   tabla E1, y el tiempo de un sync completo desde cero en el móvil.
4. Subir `tracesSampleRate` de Sentry a `0.1` en la web.

**Criterio de aceptación:** existe un documento con los números "antes". Sin él no se
puede afirmar que ninguna fase mejoró algo.

---

### Fase 1 · Los arreglos de una línea · ~1 día · riesgo bajo · **empezar por aquí**

Máximo efecto, mínimo cambio. Todo es aditivo y reversible.

| # | Cambio | Archivo |
|---|---|---|
| 1.1 | Migración `0034_indices_consulta.sql`: los 9 índices parciales de E1 | `supabase/migrations/` |
| 1.2 | `cache()` de React en `getUsuario` y `getEmpresaUsuario` | `web/src/lib/sesion.ts` (nuevo) |
| 1.3 | `.limit()` explícito en las listas de la web que hoy no lo tienen | `web/src/lib/data/*.ts` |

**Criterio:** las 9 consultas de la Fase 0 usan *index scan* en el `explain`; el
número de llamadas a Auth por render de `/admin` baja de 8 a 2 en las trazas.

**Riesgo:** `create index concurrently` fuera de transacción para no bloquear
producción. Los índices son reversibles con un `drop`.

---

### Fase 2 · RLS cacheable + agregación en la base · ~2 días · riesgo medio

| # | Cambio |
|---|---|
| 2.1 | `auth_empresa_ids_con_rol(variadic text[])` — hermana de `auth_empresa_ids()` |
| 2.2 | Migración `0035`: reescribir las 13 políticas `_staff` a la forma `empresa_id in (select …)` |
| 2.3 | Vista/RPC `saldo_por_obra(empresa)` y `resumen_flujo(empresa, desde, hasta)` agregando en SQL |
| 2.4 | `dashboard.ts` deja de traer movimientos: consume las agregaciones |

**Criterio:** el conjunto de filas visibles por rol es **idéntico** antes y después
—esto se prueba, no se supone: un test de RLS por rol (`admin`, `supervisor`,
`colaborador`, `contador`, `cliente`) que compare los `id` devueltos contra los
esperados. El dashboard deja de transferir filas de `movimientos`.

**Riesgo:** es la fase que toca seguridad. **No se despliega sin la batería de tests
de RLS de 2.4 en verde**, y se despliega sola, sin nada más en el mismo push.

---

### Fase 3 · El motor de sync · ~3 días · riesgo medio-alto

| # | Cambio |
|---|---|
| 3.1 | `pull_paginado.dart`: bucle de páginas hasta agotar (S1) |
| 3.2 | Cursor compuesto `(server_updated_at, id)`, usando el `cursorId` que ya se guarda (S2) |
| 3.3 | `pull_batch.dart`: un `SELECT ... IN` para el estado local + `batch()` + transacción por página (S3) |
| 3.4 | Fijar la invariante de `$name` contra `pushOrder` (S4) |
| 3.5 | Progreso real en la UI de sync ("tabla 7 de 21, 3 200 filas") |

**Criterio:** con la base de staging de la Fase 0, un dispositivo virgen converge en
**un** ciclo; el sync completo baja de N×2 sentencias SQLite a N/500 lotes; el test de
"dos filas con el mismo `server_updated_at` en el borde de página" pasa —hoy falla.

**Riesgo:** es el corazón de la integridad de datos. Mitigación: los tests de sync
existentes se conservan tal cual y se **añaden** los tres casos nuevos (página
incompleta, empate en el borde, fallo a mitad de transacción). Se prueba en la tableta
real contra una copia de producción antes de publicar APK.

---

### Fase 4 · `contracts/` — cerrar la divergencia web↔móvil · ~1–2 días · riesgo bajo

| # | Cambio |
|---|---|
| 4.1 | `contracts/README.md` con el formato y la regla de oro |
| 4.2 | Extraer los casos existentes de `test/logic/nomina_calculator_test.dart` y de `nomina-calculo.test.ts` a `contracts/nomina/*.golden.json` |
| 4.3 | Lo mismo para proyección, notas de obra, salario por periodo y textos finales |
| 4.4 | Cargador en ambas suites (`golden_loader.dart`, `golden.ts`) |
| 4.5 | Job de CI que falla si un `.golden.json` cambió y sólo una suite se ejecutó |

**Criterio:** agregar un caso nuevo toca **un** archivo JSON y hace fallar las dos
suites si alguna plataforma no lo cumple. Los tests de paridad copiados a mano
desaparecen.

**Riesgo:** bajo — no cambia código de producción, sólo tests.

---

### Fase 5 · Modularizar las pantallas-dios · ~4–5 días · riesgo bajo, volumen alto

Se hace **después** de la Fase 4 a propósito: con los vectores dorados en su sitio, un
refactor que rompa un número se detecta al instante.

Orden sugerido, de menor a mayor riesgo:

1. **`pdf_service.dart` → `pdf/kit/` + `pdf/reportes/`** (1 082 → ~10 archivos de
   100–150). Es el más mecánico: las primitivas ya son privadas y estáticas.
2. **`obra_detail_screen.dart`** (1 851 → `obra_detail_screen.dart` de ~200 +
   4 pestañas + 6 diálogos + 1 controlador).
3. **`proyeccion_screen.dart`** (1 756: los 20 widgets privados salen casi solos a
   `proyeccion/widgets/`).
4. **`cotizacion_detail_screen.dart`** (1 176).
5. **Web:** `tabla-proyeccion.tsx` (1 129) y `pase-lista.tsx` (794).
6. **`formDialog` genérico** en `presentation/common/`, y migrar los 38 `AlertDialog`
   escritos a mano.

**Criterio:** ningún archivo de `lib/features/` ni de `web/src/app/` supera **400
líneas**; `flutter analyze` y `tsc` limpios; **cero cambios de comportamiento** — se
verifica con los goldens de la Fase 4 y los tests de widget existentes.

**Riesgo:** bajo por cambio, alto por volumen. Mitigación: **una pantalla por PR**,
nunca dos. Un PR que mueva código *y* cambie comportamiento se rechaza.

---

### Fase 6 · Multi-empresa y red de seguridad de la web · ~3–4 días · riesgo medio

| # | Cambio |
|---|---|
| 6.1 | Empresa activa en la sesión (cookie firmada), con `getEmpresaActiva()` cacheada |
| 6.2 | Selector de empresa en el encabezado de `/admin` cuando hay más de una |
| 6.3 | Propagar `empresaId` explícito a todas las lecturas (deja de inferirse) |
| 6.4 | Esquemas de validación de entrada para las Server Actions (103 `formData.get` crudos) |
| 6.5 | Tests de las Server Actions críticas: nómina, sueldos, movimientos, cuadrillas |
| 6.6 | Tabla `evento_auditoria` + trigger sobre las tablas sensibles |

**Criterio:** una cuenta con dos empresas puede cambiar entre ellas y **nunca** ve
datos mezclados (test explícito); ninguna Server Action escribe un valor no validado;
`src/app` deja de tener 0 tests.

**Riesgo:** 6.1–6.3 tocan el camino de autorización. Se despliega detrás de la
condición "si el usuario tiene 1 empresa, comportamiento idéntico al de hoy", que es
el caso de todos los usuarios actuales.

---

## 8. Resumen del plan

| Fase | Qué desbloquea | Días | Riesgo | Dependencias |
|---|---|---|---|---|
| 0 · Medir | saber si algo mejoró | 0.5 | nulo | — |
| 1 · Índices + `cache()` | **la mayor parte del rendimiento, hoy** | 1 | bajo | 0 |
| 2 · RLS + agregación SQL | que 10 empresas no se estorben | 2 | medio | 1 |
| 3 · Sync paginado | que un móvil nuevo converja | 3 | medio-alto | 0 |
| 4 · `contracts/` | que web y móvil no diverjan nunca | 1.5 | bajo | — |
| 5 · Modularización | velocidad de cambio sostenida | 4.5 | bajo (volumen) | 4 |
| 6 · Multi-empresa + validación | el modelo de negocio | 3.5 | medio | 1, 2 |

**Total ≈ 16 días de trabajo efectivo.** Las fases 1 y 4 juntas son **2.5 días** y se
llevan la mitad del valor: si sólo hubiera tiempo para dos cosas, son esas.

### Orden recomendado si se ejecuta en serie

```
0 → 1 → 4 → 2 → 3 → 5 → 6
```

La 4 se adelanta a la 2 y la 3 porque es la red que protege todo lo que viene
después, y no depende de nada.

---

## 9. Cómo se sabrá que funcionó

Métricas concretas, medibles contra la línea base de la Fase 0:

| Métrica | Hoy (estimado) | Objetivo |
|---|---|---|
| Consultas con *seq scan* entre las 9 principales | 9 / 9 | 0 / 9 |
| Round-trips de Auth por render de `/admin` | ~8 | 2 |
| Filas de `movimientos` transferidas al dashboard | todas | 0 (agregado en SQL) |
| Ciclos de sync para converger un móvil virgen | ≥ 5 | 1 |
| Sentencias SQLite por página de pull | 2 000 | ≤ 5 |
| Archivos > 400 líneas en `features/` y `app/` | 27 (15 móvil + 12 web) | 0 |
| Casos de nómina/proyección definidos dos veces | ~40 | 0 |
| Líneas de test en `web/src/app` | 0 | > 0 en las 4 acciones críticas |
| Empresas por cuenta de usuario | 1 | N |

---

## 10. Riesgos del plan mismo

- **La Fase 2 toca RLS.** Es la única que puede causar una fuga de datos si sale mal.
  Va sola en su despliegue y con la batería de tests por rol como puerta.
- **La Fase 3 toca la integridad del sync.** Un fallo aquí no se ve: se manifiesta días
  después como "faltan datos". Debe probarse contra una copia de producción en la
  tableta real, no sólo en tests.
- **La Fase 5 es la que más tienta a "aprovechar y mejorar de paso".** No hay que
  hacerlo. Un refactor que también cambia comportamiento es imposible de revisar y de
  revertir.
- **Todo el plan asume que la suite del móvil sigue verde.** El CI ya la corre en cada
  PR desde agosto de 2026; ese es el suelo sobre el que se apoya lo demás.
