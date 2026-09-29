# Migraciones y RLS en Postgres en memoria (PGlite)

Las migraciones de `supabase/migrations/` se prueban sobre un Postgres 17 **real**
que corre dentro de Node (PGlite, WASM). No hace falta Docker, psql ni el CLI de
Supabase, y nunca se toca producción.

```
npx vitest run src/db          # solo las pruebas de base de datos (~12 s)
npx vitest run                 # todo
```

## Qué hay aquí

| Archivo | Para qué |
|---|---|
| `shim-supabase.sql` | Lo que Supabase trae antes de nuestra migración 0001: roles `anon`/`authenticated`/`service_role`, `auth.users`, `auth.uid()`/`jwt()`/`role()`/`email()`, `storage.buckets`/`objects`/`foldername()`, pgcrypto en el esquema `extensions`, y los GRANT por defecto sobre `public`. |
| `crear-db.ts` | Crea la DB y aplica shim + migraciones en orden. `comoUsuario()` para actuar como un usuario. `REEMPLAZOS`: la única lista de cambios textuales a migraciones (hoy vacía). |
| `escenarios.ts` | Helpers para sembrar: `crearEmpresaDePrueba`, `invitarConRol`, `crearClienteConCuenta`, `agregarMembresia`, `crearObra`, `crearMovimiento`, `crearNotaObra`, `insertar`, `idsVisibles`. |
| `../migraciones.test.ts` | Todas las migraciones aplican + escenario RLS base. |

## Las dos reglas

1. **Se siembra como superusuario, se afirma como usuario.** `db.query(...)` corre
   como `postgres` y se salta RLS: úsalo para preparar datos. Todo lo que diga
   "el rol X ve / no ve / puede / no puede" va dentro de `comoUsuario(db, userId, tx => ...)`,
   que hace `set local role authenticated` y pone el `sub` del JWT, igual que PostgREST.
2. **Cada test crea sus propias empresas.** `dbMigrada()` comparte una DB por archivo
   de test. No cuentes filas de toda la tabla: pregunta por los ids que tú creaste
   (`idsVisibles(tx, 'public.tabla', [id1, id2])`).

## Agregar un test de RLS para una migración nueva (0035 en adelante)

1. Escribe la migración en `supabase/migrations/00NN_nombre.sql`. El harness la toma
   sola (orden alfabético); no hay que registrarla en ningún lado.
2. Crea `web/src/db/00NN-nombre.test.ts` (debe quedar en `src/**` y terminar en
   `.test.ts` para que vitest lo encuentre):

```ts
import { beforeAll, describe, expect, it } from 'vitest';
import type { PGlite } from '@electric-sql/pglite';
import { comoUsuario, dbMigrada } from './pglite/crear-db';
import {
  crearEmpresaDePrueba, crearObra, idsVisibles, insertar, invitarConRol,
  type EmpresaDePrueba,
} from './pglite/escenarios';
import { randomUUID } from 'node:crypto';

const RLS = /row-level security/;

describe('0038 compras', () => {
  let db: PGlite;
  let a: EmpresaDePrueba;
  let b: EmpresaDePrueba;
  let obraA: string;
  let obraB: string;

  beforeAll(async () => {
    db = await dbMigrada();                      // ~3 s la primera vez por archivo
    a = await crearEmpresaDePrueba(db);
    b = await crearEmpresaDePrueba(db);
    obraA = await crearObra(db, a.empresaId);    // sembrado como superusuario
    obraB = await crearObra(db, b.empresaId);
  }, 60_000);

  it('el supervisor de A da de alta una compra en su obra', async () => {
    const sup = await invitarConRol(db, a, 'supervisor');
    const id = randomUUID();
    await comoUsuario(db, sup, (tx) =>
      insertar(tx, 'public.compras', { id, empresa_id: a.empresaId, obra_id: obraA /* … */ }),
    );
    const ve = await comoUsuario(db, a.adminId, (tx) => idsVisibles(tx, 'public.compras', [id]));
    expect(ve).toEqual([id]);
  });

  it('no puede colgar una compra de A bajo una obra de B (padre de otra empresa)', async () => {
    await expect(
      comoUsuario(db, a.adminId, (tx) =>
        insertar(tx, 'public.compras', { id: randomUUID(), empresa_id: a.empresaId, obra_id: obraB /* … */ }),
      ),
    ).rejects.toThrow(RLS);
  });

  it('el colaborador no ve compras', async () => { /* … */ });
});
```

### Qué conviene cubrir en cada tabla nueva

- **Aislamiento:** el admin de B no ve (ni puede escribir con el `empresa_id` de) A.
- **Padre de la misma empresa** (la lección de 0019): insertar con `empresa_id = A`
  apuntando a una obra/cotización/nota de B debe dar `row-level security`.
- **Cada rol** (`admin`, `supervisor`, `colaborador`, `contador`, `cliente`, y los
  nuevos de 0042): qué lee y qué escribe, según la tabla de permisos de la fase.
- **RPC:** llámala dentro de `comoUsuario`. El cuerpo de una función plpgsql no se
  valida al crearla, así que un nombre mal escrito solo aparece al ejecutarla.
