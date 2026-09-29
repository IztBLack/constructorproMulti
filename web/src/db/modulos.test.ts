// 0035 — módulos por empresa: columnas, CHECK, `activar_modulos` y
// `crear_empresa` v2, sobre Postgres real (PGlite).
//
// Cómo funciona el harness: `src/db/pglite/README.md`.

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { beforeAll, describe, expect, it } from 'vitest';
import type { PGlite } from '@electric-sql/pglite';
import {
  DIR_MIGRACIONES,
  aplicarMigraciones,
  comoAnonimo,
  comoUsuario,
  crearDbConShim,
  dbMigrada,
} from './pglite/crear-db';
import {
  crearClienteConCuenta,
  crearEmpresaDePrueba,
  crearUsuario,
  invitarConRol,
  type EmpresaDePrueba,
} from './pglite/escenarios';
import { PAQUETE_POR_DEFECTO } from '@/lib/modulos';

const LENTO = 60_000;

interface Resultado {
  ok: boolean;
  error?: string;
  modulos?: string[];
  empresa_id?: string;
}

async function modulosDe(db: PGlite, empresaId: string): Promise<string[]> {
  const r = await db.query<{ modulos: string[] }>(
    'select modulos from public.empresa_config where empresa_id = $1',
    [empresaId],
  );
  return r.rows[0]?.modulos ?? [];
}

async function activar(db: PGlite, userId: string, modulos: (string | null)[]): Promise<Resultado> {
  const r = await comoUsuario(db, userId, (tx) =>
    tx.query<{ r: Resultado }>('select public.activar_modulos($1::text[]) as r', [modulos]),
  );
  return r.rows[0].r;
}

describe('0035 — empresas que ya existían', () => {
  it(
    'quedan con los 8 módulos de hoy, y las que no tenían fila de config la reciben',
    async () => {
      const db = await crearDbConShim();
      await aplicarMigraciones(db, { hasta: '0034' });

      // Con el crear_empresa de 0005, que NO creaba la fila de empresa_config.
      const vieja = await crearEmpresaDePrueba(db, 'Empresa de antes');
      const antes = await db.query<{ n: number }>(
        'select count(*)::int as n from public.empresa_config where empresa_id = $1',
        [vieja.empresaId],
      );
      expect(antes.rows[0].n).toBe(0);

      // Y una que sí tenía fila (como las que sembró 0017).
      const conFila = await crearEmpresaDePrueba(db, 'Empresa con config');
      await db.query('insert into public.empresa_config (empresa_id, iva_porcentaje) values ($1, 8)', [
        conFila.empresaId,
      ]);

      const sql = readFileSync(join(DIR_MIGRACIONES, '0035_modulos_empresa.sql'), 'utf8');
      await db.transaction((tx) => tx.exec(sql));

      expect(await modulosDe(db, vieja.empresaId)).toEqual([...PAQUETE_POR_DEFECTO]);
      expect(await modulosDe(db, conFila.empresaId)).toEqual([...PAQUETE_POR_DEFECTO]);

      // No pisó la configuración que ya había.
      const iva = await db.query<{ iva: number }>(
        'select iva_porcentaje as iva from public.empresa_config where empresa_id = $1',
        [conFila.empresaId],
      );
      expect(iva.rows[0].iva).toBe(8);

      // Idempotente: correrla otra vez no truena ni cambia nada.
      await db.transaction((tx) => tx.exec(sql));
      expect(await modulosDe(db, vieja.empresaId)).toEqual([...PAQUETE_POR_DEFECTO]);
      await db.close();
    },
    LENTO,
  );
});

