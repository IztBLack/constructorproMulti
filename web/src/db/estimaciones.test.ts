// 0039 — avance físico por partida y estimaciones, sobre Postgres real (PGlite).
// Cómo funciona el harness: `src/db/pglite/README.md`.
//
// Lo que se prueba es lo que tiene que aguantar el cobro por avance:
//   · nadie de otra empresa ve ni toca el avance, el contrato ni las estimaciones,
//   · nadie cuelga avance o estimación de una partida de OTRA obra, ni de un
//     extra que el cliente no aprobó,
//   · cada rol hace lo suyo (RR3.1): supervisor captura, admin estima y envía,
//     cliente autoriza, contador marca cobrada, colaborador nada,
//   · lo enviado no cambia (ni por RLS ni por la llave de servicio),
//   · no se estima más de lo contratado ni se amortiza más que el anticipo.

import { randomUUID } from 'node:crypto';
import { beforeAll, describe, expect, it } from 'vitest';
import type { PGlite } from '@electric-sql/pglite';
import { comoUsuario, dbMigrada } from './pglite/crear-db';
import {
  crearClienteConCuenta,
  crearEmpresaDePrueba,
  crearMovimiento,
  crearObra,
  idsVisibles,
  insertar,
  invitarConRol,
  type EmpresaDePrueba,
} from './pglite/escenarios';

const LENTO = 60_000;
const RLS = /row-level security/;
const DIA = 86_400_000;
const INICIO = Date.UTC(2026, 8, 1, 6); // medianoche de México, 1 sep 2026

interface Resultado {
  ok: boolean;
  error?: string;
  estado?: string;
  partidas?: { id: string; origen: string; ejecutado: number | string; cantidad: number }[];
}

async function rpc(db: PGlite, userId: string, sql: string, params: unknown[]): Promise<Resultado> {
  const r = await comoUsuario(db, userId, (tx) => tx.query<{ r: Resultado }>(sql, params));
  return r.rows[0].r;
}

const enviar = (db: PGlite, u: string, id: string) =>
  rpc(db, u, 'select public.enviar_estimacion($1) as r', [id]);
const responder = (db: PGlite, u: string, id: string, si: boolean, motivo: string | null = null) =>
  rpc(db, u, 'select public.responder_estimacion($1, $2, $3) as r', [id, si, motivo]);
const registrar = (db: PGlite, u: string, id: string, si: boolean, quien: string, motivo: string | null = null) =>
  rpc(db, u, 'select public.registrar_respuesta_estimacion($1, $2, $3, $4) as r', [id, si, quien, motivo]);
const cobrar = (db: PGlite, u: string, id: string, mov: string | null) =>
  rpc(db, u, 'select public.marcar_estimacion_cobrada($1, $2) as r', [id, mov]);

/** Partida del presupuesto de una obra (sembrada como superusuario). */
async function crearPartida(
  db: PGlite,
  empresaId: string,
  obraId: string,
  cantidad: number,
  precio: number,
  concepto = 'Firme de concreto',
): Promise<string> {
  const id = randomUUID();
  await insertar(db, 'public.obra_presupuesto', {
    id,
    empresa_id: empresaId,
    obra_id: obraId,
    concepto,
    unidad: 'm2',
    cantidad,
    precio_unitario: precio,
    orden: 1,
  });
  return id;
}

/** Extra con un renglón, en el estado pedido (sembrado como superusuario). */
async function crearExtraConRenglon(
  db: PGlite,
  empresaId: string,
  obraId: string,
  estado: 'BORRADOR' | 'APROBADA',
): Promise<string> {
  const extra = randomUUID();
  const renglon = randomUUID();
  await insertar(db, 'public.orden_cambio', { id: extra, empresa_id: empresaId, obra_id: obraId, titulo: 'Barda' });
  await insertar(db, 'public.orden_cambio_renglon', {
    id: renglon,
    empresa_id: empresaId,
    orden_cambio_id: extra,
    concepto: 'Barda',
    unidad: 'm',
    cantidad: 5,
    precio_unitario: 200,
  });
  if (estado === 'APROBADA') {
    const ahora = Date.now();
    await db.query(
      `update public.orden_cambio
          set estado = 'ENVIADA', snapshot_json = '{}'::jsonb, total_enviado = 1000, enviado_at = $2
        where id = $1`,
      [extra, ahora],
    );
    await db.query(
      `update public.orden_cambio set estado = 'APROBADA', respondido_at = $2 where id = $1`,
      [extra, ahora],
    );
  }
  return renglon;
}

