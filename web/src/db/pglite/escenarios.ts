// Helpers para sembrar escenarios de prueba sobre la DB de `crear-db.ts`.
//
// Regla: lo que se SIEMBRA va como superusuario (`db.query`, se salta RLS) o por
// la RPC real cuando el flujo importa (`crear_empresa`, `invitar_usuario` +
// `canjear_codigo_vinculacion`). Lo que se AFIRMA —qué ve o qué puede escribir
// un rol— va SIEMPRE dentro de `comoUsuario`.

import { randomUUID } from 'node:crypto';
import type { PGlite } from '@electric-sql/pglite';
import { comoUsuario, type Consultable } from './crear-db';

export type Rol =
  | 'admin'
  | 'supervisor'
  | 'colaborador'
  | 'cliente'
  | 'contador'
  // 0042 (F6)
  | 'residente'
  | 'compras'
  | 'almacen';

export const ahoraMs = () => Date.now();

// ── Genérico ─────────────────────────────────────────────────────────────────

const IDENT = /^[a-z_][a-z0-9_]*(\.[a-z_][a-z0-9_]*)?$/;

/**
 * `insert into <tabla> (...) values (...) returning *` a partir de un objeto.
 * Sirve igual con `db` (superusuario) que con el `tx` de `comoUsuario` (RLS).
 * Los nombres de tabla/columna se validan contra un patrón de identificador:
 * es código de test, pero así un typo truena claro en vez de armar SQL raro.
 *
 * OJO: `returning *` exige que la fila nueva pase también las policies de
 * SELECT. Para un rol que puede insertar pero NO leer esa tabla, pasa
 * `{ returning: false }` (devuelve `undefined`), o el rechazo que veas será el
 * del SELECT y no el del INSERT.
 */
export async function insertar<T = Record<string, unknown>>(
  c: Consultable,
  tabla: string,
  fila: Record<string, unknown>,
  opciones: { returning?: boolean } = {},
): Promise<T> {
  if (!IDENT.test(tabla)) throw new Error(`Nombre de tabla inválido: ${tabla}`);
  const cols = Object.keys(fila);
  for (const col of cols) if (!IDENT.test(col)) throw new Error(`Columna inválida: ${col}`);
  const params = cols.map((_, i) => `$${i + 1}`).join(', ');
  const returning = opciones.returning === false ? '' : ' returning *';
  const r = await c.query<T>(
    `insert into ${tabla} (${cols.join(', ')}) values (${params})${returning}`,
    cols.map((col) => fila[col]),
  );
  return r.rows[0];
}

/** Ids visibles de una tabla filtrando por una lista de ids (útil para "¿ve esta fila?"). */
export async function idsVisibles(c: Consultable, tabla: string, ids: string[]): Promise<string[]> {
  if (!IDENT.test(tabla)) throw new Error(`Nombre de tabla inválido: ${tabla}`);
  const r = await c.query<{ id: string }>(
    `select id::text as id from ${tabla} where id = any($1::uuid[]) order by id`,
    [ids],
  );
  return r.rows.map((x) => x.id);
}

// ── Usuarios y empresas ──────────────────────────────────────────────────────

/** Un usuario de Supabase Auth (solo la fila en `auth.users`). */
export async function crearUsuario(
  db: PGlite,
  datos: { email?: string; nombre?: string } = {},
): Promise<string> {
  const id = randomUUID();
  await db.query(
    `insert into auth.users (id, email, raw_user_meta_data) values ($1, $2, $3)`,
    [id, datos.email ?? `${id}@prueba.test`, JSON.stringify({ nombre: datos.nombre ?? 'Prueba' })],
  );
  return id;
}

export interface EmpresaDePrueba {
  empresaId: string;
  adminId: string;
}

/** Usuario nuevo + `crear_empresa` (la RPC real, como lo hace el onboarding). */
export async function crearEmpresaDePrueba(
  db: PGlite,
  nombre = `Constructora ${randomUUID().slice(0, 8)}`,
): Promise<EmpresaDePrueba> {
  const adminId = await crearUsuario(db);
  const res = await comoUsuario(db, adminId, (tx) =>
    tx.query<{ r: { ok: boolean; empresa_id?: string; error?: string } }>(
      'select public.crear_empresa($1) as r',
      [nombre],
    ),
  );
  const r = res.rows[0].r;
  if (!r.ok || !r.empresa_id) throw new Error(`crear_empresa falló: ${r.error}`);
  return { empresaId: r.empresa_id, adminId };
}