describe('0035 — activar_modulos', () => {
  let db: PGlite;
  let a: EmpresaDePrueba;
  let b: EmpresaDePrueba;

  beforeAll(async () => {
    db = await dbMigrada();
    a = await crearEmpresaDePrueba(db);
    b = await crearEmpresaDePrueba(db);
  }, LENTO);

  it('el admin cambia los módulos de SU empresa, no los de otra', async () => {
    const r = await activar(db, a.adminId, ['obras', 'cotizaciones', 'caja']);
    expect(r).toEqual({ ok: true, modulos: ['obras', 'cotizaciones', 'caja'] });
    expect(await modulosDe(db, a.empresaId)).toEqual(['obras', 'cotizaciones', 'caja']);
    expect(await modulosDe(db, b.empresaId)).toEqual([...PAQUETE_POR_DEFECTO]);
  });

  it('resuelve dependencias (cuadrillas → equipo, subcontratos → notas) y fuerza obras', async () => {
    const r = await activar(db, a.adminId, ['cuadrillas', 'subcontratos']);
    expect(r.ok).toBe(true);
    expect(r.modulos).toEqual(['obras', 'equipo', 'cuadrillas', 'notas', 'subcontratos']);
    expect(await modulosDe(db, a.empresaId)).toEqual(r.modulos);
  });

  it('una lista vacía deja solo el núcleo', async () => {
    const r = await activar(db, a.adminId, []);
    expect(r).toEqual({ ok: true, modulos: ['obras'] });
  });

  it('rechaza claves desconocidas y elementos vacíos, sin tocar lo guardado', async () => {
    await activar(db, a.adminId, ['caja']);
    const r = await activar(db, a.adminId, ['caja', 'contabilidad_secreta']);
    expect(r.ok).toBe(false);
    expect(r.error).toMatch(/contabilidad_secreta/);

    const nulo = await activar(db, a.adminId, ['caja', null]);
    expect(nulo.ok).toBe(false);

    expect(await modulosDe(db, a.empresaId)).toEqual(['obras', 'caja']);
  });

  it('supervisor, colaborador y contador NO pueden cambiar módulos', async () => {
    for (const rol of ['supervisor', 'colaborador', 'contador'] as const) {
      const uid = await invitarConRol(db, a, rol);
      const r = await activar(db, uid, ['obras', 'cotizaciones']);
      expect(r.ok, rol).toBe(false);
      expect(r.error).toMatch(/administrador/);
    }
    expect(await modulosDe(db, a.empresaId)).toEqual(['obras', 'caja']);
  });

  it('el cliente del portal tampoco', async () => {
    const cliente = await crearClienteConCuenta(db, a.empresaId);
    const r = await activar(db, cliente.userId, ['obras', 'portal']);
    expect(r.ok).toBe(false);
  });

  it('sin sesión (anon) ni siquiera puede ejecutarla', async () => {
    await expect(
      comoAnonimo(db, (tx) => tx.query("select public.activar_modulos(array['obras'])")),
    ).rejects.toThrow(/permission denied/);
  });

  it('el CHECK impide saltarse la RPC con un UPDATE directo del admin', async () => {
    // La policy de 0018 deja al admin hacer UPDATE en empresa_config: sin el
    // CHECK podría guardar cualquier arreglo.
    const casos = [
      ['obras', 'modulo_inventado'], // clave fuera del catálogo
      ['caja'], // sin el núcleo
      ['obras', 'cuadrillas'], // cuadrillas sin equipo
    ];
    for (const modulos of casos) {
      await expect(
        comoUsuario(db, a.adminId, (tx) =>
          tx.query('update public.empresa_config set modulos = $1 where empresa_id = $2', [
            modulos,
            a.empresaId,
          ]),
        ),
      ).rejects.toThrow(/empresa_config_modulos_validos/);
    }
  });

  it('el perfil tiene que ser un objeto', async () => {
    await expect(
      comoUsuario(db, a.adminId, (tx) =>
        tx.query(`update public.empresa_config set perfil = '[1,2]'::jsonb where empresa_id = $1`, [
          a.empresaId,
        ]),
      ),
    ).rejects.toThrow(/empresa_config_perfil_valido/);
  });

  it('el supervisor sigue LEYENDO los módulos (los necesita para su menú)', async () => {
    const sup = await invitarConRol(db, a, 'supervisor');
    const r = await comoUsuario(db, sup, (tx) =>
      tx.query<{ modulos: string[] }>(
        'select modulos from public.empresa_config where empresa_id = $1',
        [a.empresaId],
      ),
    );
    expect(r.rows[0]?.modulos).toEqual(['obras', 'caja']);
  });

  it('sella updated_at y server_updated_at (el móvil sincroniza por ahí)', async () => {
    const antes = await db.query<{ u: string; s: string }>(
      'select updated_at::text as u, server_updated_at::text as s from public.empresa_config where empresa_id = $1',
      [a.empresaId],
    );
    await new Promise((r) => setTimeout(r, 5));
    await activar(db, a.adminId, ['obras', 'portal']);
    const despues = await db.query<{ u: string; s: string }>(
      'select updated_at::text as u, server_updated_at::text as s from public.empresa_config where empresa_id = $1',
      [a.empresaId],
    );
    expect(BigInt(despues.rows[0].u)).toBeGreaterThan(BigInt(antes.rows[0].u));
    expect(BigInt(despues.rows[0].s)).toBeGreaterThan(BigInt(antes.rows[0].s));
  });
});

