# Auditoría Cimnova — 2026-08-17

Hecha con los checklists de **ECC** (github.com/affaan-m/ECC), clonado en
`~/.claude/ecc` (no instalado como plugin). Skills aplicadas: `production-audit`,
`flutter-dart-code-review`, `security-review`, `database-migrations`,
`react-patterns`, `nextjs-turbopack`.

Rama: `claude/ecc-constructor-audit-b87a64`, sobre `main` (adbafbf).

> **Estado:** el diagnóstico de abajo es el del arranque (**73/100**). Todo lo
> marcado ✅ ya está corregido en esta rama; lo que queda abierto está al final.

---

## Veredicto de arranque

**73/100 — Publicable con reservas.** La postura de seguridad era sólida (RLS
como fuente de verdad, cero secretos filtrados, escapado disciplinado en los
PDF); lo que faltaba era **red de seguridad**: dependencias sin parchar, dos
tests rojos y cero CI.

---

## Bloqueadores

### ✅ B1. Next.js 16.2.9 con 9 advisories, una de bypass de middleware

`npm audit` reportaba, entre otras:

- `GHSA-6gpp-xcg3-4w24` — **bypass de middleware/proxy en App Router con Turbopack
  y locale único**. Es exactamente esta app: `web/middleware.ts` es la ÚNICA capa
  que impide que un cliente entre a `/admin` y que un staff entre a `/cliente`.
- `GHSA-955p-x3mx-jcvp` — exposición no autenticada de endpoints internos de
  Server Functions. Hay 23 archivos `'use server'`.
- `GHSA-89xv-2m56-2m9x`, `GHSA-p9j2-gv94-2wf4` — SSRF.

**Hecho:** `next` y `eslint-config-next` a 16.3.1, más `npm audit fix`. De 7
vulnerabilidades (5 altas) a 2 moderadas. `next build` verde.

### ✅ B2. Migraciones Drift sin red desde v9

`lib/core/db/app_database.dart:43` declaraba `schemaVersion => 9`, pero
`drift_schemas/` y `test/generated_migrations/` se quedaron en v8. `flutter test`
daba **202 ✓ / 2 ✗**, y no existía prueba de v8→v9 — justo la migración que corre
en cada teléfono al actualizar.

La causa de fondo no era el olvido: `migrateAndValidate` valida contra la versión
que se le pase, pero los bloques de `onUpgrade` se condicionan solo por `from`, así
que al subir de versión los pasos nuevos corren igual y validar contra una versión
intermedia falla siempre. Los tests tenían el destino escrito a mano.

**Hecho:**
- `schema dump` + `schema generate` para v9.
- Los tres tests apuntan a `db.schemaVersion`, no a un número: subir de versión ya
  solo pide regenerar snapshots. Renombrados a `migration_desde_v6/v7/v8_test.dart`.
- `migration_desde_v8_test.dart` nuevo: cubre las 7 tablas que reciben `orden`, el
  default 0 en las filas viejas, y que **los triggers de sync se reinstalan** —la
  mitad que se olvida, y sin la cual reordenar no marcaría `pending` ni subiría.
- `flutter test`: **207 ✓ / 0 ✗**.

### ✅ B3. La puerta de release no veía esos fallos

`build_release.ps1:45` corría `flutter test test/logic` — 7 de 30 archivos.
**Hecho:** `flutter test` completo.

---

## Arreglos de alto valor

### ✅ A1. Sin CI de calidad

`.github/workflows/` solo tenía `ios-build.yml`.

**Hecho:** `.github/workflows/calidad.yml`, en `push` a main y en `pull_request`,
con dos jobs independientes: móvil (`pub get` → `build_runner` → `analyze` →
`test`) y web (`npm ci` → `tsc` → `eslint` → `vitest` → `next build`).

### ✅ A2. `eslint` roto en 4 puntos

`usarArrastreOrden` (español) no se reconocía como hook, lo que **desactivaba de
facto `rules-of-hooks` y `exhaustive-deps` en todo el archivo**.

