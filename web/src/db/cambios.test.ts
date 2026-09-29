// 0036 — extras (órdenes de cambio), categoría de costo y margen objetivo, sobre
// Postgres real (PGlite). Cómo funciona el harness: `src/db/pglite/README.md`.
//
// Lo que se prueba es lo que tiene que aguantar un pleito con el cliente:
//   · nadie de otra empresa ve ni toca los extras,
//   · el cliente de OTRA obra no ve ni aprueba,
//   · el colaborador de campo no ve nada,
//   · lo que se envió no cambia (ni por RLS, ni por la llave de servicio).

import { randomUUID } from 'node:crypto';
import { beforeAll, describe, expect, it } from 'vitest';
import type { PGlite } from '@electric-sql/pglite';
import { comoUsuario, dbMigrada, type Consultable } from './pglite/crear-db';
import {
  crearClienteConCuenta,
  crearEmpresaDePrueba,
  crearObra,
  idsVisibles,
  insertar,
  invitarConRol,
  type EmpresaDePrueba,
} from './pglite/escenarios';

const LENTO = 60_000;
const RLS = /row-level security/;

interface Resultado {
  ok: boolean;
  error?: string;
  estado?: string;
}

/** Un extra BORRADOR con un renglón, sembrado como `userId` (pasa por RLS). */
async function crearExtra(
  db: PGlite,
  userId: string,
  empresaId: string,
  obraId: string,
  renglones: { concepto: string; cantidad: number; precio: number }[] = [
    { concepto: 'Barda perimetral', cantidad: 10, precio: 850 },
  ],
): Promise<string> {
  const id = randomUUID();
  await comoUsuario(db, userId, async (tx) => {
    await insertar(tx, 'public.orden_cambio', {
      id,
      empresa_id: empresaId,
      obra_id: obraId,
      titulo: 'Extra de prueba',
      motivo: 'Lo pidió el cliente',
    });
    for (const [i, r] of renglones.entries()) {
      await insertar(tx, 'public.orden_cambio_renglon', {
        id: randomUUID(),
        empresa_id: empresaId,
        orden_cambio_id: id,
        concepto: r.concepto,
        cantidad: r.cantidad,
        precio_unitario: r.precio,
        orden: (i + 1) * 100,
      });
    }
  });
  return id;
}

async function rpc(db: PGlite, userId: string, sql: string, params: unknown[]): Promise<Resultado> {
  const r = await comoUsuario(db, userId, (tx) => tx.query<{ r: Resultado }>(sql, params));
  return r.rows[0].r;
}

const enviar = (db: PGlite, u: string, id: string) =>
  rpc(db, u, 'select public.enviar_orden_cambio($1) as r', [id]);
const cancelar = (db: PGlite, u: string, id: string) =>
  rpc(db, u, 'select public.cancelar_orden_cambio($1) as r', [id]);
const responder = (db: PGlite, u: string, id: string, aprobar: boolean, motivo: string | null = null) =>
  rpc(db, u, 'select public.responder_orden_cambio($1, $2, $3) as r', [id, aprobar, motivo]);

async function fila(db: PGlite, id: string) {
  const r = await db.query<{
    estado: string;
    folio: number;
    total_enviado: number | null;
    snapshot_json: { total: number; renglones: unknown[] } | null;
    respondido_por: string | null;
    respondido_nombre: string | null;
    motivo_rechazo: string | null;
  }>('select * from public.orden_cambio where id = $1', [id]);
  return r.rows[0];
}