- **Borrado lógico:** la app borra con `update … set deleted_at`; prueba el UPDATE,
  no solo el DELETE.

### Cómo se ve cada tipo de rechazo

| Situación | Qué pasa |
|---|---|
| `insert`/`update` que no pasa el `with check` | lanza `new row violates row-level security policy` → `rejects.toThrow(/row-level security/)` |
| `select` sin policy que lo permita | **no** lanza: devuelve 0 filas → `expect(ids).toEqual([])` |
| `update`/`delete` sobre filas que el `using` no deja ver | **no** lanza: afecta 0 filas → revisa `r.affectedRows` o vuelve a leer como superusuario |
| `insert … returning *` de un rol que puede insertar pero **no leer** la tabla | lanza `row-level security` por la policy de SELECT: usa `insertar(tx, tabla, fila, { returning: false })` |
| función con `revoke execute … from anon` | lanza `permission denied for function` |
| `raise exception` dentro de una RPC | lanza con el mensaje de la excepción |

### Roles y alta de personas

- `crearEmpresaDePrueba(db)` → usuario nuevo + la RPC real `crear_empresa` (queda admin,
  con los 10 conceptos del catálogo base).
- `invitarConRol(db, empresa, 'supervisor' | 'colaborador' | 'contador' | 'residente' | 'compras' | 'almacen')`
  → flujo real: `invitar_usuario` como el admin + `canjear_codigo_vinculacion` como la
  persona nueva. `'admin'` se inserta directo.
- `asignarObra(db, empresa, userId, obraId)` → fila de `usuario_obra` (0042) insertada
  por el admin con RLS: lo que ve el residente y la bitácora del colaborador.
- `crearClienteConCuenta(db, empresaId)` → fila en `clientes` con `user_id` + membresía `cliente`.
- `agregarMembresia(db, empresaId, userId, rol)` → inserción directa, sin RPC (p. ej. una
  segunda membresía en otra empresa). Respeta el CHECK de `usuarios_empresa.rol`.
- `comoAnonimo(db, fn)` → sin sesión (rol `anon`).

## Cuando algo de una migración no corre en PGlite

**No edites la migración** para que pase aquí: es lo que corre en producción.

- Si falta algo de Supabase (una función de `auth`/`storage`, una extensión, un rol),
  agrégalo a `shim-supabase.sql` **con la misma forma que en Supabase** y un comentario.
  Extensiones disponibles como contrib de PGlite: pgcrypto, uuid-ossp, pg_trgm,
  unaccent, citext, hstore, ltree, btree_gin/gist, etc. (se cargan en
  `crearDbConShim`, opción `extensions`). pg_cron, pg_net y vault **no** existen:
  habría que poner un stub.
- Si es algo que PGlite de plano no puede ejecutar, agrega una entrada a `REEMPLAZOS`
  en `crear-db.ts` (archivo, texto exacto a buscar, reemplazo mínimo y el porqué).
  Si el texto deja de aparecer, el harness truena para que el reemplazo no se quede
  olvidado.
- Si lo que falla es un **bug real** de la migración, no lo escondas: arréglalo en la
  migración (si aún no está en producción) o repórtalo.

## Escotillas y la foto del esquema de producción

- **Escotillas** (`ESCOTILLAS` en `crear-db.ts`): migraciones que están en la
  carpeta pero NO se aplican en producción en condiciones normales (hoy, la
  `0030_revertir_0029_sueldo_columnas.sql`). El harness no las aplica por
  defecto; un test que las necesite pasa `{ incluirEscotillas: true }` a
  `crearDbMigrada` / `aplicarMigraciones`.
- **`esquema-prod.json`**: foto del esquema `public` de producción, solo nombres
  de tablas y columnas (`tabla → [columnas]`), sin datos. `../esquema-prod.test.ts`
  compara el PGlite migrado contra ella y lista cada diferencia; las ya
  diagnosticadas van en `DIFERENCIAS_CONOCIDAS` con su porqué (falla si aparece
  una nueva o si una conocida desaparece).
- Para refrescar la foto (después de aplicar migraciones en producción), por la
  Management API o el SQL Editor:

  ```sql
  select json_agg(json_build_object('t', table_name, 'c', column_name) order by table_name, column_name) as cols
    from information_schema.columns
   where table_schema = 'public'
     and table_name in (select table_name from information_schema.tables
                         where table_schema = 'public' and table_type = 'BASE TABLE');
  ```

  y normalizar a `{ tabla: [columnas ordenadas] }` con las tablas ordenadas.

## Límites

- No prueba GoTrue, PostgREST ni el servidor de Storage: prueba el SQL, las policies y
  las RPC. Una policy de `storage.objects` sí se puede probar insertando la fila
  (`bucket_id`, `name = '<empresa_id>/…'`) dentro de `comoUsuario`.
- `service_role` existe con `BYPASSRLS`, pero PGlite se conecta como `postgres`
  (superusuario): para "actuar como la llave de servicio" basta `db.query`.
