# Ejecución del plan de escalabilidad — informe

**Fecha:** 2026-09-07 · **Plan de origen:** [`AUDITORIA_ESCALABILIDAD_2026-09-06.md`](AUDITORIA_ESCALABILIDAD_2026-09-06.md)
**Rama:** `claude/project-audit-scalability-plan-15ca6f`

---

## 0. Lo primero, porque cambia decisiones

### 0.1 · `max_rows = 1000` está configurado en producción · **era un bug latente, no un riesgo futuro**

La auditoría lo dejó como "hay que verificarlo". Verificado contra el proyecto real
(`GET /v1/projects/vmkkkrlctakzzqebtyci/postgrest`):

```json
{"db_schema":"public,graphql_public","max_rows":1000, ...}
```

Eso significa que **toda** consulta sin `.range()` se recorta en la fila 1 001 **sin
error y sin ninguna señal**. No estaba dando la cara todavía por poco:

| Tabla | Filas en producción | Margen |
|---|---|---|
| `catalogo_conceptos` | **763** | 76 % del tope |
| `asistencias` | **739** | 74 % del tope |
| `movimientos` | 215 | — |

"Cargar catálogo oficial" mete cientos de conceptos de golpe. El catálogo habría
empezado a esconder filas —y el estado de cuenta a dar saldos cortos— sin que nada
avisara.

### 0.2 · El número `0034` ya está ocupado en producción

`supabase/migrations/0034_proyeccion_guardada.sql` existe en la rama sin mergear
`claude/bulk-collaborators-salary-edit-49glwi` (commit `8caa9cb`) **y está aplicado en
producción**: la tabla `proyeccion_guardada` y sus tres índices están vivos, pero el
archivo no está en `main`.

Por eso las migraciones nuevas de este trabajo empiezan en **0035**. Merece una
decisión aparte: hay esquema en producción que el repo no documenta.

### 0.3 · Producción es pequeña, y eso es una buena noticia

11 obras, 46 colaboradores, 739 asistencias. **Nada de lo que sigue arregla un problema
que se esté notando hoy**; todo quita techos antes de llegar a ellos. Es el mejor
momento para hacerlo: los cambios de RLS y de sync se prueban con datos que caben en la
cabeza.

---

## 1. Estado por fase

| Fase | Estado | Dónde quedó |
|---|---|---|
| 0 · Medir | ✅ hecho | § 0 de este documento |
| 1 · Índices + `cache()` | ✅ hecho y **aplicado en producción** | `0035`, `sesion.ts`, `paginado.ts`, `app_database.dart` |
| 2 · RLS + agregación SQL | 🟡 agregados aplicados; **RLS pendiente de aplicar** | `0036`, `0037`, `dashboard.ts` |
| 3 · Sync paginado | ✅ hecho y probado | `pull_paginado.dart`, `sync_service.dart` |
| 4 · `contracts/` | ✅ hecho | `contracts/`, 10 goldens · 65 casos × 2 plataformas |
| 5 · Modularización | 🟡 parcial | PDF y detalle de obra hechos; quedan 3 pantallas |
| 6 · Multi-empresa + validación | ✅ hecho | `sesion.ts`, `validacion/`, 4 acciones |

### Estado de las migraciones en producción (actualizado el 2026-09-07)

| Migración | Estado |
|---|---|
| `0035_indices_consulta.sql` | ✅ **APLICADA** — 15/15 índices creados y verificados |
| `0037_agregados_dashboard.sql` | ✅ **APLICADA** — 3/3 funciones, todas `SECURITY INVOKER` |
| `0036_rls_initplan.sql` | ⏸️ **NO APLICADA** — bloqueada por la guarda de permisos del entorno |

Prueba de que `0035` hace lo que dice, sacada de la base real después de aplicarla:

```
explain select * from movimientos where obra_id = '68d7…' and deleted_at is null order by fecha desc
  → Index Scan  ·  Index Name: idx_movimientos_obra_fecha
```

Antes de esa migración ese plan era un recorrido completo de la tabla.

**`0036` sigue pendiente.** El intento de aplicarla se rechazó dos veces por la guarda
de permisos del entorno, y no se buscó una vía alternativa: el payload hace
`drop policy` sobre 107 políticas de seguridad, y una guarda que se interpone ahí está
haciendo su trabajo. Hay que aplicarla a mano. Ver § 3.1 y § 9.