**Hecho:** renombrado a `useArrastreOrden` (`use-arrastre-orden.ts`) y los 4
consumidores. `npx eslint .` limpio; con el detector encendido no apareció ningún
problema de dependencias.

### ✅ A3. Nómina y proyección: mismos sueldos, permisos distintos

`/admin/proyeccion/pdf` devolvía 403 por rol; `/admin/obras/[id]/nomina/pdf/descargar`
solo pedía sesión, y la pantalla de nómina tampoco filtraba. Con la RLS 0014 dando
SELECT de `colaboradores`/`puestos` al rol `colaborador`, **un colaborador de campo
podía bajar el PDF de nómina con el sueldo de todos**.

**Decisión (2026-08-17):** nómina y proyección quedan las dos en
`admin + supervisor + contador`.

**Hecho — capa de aplicación.** Una sola lista, `ROLES_SUELDOS` en
`web/src/lib/auth/sueldos.ts`, espejada por `_rolesSueldos` en
`lib/core/sync/rol_provider.dart`. Aplicada en:

| Superficie | Antes |
|---|---|
| `/admin/proyeccion` (página y PDF) | ya tenía gate; ahora incluye `contador` |
| `/admin/obras/[id]/nomina` (página) | **sin gate** |
| `/admin/obras/[id]/nomina/pdf` (vista previa) | **sin gate** |
| `/admin/obras/[id]/nomina/pdf/descargar` | **sin gate** → 403 |
| Móvil: pestaña Nómina de la obra | **sin gate** |
| Móvil: export del PDF de nómina | **sin gate** |
| Móvil: «Nómina global (semana)» del resumen | **sin gate** |

**Hecho — capa de base de datos.** El gate de aplicación es presentación; sin
esto, el colaborador puede consultar `colaboradores` con su propia sesión, y en
el móvil el sync le baja el sueldo de todos al teléfono.

El plan original decía «revocar las columnas y exponerlas por una vista». Al ir a
aplicarlo apareció que **PostgREST expande `select('*')` a todas las columnas**:
el `REVOKE` rompía las 4 llamadas de la web y el pull genérico del móvil para
TODOS los roles. Se optó por mover el sueldo a una **tabla aparte**, que además
no obliga a duplicar la política de lectura de 0014/0022 dentro de una vista.

- `supabase/migrations/0027_sueldo_tabla_aparte.sql` — crea
  `colaborador_sueldo` (1-a-1, PK `colaborador_id`), copia los datos, instala el
  trigger de `server_updated_at` y el índice del cursor de pull, y le pone RLS:
  **lectura** admin/supervisor/contador, **escritura** admin/supervisor (el
  contador lee los montos a pagar, no los fija). **Aditiva: se puede aplicar ya.**
- `supabase/migrations/0029_sueldo_drop_columnas_viejas.sql` — quita las 4
  columnas de `colaboradores`. **NO aplicar hasta que todos los teléfonos tengan
  la app nueva**: un cliente v1.0.7 manda esas columnas en cada push y se
  quedaría con el sync atorado (PGRST204). Patrón expand/contract; la migración
  aborta sola si detecta filas sin copiar.
- Móvil: esquema Drift **v10** con la tabla nueva; la migración v9→v10 copia el
  sueldo y reconstruye `colaboradores` sin esas columnas (`alterTable`) y
  reinstala los triggers de sync, que SQLite se lleva por delante al recrear la
  tabla. `colaborador_sueldo` entra en `pushOrder` justo después de
  `colaboradores` (su PK es la FK).
- El sueldo se vuelve a juntar con el colaborador en la capa de lectura
  (`aplanarSueldo` en la web, `colaboradorToDomain(c, sueldo:)` en el móvil), así
  que el cálculo de nómina no se enteró del cambio. **Cuando no hay permiso, el
  embebido llega vacío y todo cae al salario del puesto** — no a cero.
- Cubierto por `test/data/migration_desde_v9_test.dart` (los cuatro campos
  llegan íntegros, no se crean filas vacías, `colaboradores` conserva el resto de
  los datos, los triggers sobreviven) y por 12 pruebas de `colaborador-sueldo`
  en la web.