/**
 * Da de alta a alguien en la empresa con ese rol.
 *
 * - supervisor / colaborador / contador / residente / compras / almacen: por el flujo REAL — el admin llama a
 *   `invitar_usuario` y la persona nueva canjea el código con
 *   `canjear_codigo_vinculacion`. Así el test también cubre esas RPC.
 * - admin: inserción directa como superusuario (el alta de un segundo admin va
 *   por `invitar_socio` + correo, que no aporta nada a un test de RLS).
 * - cliente: usa `crearClienteConCuenta`, que además crea la fila en `clientes`.
 */
export async function invitarConRol(
  db: PGlite,
  empresa: EmpresaDePrueba,
  rol: Exclude<Rol, 'cliente'>,
): Promise<string> {
  const userId = await crearUsuario(db);
  if (rol === 'admin') {
    await agregarMembresia(db, empresa.empresaId, userId, 'admin');
    return userId;
  }
  const inv = await comoUsuario(db, empresa.adminId, (tx) =>
    tx.query<{ r: { ok: boolean; code?: string; error?: string } }>(
      'select public.invitar_usuario($1, $2) as r',
      [`Invitado ${rol}`, rol],
    ),
  );
  const code = inv.rows[0].r.code;
  if (!inv.rows[0].r.ok || !code) throw new Error(`invitar_usuario falló: ${inv.rows[0].r.error}`);

  const canje = await comoUsuario(db, userId, (tx) =>
    tx.query<{ r: { ok: boolean; error?: string } }>(
      'select public.canjear_codigo_vinculacion($1) as r',
      [code],
    ),
  );
  if (!canje.rows[0].r.ok) throw new Error(`canjear_codigo_vinculacion falló: ${canje.rows[0].r.error}`);
  return userId;
}

/** Membresía directa como superusuario (sin RPC). Para roles o casos que la RPC no cubre. */
export async function agregarMembresia(
  db: PGlite,
  empresaId: string,
  userId: string,
  rol: Rol,
): Promise<void> {
  await db.query(
    'insert into public.usuarios_empresa (user_id, empresa_id, rol) values ($1, $2, $3)',
    [userId, empresaId, rol],
  );
}

/**
 * Un cliente del portal con cuenta: fila en `clientes` ligada a su `user_id` y
 * membresía con rol `cliente` (lo mismo que deja el canje de un código de cliente).
 */
export async function crearClienteConCuenta(
  db: PGlite,
  empresaId: string,
): Promise<{ userId: string; clienteId: string }> {
  const userId = await crearUsuario(db);
  const clienteId = randomUUID();
  await insertar(db, 'public.clientes', {
    id: clienteId,
    empresa_id: empresaId,
    nombre: 'Cliente de prueba',
    user_id: userId,
  });
  await agregarMembresia(db, empresaId, userId, 'cliente');
  return { userId, clienteId };
}

// ── Datos de obra ────────────────────────────────────────────────────────────

export async function crearObra(
  c: Consultable,
  empresaId: string,
  extra: Record<string, unknown> = {},
): Promise<string> {
  const id = randomUUID();
  await insertar(c, 'public.obras', {
    id,
    empresa_id: empresaId,
    nombre: 'Obra de prueba',
    fecha_inicio: ahoraMs(),
    ...extra,
  });
  return id;
}

export async function crearMovimiento(
  c: Consultable,
  datos: { empresaId: string; obraId: string; tipo: 'ENTRADA' | 'SALIDA'; monto?: number },
): Promise<string> {
  const id = randomUUID();
  await insertar(c, 'public.movimientos', {
    id,
    empresa_id: datos.empresaId,
    obra_id: datos.obraId,
    fecha: ahoraMs(),
    tipo: datos.tipo,
    categoria: datos.tipo === 'ENTRADA' ? 'Anticipo' : 'Material',
    concepto: `${datos.tipo} de prueba`,
    monto: datos.monto ?? 1000,
    metodo_pago: 'TRANSFERENCIA',
  });
  return id;
}

export async function crearNotaObra(
  c: Consultable,
  datos: { empresaId: string; obraId: string },
): Promise<string> {
  const id = randomUUID();
  await insertar(c, 'public.nota_obra', {
    id,
    empresa_id: datos.empresaId,
    obra_id: datos.obraId,
    destinatario: 'Socio de prueba',
  });
  return id;
}

/**
 * Asigna una obra a un residente o colaborador (0042 `usuario_obra`), como lo
 * hace la pantalla de Usuarios: el ADMIN inserta por RLS. Devuelve el id.
 */
export async function asignarObra(
  db: PGlite,
  empresa: EmpresaDePrueba,
  userId: string,
  obraId: string,
): Promise<string> {
  const id = randomUUID();
  await comoUsuario(db, empresa.adminId, (tx) =>
    insertar(
      tx,
      'public.usuario_obra',
      { id, empresa_id: empresa.empresaId, user_id: userId, obra_id: obraId },
      { returning: false },
    ),
  );
  return id;
}