describe('0036 — extras (órdenes de cambio)', () => {
  let db: PGlite;
  let a: EmpresaDePrueba;
  let b: EmpresaDePrueba;
  let obraA: string;
  let obraA2: string;
  let obraB: string;
  let supA: string;
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
    colabA = await invitarConRol(db, a, 'colaborador');
    contA = await invitarConRol(db, a, 'contador');
  }, LENTO);

  it('el folio es consecutivo por obra y lo pone la base', async () => {
    const e1 = await crearExtra(db, a.adminId, a.empresaId, obraA);
    const e2 = await crearExtra(db, supA, a.empresaId, obraA);
    const otra = await crearExtra(db, a.adminId, a.empresaId, obraA2);
    const f1 = (await fila(db, e1)).folio;
    expect((await fila(db, e2)).folio).toBe(f1 + 1);
    expect((await fila(db, otra)).folio).toBeGreaterThanOrEqual(1);
  });

  it('aislamiento: el admin de B no ve ni escribe los extras de A', async () => {
    const id = await crearExtra(db, a.adminId, a.empresaId, obraA);
    const ve = await comoUsuario(db, b.adminId, (tx) => idsVisibles(tx, 'public.orden_cambio', [id]));
    expect(ve).toEqual([]);

    // Con su propio empresa_id tampoco puede colgarlo de una obra de A.
    await expect(
      comoUsuario(db, b.adminId, (tx) =>
        insertar(tx, 'public.orden_cambio', {
          id: randomUUID(),
          empresa_id: b.empresaId,
          obra_id: obraA,
        }),
      ),
    ).rejects.toThrow(RLS);

    // Ni enviarlo ni cancelarlo.
    expect((await enviar(db, b.adminId, id)).ok).toBe(false);
    expect((await cancelar(db, b.adminId, id)).ok).toBe(false);
    expect((await fila(db, id)).estado).toBe('BORRADOR');
  });

  it('el supervisor de A no puede colgar un extra de A bajo una obra de B', async () => {
    await expect(
      comoUsuario(db, supA, (tx) =>
        insertar(tx, 'public.orden_cambio', {
          id: randomUUID(),
          empresa_id: a.empresaId,
          obra_id: obraB,
        }),
      ),
    ).rejects.toThrow(RLS);
  });

  it('nadie da de alta un extra ya "enviado" saltándose la RPC', async () => {
    await expect(
      comoUsuario(db, a.adminId, (tx) =>
        insertar(tx, 'public.orden_cambio', {
          id: randomUUID(),
          empresa_id: a.empresaId,
          obra_id: obraA,
          estado: 'APROBADA',
        }),
      ),
    ).rejects.toThrow();
  });

  it('el colaborador no ve extras ni puede crearlos', async () => {
    const id = await crearExtra(db, a.adminId, a.empresaId, obraA);
    const ve = await comoUsuario(db, colabA, (tx) => idsVisibles(tx, 'public.orden_cambio', [id]));
    expect(ve).toEqual([]);
    await expect(
      comoUsuario(db, colabA, (tx) =>
        insertar(
          tx,
          'public.orden_cambio',
          { id: randomUUID(), empresa_id: a.empresaId, obra_id: obraA },
          { returning: false },
        ),
      ),
    ).rejects.toThrow(RLS);
  });

  it('el contador lee pero no escribe', async () => {
    const id = await crearExtra(db, a.adminId, a.empresaId, obraA);
    const ve = await comoUsuario(db, contA, (tx) => idsVisibles(tx, 'public.orden_cambio', [id]));
    expect(ve).toEqual([id]);
    const r = await comoUsuario(db, contA, (tx) =>
      tx.query("update public.orden_cambio set titulo = 'x' where id = $1", [id]),
    );
    expect(r.affectedRows).toBe(0);
  });

  it('solo el admin envía; el supervisor no', async () => {
    const id = await crearExtra(db, supA, a.empresaId, obraA);
    const r = await enviar(db, supA, id);
    expect(r.ok).toBe(false);
    expect((await fila(db, id)).estado).toBe('BORRADOR');

    // Y tampoco lo "envía" con un UPDATE directo.
    await expect(
      comoUsuario(db, supA, (tx) =>
        tx.query("update public.orden_cambio set estado = 'ENVIADA' where id = $1", [id]),
      ),
    ).rejects.toThrow(RLS);
  });

  it('no se envía un extra sin conceptos', async () => {
    const id = await crearExtra(db, a.adminId, a.empresaId, obraA, []);
    const r = await enviar(db, a.adminId, id);
    expect(r.ok).toBe(false);
  });

  it('al enviar se toma la foto con el total', async () => {
    const id = await crearExtra(db, a.adminId, a.empresaId, obraA, [
      { concepto: 'Barda', cantidad: 10, precio: 850 },
      { concepto: 'Castillos', cantidad: 4, precio: 125.5 },
    ]);
    expect((await enviar(db, a.adminId, id)).ok).toBe(true);
    const f = await fila(db, id);
    expect(f.estado).toBe('ENVIADA');
    expect(f.total_enviado).toBe(9002);
    expect(Number(f.snapshot_json?.total)).toBe(9002);
    expect(f.snapshot_json?.renglones).toHaveLength(2);
  });

  describe('snapshot inmutable tras enviar', () => {
    let id: string;
    let renglonId: string;

    beforeAll(async () => {
      id = await crearExtra(db, a.adminId, a.empresaId, obraA);
      const r = await db.query<{ id: string }>(
        'select id::text as id from public.orden_cambio_renglon where orden_cambio_id = $1',
        [id],
      );
      renglonId = r.rows[0].id;
      expect((await enviar(db, a.adminId, id)).ok).toBe(true);
    }, LENTO);

    it('el admin ya no edita el extra (la RLS solo deja tocar borradores)', async () => {
      const r = await comoUsuario(db, a.adminId, (tx) =>
        tx.query("update public.orden_cambio set titulo = 'Otro' where id = $1", [id]),
      );
      expect(r.affectedRows).toBe(0);
    });

    it('ni sus renglones', async () => {
      await expect(
        comoUsuario(db, a.adminId, (tx) =>
          tx.query('update public.orden_cambio_renglon set precio_unitario = 1 where id = $1', [
            renglonId,
          ]),
        ),
      ).rejects.toThrow();
      await expect(
        comoUsuario(db, a.adminId, (tx) =>
          insertar(tx, 'public.orden_cambio_renglon', {
            id: randomUUID(),
            empresa_id: a.empresaId,
            orden_cambio_id: id,
            concepto: 'Colado',
            cantidad: 1,
            precio_unitario: 99999,
          }),
        ),
      ).rejects.toThrow();
    });

    it('ni siquiera la llave de servicio cambia la foto, el total o los renglones', async () => {
      await expect(
        db.query('update public.orden_cambio set total_enviado = 1 where id = $1', [id]),
      ).rejects.toThrow(/no se puede cambiar/);
      await expect(
        db.query("update public.orden_cambio set snapshot_json = '{}'::jsonb where id = $1", [id]),
      ).rejects.toThrow(/no se puede cambiar/);
      await expect(
        db.query('update public.orden_cambio_renglon set cantidad = 99 where id = $1', [renglonId]),
      ).rejects.toThrow(/no se pueden cambiar/);
      await expect(
        db.query('delete from public.orden_cambio_renglon where id = $1', [renglonId]),
      ).rejects.toThrow(/no se pueden cambiar/);
    });

    it('un extra enviado no se borra ni regresa a borrador', async () => {
      await expect(
        db.query('update public.orden_cambio set deleted_at = 1 where id = $1', [id]),
      ).rejects.toThrow(/no se borra/);
      await expect(
        db.query("update public.orden_cambio set estado = 'BORRADOR' where id = $1", [id]),
      ).rejects.toThrow();
    });

    it('aprobado, la respuesta tampoco cambia', async () => {
      expect((await responder(db, clienteA.userId, id, true)).ok).toBe(true);
      const f = await fila(db, id);
      expect(f.estado).toBe('APROBADA');
      expect(f.respondido_por).toBe(clienteA.userId);
      expect(f.respondido_nombre).toBe('Cliente de prueba');

      await expect(
        db.query("update public.orden_cambio set estado = 'RECHAZADA', motivo_rechazo = 'x' where id = $1", [id]),
      ).rejects.toThrow();
      // Contestar dos veces no se puede.
      expect((await responder(db, clienteA.userId, id, false, 'Cambié de opinión')).ok).toBe(false);
      // Y un aprobado no se cancela.
      expect((await cancelar(db, a.adminId, id)).ok).toBe(false);
    });
  });

  describe('el cliente', () => {
    it('ve SOLO los extras enviados de SU obra; no los borradores ni los de otra obra', async () => {
      const borrador = await crearExtra(db, a.adminId, a.empresaId, obraA);
      const enviado = await crearExtra(db, a.adminId, a.empresaId, obraA);
      const deOtraObra = await crearExtra(db, a.adminId, a.empresaId, obraA2);
      await enviar(db, a.adminId, enviado);
      await enviar(db, a.adminId, deOtraObra);

      const ve = await comoUsuario(db, clienteA.userId, (tx) =>
        idsVisibles(tx, 'public.orden_cambio', [borrador, enviado, deOtraObra]),
      );
      expect(ve).toEqual([enviado]);

      // Los renglones vivos no se le abren: lee la foto.
      const renglones = await comoUsuario(db, clienteA.userId, (tx) =>
        tx.query('select id from public.orden_cambio_renglon where orden_cambio_id = $1', [enviado]),
      );
      expect(renglones.rows).toEqual([]);
    });

    it('el cliente de otra obra no aprueba', async () => {
      const id = await crearExtra(db, a.adminId, a.empresaId, obraA);
      await enviar(db, a.adminId, id);
      const r = await responder(db, clienteA2.userId, id, true);
      expect(r).toEqual({ ok: false, error: 'No autorizado' });
      expect((await fila(db, id)).estado).toBe('ENVIADA');
    });

    it('el cliente de otra empresa no ve ni aprueba', async () => {
      const clienteB = await crearClienteConCuenta(db, b.empresaId);
      const id = await crearExtra(db, a.adminId, a.empresaId, obraA);
      await enviar(db, a.adminId, id);
      const ve = await comoUsuario(db, clienteB.userId, (tx) =>
        idsVisibles(tx, 'public.orden_cambio', [id]),
      );
      expect(ve).toEqual([]);
      expect((await responder(db, clienteB.userId, id, true)).ok).toBe(false);
    });

    it('el personal no puede responder por el cliente', async () => {
      const id = await crearExtra(db, a.adminId, a.empresaId, obraA);
      await enviar(db, a.adminId, id);
      expect((await responder(db, a.adminId, id, true)).ok).toBe(false);
      expect((await responder(db, supA, id, true)).ok).toBe(false);
    });

    it('no responde un borrador', async () => {
      const id = await crearExtra(db, a.adminId, a.empresaId, obraA);
      expect((await responder(db, clienteA.userId, id, true)).ok).toBe(false);
    });

    it('rechazar exige motivo y lo guarda', async () => {
      const id = await crearExtra(db, a.adminId, a.empresaId, obraA);
      await enviar(db, a.adminId, id);
      expect((await responder(db, clienteA.userId, id, false, '   ')).ok).toBe(false);
      const r = await responder(db, clienteA.userId, id, false, 'Está muy caro');
      expect(r).toEqual({ ok: true, estado: 'RECHAZADA' });
      expect((await fila(db, id)).motivo_rechazo).toBe('Está muy caro');
    });

    it('sin sesión no se responde', async () => {
      const id = await crearExtra(db, a.adminId, a.empresaId, obraA);
      await enviar(db, a.adminId, id);
      await expect(
        comoUsuario(db, null, (tx) =>
          tx.query('select public.responder_orden_cambio($1, true, null)', [id]),
        ),
      ).rejects.toThrow(/permission denied/);
    });
  });

  it('cancelar: un enviado sin respuesta se cancela y el cliente deja de verlo', async () => {
    const id = await crearExtra(db, a.adminId, a.empresaId, obraA);
    await enviar(db, a.adminId, id);
    expect((await cancelar(db, supA, id)).ok).toBe(false);
    expect((await cancelar(db, a.adminId, id)).ok).toBe(true);
    expect((await fila(db, id)).estado).toBe('CANCELADA');
    const ve = await comoUsuario(db, clienteA.userId, (tx) =>
      idsVisibles(tx, 'public.orden_cambio', [id]),
    );
    expect(ve).toEqual([]);
    expect((await responder(db, clienteA.userId, id, true)).ok).toBe(false);
  });

  it('un borrador sí se borra (lógico) y se edita', async () => {
    const id = await crearExtra(db, supA, a.empresaId, obraA);
    const r = await comoUsuario(db, supA, (tx) =>
      tx.query("update public.orden_cambio set titulo = 'Nuevo', deleted_at = 1 where id = $1", [id]),
    );
    expect(r.affectedRows).toBe(1);
  });

  it('no se cambia de obra ni de folio un borrador', async () => {
    const id = await crearExtra(db, a.adminId, a.empresaId, obraA);
    await expect(
      comoUsuario(db, a.adminId, (tx) =>
        tx.query('update public.orden_cambio set obra_id = $2 where id = $1', [id, obraA2]),
      ),
    ).rejects.toThrow(/folio/);
  });
});

