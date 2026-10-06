// El PGlite migrado tiene que parecerse a producción en lo que importa para que
// una prueba signifique lo mismo allá: tablas y columnas, quién puede ejecutar
// cada función, policies, triggers y RLS. Las dos cargas fallidas del demo
// fueron justo esto: el harness aplicaba la escotilla 0030 (columnas que prod ya
// no tiene) y no conocía un REVOKE hecho a mano en prod (hoy en la 0046).
//
// Fotos de producción, solo metadatos (Management API, sin datos):
//   · `pglite/esquema-prod.json`            tabla → columnas (information_schema.columns)
//   · `pglite/esquema-prod-seguridad.json`  funciones (EXECUTE de anon/authenticated y
//                                           SECURITY DEFINER), policies (public y storage),
//                                           triggers (information_schema.triggers) y RLS.
// Cómo refrescarlas: `pglite/README.md`.

import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import type { PGlite } from '@electric-sql/pglite';
import { dbMigrada } from './pglite/crear-db';

type Esquema = Record<string, string[]>;

export interface Seguridad {
  funciones: Record<string, { execute: string[]; definer: boolean }>;
  policies: Record<string, Record<string, { cmd: string; roles: string[] }>>;
  triggers: Record<string, string[]>;
  rls: Record<string, boolean>;
}

const leer = <T>(archivo: string): T => JSON.parse(readFileSync(new URL(archivo, import.meta.url), 'utf8')) as T;
const FOTO: Esquema = leer('./pglite/esquema-prod.json');
const FOTO_SEG: Seguridad = leer('./pglite/esquema-prod-seguridad.json');

const REPO = 'está en el repo (PGlite) y NO en producción';
const PROD = 'está en producción y NO en el repo (PGlite)';

/** Diferencias legibles: "tabla.columna solo en X". Vacío = iguales. */
export function diferenciasEsquema(repo: Esquema, prod: Esquema): string[] {
  const out: string[] = [];
  const tablas = [...new Set([...Object.keys(repo), ...Object.keys(prod)])].sort();
  for (const t of tablas) {
    if (!prod[t]) {
      out.push(`tabla ${t}: ${REPO}`);
      continue;
    }
    if (!repo[t]) {
      out.push(`tabla ${t}: ${PROD}`);
      continue;
    }
    const p = new Set(prod[t]);
    const r = new Set(repo[t]);
    for (const c of repo[t]) if (!p.has(c)) out.push(`${t}.${c}: ${REPO}`);
    for (const c of prod[t]) if (!r.has(c)) out.push(`${t}.${c}: ${PROD}`);
  }
  return out;
}

function llaves(...objs: object[]): string[] {
  return [...new Set(objs.flatMap((o) => Object.keys(o)))].sort();
}

/** Diferencias de funciones, policies, triggers y RLS. */
export function diferenciasSeguridad(repo: Seguridad, prod: Seguridad): string[] {
  const out: string[] = [];
  for (const f of llaves(repo.funciones, prod.funciones)) {
    const r = repo.funciones[f];
    const p = prod.funciones[f];
    if (!p) out.push(`función ${f}: ${REPO}`);
    else if (!r) out.push(`función ${f}: ${PROD}`);
    else {
      const er = r.execute.join(',') || 'nadie';
      const ep = p.execute.join(',') || 'nadie';
      if (er !== ep) out.push(`función ${f}: EXECUTE en el repo = ${er}; en producción = ${ep}`);
      if (r.definer !== p.definer) out.push(`función ${f}: SECURITY DEFINER en el repo = ${r.definer}; en producción = ${p.definer}`);
    }
  }
  for (const t of llaves(repo.policies, prod.policies)) {
    const r = repo.policies[t] ?? {};
    const p = prod.policies[t] ?? {};
    for (const n of llaves(r, p)) {
      if (!p[n]) out.push(`policy ${t}.${n}: ${REPO}`);
      else if (!r[n]) out.push(`policy ${t}.${n}: ${PROD}`);
      else if (r[n].cmd !== p[n].cmd || r[n].roles.join(',') !== p[n].roles.join(',')) {
        out.push(`policy ${t}.${n}: en el repo ${r[n].cmd} {${r[n].roles}}; en producción ${p[n].cmd} {${p[n].roles}}`);
      }
    }
  }
  for (const t of llaves(repo.triggers, prod.triggers)) {
    const r = new Set(repo.triggers[t] ?? []);
    const p = new Set(prod.triggers[t] ?? []);
    for (const g of r) if (!p.has(g)) out.push(`trigger ${t}.${g}: ${REPO}`);
    for (const g of p) if (!r.has(g)) out.push(`trigger ${t}.${g}: ${PROD}`);
  }
  for (const t of llaves(repo.rls, prod.rls)) {
    if (repo.rls[t] !== prod.rls[t]) {
      out.push(`RLS de ${t}: en el repo = ${repo.rls[t] ?? 'sin tabla'}; en producción = ${prod.rls[t] ?? 'sin tabla'}`);
    }
  }
  return out;
}

