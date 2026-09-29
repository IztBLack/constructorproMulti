// 0047 — tasa de IVA de cada obra (`iva_obras`), sobre Postgres real (PGlite).
// Cómo funciona el harness: `src/db/pglite/README.md`.
//
// Lo que se prueba:
//   · el orden contrato → cotización convertida (o aceptada ligada) → 0,
//   · un contrato con IVA 0 manda sobre la cotización (es "sin IVA" a propósito),
//   · la oficina, el residente asignado y el cliente dueño la leen; el cliente
//     de otra obra, el colaborador, otra empresa y el anónimo no.

import { randomUUID } from 'node:crypto';
import { beforeAll, describe, expect, it } from 'vitest';
import type { PGlite } from '@electric-sql/pglite';
import { comoAnonimo, comoUsuario, dbMigrada } from './pglite/crear-db';
import {
  asignarObra,
  crearClienteConCuenta,
  crearEmpresaDePrueba,
  crearObra,
  insertar,
  invitarConRol,
  type EmpresaDePrueba,
} from './pglite/escenarios';

const LENTO = 60_000;

interface Fila {
  obra_id: string;
  iva_pct: string;
  origen: string;
}

async function tasas(db: PGlite, userId: string, ids: string[]): Promise<Record<string, [number, string]>> {
  const r = await comoUsuario(db, userId, (tx) =>
    tx.query<Fila>('select obra_id::text, iva_pct::text, origen from public.iva_obras($1::uuid[])', [ids]),
  );
  return Object.fromEntries(r.rows.map((f) => [f.obra_id, [Number(f.iva_pct), f.origen]]));
}

async function crearCotizacion(
  db: PGlite,
  empresaId: string,
  obraId: string | null,
  datos: { estado: string; ivaEnabled?: boolean; ivaPct?: number; fecha?: number },
): Promise<string> {
  const id = randomUUID();
  await insertar(db, 'public.cotizaciones', {
    id,
    empresa_id: empresaId,
    cliente: 'Cliente',
    nombre_proyecto: 'Proyecto',
    fecha: datos.fecha ?? Date.now(),
    estado: datos.estado,
    iva_enabled: datos.ivaEnabled ?? true,
    iva_porcentaje: datos.ivaPct ?? 16,
    obra_id: obraId,
  });
  return id;
}

async function crearContrato(db: PGlite, empresaId: string, obraId: string, ivaPct: number): Promise<void> {
  await insertar(db, 'public.obra_contrato', { obra_id: obraId, empresa_id: empresaId, iva_pct: ivaPct });
}