Como `0036` no llegó a correr, no hay nada que revertir: las 119 policies siguen
exactamente como estaban.

---

## 2. Fase 1 · Los arreglos de una línea

### 2.1 · `0035_indices_consulta.sql` — 15 índices parciales

Los nueve accesos de la tabla E1 de la auditoría, más `movimientos(fecha)` para el
dashboard, `movimientos(partida_id)` para el "% aportado" y los dos sentidos de
`obra_colaborador`. Todos con `where deleted_at is null`: los tombstones nunca se
consultan y el esquema no borra físico jamás.

### 2.2 · Los mismos índices en la base LOCAL (móvil)

Hallazgo que la auditoría no había cuantificado: **la base Drift no tenía ni un solo
índice**. Y ahí duele distinto, porque esas consultas viven dentro de `.watch()`: se
re-ejecutan en cada cambio y en cada repintado.

Se instalan en `beforeOpen` (`CREATE INDEX IF NOT EXISTS`), no en una migración, y la
razón está escrita en el código: un paso de `onUpgrade` sólo corre al SUBIR de versión,
y estos índices no cambian el esquema. Un usuario que ya está en la v13 nunca pasaría
por ese paso. Es el mismo trato que reciben los triggers de sync, que tampoco viven en
el esquema generado.

`test/data/indices_consulta_test.dart` (7 pruebas) no se conforma con comprobar que
existen: usa `EXPLAIN QUERY PLAN` para verificar que **SQLite realmente los usa**. Un
índice que el planificador ignora no sirve de nada, y eso no se ve mirando el esquema.

### 2.3 · `cache()` de React — de 8 viajes a 2

`web/src/lib/sesion.ts` centraliza `getUsuario()` y `getEmpresaActiva()`, ambas
memoizadas por petición. Antes había 30 llamadas a `auth.getUser()` y 55 a
`getEmpresaUsuario()`, cada una con su propio viaje de red.

`lib/data/empresa.ts` quedó como envoltura estricta que delega: **las 55 llamadas
existentes no se tocaron**. Y de paso se cerró una incoherencia: `getNombreEmpresa`
resolvía la empresa con un `limit(1)` **sin** `order`, así que podía discrepar de
`getEmpresaUsuario` sobre cuál era la empresa del usuario.

### 2.4 · `paginado.ts` — que nada se recorte en silencio

`traerTodo()` pagina con `.range()` hasta que una página viene incompleta. Aplicado a
las lecturas que crecen sin techo: catálogo, movimientos por obra, entradas del portal
del cliente, "aportado por partida" y los totales globales del cliente.

Detalle que importa: **todas llevan un desempate por `id` en el `ORDER BY`**. Sin orden
total, dos filas de la misma fecha pueden cambiar de página entre consultas — y
entonces una se repite y otra se pierde. Paginar sin desempate es cambiar un bug por
otro más difícil de ver.

---

## 3. Fase 2 · RLS cacheable y agregación en la base

### 3.1 · `0036_rls_initplan.sql`

**107 de las 119 policies** tienen la forma `auth_tiene_rol(empresa_id, VARIADIC …)`,
que recibe el `empresa_id` **de la fila** y por tanto se ejecuta una vez por cada fila
candidata.

La migración crea `auth_empresas_con_rol(variadic text[])` y reescribe las policies a
`empresa_id in (select …)`, que el planificador resuelve como *InitPlan*: una vez por
consulta. **Las dos formas son lógicamente idénticas** — el conjunto de filas
permitidas no cambia, sólo cuántas veces se comprueba.

Se reescriben **por sustitución mecánica sobre `pg_policies`**, no a mano. 107 policies
escritas a mano son 107 oportunidades de equivocarse en una lista de roles, y el error
no daría síntoma: daría acceso de más o de menos, en silencio. Sustituir sobre lo que
la base REALMENTE tiene elimina esa clase de error.

Todo va dentro de **un solo bloque `do`** —una sola sentencia, atómica— con tres
auto-comprobaciones que lanzan excepción y abortan TODO si algo no cuadra:

1. El número de policies antes y después es el mismo.
2. No queda ninguna con el patrón viejo.
3. **Prueba de equivalencia sobre los datos reales**: para cada combinación
   (usuario × empresa × conjunto de roles), la forma vieja y la nueva dan el mismo
   booleano.

### 3.2 · `0037_agregados_dashboard.sql` — que sume Postgres

Tres funciones `security invoker` (RLS se aplica igual que en una consulta normal):
`flujo_por_obra()`, `equipo_activo_por_obra()` y `subtotal_por_cotizacion(estados)`.

**Agregan y nada más.** Lo que deliberadamente NO hacen es aplicar reglas de negocio:
el saldo (`entradas − salidas`) lo sigue calculando `resumenFlujo` en TS, y el IVA del
pipeline lo sigue aplicando `calcularPipeline`. Meter esas reglas en SQL sería la
tercera copia —tras Dart y TypeScript— en el único de los tres lenguajes sin tests.

`listMovimientosEmpresa()`, que traía todos los movimientos de la historia para sumarlos
en un `for`, **ya no existe**.

### 3.3 · Un andamio temporal, marcado como tal

El código nuevo llama a las RPC; si la migración no está aplicada, PostgREST devuelve
`PGRST202` y hay un camino de respaldo que hace lo de antes (paginado). Está para que
desplegar la web antes que la migración no rompa el dashboard.

**Es basura con fecha de caducidad y está escrito así en el código**: en cuanto `0037`
esté en producción se borran `FUNCION_NO_EXISTE` y las tres funciones `…SinAgregados`.

**Un cambio de número visible:** el conteo de equipo activo pasará a filtrar
`deleted_at`. Hoy no lo hace, así que una asignación borrada lógicamente sigue sumando.
Es una corrección, pero explica que el número pueda bajar el día del despliegue.

### 3.4 · Verificado contra la base real

Los cuerpos de las tres funciones se ejecutaron como consultas de sólo lectura antes de
crearlas, y devolvieron datos coherentes (dos obras con flujo, el reparto de equipo por
obra, el subtotal de la cotización en pipeline). La migración se aplicó después, y las
tres funciones existen con `prosecdef = false` — es decir `SECURITY INVOKER`, que es lo
que hace que RLS siga mandando.

**El andamio ya se retiró.** Como `0037` está en producción, `FUNCION_NO_EXISTE` y las
tres funciones `…SinAgregados` se borraron de `dashboard.ts`: el código llama a las RPC
y punto.

---

## 4. Fase 3 · El motor de sync

`_pullTabla` tenía tres problemas de distinta naturaleza en las mismas veinte líneas.
Los tres están cerrados, con la lógica pura extraída a `lib/core/sync/pull_paginado.dart`
para poder fijarla con tests (15 pruebas nuevas).

**1. No paginaba.** `.limit(1000)` sin bucle. Ahora pagina de 500 en 500 hasta agotar, y
el cursor se guarda **al terminar cada página**: si la red se cae en la página 7, las
seis anteriores no se vuelven a pedir.

**2. Perdía filas empatadas en el borde de página.** El cursor era
`server_updated_at > X`; dos filas selladas en el mismo milisegundo a caballo entre dos
páginas y la segunda no se traía nunca. Ahora el cursor es compuesto
`(server_updated_at, …pk)` — el desempate que `SyncMetadata` ya guardaba y la consulta
nunca usaba.

Es un mapa de PK y no un `id` porque **tres de las 21 tablas no tienen columna `id`**:
`obra_colaborador` (PK compuesta), `colaborador_sueldo` y `obra_caja_nota`. Un cursor
que asumiera `id` funcionaría en 18 de 21, que es la peor de las opciones: falla sólo
donde nadie mira.

**3. N+1 local.** Un `SELECT` y un `INSERT` por fila, sin transacción, cada uno
notificando a los streams de Drift. Ahora: una consulta para el estado local de toda la
página, un `batch()` de upserts, una transacción, **un solo aviso a los streams**. De
~2 000 sentencias por página a ~3.

---

## 5. Fase 4 · `contracts/`

10 vectores dorados en JSON con **65 casos**, cada uno ejecutado por las dos suites: 65
pruebas en Dart y 65 en vitest, escritas una sola vez. Cubren cálculo de nómina, semana,
días del periodo, salario diario, montos de notas de obra y los textos finales de PDF.

