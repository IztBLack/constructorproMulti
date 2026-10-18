// 0050 — listas de material: RLS por rol, padre de la misma empresa, residente
// por obra, CHECK de números y la clave `listas` en el catálogo de módulos.
//
// Cómo funciona el harness: `src/db/pglite/README.md`.

import { randomUUID } from 'node:crypto';
import { beforeAll, describe, expect, it } from 'vitest';
import type { PGlite } from '@electric-sql/pglite';
import { comoUsuario, dbMigrada } from './pglite/crear-db';
import {
  asignarObra,
  crearEmpresaDePrueba,
  crearObra,
  idsVisibles,
  insertar,
  invitarConRol,
  type EmpresaDePrueba,
} from './pglite/escenarios';

const RLS = /row-level security/;
const LENTO = 60_000;

describe('0050 listas de material', () => {
  let db: PGlite;
  let a: EmpresaDePrueba;
  let b: EmpresaDePrueba;
  let obraA: string;
  let obraA2: string;
  let obraB: string;
  let listaA: string;

  async function crearLista(c: Parameters<typeof insertar>[0], empresaId: string, obraId: string) {
    const id = randomUUID();
    await insertar(c, 'public.lista_material', { id, empresa_id: empresaId, obra_id: obraId, titulo: 'Trabes' }, { returning: false });
    return id;
  }

  async function crearRenglon(c: Parameters<typeof insertar>[0], empresaId: string, listaId: string, extra: Record<string, unknown> = {}) {
    const id = randomUUID();
    await insertar(
      c,
      'public.lista_material_renglon',
      { id, empresa_id: empresaId, lista_id: listaId, seccion: 'Trabes', cantidad: 4, largo: 10.45, ...extra },
      { returning: false },
    );
    return id;
  }

  beforeAll(async () => {
    db = await dbMigrada();
    a = await crearEmpresaDePrueba(db);
    b = await crearEmpresaDePrueba(db);
    obraA = await crearObra(db, a.empresaId);
    obraA2 = await crearObra(db, a.empresaId);
    obraB = await crearObra(db, b.empresaId);
    listaA = await crearLista(db, a.empresaId, obraA);
  }, LENTO);

  it('el supervisor crea una lista y sus renglones; el admin los ve', async () => {
    const sup = await invitarConRol(db, a, 'supervisor');
    const lista = await comoUsuario(db, sup, (tx) => crearLista(tx, a.empresaId, obraA));
    const renglon = await comoUsuario(db, sup, (tx) => crearRenglon(tx, a.empresaId, lista, { separacion_cm: 25 }));
    const ve = await comoUsuario(db, a.adminId, (tx) => idsVisibles(tx, 'public.lista_material_renglon', [renglon]));
    expect(ve).toEqual([renglon]);
  }, LENTO);

  it('el supervisor palomea un renglón (update)', async () => {
    const sup = await invitarConRol(db, a, 'supervisor');
    const renglon = await crearRenglon(db, a.empresaId, listaA);
    await comoUsuario(db, sup, (tx) =>
      tx.query(
        'update public.lista_material_renglon set marcado = true, marcado_por = $2, marcado_at = 1 where id = $1',
        [renglon, sup],
      ),
    );
    const r = await db.query<{ marcado: boolean }>('select marcado from public.lista_material_renglon where id = $1', [renglon]);
    expect(r.rows[0].marcado).toBe(true);
  }, LENTO);

  it('contador, compras y almacén leen pero no escriben', async () => {
    const renglon = await crearRenglon(db, a.empresaId, listaA);
    for (const rol of ['contador', 'compras', 'almacen'] as const) {
      const u = await invitarConRol(db, a, rol);
      const ve = await comoUsuario(db, u, (tx) => idsVisibles(tx, 'public.lista_material', [listaA]));
      expect(ve, rol).toEqual([listaA]);
      const veR = await comoUsuario(db, u, (tx) => idsVisibles(tx, 'public.lista_material_renglon', [renglon]));
      expect(veR, rol).toEqual([renglon]);
      await expect(comoUsuario(db, u, (tx) => crearLista(tx, a.empresaId, obraA)), rol).rejects.toThrow(RLS);
    }
  }, LENTO);

  it('el colaborador no ve listas', async () => {
    const col = await invitarConRol(db, a, 'colaborador');
    const ve = await comoUsuario(db, col, (tx) => idsVisibles(tx, 'public.lista_material', [listaA]));
    expect(ve).toEqual([]);
  }, LENTO);

  it('otra empresa no ve la lista de A', async () => {
    const ve = await comoUsuario(db, b.adminId, (tx) => idsVisibles(tx, 'public.lista_material', [listaA]));
    expect(ve).toEqual([]);
  }, LENTO);

  it('no se cuelga una lista de A bajo una obra de B, ni un renglón de B bajo una lista de A', async () => {
    await expect(comoUsuario(db, a.adminId, (tx) => crearLista(tx, a.empresaId, obraB))).rejects.toThrow(RLS);
    await expect(comoUsuario(db, b.adminId, (tx) => crearRenglon(tx, b.empresaId, listaA))).rejects.toThrow(RLS);
  }, LENTO);

  it('el residente solo trabaja en su obra', async () => {
    const res = await invitarConRol(db, a, 'residente');
    await asignarObra(db, a, res, obraA);
    const suya = await comoUsuario(db, res, (tx) => crearLista(tx, a.empresaId, obraA));
    await comoUsuario(db, res, (tx) => crearRenglon(tx, a.empresaId, suya));
    await expect(comoUsuario(db, res, (tx) => crearLista(tx, a.empresaId, obraA2))).rejects.toThrow(RLS);

    const ajena = await crearLista(db, a.empresaId, obraA2);
    const ve = await comoUsuario(db, res, (tx) => idsVisibles(tx, 'public.lista_material', [suya, ajena]));
    expect(ve).toEqual([suya]);
    await expect(comoUsuario(db, res, (tx) => crearRenglon(tx, a.empresaId, ajena))).rejects.toThrow(RLS);
  }, LENTO);

  it('los CHECK rechazan largos, separaciones y tipos imposibles', async () => {
    await expect(crearRenglon(db, a.empresaId, listaA, { largo: 0 })).rejects.toThrow(/lista_material_renglon_numeros/);
    await expect(crearRenglon(db, a.empresaId, listaA, { separacion_cm: -5 })).rejects.toThrow(/lista_material_renglon_numeros/);
    await expect(crearRenglon(db, a.empresaId, listaA, { cantidad: -1 })).rejects.toThrow(/lista_material_renglon_numeros/);
    await expect(crearRenglon(db, a.empresaId, listaA, { tipo: 'TORNILLO' })).rejects.toThrow(/lista_material_renglon_tipo/);
    // LIBRE sin largo es válido: «30 bultos de cemento».
    await crearRenglon(db, a.empresaId, listaA, { tipo: 'LIBRE', largo: null, cantidad: 30, unidad: 'bulto' });
  }, LENTO);

  it('el servidor sella server_updated_at (cursor del pull del móvil)', async () => {
    const r = await db.query<{ s: string }>('select server_updated_at::text as s from public.lista_material where id = $1', [listaA]);
    expect(Number(r.rows[0].s)).toBeGreaterThan(0);
  }, LENTO);

  it('la empresa puede prender el módulo `listas`', async () => {
    const r = await comoUsuario(db, a.adminId, (tx) =>
      tx.query<{ r: { ok: boolean; modulos?: string[]; error?: string } }>(
        'select public.activar_modulos($1::text[]) as r',
        [['obras', 'listas']],
      ),
    );
    expect(r.rows[0].r.ok, r.rows[0].r.error).toBe(true);
    expect(r.rows[0].r.modulos).toContain('listas');
  }, LENTO);
});