describe('0047 iva_obras', () => {
  let db: PGlite;
  let a: EmpresaDePrueba;
  let b: EmpresaDePrueba;
  let sinNada: string;
  let conCotizacion: string;
  let cotSinIva: string;
  let conContrato: string;
  let contratoCero: string;
  let aceptadaLigada: string;
  let obraB: string;

  beforeAll(async () => {
    db = await dbMigrada();
    a = await crearEmpresaDePrueba(db);
    b = await crearEmpresaDePrueba(db);

    sinNada = await crearObra(db, a.empresaId);

    conCotizacion = await crearObra(db, a.empresaId);
    await crearCotizacion(db, a.empresaId, conCotizacion, { estado: 'CONVERTIDA', ivaPct: 16 });

    cotSinIva = await crearObra(db, a.empresaId);
    await crearCotizacion(db, a.empresaId, cotSinIva, { estado: 'CONVERTIDA', ivaEnabled: false });

    conContrato = await crearObra(db, a.empresaId);
    await crearCotizacion(db, a.empresaId, conContrato, { estado: 'CONVERTIDA', ivaPct: 16 });
    await crearContrato(db, a.empresaId, conContrato, 8);

    contratoCero = await crearObra(db, a.empresaId);
    await crearCotizacion(db, a.empresaId, contratoCero, { estado: 'CONVERTIDA', ivaPct: 16 });
    await crearContrato(db, a.empresaId, contratoCero, 0);

    // Obra que ya existía: se le ligó una cotización ACEPTADA (8 %) y hay otra
    // ENVIADA (16 %) que no cuenta. Una BORRADOR tampoco.
    aceptadaLigada = await crearObra(db, a.empresaId);
    await crearCotizacion(db, a.empresaId, aceptadaLigada, { estado: 'ENVIADA', ivaPct: 16, fecha: 1 });
    await crearCotizacion(db, a.empresaId, aceptadaLigada, { estado: 'BORRADOR', ivaPct: 16, fecha: 2 });
    await crearCotizacion(db, a.empresaId, aceptadaLigada, { estado: 'ACEPTADA', ivaPct: 8, fecha: 3 });

    obraB = await crearObra(db, b.empresaId);
    await crearContrato(db, b.empresaId, obraB, 16);
  }, LENTO);

  it('contrato → cotización → sin IVA, y el contrato en 0 manda', async () => {
    const t = await tasas(db, a.adminId, [sinNada, conCotizacion, cotSinIva, conContrato, contratoCero, aceptadaLigada]);
    expect(t[sinNada]).toEqual([0, 'ninguno']);
    expect(t[conCotizacion]).toEqual([16, 'cotizacion']);
    expect(t[cotSinIva]).toEqual([0, 'cotizacion']);
    expect(t[conContrato]).toEqual([8, 'contrato']);
    expect(t[contratoCero]).toEqual([0, 'contrato']);
    expect(t[aceptadaLigada]).toEqual([8, 'cotizacion']);
  });

  it('la CONVERTIDA gana a una ACEPTADA ligada después', async () => {
    const obra = await crearObra(db, a.empresaId);
    await crearCotizacion(db, a.empresaId, obra, { estado: 'ACEPTADA', ivaPct: 8, fecha: 1 });
    await crearCotizacion(db, a.empresaId, obra, { estado: 'CONVERTIDA', ivaPct: 16, fecha: 2 });
    expect((await tasas(db, a.adminId, [obra]))[obra]).toEqual([16, 'cotizacion']);
  });

  it('un contrato borrado (lógico) ya no cuenta', async () => {
    const obra = await crearObra(db, a.empresaId);
    await crearCotizacion(db, a.empresaId, obra, { estado: 'CONVERTIDA', ivaPct: 16 });
    await insertar(db, 'public.obra_contrato', {
      obra_id: obra,
      empresa_id: a.empresaId,
      iva_pct: 0,
      deleted_at: Date.now(),
    });
    expect((await tasas(db, a.adminId, [obra]))[obra]).toEqual([16, 'cotizacion']);
  });

  it('la oficina (supervisor, contador) la lee', async () => {
    for (const rol of ['supervisor', 'contador'] as const) {
      const u = await invitarConRol(db, a, rol);
      expect((await tasas(db, u, [conContrato]))[conContrato]).toEqual([8, 'contrato']);
    }
  });

  it('el residente solo la de sus obras asignadas', async () => {
    const r = await invitarConRol(db, a, 'residente');
    await asignarObra(db, a, r, conContrato);
    const t = await tasas(db, r, [conContrato, conCotizacion]);
    expect(Object.keys(t)).toEqual([conContrato]);
  });

  it('el cliente dueño la lee aunque no lea obra_contrato; el de otra obra no', async () => {
    const dueno = await crearClienteConCuenta(db, a.empresaId);
    const otro = await crearClienteConCuenta(db, a.empresaId);
    await db.query('update public.obras set cliente_id = $1 where id = $2', [dueno.clienteId, conContrato]);
    expect((await tasas(db, dueno.userId, [conContrato]))[conContrato]).toEqual([8, 'contrato']);
    expect(await tasas(db, otro.userId, [conContrato])).toEqual({});
    // Y de verdad no lee el contrato por su cuenta.
    const directo = await comoUsuario(db, dueno.userId, (tx) =>
      tx.query('select 1 from public.obra_contrato where obra_id = $1', [conContrato]),
    );
    expect(directo.rows).toEqual([]);
  });

  it('colaborador, otra empresa y anónimo no reciben nada', async () => {
    const col = await invitarConRol(db, a, 'colaborador');
    expect(await tasas(db, col, [conContrato])).toEqual({});
    expect(await tasas(db, b.adminId, [conContrato])).toEqual({});
    expect(await tasas(db, a.adminId, [obraB])).toEqual({});
    await expect(
      comoAnonimo(db, (tx) => tx.query('select * from public.iva_obras($1::uuid[])', [[conContrato]])),
    ).rejects.toThrow(/permission denied/);
  });
});