### ✅ A4. Bucket `cotizaciones` sin límites

`0024` crea `comprobantes` con `file_size_limit` y `allowed_mime_types`; `0007`
creó `cotizaciones` sin ninguno, y el Server Action solo validaba tamaño, con el
`contentType` saliendo tal cual del cliente.

**Hecho:** allowlist `TIPOS_OK` en `archivos-actions.ts`, `accept` del input
alineado, y `supabase/migrations/0028_bucket_cotizaciones_limites.sql`
(15 MB + 5 tipos). **La migración 0028 falta aplicarla en producción.**

### ✅ A5. Web sin una sola prueba

249 archivos `.ts/.tsx`, cero tests, con la lógica de dinero duplicada en TS.

**Hecho:** Vitest (`environment: 'node'`, `TZ=Europe/Madrid` a propósito para que
las pruebas de zona horaria no pasen por casualidad). **104 pruebas en 7 archivos**,
portadas caso por caso desde `test/logic/*.dart`, con los mismos números — son
pruebas de **paridad**, no solo de regresión:

| Módulo TS | Espejo Dart |
|---|---|
| `nomina-calculo.ts` | `nomina_calculator_test.dart` |
| `proyeccion-nomina.ts` | `proyeccion_nomina_test.dart` |
| `cotizacion-diff.ts` | `iva_congelado_test.dart` |
| `auth/sueldos.ts` + `auth/secciones.ts` | `rol_permiso_test.dart` |
| `salario.ts` | — |
| `tz.ts` | — |
| `colaborador-sueldo.ts` | — |

### 🐞 A5-bis. Bug encontrado al escribir esas pruebas: IVA quemado en el diff

`cotizacion-diff.ts` calculaba `totalDeSnapshot` multiplicando por un **`1.16`
quemado**, mientras el resto de la app usa la tasa congelada de cada cotización
(`iva_porcentaje`, migración 0017). El panel de re-aprobación del portal del
cliente muestra «Total antes / Total ahora» **justo encima del botón de aprobar**:
en una empresa con IVA al 8% (frontera) o sin IVA, esos dos montos salían
inflados.

**Hecho:** `totalDeSnapshot` recibe la tasa; `compararSnapshot` la toma de
`actual.iva_porcentaje ?? IVA_POR_DEFECTO`. Las dos fotos se valoran con la misma
tasa, que es lo correcto porque se congela al crear la cotización. Cubierto por 5
pruebas (8%, 0%, sin tasa, IVA apagado, y el orden descuento→IVA).

### ✅ A6. Sin reporte de errores

`lib/core/crash/crash_logger.dart` guardaba 10 crashes en disco y no enviaba
nada; la web no registraba nada.

**Hecho:** Sentry en los dos, **apagado mientras no haya DSN** — el repo se sigue
pudiendo clonar, correr y desplegar sin cuenta de Sentry, y el CI compila sin
secretos.

- Web: `@sentry/nextjs` vía `src/instrumentation.ts` (servidor y edge, más
  `onRequestError` para Server Actions y route handlers) y
  `src/instrumentation-client.ts` (navegador). El SDK ni se importa si falta el
  DSN. Sin trazas de rendimiento, sin PII y sin repetición de sesión: la pantalla
  lleva sueldos y datos de clientes.
- Móvil: `sentry_flutter` enganchado dentro de `CrashLogger.runGuarded`. **El log
  local se conserva** — un reporte que solo existe en la nube no sirve cuando el
  problema es que el teléfono no tiene nube, que es la mitad de la obra.
- **Falta el DSN.** Web: `NEXT_PUBLIC_SENTRY_DSN` (ver `web/.env.example`).
  Móvil: `$env:SENTRY_DSN` antes de correr `build_release.ps1`, que lo pasa como
  `--dart-define`.

### ✅ A7. Otras advisories de npm

`sharp`, `brace-expansion`, `nanoid`, `postcss` — cerradas con B1 y `npm audit fix`.
Queda `uuid` <11.1.1 (moderada) vía `exceljs`: el único arreglo es `exceljs@3.4.0`,
que rompe. Se deja: es un bounds check en `uuid` v3/v5/v6 con `buf`, y el proyecto
usa `crypto.randomUUID()`.