interface Dinero {
  bruto: number;
  amort: number;
  ivaPct: number;
  fondoPct: number;
  ret?: number;
}

/** Cuentas coherentes (lo que haría la web) para sembrar una estimación. */
function importes(d: Dinero) {
  const r2 = (n: number) => Math.round(n * 100) / 100;
  const subtotal = r2(d.bruto - d.amort);
  const iva = r2((subtotal * d.ivaPct) / 100);
  const total = r2(subtotal + iva);
  const fondo = r2((d.bruto * d.fondoPct) / 100);
  const ret = d.ret ?? 0;
  return {
    importe_bruto: d.bruto,
    amortizacion: d.amort,
    subtotal,
    iva_pct: d.ivaPct,
    iva,
    total,
    fondo_garantia_pct: d.fondoPct,
    fondo_garantia: fondo,
    retenciones_total: ret,
    neto: r2(total - fondo - ret),
  };
}

/** Estimación BORRADOR con renglones, creada POR EL ADMIN (pasa por RLS). */
async function crearEstimacion(
  db: PGlite,
  a: EmpresaDePrueba,
  obraId: string,
  renglones: { partida?: string; extra?: string; cantidad: number; precio: number }[],
  amort = 0,
): Promise<string> {
  const id = randomUUID();
  const bruto = renglones.reduce((s, r) => s + Math.round(r.cantidad * r.precio * 100) / 100, 0);
  await comoUsuario(db, a.adminId, async (tx) => {
    await insertar(tx, 'public.estimaciones', {
      id,
      empresa_id: a.empresaId,
      obra_id: obraId,
      periodo_inicio: INICIO,
      periodo_fin: INICIO + 14 * DIA,
      ...importes({ bruto, amort, ivaPct: 16, fondoPct: 5 }),
    });
    for (const [i, r] of renglones.entries()) {
      await insertar(tx, 'public.estimacion_renglon', {
        id: randomUUID(),
        empresa_id: a.empresaId,
        estimacion_id: id,
        presupuesto_id: r.partida ?? null,
        orden_cambio_renglon_id: r.extra ?? null,
        concepto: 'Partida',
        cantidad: r.cantidad,
        precio_unitario: r.precio,
        orden: i,
      });
    }
  });
  return id;
}

async function fila(db: PGlite, id: string) {
  const r = await db.query<{
    estado: string;
    folio: number;
    neto: string;
    snapshot_json: {
      renglones: { anterior: string | number; acumulado: string | number; generadores: unknown[] }[];
      contrato: { anticipo_por_amortizar: string | number };
    } | null;
    respuesta_origen: string | null;
    respondido_nombre: string | null;
    movimiento_id: string | null;
  }>('select * from public.estimaciones where id = $1', [id]);
  return r.rows[0];
}