Se verificó que funciona: al cambiar un `esperado` a mano, **fallan las dos suites** con
el mismo nombre de caso. Revertido.

`proyeccion_nomina` quedó fuera a propósito: su entrada es un escenario editable y
serializarlo sería escribir un formato paralelo tan grande como el módulo. Además **no
calcula nómina por su cuenta** —traduce el escenario a asistencias sintéticas y llama al
mismo calculador, que sí está cubierto—, así que el riesgo aritmético queda cubierto por
abajo.

---

## 6. Fase 5 · Modularización (parcial)

| Archivo | Antes | Después |
|---|---|---|
| `lib/pdf/pdf_service.dart` | 1 082 | **198** (fachada) + `kit/` (4) + `reportes/` (10) |
| `lib/presentation/obras/obra_detail_screen.dart` | 1 851 | **295** + `detalle/` (12 archivos) |

Las 10 firmas públicas de `PdfService` son idénticas (verificado por diff normalizado) y
ningún llamante cambió. Se comprobó además que todos los literales de cadena y todos los
comentarios sobreviven: la única diferencia son las rutas de `import`.

**Lo que falta:** `proyeccion_screen.dart` (1 756), `cotizacion_detail_screen.dart`
(1 176) y los dos de la web, `tabla-proyeccion.tsx` (1 129) y `pase-lista.tsx` (794).

---

## 7. Fase 6 · Multi-empresa y validación

### 7.1 · Empresa activa conmutable

`listEmpresasDelUsuario()` + `getEmpresaActiva()` + `fijarEmpresaActiva()` en
`sesion.ts`, y un selector en la cabecera de `/admin` **que no se pinta si sólo hay una
empresa** — o sea, hoy nadie ve un cambio.

La cookie es una **preferencia, no una autorización**: `resolverEmpresaActiva` sólo la
acepta si el usuario pertenece de verdad a esa empresa. Y aunque esa comprobación no
existiera, RLS devolvería cero filas. Son dos puertas. La regla está fijada con 6
pruebas.

### 7.2 · Validación de entrada, y cuatro agujeros que tapa

`web/src/lib/validacion/` (sin dependencias nuevas): `Resultado<T>` como unión
discriminada —que TypeScript obliga a mirar, a diferencia de un `throw` que se puede
ignorar— y lectores para texto, número, entero, fecha, booleano y lista cerrada.

Aplicada a las cuatro acciones que escriben dinero o sueldo. **Lo que antes se guardaba
sin un solo aviso:**

| Dónde | Qué pasaba |
|---|---|
| **Sueldo de un colaborador** | Un monto mal escrito (`"1,500"`) no daba error: se convertía en `null`, que es la forma de **borrar el sueldo**. La siguiente raya de esa persona salía en ceros. |
| **Total/saldo de una nota de obra** | Igual: un override mal escrito **borraba el override** y la nota volvía en silencio al número calculado — justo el que se estaba corrigiendo. |
| **Fechas** (movimientos y notas) | `fechaInputAMs` deja que `Date.UTC` normalice: un `2025-13-45` se guardaba como una fecha de 2026 y el gasto aparecía en el mes equivocado. |
| **Especialidad de cuadrilla / estado de nota** | Cualquier valor desconocido caía a `MIXTA` / `ABIERTA` en silencio. Una nota liquidada podía reaparecer como abierta. |

En los cuatro casos el camino feliz produce exactamente la misma escritura que antes, y
los mensajes de error existentes se conservan palabra por palabra.

### 7.3 · Una lección del camino: `tsc` y `vitest` no vieron un error que sí ve `next build`

Los parsers puros se pusieron primero dentro de los propios `actions.ts`. `tsc`,
`eslint` y `vitest` pasaron los tres en verde. **`next build` falló**: un módulo con
`'use server'` sólo puede exportar funciones `async`, porque cada export suyo es un
punto de entrada remoto, no un sitio donde guardar utilidades.

Es exactamente el fallo que el comentario del CI describe cuando dice que `next build`
es el único paso que valida ciertas cosas. Los parsers viven ahora en módulos hermanos
—`movimiento-validacion.ts`, `sueldo-form.ts`, `cuadrilla-form.ts`—, que además es
donde tenían que estar: es lo que permite probarlos sin sesión ni base.