---

## Lo que salió limpio (verificado, no asumido)

- **Cero secretos en el repo.** `.env*` ignorado en ambos `.gitignore`; la
  `publishableKey` de `lib/core/sync/supabase_config.dart:17` es pública por
  diseño; la `service_role` no aparece en ningún lado.
- **Escapado de HTML en los PDF, disciplinado.** Los 5 builders interpolan datos
  de usuario solo vía `esc()` (`web/src/lib/pdf/documento-base.ts:13`); las
  interpolaciones crudas son montos, fechas y folios. El `titulo` se escapa río
  abajo. No hay inyección hacia el Chromium headless.
- **Buckets privados** los dos, con policies por `empresa_id` en el primer
  segmento de la ruta, construido en el servidor.
- **Subida de comprobantes** bien pensada: URL firmada por permiso + rol, ruta
  armada en servidor, revalidación al enlazar.
- **RLS de gestión de usuarios:** códigos de vinculación solo admin (o supervisor
  acotado), `empresa_config` solo admin (`0018`).
- **`/auth/signout` es POST**, y `/auth/callback` valida `destino` contra
  redirector abierto.
- Cero `print()` en `lib/`; cero `: any` en 249 archivos TS.

---

## Lo que queda abierto

Nada de esto es código: son pasos que dependen de producción o de una cuenta.

### 1. Aplicar las migraciones en Supabase, EN ESTE ORDEN

| Migración | Cuándo |
|---|---|
| `0027_sueldo_tabla_aparte.sql` | **Ya.** Es aditiva; no rompe a ningún teléfono. |
| `0028_bucket_cotizaciones_limites.sql` | **Ya.** Solo toca `storage.buckets`. |
| `0029_sueldo_drop_columnas_viejas.sql` | **Solo cuando TODOS los teléfonos tengan la app nueva.** |

La 0029 es la que de verdad cierra A3: hasta que corra, un colaborador podría
consultar `colaboradores` directo con su propia sesión. Pero si se corre antes de
tiempo, cualquier teléfono con la versión anterior se queda con el sync atorado
(manda columnas que ya no existen → PGRST204) y no puede subir ni la asistencia
del día. La migración se niega a correr sola si detecta sueldos sin copiar.

### 2. El DSN de Sentry

El código está listo y apagado. Falta crear el proyecto y pegar el DSN en:
- Web: `NEXT_PUBLIC_SENTRY_DSN` en Vercel (plantilla en `web/.env.example`).
- Móvil: `$env:SENTRY_DSN` antes de `build_release.ps1`.

Mientras tanto todo funciona igual que antes, con el log local en el teléfono.

### 3. Comprobaciones que ningún comando cubre

Hacen falta usuarios reales y no se han hecho:

- Con cuenta **`colaborador`**: que el pase de lista siga funcionando (necesita
  leer `colaboradores`), que `/admin/obras/<id>/nomina` no se abra, y que
  `/admin/obras/<id>/nomina/pdf/descargar` responda 403. En el móvil, tras un
  sync, que la base local NO traiga sueldo.
- Con cuenta **`contador`**: que nómina y proyección sí abran.
- Arrastrar para reordenar en cotizaciones, cuadrillas, equipo y obras, después
  del renombrado del hook.
- Bajar un PDF de cotización desde Vercel: es la ruta que depende del binario de
  Chromium empaquetado, lo primero que rompe un salto de versión de Next.

### 4. Evidencia que sigue faltando

- Nada se probó contra el despliegue real ni contra Supabase de producción.
- Sin cobertura medida (`flutter test --coverage`, `vitest --coverage`).

---

## Verificación actual

    flutter analyze --no-fatal-infos lib   →  6 infos (onReorder del SDK), 0 errores
    flutter test                           →  208 ✓ / 0 ✗   (antes: 202 ✓ / 2 ✗)
    npx tsc --noEmit                       →  limpio
    npx eslint .                           →  0 errores      (antes: 4)
    npx vitest run                         →  104 ✓ en 7 archivos (antes: no existía)
    npx next build                         →  verde con Next 16.3.1
    npm audit --omit=dev                   →  2 moderadas    (antes: 7, 5 altas)