/** Lo mismo que la foto, leído del PGlite migrado (con las mismas fuentes). */
async function seguridadDe(db: PGlite): Promise<Seguridad> {
  const funciones: Seguridad['funciones'] = {};
  const f = await db.query<{ f: string; anon: boolean; auth: boolean; definer: boolean }>(
    `select p.proname || '(' || pg_get_function_identity_arguments(p.oid) || ')' as f,
            has_function_privilege('anon', p.oid, 'execute') as anon,
            has_function_privilege('authenticated', p.oid, 'execute') as auth,
            p.prosecdef as definer
       from pg_proc p join pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'public'`,
  );
  for (const x of f.rows) {
    funciones[x.f] = { execute: [...(x.anon ? ['anon'] : []), ...(x.auth ? ['authenticated'] : [])], definer: x.definer };
  }
  const policies: Seguridad['policies'] = {};
  const p = await db.query<{ t: string; n: string; cmd: string; roles: string[] }>(
    `select schemaname || '.' || tablename as t, policyname as n, cmd, roles::text[] as roles
       from pg_policies where schemaname in ('public', 'storage')`,
  );
  for (const x of p.rows) (policies[x.t] ??= {})[x.n] = { cmd: x.cmd, roles: [...x.roles].sort() };
  // information_schema.triggers, igual que la foto: NO lista los triggers de
  // TRUNCATE (p. ej. `trg_actividad_sin_truncate` de 0042). Comparar con
  // pg_trigger de este lado inventaría una diferencia que no existe.
  const triggers: Seguridad['triggers'] = {};
  const g = await db.query<{ t: string; g: string }>(
    `select distinct event_object_table as t, trigger_name as g
       from information_schema.triggers where event_object_schema = 'public'`,
  );
  for (const x of g.rows) (triggers[x.t] ??= []).push(x.g);
  const rls: Seguridad['rls'] = {};
  const r = await db.query<{ t: string; on: boolean }>(
    `select c.relname as t, c.relrowsecurity as on
       from pg_class c join pg_namespace n on n.oid = c.relnamespace
      where n.nspname = 'public' and c.relkind in ('r', 'p')`,
  );
  for (const x of r.rows) rls[x.t] = x.on;
  return { funciones, policies, triggers, rls };
}

const PROYECCION_GUARDADA =
  'La crea `supabase/migrations/0034_proyeccion_guardada.sql`, que solo existe en la rama ' +
  '`bulk-collab-salary` (= origin/claude/bulk-collaborators-salary-edit-49glwi, commits 8caa9cb y ' +
  '8e65966 "la 0034 en producción"), sin mergear a main ni a la rama de integración. Choca de número ' +
  'con `0034_nota_para_y_porcentaje.sql`. Al mergear esa rama hay que renumerarla (0047 o la que siga) ' +
  'y entonces sale de esta lista (tabla, sus 3 policies, su trigger y su RLS).';

const FUNCION_A_MANO =
  'Existe en producción (SECURITY INVOKER; EXECUTE solo para authenticated, sin anon ni PUBLIC) y no ' +
  'aparece en ninguna migración, archivo ni commit de ninguna rama del repo (`git log --all -S`), ni la ' +
  'llama la web ni el móvil. Se creó a mano en el SQL Editor. No se registra en una migración porque la ' +
  'foto no trae su cuerpo: hay que sacarlo con `select pg_get_functiondef(\'public.<nombre>\'::regproc)` ' +
  'y decidir si se versiona o se borra. Como corre con los permisos de quien llama, la RLS la sigue acotando.';

/**
 * Diferencias YA diagnosticadas que no se arreglan desde aquí (no se toca
 * producción desde el repo). Cada una lleva su porqué. La prueba falla si
 * aparece una diferencia NUEVA y también si una de estas desaparece (para que
 * la lista no se quede vieja cuando alguien la resuelva).
 */