describe('0036 — foto del extra (bucket `extras`)', () => {
  let db: PGlite;
  let a: EmpresaDePrueba;
  let b: EmpresaDePrueba;
  let obraA: string;
  let clienteA: { userId: string; clienteId: string };
  let clienteOtro: { userId: string; clienteId: string };

  beforeAll(async () => {
    db = await dbMigrada();
    a = await crearEmpresaDePrueba(db);
    b = await crearEmpresaDePrueba(db);
    clienteA = await crearClienteConCuenta(db, a.empresaId);
    clienteOtro = await crearClienteConCuenta(db, a.empresaId);
    obraA = await crearObra(db, a.empresaId, { cliente_id: clienteA.clienteId });
  }, LENTO);

  async function subir(c: Consultable, name: string) {
    await c.query("insert into storage.objects (bucket_id, name) values ('extras', $1)", [name]);
  }
  async function ve(userId: string, name: string): Promise<boolean> {
    const r = await comoUsuario(db, userId, (tx) =>
      tx.query("select 1 from storage.objects where bucket_id = 'extras' and name = $1", [name]),
    );
    return r.rows.length > 0;
  }

  it('el admin sube a su carpeta; el de otra empresa no', async () => {
    await comoUsuario(db, a.adminId, (tx) => subir(tx, `${a.empresaId}/${obraA}/foto-a.jpg`));
    await expect(
      comoUsuario(db, b.adminId, (tx) => subir(tx, `${a.empresaId}/${obraA}/intruso.jpg`)),
    ).rejects.toThrow(RLS);
    expect(await ve(b.adminId, `${a.empresaId}/${obraA}/foto-a.jpg`)).toBe(false);
  });

  it('el cliente ve la foto de SU extra enviado, y nada más', async () => {
    const nombre = `${a.empresaId}/${obraA}/foto-cliente.jpg`;
    const suelta = `${a.empresaId}/${obraA}/otra.jpg`;
    await db.query("insert into storage.objects (bucket_id, name) values ('extras', $1), ('extras', $2)", [
      nombre,
      suelta,
    ]);
    const id = await crearExtra(db, a.adminId, a.empresaId, obraA);
    await db.query('update public.orden_cambio set foto_uri = $2 where id = $1', [id, nombre]);

    // Borrador: todavía no.
    expect(await ve(clienteA.userId, nombre)).toBe(false);
    await enviar(db, a.adminId, id);
    expect(await ve(clienteA.userId, nombre)).toBe(true);
    expect(await ve(clienteA.userId, suelta)).toBe(false);
    expect(await ve(clienteOtro.userId, nombre)).toBe(false);
  });
});