---

# Anexo — Verificación contra producción, 2026-08-18

El informe de arriba cerraba diciendo que nada se había probado contra Supabase
de producción ni contra un dispositivo real. Eso ya no es cierto. Lo que sigue
es lo que se comprobó, con el resultado que dio.

## Migraciones aplicadas

`0027` y `0028` están **aplicadas y verificadas** en `vmkkkrlctakzzqebtyci`.
`0029` **no**, y sigue esperando a que todos los equipos tengan la app nueva.

Un aviso que vale la pena dejar escrito: al revisar se creyó por un momento que
la 0029 ya estaba aplicada, y se llegó a redactar un revert de emergencia
(`0030_revertir_0029_sueldo_columnas.sql`). La consulta al esquema lo desmintió
—las cuatro columnas seguían ahí— y el archivo quedó como escotilla de salida,
no como algo que haya que correr. **Antes de actuar sobre el estado de
producción, consúltalo; no lo des por sabido.**

## Estado de los datos, después de migrar la tableta

| Comprobación | Resultado |
|---|---|
| Filas en `colaborador_sueldo` | 30 |
| Colaboradores con sueldo en `colaboradores` | 30 |
| Huérfanos (los que abortarían la 0029) | **0** |
| Discrepancias de monto entre tabla vieja y nueva | **0** |

Cero discrepancias es lo que importa: cada monto de la tabla nueva es idéntico
al de la columna vieja. La migración Drift v9→v10 —que reconstruye
`colaboradores` entera para soltar cuatro columnas— no perdió ni alteró nada.

La tableta (SM_X510, la de obra) migró en el arranque y subió sus 29 filas:

    [SyncService] PUSH colaborador_sueldo: 29 por subir

Sin crash y sin error de SQLite. El servidor pasó de 29 a 30 filas porque la
tableta traía un sueldo que la copia de la 0027 no había alcanzado a ver.

## RLS: probada, no asumida

Simulando la sesión de cada usuario en Postgres (`set local role authenticated`
+ `request.jwt.claims`), sin contraseñas y dentro de una transacción revertida:

| Sesión | Pasa `auth_tiene_rol(admin,supervisor,contador)` | Ve `colaborador_sueldo` | Ve `colaboradores` |
|---|---|---|---|
| admin | sí | 30 | 41 |
| cliente | **no** | **0** | **0** |

La policy `colaborador_sueldo_read` hace lo que debe. Un `colaborador` se
comporta igual que el `cliente` frente a esa tabla, porque el gate lista roles
explícitamente y él no está.

## Por qué la 0029 sigue importando

`colaboradores` tiene dos policies de SELECT, y una de ellas incluye al rol de
campo:

    colaboradores_staff_read → admin, supervisor, colaborador
    colaboradores_contador_read → contador

Necesita esa lectura para el pase de lista. Pero mientras las cuatro columnas de
sueldo sigan en esa tabla, esa misma lectura se las entrega. **Ese es el hueco
que cierra la 0029, y no lo cierra ninguna otra cosa** — los gates de la app son
presentación, y el colaborador tiene la anon key y su propia sesión.

## Lo que baja el riesgo hoy

Producción tiene **dos cuentas**: un `admin` y un `cliente`. No existe ninguna
cuenta con rol `colaborador` ni `contador`. Así que A3 hoy no es explotable por
nadie: es una puerta abierta a un cuarto donde todavía no hay quien entre. Eso
da margen para hacer el despliegue con calma, pero **el orden no cambia**: la
0029 va antes de crear la primera cuenta de campo, o al mismo tiempo.

## Lo que sigue sin evidencia

- El PDF de cotización desde Vercel (la ruta del Chromium empaquetado).
- Arrastrar para reordenar en las cuatro pantallas, tras el renombrado del hook.
- Cobertura medida.
- La web desplegada con Next 16.3.1.
