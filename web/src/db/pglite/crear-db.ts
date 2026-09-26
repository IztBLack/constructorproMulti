// Postgres en memoria (PGlite) con TODAS las migraciones de `supabase/migrations/`
// aplicadas, para probar SQL y RLS sin Docker, sin psql y sin tocar producción.
//
// Cómo se usa: ver `README.md` en esta misma carpeta.

import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { PGlite, type Transaction } from '@electric-sql/pglite';
import { pgcrypto } from '@electric-sql/pglite/contrib/pgcrypto';

// web/src/db/pglite/ → raíz del repo
const RAIZ_REPO = fileURLToPath(new URL('../../../../', import.meta.url));
export const DIR_MIGRACIONES = join(RAIZ_REPO, 'supabase', 'migrations');
const RUTA_SHIM = fileURLToPath(new URL('./shim-supabase.sql', import.meta.url));

/** Lo que tienen en común `PGlite` y la `Transaction` de `comoUsuario`. */
export type Consultable = Pick<Transaction, 'query' | 'exec'>;

// ─────────────────────────────────────────────────────────────────────────────
// Reemplazos textuales sobre migraciones existentes
// ─────────────────────────────────────────────────────────────────────────────
// Las migraciones NO se editan para que pasen aquí: son lo que corre en
// producción. Si alguna trae algo que PGlite no puede ejecutar (p. ej. una
// extensión que no existe en WASM), se agrega aquí UN reemplazo mínimo con su
// porqué. Esta lista es el único lugar donde el harness se aparta del SQL real.
//
// Si `buscar` deja de aparecer en el archivo, `aplicarMigraciones` truena: así un
// reemplazo viejo no se queda escondiendo nada.
//
// Hoy está vacía: las 34 migraciones (0001-0034) corren tal cual sobre el shim.
export interface Reemplazo {
  /** Nombre del archivo, p. ej. `0042_algo.sql`. */
  archivo: string;
  buscar: string;
  reemplazo: string;
  /** Por qué PGlite no puede con el original y por qué el cambio no altera lo que se prueba. */
  porque: string;
}

export const REEMPLAZOS: readonly Reemplazo[] = [];

// ─────────────────────────────────────────────────────────────────────────────
// Construcción
// ─────────────────────────────────────────────────────────────────────────────

/** Archivos `NNNN_*.sql` en orden alfabético (= orden de aplicación en Supabase). */
export function listarMigraciones(): string[] {
  return readdirSync(DIR_MIGRACIONES)
    .filter((f) => f.endsWith('.sql'))
    .sort();
}

function leerMigracion(archivo: string): string {
  // En Windows git puede dejar CRLF: se normaliza para que `buscar` (con \n)
  // encuentre lo mismo en cualquier máquina.
  let sql = readFileSync(join(DIR_MIGRACIONES, archivo), 'utf8').replace(/\r\n/g, '\n');
  for (const r of REEMPLAZOS.filter((x) => x.archivo === archivo)) {
    if (!sql.includes(r.buscar)) {
      throw new Error(
        `Reemplazo obsoleto en ${archivo}: ya no aparece ${JSON.stringify(r.buscar)}. ` +
          'Quítalo de REEMPLAZOS en crear-db.ts.',
      );
    }
    sql = sql.split(r.buscar).join(r.reemplazo);
  }
  return sql;
}

/** PGlite vacía + el shim de Supabase (roles, auth, storage, extensiones). */
export async function crearDbConShim(): Promise<PGlite> {
  const db = await PGlite.create({ extensions: { pgcrypto } });
  await db.exec(readFileSync(RUTA_SHIM, 'utf8'));
  return db;
}

/**
 * Aplica las migraciones en orden. Cada archivo va en su propia transacción,
 * como lo hace el CLI de Supabase: si uno falla, el error dice cuál.
 *
 * `hasta` (inclusive, p. ej. `'0019'`) sirve para probar una migración contra
 * el estado previo a las que siguen.
 */
export async function aplicarMigraciones(
  db: PGlite,
  opciones: { hasta?: string } = {},
): Promise<string[]> {
  const aplicadas: string[] = [];
  for (const archivo of listarMigraciones()) {
    if (opciones.hasta && archivo.slice(0, opciones.hasta.length) > opciones.hasta) break;
    const sql = leerMigracion(archivo);
    try {
      await db.transaction(async (tx) => {
        await tx.exec(sql);
      });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      throw new Error(`La migración ${archivo} falló: ${msg}`, { cause: e });
    }
    aplicadas.push(archivo);
  }
  return aplicadas;
}

/** DB nueva con shim + todas las migraciones. Tarda unos segundos: ver `dbMigrada`. */
export async function crearDbMigrada(): Promise<PGlite> {
  const db = await crearDbConShim();
  await aplicarMigraciones(db);
  return db;
}

let cache: Promise<PGlite> | null = null;

/**
 * La misma DB migrada para todo el archivo de test (vitest aísla cada archivo en
 * su propio módulo, así que no se comparte entre archivos).
 *
 * Los tests que la comparten NO deben pisarse: cada uno crea sus propias
 * empresas con `crearEmpresaDePrueba` (ids aleatorios) y nunca cuenta filas de
 * toda la tabla, solo las de sus empresas. Si un test necesita una base
 * prístina, que use `crearDbMigrada()`.
 */
export function dbMigrada(): Promise<PGlite> {
  cache ??= crearDbMigrada();
  return cache;
}

// ─────────────────────────────────────────────────────────────────────────────
// Actuar como un usuario
// ─────────────────────────────────────────────────────────────────────────────

export type RolPostgrest = 'authenticated' | 'anon';

/**
 * Ejecuta `fn` como lo haría PostgREST con el JWT de `userId`: dentro de una
 * transacción con `set local role authenticated` y los claims del JWT en las
 * variables de sesión. Todo lo que pase adentro respeta RLS y GRANTs.
 *
 * Si `fn` termina bien se hace COMMIT (los datos quedan para el siguiente paso
 * del test); si lanza, ROLLBACK y el error se propaga — así se prueba que una
 * policy RECHAZA algo: `await expect(comoUsuario(...)).rejects.toThrow(/row-level security/)`.
 *
 * Fuera de `comoUsuario`, `db.query(...)` corre como `postgres` (superusuario,
 * se salta RLS): úsalo para sembrar datos, nunca para afirmar lo que ve un rol.
 */
export async function comoUsuario<T>(
  db: PGlite,
  userId: string | null,
  fn: (tx: Transaction) => Promise<T>,
  opciones: { rol?: RolPostgrest; email?: string } = {},
): Promise<T> {
  const rol: RolPostgrest = opciones.rol ?? (userId ? 'authenticated' : 'anon');
  const claims = JSON.stringify({
    sub: userId ?? undefined,
    role: rol,
    email: opciones.email ?? undefined,
  });
  return db.transaction(async (tx) => {
    await tx.query(
      `select set_config('request.jwt.claim.sub', $1, true),
              set_config('request.jwt.claim.role', $2, true),
              set_config('request.jwt.claims', $3, true)`,
      [userId ?? '', rol, claims],
    );
    // `rol` es uno de dos literales fijos (tipado arriba): no hay inyección posible.
    await tx.exec(`set local role ${rol}`);
    return fn(tx);
  });
}

/** Atajo: sin sesión (rol `anon`). */
export function comoAnonimo<T>(db: PGlite, fn: (tx: Transaction) => Promise<T>): Promise<T> {
  return comoUsuario(db, null, fn, { rol: 'anon' });
}
