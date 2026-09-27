// 0038 — compras y material sobre Postgres real (PGlite). Cómo funciona el
// harness: `src/db/pglite/README.md`.
//
// Lo que se prueba es la cadena que mueve dinero:
//   · nadie de otra empresa ve ni toca nada; nada cuelga de un padre ajeno,
//   · cada rol hace lo suyo (RR2.1): supervisor pide y recibe, admin aprueba y
//     compra, contador paga; colaborador y cliente no ven nada,
//   · los estados se calculan en la base (y coinciden con `lib/compras`),
//   · lo emitido no cambia,
//   · pagar crea UNA salida de caja con categoría de costo MATERIAL, y la caja
//     manda si alguien la corrige o la borra.

import { randomUUID } from 'node:crypto';
import { beforeAll, describe, expect, it } from 'vitest';
import type { PGlite } from '@electric-sql/pglite';
import { comoUsuario, dbMigrada } from './pglite/crear-db';
import {
  crearClienteConCuenta,
  crearEmpresaDePrueba,
  crearObra,
  idsVisibles,
  insertar,
  invitarConRol,
  type EmpresaDePrueba,
} from './pglite/escenarios';
import { totalesOrden } from '@/lib/compras/calculo';

const LENTO = 60_000;
const RLS = /row-level security/;

interface Resultado {
  ok: boolean;
  error?: string;
  estado?: string;
  total?: number;
  id?: string;
  movimiento_id?: string;
  repetido?: boolean;
}

async function rpc(db: PGlite, userId: string, sql: string, params: unknown[]): Promise<Resultado> {
  const r = await comoUsuario(db, userId, (tx) => tx.query<{ r: Resultado }>(sql, params));
  return r.rows[0].r;
}

const emitir = (db: PGlite, u: string, id: string) =>
  rpc(db, u, 'select public.emitir_orden_compra($1) as r', [id]);
const cancelar = (db: PGlite, u: string, id: string) =>
  rpc(db, u, 'select public.cancelar_orden_compra($1) as r', [id]);
const pagar = (db: PGlite, u: string, oc: string, monto: number, id = randomUUID()) =>
  rpc(db, u, 'select public.pagar_orden_compra($1, $2, $3, $4, $5, $6, $7) as r', [
    id,
    oc,
    monto,
    Date.now(),
    'TRANSFERENCIA',
    'SPEI 123',
    '',
  ]);
const anular = (db: PGlite, u: string, id: string) =>
  rpc(db, u, 'select public.anular_pago_proveedor($1) as r', [id]);
const ligarFactura = (db: PGlite, u: string, oc: string, uuid: string | null) =>
  rpc(db, u, 'select public.ligar_factura_orden_compra($1, $2, $3, $4, $5, $6, $7, $8, $9) as r', [
    oc,
    uuid,
    'AAA010101AAA',
    116,
    16,
    Date.now(),
    null,
    null,
    null,
  ]);

async function valor<T>(db: PGlite, sql: string, params: unknown[]): Promise<T> {
  const r = await db.query<{ v: T }>(sql, params);
  return r.rows[0]?.v;
}

const estadoReq = (db: PGlite, id: string) =>
  valor<string>(db, 'select estado as v from public.requisiciones where id = $1', [id]);
const estadoOc = (db: PGlite, id: string) =>
  valor<string>(db, 'select estado as v from public.ordenes_compra where id = $1', [id]);