export const DIFERENCIAS_CONOCIDAS: readonly { diferencia: string; porque: string }[] = [
  { diferencia: `tabla proyeccion_guardada: ${PROD}`, porque: PROYECCION_GUARDADA },
  { diferencia: `policy public.proyeccion_guardada.proyeccion_guardada_insert: ${PROD}`, porque: PROYECCION_GUARDADA },
  { diferencia: `policy public.proyeccion_guardada.proyeccion_guardada_read: ${PROD}`, porque: PROYECCION_GUARDADA },
  { diferencia: `policy public.proyeccion_guardada.proyeccion_guardada_update: ${PROD}`, porque: PROYECCION_GUARDADA },
  { diferencia: `trigger proyeccion_guardada.trg_srv_upd: ${PROD}`, porque: PROYECCION_GUARDADA },
  { diferencia: 'RLS de proyeccion_guardada: en el repo = sin tabla; en producción = true', porque: PROYECCION_GUARDADA },
  { diferencia: `función equipo_activo_por_obra(): ${PROD}`, porque: FUNCION_A_MANO },
  { diferencia: `función flujo_por_obra(): ${PROD}`, porque: FUNCION_A_MANO },
  { diferencia: `función subtotal_por_cotizacion(p_estados text[]): ${PROD}`, porque: FUNCION_A_MANO },
];

function comparar(encontradas: string[], categoria: RegExp): void {
  const conocidas = DIFERENCIAS_CONOCIDAS.map((d) => d.diferencia).filter((d) => categoria.test(d));
  // Nuevas: algo cambió de un lado y no del otro (¿otra escotilla? ¿una
  // migración sin aplicar en producción? ¿algo hecho a mano en prod?).
  expect(encontradas.filter((d) => !conocidas.includes(d)), 'diferencias nuevas prod ↔ repo').toEqual([]);
  // Resueltas: quítalas de DIFERENCIAS_CONOCIDAS.
  expect(conocidas.filter((d) => !encontradas.includes(d)), 'diferencias conocidas que ya no existen').toEqual([]);
}

describe('esquema de producción', () => {
  it('las fotos tienen la forma esperada', () => {
    expect(Object.keys(FOTO).length).toBeGreaterThan(50);
    for (const cols of Object.values(FOTO)) expect(cols.length).toBeGreaterThan(0);
    expect(Object.keys(FOTO_SEG.funciones).length).toBeGreaterThan(50);
    expect(Object.keys(FOTO_SEG.policies).length).toBeGreaterThan(50);
    expect(Object.keys(FOTO_SEG.rls).length).toBe(Object.keys(FOTO).length);
  });

  it('el PGlite migrado tiene las mismas tablas y columnas que producción', async () => {
    const db = await dbMigrada();
    const r = await db.query<{ t: string; c: string }>(
      `select c.table_name as t, c.column_name as c
         from information_schema.columns c
         join information_schema.tables x on x.table_schema = c.table_schema and x.table_name = c.table_name
        where c.table_schema = 'public' and x.table_type = 'BASE TABLE'`,
    );
    const repo: Esquema = {};
    for (const f of r.rows) (repo[f.t] ??= []).push(f.c);
    comparar(diferenciasEsquema(repo, FOTO), /^tabla |^\w+\.\w+: /);
  }, 60_000);

  it('funciones (quién tiene EXECUTE), policies, triggers y RLS iguales a producción', async () => {
    const db = await dbMigrada();
    comparar(diferenciasSeguridad(await seguridadDe(db), FOTO_SEG), /^(función|policy|trigger|RLS) /);
  }, 60_000);

  it('_cotizacion_snapshot no la ejecuta ninguna sesión (0046, como en producción)', async () => {
    const db = await dbMigrada();
    const r = await db.query<{ anon: boolean; auth: boolean }>(
      `select has_function_privilege('anon', 'public._cotizacion_snapshot(uuid)', 'execute') as anon,
              has_function_privilege('authenticated', 'public._cotizacion_snapshot(uuid)', 'execute') as auth`,
    );
    expect(r.rows[0]).toEqual({ anon: false, auth: false });
    expect(FOTO_SEG.funciones['_cotizacion_snapshot(p_cotizacion_id uuid)'].execute).toEqual([]);
  }, 60_000);

  it('cada diferencia conocida explica su porqué', () => {
    for (const d of DIFERENCIAS_CONOCIDAS) expect(d.porque.length).toBeGreaterThan(40);
  });

  it('sin la escotilla 0030, colaboradores ya no trae las columnas de sueldo (como producción)', () => {
    for (const c of ['salario_personalizado', 'periodo_pago', 'salario_periodo', 'dias_semana']) {
      expect(FOTO.colaboradores).not.toContain(c);
      expect(FOTO.colaborador_sueldo).toContain(c);
    }
  });
});