describe('0039 — avance y estimaciones', () => {
  let db: PGlite;
  let a: EmpresaDePrueba;
  let b: EmpresaDePrueba;
  let obraA: string;
  let obraA2: string;
  let obraB: string;
  let supA: string;
  let sup2A: string;
  let colabA: string;
  let contA: string;
  let clienteA: { userId: string; clienteId: string };
  let clienteA2: { userId: string; clienteId: string };

  beforeAll(async () => {
    db = await dbMigrada();
    a = await crearEmpresaDePrueba(db);
    b = await crearEmpresaDePrueba(db);
    clienteA = await crearClienteConCuenta(db, a.empresaId);
    clienteA2 = await crearClienteConCuenta(db, a.empresaId);
    obraA = await crearObra(db, a.empresaId, { cliente_id: clienteA.clienteId });
    obraA2 = await crearObra(db, a.empresaId, { cliente_id: clienteA2.clienteId });
    obraB = await crearObra(db, b.empresaId);
    supA = await invitarConRol(db, a, 'supervisor');
    sup2A = await invitarConRol(db, a, 'supervisor');
    colabA = await invitarConRol(db, a, 'colaborador');
    contA = await invitarConRol(db, a, 'contador');
  }, LENTO);

  // ── Avance ────────────────────────────────────────────────────────────────

  describe('avance por partida', () => {
    it('el supervisor captura; la base sella quién fue', async () => {
      const partida = await crearPartida(db, a.empresaId, obraA, 100, 250);
      const id = randomUUID();
      await comoUsuario(db, supA, (tx) =>
        insertar(tx, 'public.avance_partida', {
          id,
          empresa_id: a.empresaId,
          obra_id: obraA,
          presupuesto_id: partida,
          fecha: INICIO,
          cantidad: 12.5,
          nota: 'eje 1-3',
          capturo_id: a.adminId, // se ignora: lo pone el trigger
        }),
      );
      const r = await db.query<{ capturo_id: string }>('select capturo_id from public.avance_partida where id = $1', [id]);
      expect(r.rows[0].capturo_id).toBe(supA);
    });

    it('no se cuelga avance de una partida de OTRA obra (ni de otra empresa)', async () => {
      const ajena = await crearPartida(db, a.empresaId, obraA2, 10, 10);
      const deB = await crearPartida(db, b.empresaId, obraB, 10, 10);
      for (const partida of [ajena, deB]) {
        await expect(
          comoUsuario(db, supA, (tx) =>
            insertar(tx, 'public.avance_partida', {
              id: randomUUID(),
              empresa_id: a.empresaId,
              obra_id: obraA,
              presupuesto_id: partida,
              fecha: INICIO,
              cantidad: 1,
            }),
          ),
        ).rejects.toThrow(RLS);
      }
    });

    it('solo se avanza un extra APROBADO', async () => {
      const borrador = await crearExtraConRenglon(db, a.empresaId, obraA, 'BORRADOR');
      const aprobado = await crearExtraConRenglon(db, a.empresaId, obraA, 'APROBADA');
      await expect(
        comoUsuario(db, supA, (tx) =>
          insertar(tx, 'public.avance_partida', {
            id: randomUUID(),
            empresa_id: a.empresaId,
            obra_id: obraA,
            orden_cambio_renglon_id: borrador,
            fecha: INICIO,
            cantidad: 1,
          }),
        ),
      ).rejects.toThrow(RLS);
      const id = randomUUID();
      await comoUsuario(db, supA, (tx) =>
        insertar(tx, 'public.avance_partida', {
          id,
          empresa_id: a.empresaId,
          obra_id: obraA,
          orden_cambio_renglon_id: aprobado,
          fecha: INICIO,
          cantidad: 2,
        }),
      );
      expect(await comoUsuario(db, a.adminId, (tx) => idsVisibles(tx, 'public.avance_partida', [id]))).toEqual([id]);
    });

    it('el acumulado de una partida nunca queda abajo de cero', async () => {
      const partida = await crearPartida(db, a.empresaId, obraA, 10, 10);
      await comoUsuario(db, supA, (tx) =>
        insertar(tx, 'public.avance_partida', {
          id: randomUUID(),
          empresa_id: a.empresaId,
          obra_id: obraA,
          presupuesto_id: partida,
          fecha: INICIO,
          cantidad: 3,
        }),
      );
      // Corregir con negativo: sí, hasta cero.
      await comoUsuario(db, supA, (tx) =>
        insertar(tx, 'public.avance_partida', {
          id: randomUUID(),
          empresa_id: a.empresaId,
          obra_id: obraA,
          presupuesto_id: partida,
          fecha: INICIO,
          cantidad: -3,
        }),
      );
      await expect(
        comoUsuario(db, supA, (tx) =>
          insertar(tx, 'public.avance_partida', {
            id: randomUUID(),
            empresa_id: a.empresaId,
            obra_id: obraA,
            presupuesto_id: partida,
            fecha: INICIO,
            cantidad: -0.5,
          }),
        ),
      ).rejects.toThrow(/abajo de cero/);
    });

    it('el supervisor borra lo suyo, no lo de otro supervisor; el admin sí', async () => {
      const partida = await crearPartida(db, a.empresaId, obraA, 10, 10);
      const mio = randomUUID();
      await comoUsuario(db, sup2A, (tx) =>
        insertar(tx, 'public.avance_partida', {
          id: mio,
          empresa_id: a.empresaId,
          obra_id: obraA,
          presupuesto_id: partida,
          fecha: INICIO,
          cantidad: 1,
        }),
      );
      const borrarComo = (u: string) =>
        comoUsuario(db, u, (tx) =>
          tx.query('update public.avance_partida set deleted_at = $2 where id = $1', [mio, Date.now()]),
        );
      expect((await borrarComo(supA)).affectedRows).toBe(0);
      expect((await borrarComo(a.adminId)).affectedRows).toBe(1);
    });

    it('colaborador, cliente y otra empresa no ven el avance; el contador lee pero no captura', async () => {
      const partida = await crearPartida(db, a.empresaId, obraA, 10, 10);
      const id = randomUUID();
      await comoUsuario(db, supA, (tx) =>
        insertar(tx, 'public.avance_partida', {
          id,
          empresa_id: a.empresaId,
          obra_id: obraA,
          presupuesto_id: partida,
          fecha: INICIO,
          cantidad: 1,
        }),
      );
      for (const u of [colabA, clienteA.userId, b.adminId]) {
        expect(await comoUsuario(db, u, (tx) => idsVisibles(tx, 'public.avance_partida', [id]))).toEqual([]);
      }
      expect(await comoUsuario(db, contA, (tx) => idsVisibles(tx, 'public.avance_partida', [id]))).toEqual([id]);
      await expect(
        comoUsuario(db, contA, (tx) =>
          insertar(
            tx,
            'public.avance_partida',
            {
              id: randomUUID(),
              empresa_id: a.empresaId,
              obra_id: obraA,
              presupuesto_id: partida,
              fecha: INICIO,
              cantidad: 1,
            },
            { returning: false },
          ),
        ),
      ).rejects.toThrow(RLS);
    });

    it('el cliente ve el avance de SU obra por la RPC del portal (sin notas); otro cliente no', async () => {
      const obra = await crearObra(db, a.empresaId, { cliente_id: clienteA.clienteId });
      const partida = await crearPartida(db, a.empresaId, obra, 40, 100);
      await comoUsuario(db, supA, (tx) =>
        insertar(tx, 'public.avance_partida', {
          id: randomUUID(),
          empresa_id: a.empresaId,
          obra_id: obra,
          presupuesto_id: partida,
          fecha: INICIO,
          cantidad: 10,
          nota: 'nota interna',
        }),
      );
      const r = await rpc(db, clienteA.userId, 'select public.avance_obra_portal($1) as r', [obra]);
      expect(r.ok).toBe(true);
      expect(r.partidas).toHaveLength(1);
      expect(Number(r.partidas![0].ejecutado)).toBe(10);
      expect(JSON.stringify(r)).not.toContain('nota interna');

      const otro = await rpc(db, clienteA2.userId, 'select public.avance_obra_portal($1) as r', [obra]);
      expect(otro).toEqual({ ok: false, error: 'No autorizado' });
      const ajeno = await rpc(db, b.adminId, 'select public.avance_obra_portal($1) as r', [obra]);
      expect(ajeno.ok).toBe(false);
    });
  });

  // ── Contrato y retenciones ────────────────────────────────────────────────

  describe('contrato y retenciones', () => {
    it('el admin lo escribe; el supervisor lo lee pero no lo cambia; el colaborador no lo ve', async () => {
      const obra = await crearObra(db, a.empresaId);
      await comoUsuario(db, a.adminId, (tx) =>
        insertar(tx, 'public.obra_contrato', {
          obra_id: obra,
          empresa_id: a.empresaId,
          anticipo_monto: 30000,
          amortizacion_pct: 30,
          fondo_garantia_pct: 5,
        }),
      );
      const ve = (u: string) =>
        comoUsuario(db, u, (tx) =>
          tx.query('select obra_id from public.obra_contrato where obra_id = $1', [obra]),
        );
      expect((await ve(supA)).rows).toHaveLength(1);
      expect((await ve(colabA)).rows).toHaveLength(0);
      expect((await ve(b.adminId)).rows).toHaveLength(0);
      const upd = await comoUsuario(db, supA, (tx) =>
        tx.query('update public.obra_contrato set anticipo_monto = 1 where obra_id = $1', [obra]),
      );
      expect(upd.affectedRows).toBe(0);
    });

    it('el anticipo solo se liga con una ENTRADA de la misma obra', async () => {
      const obra = await crearObra(db, a.empresaId);
      const salida = await crearMovimiento(db, { empresaId: a.empresaId, obraId: obra, tipo: 'SALIDA' });
      const deOtraObra = await crearMovimiento(db, { empresaId: a.empresaId, obraId: obraA2, tipo: 'ENTRADA' });
      for (const mov of [salida, deOtraObra]) {
        await expect(
          comoUsuario(db, a.adminId, (tx) =>
            insertar(tx, 'public.obra_contrato', {
              obra_id: obra,
              empresa_id: a.empresaId,
              anticipo_monto: 1000,
              anticipo_movimiento_id: mov,
            }),
          ),
        ).rejects.toThrow(RLS);
      }
    });

    it('B no puede colgar un contrato ni una retención de una obra de A', async () => {
      await expect(
        comoUsuario(db, b.adminId, (tx) =>
          insertar(tx, 'public.obra_retencion', {
            id: randomUUID(),
            empresa_id: b.empresaId,
            obra_id: obraA,
            concepto: '5 al millar',
            valor: 0.5,
          }),
        ),
      ).rejects.toThrow(RLS);
    });

    it('una retención en % no pasa de 100', async () => {
      await expect(
        insertar(db, 'public.obra_retencion', {
          id: randomUUID(),
          empresa_id: a.empresaId,
          obra_id: obraA,
          concepto: 'Mal',
          tipo: 'PORCENTAJE',
          valor: 150,
        }),
      ).rejects.toThrow(/obra_retencion_pct/);
    });
  });

  // ── Estimaciones ──────────────────────────────────────────────────────────

  describe('estimaciones', () => {
    it('solo el admin crea; el supervisor no; el importe lo calcula la base', async () => {
      const obra = await crearObra(db, a.empresaId);
      const partida = await crearPartida(db, a.empresaId, obra, 10, 33.335);
      await expect(
        comoUsuario(db, supA, (tx) =>
          insertar(tx, 'public.estimaciones', {
            id: randomUUID(),
            empresa_id: a.empresaId,
            obra_id: obra,
            periodo_inicio: INICIO,
            periodo_fin: INICIO,
          }),
        ),
      ).rejects.toThrow(RLS);

      const id = await crearEstimacion(db, a, obra, [{ partida, cantidad: 3, precio: 33.335 }]);
      const r = await db.query<{ importe: string }>(
        'select importe from public.estimacion_renglon where estimacion_id = $1',
        [id],
      );
      // 3 × 33.335 = 100.005 → 100.01 (a la mitad, hacia arriba: igual que la web).
      expect(Number(r.rows[0].importe)).toBe(100.01);
    });

    it('la base rechaza cuentas que no cuadran', async () => {
      const obra = await crearObra(db, a.empresaId);
      await expect(
        comoUsuario(db, a.adminId, (tx) =>
          insertar(tx, 'public.estimaciones', {
            id: randomUUID(),
            empresa_id: a.empresaId,
            obra_id: obra,
            periodo_inicio: INICIO,
            periodo_fin: INICIO,
            ...importes({ bruto: 1000, amort: 0, ivaPct: 16, fondoPct: 0 }),
            neto: 999, // no cuadra
          }),
        ),
      ).rejects.toThrow(/estimaciones_dinero_cuadra/);
      await expect(
        comoUsuario(db, a.adminId, (tx) =>
          insertar(tx, 'public.estimaciones', {
            id: randomUUID(),
            empresa_id: a.empresaId,
            obra_id: obra,
            periodo_inicio: INICIO,
            periodo_fin: INICIO,
            ...importes({ bruto: 100, amort: 150, ivaPct: 0, fondoPct: 0 }),
          }),
        ),
      ).rejects.toThrow(/estimaciones_dinero_positivo/);
    });

    it('un solo borrador por obra', async () => {
      const obra = await crearObra(db, a.empresaId);
      const partida = await crearPartida(db, a.empresaId, obra, 10, 10);
      await crearEstimacion(db, a, obra, [{ partida, cantidad: 1, precio: 10 }]);
      await expect(crearEstimacion(db, a, obra, [{ partida, cantidad: 1, precio: 10 }])).rejects.toThrow(
        /uq_estimacion_borrador/,
      );
    });

    it('un renglón no se cuelga de una partida de otra obra ni de un extra sin aprobar', async () => {
      const obra = await crearObra(db, a.empresaId);
      const ajena = await crearPartida(db, a.empresaId, obraA2, 10, 10);
      const sinAprobar = await crearExtraConRenglon(db, a.empresaId, obra, 'BORRADOR');
      await expect(crearEstimacion(db, a, obra, [{ partida: ajena, cantidad: 1, precio: 10 }])).rejects.toThrow(RLS);
      const obra2 = await crearObra(db, a.empresaId);
      await expect(
        crearEstimacion(db, a, obra2, [{ extra: sinAprobar, cantidad: 1, precio: 200 }]),
      ).rejects.toThrow(RLS);
    });

    it('ciclo completo: enviar congela, el cliente autoriza, el contador cobra y liga la entrada', async () => {
      const obra = await crearObra(db, a.empresaId, { cliente_id: clienteA.clienteId });
      const partida = await crearPartida(db, a.empresaId, obra, 100, 100);
      await insertar(db, 'public.obra_contrato', {
        obra_id: obra,
        empresa_id: a.empresaId,
        anticipo_monto: 3000,
        amortizacion_pct: 30,
        fondo_garantia_pct: 5,
      });
      await comoUsuario(db, supA, (tx) =>
        insertar(tx, 'public.avance_partida', {
          id: randomUUID(),
          empresa_id: a.empresaId,
          obra_id: obra,
          presupuesto_id: partida,
          fecha: INICIO + 2 * DIA,
          cantidad: 10,
          nota: '10 m2 eje A',
        }),
      );
      const id = await crearEstimacion(db, a, obra, [{ partida, cantidad: 10, precio: 100 }], 300);

      // El cliente todavía no la ve (borrador).
      expect(await comoUsuario(db, clienteA.userId, (tx) => idsVisibles(tx, 'public.estimaciones', [id]))).toEqual([]);
      // El supervisor no envía.
      expect((await enviar(db, supA, id)).ok).toBe(false);

      expect(await enviar(db, a.adminId, id)).toMatchObject({ ok: true, estado: 'ENVIADA' });
      const f = await fila(db, id);
      expect(f.snapshot_json?.renglones[0].generadores).toHaveLength(1);
      expect(Number(f.snapshot_json?.contrato.anticipo_por_amortizar)).toBe(2700);

      // Congelada: ni la llave de servicio cambia el dinero ni los renglones.
      await expect(db.query('update public.estimaciones set neto = 0 where id = $1', [id])).rejects.toThrow(
        /ya se envió/,
      );
      await expect(
        db.query('update public.estimacion_renglon set cantidad = 1 where estimacion_id = $1', [id]),
      ).rejects.toThrow(/ya se envió/);
      await expect(db.query('update public.estimaciones set deleted_at = 1 where id = $1', [id])).rejects.toThrow(
        /no se borra/,
      );

      // El cliente la ve; el de otra obra no la ve ni la contesta; el cliente no ve renglones vivos.
      expect(await comoUsuario(db, clienteA.userId, (tx) => idsVisibles(tx, 'public.estimaciones', [id]))).toEqual([id]);
      expect(await comoUsuario(db, clienteA2.userId, (tx) => idsVisibles(tx, 'public.estimaciones', [id]))).toEqual([]);
      expect(await responder(db, clienteA2.userId, id, true)).toEqual({ ok: false, error: 'No autorizado' });
      const renglonesCliente = await comoUsuario(db, clienteA.userId, (tx) =>
        tx.query('select id from public.estimacion_renglon where estimacion_id = $1', [id]),
      );
      expect(renglonesCliente.rows).toHaveLength(0);

      // Cobrar antes de autorizar: no.
      expect((await cobrar(db, contA, id, null)).ok).toBe(false);

      expect(await responder(db, clienteA.userId, id, true)).toEqual({ ok: true, estado: 'AUTORIZADA' });
      expect((await fila(db, id)).respuesta_origen).toBe('PORTAL');
      // Una sola respuesta.
      expect((await responder(db, clienteA.userId, id, false, 'no')).ok).toBe(false);

      // El colaborador no cobra; la entrada tiene que ser de esta obra.
      expect((await cobrar(db, colabA, id, null)).ok).toBe(false);
      const ajena = await crearMovimiento(db, { empresaId: a.empresaId, obraId: obraA2, tipo: 'ENTRADA' });
      expect((await cobrar(db, contA, id, ajena)).ok).toBe(false);
      const entrada = await crearMovimiento(db, { empresaId: a.empresaId, obraId: obra, tipo: 'ENTRADA', monto: 2012 });
      expect(await cobrar(db, contA, id, entrada)).toEqual({ ok: true, estado: 'COBRADA' });
      expect((await fila(db, id)).movimiento_id).toBe(entrada);
    });

    it('no se estima más de lo contratado; lo de más va por un extra aprobado', async () => {
      const obra = await crearObra(db, a.empresaId);
      const partida = await crearPartida(db, a.empresaId, obra, 10, 100);
      const e1 = await crearEstimacion(db, a, obra, [{ partida, cantidad: 8, precio: 100 }]);
      expect((await enviar(db, a.adminId, e1)).ok).toBe(true);

      // 8 ya estimadas + 3 = 11 > 10.
      const e2 = await crearEstimacion(db, a, obra, [{ partida, cantidad: 3, precio: 100 }]);
      const r = await enviar(db, a.adminId, e2);
      expect(r.ok).toBe(false);
      expect(r.error).toMatch(/más de lo contratado/);

      // Con un extra aprobado, su renglón es estimable aparte.
      await db.query('update public.estimaciones set deleted_at = 1 where id = $1', [e2]);
      const extra = await crearExtraConRenglon(db, a.empresaId, obra, 'APROBADA');
      const e3 = await crearEstimacion(db, a, obra, [
        { partida, cantidad: 2, precio: 100 },
        { extra, cantidad: 1, precio: 200 },
      ]);
      expect((await enviar(db, a.adminId, e3)).ok).toBe(true);
      const f = await fila(db, e3);
      expect(Number(f.snapshot_json?.renglones[0].anterior)).toBe(8);
      expect(Number(f.snapshot_json?.renglones[0].acumulado)).toBe(10);
    });

    it('una estimación RECHAZADA libera sus cantidades', async () => {
      const obra = await crearObra(db, a.empresaId, { cliente_id: clienteA.clienteId });
      const partida = await crearPartida(db, a.empresaId, obra, 10, 100);
      const e1 = await crearEstimacion(db, a, obra, [{ partida, cantidad: 10, precio: 100 }]);
      await enviar(db, a.adminId, e1);
      expect((await responder(db, clienteA.userId, e1, false)).ok).toBe(false); // sin motivo
      expect(await responder(db, clienteA.userId, e1, false, 'Faltan medidas')).toEqual({
        ok: true,
        estado: 'RECHAZADA',
      });
      const e2 = await crearEstimacion(db, a, obra, [{ partida, cantidad: 10, precio: 100 }]);
      expect((await enviar(db, a.adminId, e2)).ok).toBe(true);
      expect((await fila(db, e2)).folio).toBe((await fila(db, e1)).folio + 1);
    });

    it('no se envía si el precio del presupuesto cambió', async () => {
      const obra = await crearObra(db, a.empresaId);
      const partida = await crearPartida(db, a.empresaId, obra, 10, 100);
      const e = await crearEstimacion(db, a, obra, [{ partida, cantidad: 1, precio: 100 }]);
      await db.query('update public.obra_presupuesto set precio_unitario = 120 where id = $1', [partida]);
      const r = await enviar(db, a.adminId, e);
      expect(r.ok).toBe(false);
      expect(r.error).toMatch(/precio/);
    });

    it('la amortización nunca pasa de lo que queda del anticipo', async () => {
      const obra = await crearObra(db, a.empresaId);
      const partida = await crearPartida(db, a.empresaId, obra, 100, 100);
      await insertar(db, 'public.obra_contrato', {
        obra_id: obra,
        empresa_id: a.empresaId,
        anticipo_monto: 500,
        amortizacion_pct: 30,
      });
      const e1 = await crearEstimacion(db, a, obra, [{ partida, cantidad: 10, precio: 100 }], 300);
      expect((await enviar(db, a.adminId, e1)).ok).toBe(true);
      // Quedan 200; pedir 300 no pasa.
      const e2 = await crearEstimacion(db, a, obra, [{ partida, cantidad: 10, precio: 100 }], 300);
      const r = await enviar(db, a.adminId, e2);
      expect(r.ok).toBe(false);
      expect(r.error).toMatch(/anticipo/);
    });

    it('la respuesta que llegó por fuera la registra solo el admin, y queda marcada OFICINA', async () => {
      const obra = await crearObra(db, a.empresaId);
      const partida = await crearPartida(db, a.empresaId, obra, 10, 100);
      const e = await crearEstimacion(db, a, obra, [{ partida, cantidad: 1, precio: 100 }]);
      await enviar(db, a.adminId, e);
      expect((await registrar(db, supA, e, true, 'Ing. Pérez')).ok).toBe(false);
      expect((await registrar(db, a.adminId, e, true, '  ')).ok).toBe(false);
      expect(await registrar(db, a.adminId, e, true, 'Ing. Pérez (residente)')).toEqual({
        ok: true,
        estado: 'AUTORIZADA',
      });
      const f = await fila(db, e);
      expect(f.respuesta_origen).toBe('OFICINA');
      expect(f.respondido_nombre).toBe('Ing. Pérez (residente)');
    });

    it('aislamiento: B no ve ni envía las estimaciones de A', async () => {
      const obra = await crearObra(db, a.empresaId);
      const partida = await crearPartida(db, a.empresaId, obra, 10, 100);
      const e = await crearEstimacion(db, a, obra, [{ partida, cantidad: 1, precio: 100 }]);
      expect(await comoUsuario(db, b.adminId, (tx) => idsVisibles(tx, 'public.estimaciones', [e]))).toEqual([]);
      expect((await enviar(db, b.adminId, e)).ok).toBe(false);
      expect(await comoUsuario(db, colabA, (tx) => idsVisibles(tx, 'public.estimaciones', [e]))).toEqual([]);
      expect(await comoUsuario(db, supA, (tx) => idsVisibles(tx, 'public.estimaciones', [e]))).toEqual([e]);
    });
  });

  // ── Cobro fiscal (F1b) ────────────────────────────────────────────────────

  describe('cobro fiscal de una estimación', () => {
    it('solo una estimación autorizada es cobro para facturar, y con un solo origen', async () => {
      const obra = await crearObra(db, a.empresaId, { cliente_id: clienteA.clienteId });
      const partida = await crearPartida(db, a.empresaId, obra, 10, 100);
      const e = await crearEstimacion(db, a, obra, [{ partida, cantidad: 1, precio: 100 }]);
      const fiscal = (id: string, extra: Record<string, unknown> = {}) =>
        comoUsuario(db, contA, (tx) =>
          insertar(tx, 'public.cobro_fiscal', { id, empresa_id: a.empresaId, estimacion_id: e, ...extra }),
        );

      await expect(fiscal(randomUUID())).rejects.toThrow(RLS); // borrador
      await enviar(db, a.adminId, e);
      await expect(fiscal(randomUUID())).rejects.toThrow(RLS); // enviada
      await responder(db, clienteA.userId, e, true);

      const mov = await crearMovimiento(db, { empresaId: a.empresaId, obraId: obra, tipo: 'ENTRADA' });
      await expect(fiscal(randomUUID(), { movimiento_id: mov })).rejects.toThrow(/cobro_fiscal_origen/);
      const id = randomUUID();
      await fiscal(id);
      expect(await comoUsuario(db, a.adminId, (tx) => idsVisibles(tx, 'public.cobro_fiscal', [id]))).toEqual([id]);
      // El supervisor no ve lo fiscal.
      expect(await comoUsuario(db, supA, (tx) => idsVisibles(tx, 'public.cobro_fiscal', [id]))).toEqual([]);
    });
  });
});