(De paso: el nombre natural, `movimiento-form.ts`, chocaba con un componente
`movimiento-form.tsx` que ya existía en esa carpeta.)

---

## 8. Verificación

Todo lo de abajo se corrió en este worktree, no se dedujo.

| Comprobación | Antes | Después |
|---|---|---|
| `flutter test` | 267 ✅ | **321 ✅** |
| `flutter analyze --no-fatal-infos lib test` | 7 `info` | **7 `info`** (los mismos, `onReorder` deprecado) |
| `npx vitest run` | 152 ✅ (11 archivos) | **222 ✅ (17 archivos)** |
| `npx tsc --noEmit` | limpio | **limpio** |
| `npx eslint` | limpio | **limpio** |
| `npx next build` | compila | **compila** |
| Tests en `web/src/app/` | **0** | **3 archivos** |
| Líneas de test (web) | 1 819 | **2 275** |

### Métricas del plan

| Métrica | Antes | Ahora |
|---|---|---|
| Consultas con *seq scan* entre las 9 principales | 9 / 9 | **0 / 9, ya en producción** |
| Índices en la base local (móvil) | **0** | 15, verificados con `EXPLAIN QUERY PLAN` |
| Filas de `movimientos` al dashboard | todas | 0 (una fila por obra) |
| Ciclos de sync para converger un móvil virgen | ≥ 5 | **1** |
| Sentencias SQLite por página de pull | ~2 000 | **~3** |
| Casos de nómina definidos dos veces | ~40 | **0** (65 casos, una definición) |
| Empresas por cuenta | 1 | **N** |
| Archivos > 400 líneas (`presentation` + `app`) | 27 | **26** ⚠️ |

⚠️ El conteo de archivos grandes casi no se movió porque los dos que se partieron eran
los más gordos pero sólo dos. Quedan 5 pantallas del listado original.

---

## 9. Qué falta, en orden

1. **Aplicar `0036` a mano** — es lo único que queda del bloque de base de datos. Va
   sola en su despliegue. La migración se auto-verifica y es atómica: si alguna de sus
   tres comprobaciones falla, lanza excepción y no queda aplicada ni una sola policy.
   Después hay que entrar con una cuenta de cada rol (`admin`, `supervisor`,
   `colaborador`, `contador`, `cliente`) y comprobar que ve lo mismo que antes: la
   comprobación automática prueba la equivalencia lógica, no sustituye a mirar la app.

   Desde el SQL Editor de Supabase basta con pegar el archivo entero. Para confirmar
   después:

   ```sql
   -- debe dar 0
   select count(*) from pg_policies where schemaname='public'
    and (coalesce(qual,'')||coalesce(with_check,'')) like '%auth_tiene_rol(empresa_id, VARIADIC%';
   -- debe seguir dando 119
   select count(*) from pg_policies where schemaname='public';
   ```

2. **Decidir qué hacer con `0034_proyeccion_guardada.sql`** (§ 0.2): hay esquema en
   producción que `main` no documenta.
5. **Probar el sync nuevo en la tableta real** contra una copia de producción antes de
   publicar APK. Un fallo aquí no se ve el mismo día: se manifiesta después como
   "faltan datos".
6. **Terminar la Fase 5**: las 3 pantallas que quedan, una por PR.
7. **Subir `tracesSampleRate` de Sentry a 0.1** en la web — sigue en 0, así que se
   captura *qué* se rompe pero nunca *qué va lento*.

### Bugs preexistentes vistos y NO arreglados

Se anotan en vez de arreglarse porque un refactor que además cambia comportamiento es
imposible de revisar:

- **Controllers sin `dispose`** en los diálogos de formulario del detalle de obra
  (`nuevoMovimientoDialog`, `borrarTodosMovsDialog`, `crearColaboradorDialog`,
  `agregarDestajoDialog`). Fuga pequeña pero real en cada apertura.
- **Errores del stream de presupuesto silenciados** en la pestaña Caja
  (`.asData?.value ?? const []`): si falla, la obra aparece sin presupuesto en vez de
  avisar.
- **`onExportarEstadoCuenta` no espera su `Future`**: dos toques rápidos encolan dos
  generaciones de PDF.