describe('0036 — categoría de costo y margen objetivo', () => {
  let db: PGlite;
  let a: EmpresaDePrueba;
  let b: EmpresaDePrueba;
  let obraA: string;
  let supA: string;
  let contA: string;
  let clienteA: { userId: string; clienteId: string };

  beforeAll(async () => {
    db = await dbMigrada();
    a = await crearEmpresaDePrueba(db);
    b = await crearEmpresaDePrueba(db);
    clienteA = await crearClienteConCuenta(db, a.empresaId);
    obraA = await crearObra(db, a.empresaId, { cliente_id: clienteA.clienteId });
    supA = await invitarConRol(db, a, 'supervisor');
    contA = await invitarConRol(db, a, 'contador');
  }, LENTO);

  it('la categoría de costo acepta la lista cerrada y null; rechaza lo demás', async () => {
    const base = {
      empresa_id: a.empresaId,
      obra_id: obraA,
      fecha: 1,
      tipo: 'SALIDA',
      categoria: 'Material',
      concepto: 'Cemento',
      monto: 100,
      metodo_pago: 'EFECTIVO',
    };
    await insertar(db, 'public.movimientos', { ...base, id: randomUUID(), categoria_costo: 'MATERIAL' });
    await insertar(db, 'public.movimientos', { ...base, id: randomUUID() });
    await expect(
      insertar(db, 'public.movimientos', { ...base, id: randomUUID(), categoria_costo: 'COMIDA' }),
    ).rejects.toThrow(/categoria_costo/);
  });

  // SEG-B3: el margen de la empresa ya no vive en `empresa_config` (la leen
  // supervisor y colaborador) sino en `empresa_margen`. Sin fila = 15 (la web
  // aplica el mismo respaldo); la fila nueva nace con 15.
  it('el margen de la empresa: sin fila la web usa 15, y la fila nace con 15 (solo admin la escribe)', async () => {
    const col = await db.query(
      `select 1 from information_schema.columns
        where table_schema = 'public' and table_name = 'empresa_config' and column_name = 'margen_objetivo'`,
    );
    expect(col.rows).toHaveLength(0);
    await comoUsuario(db, a.adminId, (tx) =>
      insertar(tx, 'public.empresa_margen', { empresa_id: a.empresaId }, { returning: false }),
    );
    const r = await db.query<{ m: number }>(
      'select margen_objetivo as m from public.empresa_margen where empresa_id = $1',
      [a.empresaId],
    );
    expect(r.rows[0].m).toBe(15);
    const leer = (u: string) =>
      comoUsuario(db, u, (tx) =>
        tx.query('select margen_objetivo from public.empresa_margen where empresa_id = $1', [a.empresaId]),
      );
    expect((await leer(a.adminId)).rows).toHaveLength(1);
    expect((await leer(contA)).rows).toHaveLength(1);
    expect((await leer(supA)).rows).toHaveLength(0);
    expect((await leer(clienteA.userId)).rows).toHaveLength(0);
    await expect(
      comoUsuario(db, contA, (tx) =>
        insertar(tx, 'public.empresa_margen', { empresa_id: a.empresaId, margen_objetivo: 3 }, { returning: false }),
      ),
    ).rejects.toThrow(/row-level security/);
  });

  it('el margen de la obra lo escribe el admin, lo lee el contador y NO el supervisor ni el cliente', async () => {
    await comoUsuario(db, a.adminId, (tx) =>
      insertar(tx, 'public.obra_margen_objetivo', {
        obra_id: obraA,
        empresa_id: a.empresaId,
        margen_objetivo: 20,
      }),
    );
    const leer = (u: string) =>
      comoUsuario(db, u, (tx) =>
        tx.query('select margen_objetivo from public.obra_margen_objetivo where obra_id = $1', [obraA]),
      );
    expect((await leer(contA)).rows).toHaveLength(1);
    expect((await leer(supA)).rows).toHaveLength(0);
    expect((await leer(clienteA.userId)).rows).toHaveLength(0);
    expect((await leer(b.adminId)).rows).toHaveLength(0);

    await expect(
      comoUsuario(db, supA, (tx) =>
        tx.query('update public.obra_margen_objetivo set margen_objetivo = 5 where obra_id = $1', [obraA]).then(
          (r) => {
            if (r.affectedRows === 0) throw new Error('row-level security: 0 filas');
          },
        ),
      ),
    ).rejects.toThrow(RLS);
  });

  it('el admin de B no pone margen a una obra de A', async () => {
    const otraObra = await crearObra(db, a.empresaId);
    await expect(
      comoUsuario(db, b.adminId, (tx) =>
        insertar(tx, 'public.obra_margen_objetivo', {
          obra_id: otraObra,
          empresa_id: b.empresaId,
          margen_objetivo: 10,
        }),
      ),
    ).rejects.toThrow(RLS);
  });

  it('un margen fuera de rango se rechaza', async () => {
    await expect(
      db.query(
        `insert into public.empresa_margen (empresa_id, margen_objetivo) values ($1, 100)
         on conflict (empresa_id) do update set margen_objetivo = 100`,
        [a.empresaId],
      ),
    ).rejects.toThrow(/margen/);
  });
});