describe('0038 — compras y material', () => {
  let db: PGlite;
  let a: EmpresaDePrueba;
  let b: EmpresaDePrueba;
  let obraA: string;
  let obraA2: string;
  let obraB: string;
  let supA: string;
  let supA2: string;
  let colabA: string;
  let contA: string;
  let clienteA: { userId: string; clienteId: string };
  let provA: string;
  let provB: string;
  let cementoA: string;

  /** Proveedor sembrado como el admin (pasa por RLS). */
  async function proveedor(emp: EmpresaDePrueba, extra: Record<string, unknown> = {}) {
    const id = randomUUID();
    await comoUsuario(db, emp.adminId, (tx) =>
      insertar(tx, 'public.proveedores', { id, empresa_id: emp.empresaId, nombre: 'Materiales del Norte', dias_credito: 15, ...extra }),
    );
    return id;
  }

  /** Requisición con renglones, pedida por `userId`. */
  async function requisicion(
    userId: string,
    emp: EmpresaDePrueba,
    obraId: string,
    renglones: { descripcion: string; cantidad: number; material_id?: string | null }[],
  ) {
    const id = randomUUID();
    const rids: string[] = [];
    await comoUsuario(db, userId, async (tx) => {
      await insertar(tx, 'public.requisiciones', { id, empresa_id: emp.empresaId, obra_id: obraId, notas: 'Para el colado' });
      for (const [i, r] of renglones.entries()) {
        const rid = randomUUID();
        rids.push(rid);
        await insertar(tx, 'public.requisicion_renglon', {
          id: rid,
          empresa_id: emp.empresaId,
          requisicion_id: id,
          descripcion: r.descripcion,
          unidad: 'bulto',
          cantidad: r.cantidad,
          material_id: r.material_id ?? null,
          orden: i * 100,
        });
      }
    });
    return { id, rids };
  }

  async function aprobar(userId: string, id: string) {
    await comoUsuario(db, userId, (tx) =>
      tx.query(`update public.requisiciones set estado = 'APROBADA' where id = $1`, [id]),
    );
  }

  /** Orden en borrador con renglones, creada por el admin. */
  async function orden(
    emp: EmpresaDePrueba,
    obraId: string,
    provId: string,
    renglones: { cantidad: number; precio: number; req?: string; material_id?: string }[],
    iva = 16,
  ) {
    const id = randomUUID();
    const rids: string[] = [];
    await comoUsuario(db, emp.adminId, async (tx) => {
      await insertar(tx, 'public.ordenes_compra', {
        id,
        empresa_id: emp.empresaId,
        obra_id: obraId,
        proveedor_id: provId,
        iva_pct: iva,
        condiciones: 'Entrega en obra',
      });
      for (const [i, r] of renglones.entries()) {
        const rid = randomUUID();
        rids.push(rid);
        await insertar(tx, 'public.orden_compra_renglon', {
          id: rid,
          empresa_id: emp.empresaId,
          orden_compra_id: id,
          requisicion_renglon_id: r.req ?? null,
          material_id: r.material_id ?? null,
          descripcion: 'Cemento gris 50 kg',
          unidad: 'bulto',
          cantidad: r.cantidad,
          precio_unitario: r.precio,
          orden: i * 100,
        });
      }
    });
    return { id, rids };
  }

  async function recibir(userId: string, emp: EmpresaDePrueba, oc: string, lineas: { renglon: string; cantidad: number }[]) {
    const id = randomUUID();
    await comoUsuario(db, userId, async (tx) => {
      await insertar(tx, 'public.recepciones', { id, empresa_id: emp.empresaId, orden_compra_id: oc, obra_id: obraA });
      for (const l of lineas) {
        await insertar(tx, 'public.recepcion_renglon', {
          id: randomUUID(),
          empresa_id: emp.empresaId,
          recepcion_id: id,
          orden_compra_renglon_id: l.renglon,
          cantidad_recibida: l.cantidad,
        });
      }
    });
    return id;
  }

  beforeAll(async () => {
    db = await dbMigrada();
    a = await crearEmpresaDePrueba(db);
    b = await crearEmpresaDePrueba(db);
    clienteA = await crearClienteConCuenta(db, a.empresaId);
    obraA = await crearObra(db, a.empresaId, { cliente_id: clienteA.clienteId });
    obraA2 = await crearObra(db, a.empresaId);
    obraB = await crearObra(db, b.empresaId);
    supA = await invitarConRol(db, a, 'supervisor');
    supA2 = await invitarConRol(db, a, 'supervisor');
    colabA = await invitarConRol(db, a, 'colaborador');
    contA = await invitarConRol(db, a, 'contador');
    provA = await proveedor(a);
    provB = await proveedor(b);
    cementoA = randomUUID();
    await comoUsuario(db, a.adminId, (tx) =>
      insertar(tx, 'public.materiales', {
        id: cementoA,
        empresa_id: a.empresaId,
        nombre: 'Cemento gris 50 kg',
        unidad: 'bulto',
        clave_sat: '30111601',
        unidad_sat: 'XBG',
      }),
    );
  }, LENTO);

  // ── Catálogos ──────────────────────────────────────────────────────────────

  it('proveedores: admin y contador escriben; supervisor solo lee; RFC único por empresa', async () => {
    const id = await proveedor(a, { rfc: 'MAN010101AB1' });
    await expect(proveedor(a, { rfc: 'MAN010101AB1' })).rejects.toThrow(/uq_proveedores_rfc|duplicate/);
    // Otra empresa sí puede tener el mismo RFC.
    await proveedor(b, { rfc: 'MAN010101AB1' });

    await comoUsuario(db, contA, (tx) =>
      insertar(tx, 'public.proveedores', { id: randomUUID(), empresa_id: a.empresaId, nombre: 'Ferretería' }),
    );
    await expect(
      comoUsuario(db, supA, (tx) =>
        insertar(tx, 'public.proveedores', { id: randomUUID(), empresa_id: a.empresaId, nombre: 'X' }),
      ),
    ).rejects.toThrow(RLS);
    expect(await comoUsuario(db, supA, (tx) => idsVisibles(tx, 'public.proveedores', [id]))).toEqual([id]);
    expect(await comoUsuario(db, b.adminId, (tx) => idsVisibles(tx, 'public.proveedores', [id]))).toEqual([]);
    expect(await comoUsuario(db, colabA, (tx) => idsVisibles(tx, 'public.proveedores', [id]))).toEqual([]);
  });

  it('un RFC inválido no entra', async () => {
    await expect(proveedor(a, { rfc: 'NO-ES-RFC' })).rejects.toThrow(/proveedores_rfc/);
  });

  it('materiales: solo el admin da de alta; el proveedor habitual tiene que ser de su empresa', async () => {
    await expect(
      comoUsuario(db, supA, (tx) =>
        insertar(tx, 'public.materiales', { id: randomUUID(), empresa_id: a.empresaId, nombre: 'Varilla' }),
      ),
    ).rejects.toThrow(RLS);
    await expect(
      comoUsuario(db, a.adminId, (tx) =>
        insertar(tx, 'public.materiales', {
          id: randomUUID(),
          empresa_id: a.empresaId,
          nombre: 'Varilla',
          proveedor_id: provB,
        }),
      ),
    ).rejects.toThrow(RLS);
  });

  // ── Requisiciones ──────────────────────────────────────────────────────────

  it('el supervisor pide; folio por empresa y sellos de quién pidió los pone la base', async () => {
    const r1 = await requisicion(supA, a, obraA, [{ descripcion: 'Cemento', cantidad: 10 }]);
    const r2 = await requisicion(supA, a, obraA2, [{ descripcion: 'Arena', cantidad: 3 }]);
    const f1 = await valor<number>(db, 'select folio as v from public.requisiciones where id = $1', [r1.id]);
    const f2 = await valor<number>(db, 'select folio as v from public.requisiciones where id = $1', [r2.id]);
    expect(f2).toBe(f1 + 1);
    expect(await valor<string>(db, 'select pedido_por::text as v from public.requisiciones where id = $1', [r1.id])).toBe(supA);
    expect(await estadoReq(db, r1.id)).toBe('PENDIENTE');
  });

  it('no se cuelga una requisición de una obra de otra empresa', async () => {
    await expect(
      comoUsuario(db, a.adminId, (tx) =>
        insertar(tx, 'public.requisiciones', { id: randomUUID(), empresa_id: a.empresaId, obra_id: obraB }),
      ),
    ).rejects.toThrow(RLS);
  });

  it('colaborador y cliente no piden ni ven requisiciones', async () => {
    const r = await requisicion(supA, a, obraA, [{ descripcion: 'Grava', cantidad: 2 }]);
    await expect(
      comoUsuario(db, colabA, (tx) =>
        insertar(tx, 'public.requisiciones', { id: randomUUID(), empresa_id: a.empresaId, obra_id: obraA }),
      ),
    ).rejects.toThrow(RLS);
    expect(await comoUsuario(db, colabA, (tx) => idsVisibles(tx, 'public.requisiciones', [r.id]))).toEqual([]);
    expect(await comoUsuario(db, clienteA.userId, (tx) => idsVisibles(tx, 'public.requisiciones', [r.id]))).toEqual([]);
    expect(await comoUsuario(db, b.adminId, (tx) => idsVisibles(tx, 'public.requisiciones', [r.id]))).toEqual([]);
    expect(await comoUsuario(db, contA, (tx) => idsVisibles(tx, 'public.requisiciones', [r.id]))).toEqual([r.id]);
  });

  it('el supervisor no aprueba, ni edita la requisición de otro supervisor', async () => {
    const r = await requisicion(supA, a, obraA, [{ descripcion: 'Block', cantidad: 100 }]);
    const res = await comoUsuario(db, supA, (tx) =>
      tx.query(`update public.requisiciones set estado = 'APROBADA' where id = $1`, [r.id]),
    ).catch((e: Error) => e);
    expect(res instanceof Error ? res.message : '').toMatch(RLS);
    const otro = await comoUsuario(db, supA2, (tx) =>
      tx.query(`update public.requisiciones set notas = 'cambio' where id = $1`, [r.id]),
    );
    expect(otro.affectedRows).toBe(0);
    // El suyo sí, mientras está por aprobar.
    const suyo = await comoUsuario(db, supA, (tx) =>
      tx.query(`update public.requisiciones set notas = 'urge' where id = $1`, [r.id]),
    );
    expect(suyo.affectedRows).toBe(1);
  });

  it('rechazar exige motivo; una rechazada no cambia más', async () => {
    const r = await requisicion(supA, a, obraA, [{ descripcion: 'Pintura', cantidad: 4 }]);
    await expect(
      comoUsuario(db, a.adminId, (tx) =>
        tx.query(`update public.requisiciones set estado = 'RECHAZADA' where id = $1`, [r.id]),
      ),
    ).rejects.toThrow(/requisiciones_rechazo_con_motivo/);
    await comoUsuario(db, a.adminId, (tx) =>
      tx.query(`update public.requisiciones set estado = 'RECHAZADA', motivo_rechazo = 'Ya hay en bodega' where id = $1`, [r.id]),
    );
    expect(await estadoReq(db, r.id)).toBe('RECHAZADA');
    await expect(
      comoUsuario(db, a.adminId, (tx) =>
        tx.query(`update public.requisiciones set estado = 'APROBADA' where id = $1`, [r.id]),
      ),
    ).rejects.toThrow(/rechazada no cambia/);
  });

  it('los renglones de una requisición aprobada no se tocan', async () => {
    const r = await requisicion(supA, a, obraA, [{ descripcion: 'Cal', cantidad: 5 }]);
    await aprobar(a.adminId, r.id);
    await expect(
      comoUsuario(db, a.adminId, (tx) =>
        tx.query(`update public.requisicion_renglon set cantidad = 50 where id = $1`, [r.rids[0]]),
      ),
    ).rejects.toThrow(/ya se aprobó/);
  });

  // ── Orden de compra y estado de la requisición ─────────────────────────────

  it('la requisición pasa a PARCIAL / COMPRADA según lo que está en órdenes, y vuelve al cancelar', async () => {
    const r = await requisicion(supA, a, obraA, [
      { descripcion: 'Cemento', cantidad: 10, material_id: cementoA },
      { descripcion: 'Arena', cantidad: 2 },
    ]);
    await aprobar(a.adminId, r.id);
    expect(await estadoReq(db, r.id)).toBe('APROBADA');

    const o1 = await orden(a, obraA, provA, [{ cantidad: 4, precio: 250, req: r.rids[0], material_id: cementoA }]);
    expect(await estadoReq(db, r.id)).toBe('PARCIAL');

    const o2 = await orden(a, obraA, provA, [
      { cantidad: 6, precio: 250, req: r.rids[0] },
      { cantidad: 2, precio: 400, req: r.rids[1] },
    ]);
    expect(await estadoReq(db, r.id)).toBe('COMPRADA');

    expect((await cancelar(db, a.adminId, o2.id)).ok).toBe(true);
    expect(await estadoReq(db, r.id)).toBe('PARCIAL');
    expect((await cancelar(db, a.adminId, o1.id)).ok).toBe(true);
    expect(await estadoReq(db, r.id)).toBe('APROBADA');
  });

  it('no se compra lo de una requisición por aprobar, ni de otra obra', async () => {
    const pend = await requisicion(supA, a, obraA, [{ descripcion: 'Yeso', cantidad: 3 }]);
    await expect(orden(a, obraA, provA, [{ cantidad: 3, precio: 90, req: pend.rids[0] }])).rejects.toThrow(RLS);

    const otraObra = await requisicion(supA, a, obraA2, [{ descripcion: 'Yeso', cantidad: 3 }]);
    await aprobar(a.adminId, otraObra.id);
    await expect(orden(a, obraA, provA, [{ cantidad: 3, precio: 90, req: otraObra.rids[0] }])).rejects.toThrow(RLS);
  });

  it('no se arma una orden con proveedor u obra de otra empresa, ni la arman supervisor o contador', async () => {
    await expect(orden(a, obraA, provB, [])).rejects.toThrow(RLS);
    await expect(orden(a, obraB, provA, [])).rejects.toThrow(RLS);
    for (const u of [supA, contA]) {
      await expect(
        comoUsuario(db, u, (tx) =>
          insertar(tx, 'public.ordenes_compra', {
            id: randomUUID(),
            empresa_id: a.empresaId,
            obra_id: obraA,
            proveedor_id: provA,
          }),
        ),
      ).rejects.toThrow(RLS);
    }
  });

  it('emitir calcula los mismos totales que la web y congela la orden', async () => {
    const renglones = [
      { cantidad: 3, precio: 199.995 },
      { cantidad: 0.5, precio: 1234.567 },
      { cantidad: 10, precio: 0.1 },
    ];
    const o = await orden(a, obraA, provA, renglones.map((r) => ({ ...r, material_id: cementoA })), 16);
    expect((await emitir(db, supA, o.id)).ok).toBe(false);
    const r = await emitir(db, a.adminId, o.id);
    expect(r.ok).toBe(true);

    const fila = (
      await db.query<{ subtotal: number; iva: number; total: number; folio: number }>(
        'select subtotal, iva, total, folio from public.ordenes_compra where id = $1',
        [o.id],
      )
    ).rows[0];
    const web = totalesOrden(
      renglones.map((x) => ({ cantidad: x.cantidad, precio_unitario: x.precio })),
      16,
    );
    expect(fila.subtotal).toBeCloseTo(web.subtotal, 2);
    expect(fila.iva).toBeCloseTo(web.iva, 2);
    expect(fila.total).toBeCloseTo(web.total, 2);

    // El catálogo aprende el último precio (el más alto de la orden).
    expect(await valor<number>(db, 'select ultimo_precio as v from public.materiales where id = $1', [cementoA])).toBeCloseTo(1234.567, 3);

    // Lo emitido no cambia: ni por la llave de servicio.
    await expect(db.query('update public.ordenes_compra set iva_pct = 0 where id = $1', [o.id])).rejects.toThrow(/ya se emitió/);
    await expect(
      db.query('update public.orden_compra_renglon set precio_unitario = 1 where id = $1', [o.rids[0]]),
    ).rejects.toThrow(/ya se emitió/);
    await expect(db.query(`update public.ordenes_compra set estado = 'RECIBIDA' where id = $1`, [o.id])).resolves.toBeTruthy();
    // …y "RECIBIDA" escrito a mano no pega: el estado lo calcula la base.
    expect(await estadoOc(db, o.id)).toBe('EMITIDA');
  });

  it('el folio de las órdenes es consecutivo por empresa', async () => {
    const o1 = await orden(a, obraA, provA, []);
    const o2 = await orden(a, obraA2, provA, []);
    const f = (id: string) => valor<number>(db, 'select folio as v from public.ordenes_compra where id = $1', [id]);
    expect(await f(o2.id)).toBe((await f(o1.id)) + 1);
  });

  // ── Recepción ──────────────────────────────────────────────────────────────

  it('el supervisor recibe; la orden pasa a PARCIAL y a RECIBIDA; borrar la recepción la regresa', async () => {
    const o = await orden(a, obraA, provA, [
      { cantidad: 10, precio: 250 },
      { cantidad: 2, precio: 400 },
    ]);
    // Un borrador no se recibe.
    await expect(recibir(supA, a, o.id, [{ renglon: o.rids[0], cantidad: 1 }])).rejects.toThrow(/orden emitida/);
    await emitir(db, a.adminId, o.id);

    const rec1 = await recibir(supA, a, o.id, [{ renglon: o.rids[0], cantidad: 6 }]);
    expect(await estadoOc(db, o.id)).toBe('PARCIAL');
    expect(await valor<string>(db, 'select obra_id::text as v from public.recepciones where id = $1', [rec1])).toBe(obraA);

    await recibir(supA, a, o.id, [
      { renglon: o.rids[0], cantidad: 4 },
      { renglon: o.rids[1], cantidad: 2 },
    ]);
    expect(await estadoOc(db, o.id)).toBe('RECIBIDA');

    // El supervisor no borra; el admin sí, y la orden se recalcula.
    const intento = await comoUsuario(db, supA, (tx) =>
      tx.query('update public.recepciones set deleted_at = $2 where id = $1', [rec1, Date.now()]),
    ).catch((e: Error) => e);
    expect(intento instanceof Error ? intento.message : '').toMatch(RLS);
    await comoUsuario(db, a.adminId, (tx) =>
      tx.query('update public.recepciones set deleted_at = $2 where id = $1', [rec1, Date.now()]),
    );
    expect(await estadoOc(db, o.id)).toBe('PARCIAL');

    // Con recepciones vivas no se cancela.
    expect((await cancelar(db, a.adminId, o.id)).error).toMatch(/Ya se recibió/);
  });

  it('no se recibe un renglón de otra orden', async () => {
    const o1 = await orden(a, obraA, provA, [{ cantidad: 1, precio: 10 }]);
    const o2 = await orden(a, obraA, provA, [{ cantidad: 1, precio: 10 }]);
    await emitir(db, a.adminId, o1.id);
    await emitir(db, a.adminId, o2.id);
    await expect(recibir(supA, a, o1.id, [{ renglon: o2.rids[0], cantidad: 1 }])).rejects.toThrow(/no es de la orden/);
  });

  // ── Pagos ──────────────────────────────────────────────────────────────────

  it('el contador paga: nace UNA salida de caja MATERIAL en la obra de la orden', async () => {
    const o = await orden(a, obraA, provA, [{ cantidad: 10, precio: 100 }], 16); // total 1160
    // No se paga un borrador.
    expect((await pagar(db, contA, o.id, 100)).ok).toBe(false);
    await emitir(db, a.adminId, o.id);

    // Supervisor y colaborador no pagan.
    expect((await pagar(db, supA, o.id, 100)).error).toMatch(/administrador o el contador/);
    expect((await pagar(db, colabA, o.id, 100)).ok).toBe(false);

    const pagoId = randomUUID();
    const r = await pagar(db, contA, o.id, 500, pagoId);
    expect(r.ok).toBe(true);
    const mov = (
      await db.query<{
        tipo: string;
        categoria: string;
        categoria_costo: string;
        obra_id: string;
        monto: number;
        empresa_id: string;
        nombre: string;
      }>('select tipo, categoria, categoria_costo, obra_id::text, monto, empresa_id::text, nombre from public.movimientos where id = $1', [
        r.movimiento_id,
      ])
    ).rows[0];
    expect(mov).toMatchObject({
      tipo: 'SALIDA',
      categoria: 'MATERIAL',
      categoria_costo: 'MATERIAL',
      obra_id: obraA,
      monto: 500,
      empresa_id: a.empresaId,
      nombre: 'Materiales del Norte',
    });

    // Doble clic: mismo id, mismo pago, sin segunda salida.
    const otra = await pagar(db, contA, o.id, 500, pagoId);
    expect(otra.repetido).toBe(true);
    expect(await valor<number>(db, 'select count(*)::int as v from public.pagos_proveedor where orden_compra_id = $1', [o.id])).toBe(1);

    // No se paga de más (saldo 660).
    expect((await pagar(db, contA, o.id, 700)).error).toMatch(/pasa de lo que se debe/);
    expect((await pagar(db, a.adminId, o.id, 660)).ok).toBe(true);

    // El supervisor no ve los pagos; el contador sí.
    expect(await comoUsuario(db, supA, (tx) => idsVisibles(tx, 'public.pagos_proveedor', [pagoId]))).toEqual([]);
    expect(await comoUsuario(db, contA, (tx) => idsVisibles(tx, 'public.pagos_proveedor', [pagoId]))).toEqual([pagoId]);
    // Nadie inserta pagos a mano (sin policy de INSERT).
    await expect(
      comoUsuario(db, contA, (tx) =>
        insertar(
          tx,
          'public.pagos_proveedor',
          {
            id: randomUUID(),
            empresa_id: a.empresaId,
            orden_compra_id: o.id,
            proveedor_id: provA,
            monto: 1,
            fecha: Date.now(),
            movimiento_id: randomUUID(),
          },
          { returning: false },
        ),
      ),
    ).rejects.toThrow(RLS);

    // Con pagos no se cancela.
    expect((await cancelar(db, a.adminId, o.id)).error).toMatch(/tiene pagos/);
  });

  it('el cliente de la obra no ve la salida de material (0010/0019 siguen valiendo)', async () => {
    const o = await orden(a, obraA, provA, [{ cantidad: 1, precio: 100 }], 0);
    await emitir(db, a.adminId, o.id);
    const r = await pagar(db, contA, o.id, 100);
    expect(await comoUsuario(db, clienteA.userId, (tx) => idsVisibles(tx, 'public.movimientos', [r.movimiento_id!]))).toEqual([]);
  });

  it('la caja manda: corregir o borrar el movimiento se refleja en el pago; anular borra los dos', async () => {
    const o = await orden(a, obraA, provA, [{ cantidad: 1, precio: 1000 }], 0);
    await emitir(db, a.adminId, o.id);
    const p1 = randomUUID();
    const r1 = await pagar(db, contA, o.id, 400, p1);
    // El contador corrige el monto desde la caja.
    await comoUsuario(db, contA, (tx) =>
      tx.query('update public.movimientos set monto = 350, updated_at = $2 where id = $1', [r1.movimiento_id, Date.now()]),
    );
    expect(await valor<number>(db, 'select monto as v from public.pagos_proveedor where id = $1', [p1])).toBe(350);
    // …y lo borra (lógico, como hace la app).
    await comoUsuario(db, contA, (tx) =>
      tx.query('update public.movimientos set deleted_at = $2 where id = $1', [r1.movimiento_id, Date.now()]),
    );
    expect(await valor<number | null>(db, 'select deleted_at as v from public.pagos_proveedor where id = $1', [p1])).not.toBeNull();

    // Anular por RPC borra pago y movimiento.
    const p2 = randomUUID();
    const r2 = await pagar(db, contA, o.id, 1000, p2);
    expect(r2.ok).toBe(true);
    expect((await anular(db, supA, p2)).ok).toBe(false);
    expect((await anular(db, contA, p2)).ok).toBe(true);
    expect(await valor<number | null>(db, 'select deleted_at as v from public.movimientos where id = $1', [r2.movimiento_id])).not.toBeNull();
    // Ya sin pagos vivos, se puede cancelar.
    expect((await cancelar(db, a.adminId, o.id)).ok).toBe(true);
  });

  it('borrar de verdad el movimiento (DELETE) también apaga el pago', async () => {
    const o = await orden(a, obraA, provA, [{ cantidad: 1, precio: 50 }], 0);
    await emitir(db, a.adminId, o.id);
    const p = randomUUID();
    const r = await pagar(db, contA, o.id, 50, p);
    await comoUsuario(db, contA, (tx) => tx.query('delete from public.movimientos where id = $1', [r.movimiento_id]));
    expect(await valor<number | null>(db, 'select deleted_at as v from public.pagos_proveedor where id = $1', [p])).not.toBeNull();
  });

  // ── Factura del proveedor ──────────────────────────────────────────────────

  it('una factura (folio fiscal) se liga a UNA sola orden; el supervisor no liga', async () => {
    const o1 = await orden(a, obraA, provA, [{ cantidad: 1, precio: 100 }]);
    const o2 = await orden(a, obraA, provA, [{ cantidad: 1, precio: 100 }]);
    const uuid = randomUUID();
    expect((await ligarFactura(db, a.adminId, o1.id, uuid)).error).toMatch(/orden emitida/);
    await emitir(db, a.adminId, o1.id);
    await emitir(db, a.adminId, o2.id);
    expect((await ligarFactura(db, supA, o1.id, uuid)).ok).toBe(false);
    expect((await ligarFactura(db, contA, o1.id, uuid)).ok).toBe(true);
    const repetida = await ligarFactura(db, a.adminId, o2.id, uuid.toLowerCase());
    expect(repetida.error).toMatch(/ya está ligada a la orden OC-/);
    // Quitarla libera el folio.
    expect((await ligarFactura(db, contA, o1.id, null)).ok).toBe(true);
    expect((await ligarFactura(db, a.adminId, o2.id, uuid)).ok).toBe(true);
  });

  // ── Existencias (RF2.7) ────────────────────────────────────────────────────

  it('existencias = recibido − consumido ± traspasos, con la RLS de quien consulta', async () => {
    const varilla = randomUUID();
    await comoUsuario(db, a.adminId, (tx) =>
      insertar(tx, 'public.materiales', { id: varilla, empresa_id: a.empresaId, nombre: 'Varilla 3/8', unidad: 'pza' }),
    );
    const o = await orden(a, obraA, provA, [{ cantidad: 100, precio: 120, material_id: varilla }]);
    await emitir(db, a.adminId, o.id);
    await recibir(supA, a, o.id, [{ renglon: o.rids[0], cantidad: 100 }]);

    await comoUsuario(db, supA, async (tx) => {
      await insertar(tx, 'public.material_movimiento', {
        id: randomUUID(), empresa_id: a.empresaId, obra_id: obraA, material_id: varilla, tipo: 'CONSUMO', cantidad: 30,
      });
      await insertar(tx, 'public.material_movimiento', {
        id: randomUUID(), empresa_id: a.empresaId, obra_id: obraA, material_id: varilla, tipo: 'TRASPASO', cantidad: 20,
        obra_destino_id: obraA2,
      });
      await insertar(tx, 'public.material_movimiento', {
        id: randomUUID(), empresa_id: a.empresaId, obra_id: obraA, material_id: varilla, tipo: 'AJUSTE', cantidad: -2,
      });
    });

    const leer = (u: string) =>
      comoUsuario(db, u, (tx) =>
        tx.query<{ obra_id: string; existencia: number }>(
          'select obra_id::text, existencia from public.existencias_obra where material_id = $1 order by obra_id',
          [varilla],
        ),
      );
    const filas = (await leer(a.adminId)).rows;
    const por = new Map(filas.map((f) => [f.obra_id, Number(f.existencia)]));
    expect(por.get(obraA)).toBe(48);
    expect(por.get(obraA2)).toBe(20);
    expect((await leer(b.adminId)).rows).toEqual([]);
    expect((await leer(colabA)).rows).toEqual([]);

    // Traspaso a una obra de otra empresa: no.
    await expect(
      comoUsuario(db, supA, (tx) =>
        insertar(tx, 'public.material_movimiento', {
          id: randomUUID(), empresa_id: a.empresaId, obra_id: obraA, material_id: varilla, tipo: 'TRASPASO', cantidad: 1,
          obra_destino_id: obraB,
        }),
      ),
    ).rejects.toThrow(RLS);
  });

  // ── Bucket `compras` ───────────────────────────────────────────────────────

  it('bucket: la remisión va a la carpeta de una recepción que existe; la factura la sube admin o contador', async () => {
    const o = await orden(a, obraA, provA, [{ cantidad: 1, precio: 10 }]);
    await emitir(db, a.adminId, o.id);
    const rec = await recibir(supA, a, o.id, [{ renglon: o.rids[0], cantidad: 1 }]);
    const subir = (u: string, name: string) =>
      comoUsuario(db, u, (tx) =>
        insertar(tx, 'storage.objects', { id: randomUUID(), bucket_id: 'compras', name }, { returning: false }),
      );

    await subir(supA, `${a.empresaId}/remisiones/${rec}/foto.jpg`);
    await expect(subir(supA, `${a.empresaId}/remisiones/${randomUUID()}/foto.jpg`)).rejects.toThrow(RLS);
    await expect(subir(supA, `${a.empresaId}/facturas/${o.id}/f.xml`)).rejects.toThrow(RLS);
    await subir(contA, `${a.empresaId}/facturas/${o.id}/f.xml`);
    await expect(subir(b.adminId, `${a.empresaId}/facturas/${o.id}/g.xml`)).rejects.toThrow(RLS);
    await expect(subir(a.adminId, `basura/remisiones/${rec}/x.jpg`)).rejects.toThrow(RLS);
    await expect(subir(colabA, `${a.empresaId}/remisiones/${rec}/foto2.jpg`)).rejects.toThrow(RLS);
  });
});