describe('0035 — crear_empresa v2', () => {
  let db: PGlite;

  beforeAll(async () => {
    db = await dbMigrada();
  }, LENTO);

  async function crear(userId: string, sql: string, params: unknown[]): Promise<Resultado> {
    const r = await comoUsuario(db, userId, (tx) => tx.query<{ r: Resultado }>(sql, params));
    return r.rows[0].r;
  }

  it('la llamada vieja de un argumento sigue funcionando y deja el paquete de siempre', async () => {
    const uid = await crearUsuario(db);
    const r = await crear(uid, 'select public.crear_empresa($1) as r', ['Constructora vieja']);
    expect(r.ok).toBe(true);
    expect(await modulosDe(db, r.empresa_id!)).toEqual([...PAQUETE_POR_DEFECTO]);
  });

  it('por nombre de parámetro (como la llama PostgREST) no es ambigua', async () => {
    const uid = await crearUsuario(db);
    const r = await crear(uid, 'select public.crear_empresa(p_nombre => $1) as r', ['Por nombre']);
    expect(r.ok).toBe(true);
  });

  it('solo existe UNA crear_empresa (sin sobrecarga que confunda a PostgREST)', async () => {
    const r = await db.query<{ n: number }>(
      `select count(*)::int as n from pg_proc p join pg_namespace n on n.oid = p.pronamespace
        where n.nspname = 'public' and p.proname = 'crear_empresa'`,
    );
    expect(r.rows[0].n).toBe(1);
  });

  it('con módulos y perfil: los guarda, resuelve dependencias y fuerza obras', async () => {
    const uid = await crearUsuario(db);
    const perfil = { tipo: 'independiente', factura: 'no', necesidades: ['cotizar'] };
    const r = await crear(
      uid,
      'select public.crear_empresa(p_nombre => $1, p_modulos => $2::text[], p_perfil => $3::jsonb) as r',
      ['Maestro Juan', ['cotizaciones', 'cuadrillas'], JSON.stringify(perfil)],
    );
    expect(r.ok).toBe(true);
    expect(r.modulos).toEqual(['obras', 'cotizaciones', 'equipo', 'cuadrillas']);

    const fila = await db.query<{ modulos: string[]; perfil: unknown }>(
      'select modulos, perfil from public.empresa_config where empresa_id = $1',
      [r.empresa_id],
    );
    expect(fila.rows[0].modulos).toEqual(r.modulos);
    expect(fila.rows[0].perfil).toEqual(perfil);

    // Lo de 0005 sigue igual: admin y catálogo base.
    const extra = await comoUsuario(db, uid, (tx) =>
      tx.query<{ rol: string; conceptos: number }>(
        `select (select rol from public.usuarios_empresa where user_id = auth.uid()) as rol,
                (select count(*)::int from public.catalogo_conceptos where empresa_id = $1) as conceptos`,
        [r.empresa_id],
      ),
    );
    expect(extra.rows[0]).toEqual({ rol: 'admin', conceptos: 10 });
  });

  it('con módulo desconocido no crea nada', async () => {
    const uid = await crearUsuario(db);
    const r = await crear(
      uid,
      'select public.crear_empresa(p_nombre => $1, p_modulos => $2::text[]) as r',
      ['No debe existir', ['obras', 'teletransporte']],
    );
    expect(r.ok).toBe(false);
    const m = await db.query<{ n: number }>(
      'select count(*)::int as n from public.usuarios_empresa where user_id = $1',
      [uid],
    );
    expect(m.rows[0].n).toBe(0);
  });

  it('con un perfil que no es objeto no crea nada', async () => {
    const uid = await crearUsuario(db);
    const r = await crear(
      uid,
      'select public.crear_empresa(p_nombre => $1, p_perfil => $2::jsonb) as r',
      ['Tampoco', '"texto"'],
    );
    expect(r.ok).toBe(false);
  });

  it('sin sesión (anon) no puede ejecutarla', async () => {
    await expect(
      comoAnonimo(db, (tx) => tx.query("select public.crear_empresa('Anónima')")),
    ).rejects.toThrow(/permission denied/);
  });
});
