// 0037 — datos para facturar: quién ve y escribe los datos fiscales, las RPC del
// portal, las claves SAT y el estado fiscal de cada cobro, sobre Postgres real
// (PGlite). Cómo funciona el harness: `src/db/pglite/README.md`.

import { randomUUID } from 'node:crypto';
import { beforeAll, describe, expect, it } from 'vitest';
import type { PGlite } from '@electric-sql/pglite';
import { comoUsuario, dbMigrada } from './pglite/crear-db';
import {
  ahoraMs,
  crearClienteConCuenta,
  crearEmpresaDePrueba,
  crearMovimiento,
  crearObra,
  insertar,
  invitarConRol,
  type EmpresaDePrueba,
} from './pglite/escenarios';

const LENTO = 60_000;
const RLS = /row-level security/;

interface Resultado {
  ok: boolean;
  error?: string;
}

async function prenderFiscal(db: PGlite, empresaId: string): Promise<void> {
  await db.query(
    `update public.empresa_config
        set modulos = public.modulos_resolver(modulos || array['fiscal'])
      where empresa_id = $1`,
    [empresaId],
  );
}

async function crearCotizacionConPago(
  db: PGlite,
  empresaId: string,
  clienteId: string | null,
): Promise<{ cotizacionId: string; pagoId: string; partidaId: string }> {
  const cotizacionId = randomUUID();
  const seccionId = randomUUID();
  const partidaId = randomUUID();
  const pagoId = randomUUID();
  await insertar(db, 'public.cotizaciones', {
    id: cotizacionId,
    empresa_id: empresaId,
    cliente: 'Cliente',
    cliente_id: clienteId,
    nombre_proyecto: 'Casa',
    fecha: ahoraMs(),
    estado: 'ACEPTADA',
  });
  await insertar(db, 'public.secciones', {
    id: seccionId,
    empresa_id: empresaId,
    cotizacion_id: cotizacionId,
    nombre: 'Obra negra',
  });
  await insertar(db, 'public.partidas', {
    id: partidaId,
    empresa_id: empresaId,
    seccion_id: seccionId,
    descripcion: 'Muro de block',
    unidad: 'm2',
    cantidad: 10,
    precio_unitario: 500,
  });
  await insertar(db, 'public.pagos', {
    id: pagoId,
    empresa_id: empresaId,
    cotizacion_id: cotizacionId,
    fecha: ahoraMs(),
    monto: 5800,
    metodo: 'TRANSFERENCIA',
    concepto: 'Anticipo',
  });
  return { cotizacionId, pagoId, partidaId };
}

const DATOS_CLIENTE = {
  rfc: 'GODE561231GR8',
  razon: 'EMILIO GOMEZ DIAZ',
  regimen: '612',
  cp: '06300',
  uso: 'I01',
  correo: 'emilio@ejemplo.test',
};

async function confirmar(
  db: PGlite,
  userId: string,
  clienteId: string,
  cambios: Partial<typeof DATOS_CLIENTE> & { constancia?: string | null } = {},
): Promise<Resultado> {
  const d = { ...DATOS_CLIENTE, ...cambios };
  const r = await comoUsuario(db, userId, (tx) =>
    tx.query<{ r: Resultado }>(
      'select public.confirmar_mis_datos_fiscales($1, $2, $3, $4, $5, $6, $7, $8) as r',
      [clienteId, d.rfc, d.razon, d.regimen, d.cp, d.uso, d.correo, cambios.constancia ?? null],
    ),
  );
  return r.rows[0].r;
}

describe('0037 — datos para facturar', () => {
  let db: PGlite;
  let a: EmpresaDePrueba;
  let b: EmpresaDePrueba;
  let supA: string;
  let colA: string;
  let conA: string;
  let clienteA: { userId: string; clienteId: string };
  let clienteB: { userId: string; clienteId: string };

  beforeAll(async () => {
    db = await dbMigrada();
    a = await crearEmpresaDePrueba(db);
    b = await crearEmpresaDePrueba(db);
    await prenderFiscal(db, a.empresaId);
    supA = await invitarConRol(db, a, 'supervisor');
    colA = await invitarConRol(db, a, 'colaborador');
    conA = await invitarConRol(db, a, 'contador');
    clienteA = await crearClienteConCuenta(db, a.empresaId);
    clienteB = await crearClienteConCuenta(db, b.empresaId);
  }, LENTO);

  // ── Emisor ────────────────────────────────────────────────────────────────
  describe('empresa_fiscal (emisor)', () => {
    it('el admin y el contador la escriben y la leen', async () => {
      await comoUsuario(db, a.adminId, (tx) =>
        insertar(tx, 'public.empresa_fiscal', {
          empresa_id: a.empresaId,
          rfc: 'CPR200101AB1',
          razon_social: 'CONSTRUCTORA PRUEBA',
          regimen: '601',
          cp_fiscal: '64000',
        }),
      );
      const r = await comoUsuario(db, conA, async (tx) => {
        await tx.query(
          `update public.empresa_fiscal set cp_fiscal = '64010' where empresa_id = $1`,
          [a.empresaId],
        );
        return tx.query<{ cp_fiscal: string }>(
          'select cp_fiscal from public.empresa_fiscal where empresa_id = $1',
          [a.empresaId],
        );
      });
      expect(r.rows[0].cp_fiscal).toBe('64010');
    });

    it('supervisor, colaborador y cliente no la ven', async () => {
      for (const u of [supA, colA, clienteA.userId]) {
        const r = await comoUsuario(db, u, (tx) =>
          tx.query('select 1 from public.empresa_fiscal where empresa_id = $1', [a.empresaId]),
        );
        expect(r.rows).toEqual([]);
      }
    });

    it('el admin de otra empresa no puede escribir la de A', async () => {
      await expect(
        comoUsuario(db, b.adminId, (tx) =>
          insertar(tx, 'public.empresa_fiscal', { empresa_id: a.empresaId }, { returning: false }),
        ),
      ).rejects.toThrow(RLS);
    });

    it('rechaza un RFC o un CP con mal formato', async () => {
      await expect(
        db.query(`update public.empresa_fiscal set rfc = 'ABC' where empresa_id = $1`, [a.empresaId]),
      ).rejects.toThrow(/empresa_fiscal_rfc/);
      await expect(
        db.query(`update public.empresa_fiscal set cp_fiscal = '640' where empresa_id = $1`, [
          a.empresaId,
        ]),
      ).rejects.toThrow(/empresa_fiscal_cp/);
    });
  });

  // ── Receptor ──────────────────────────────────────────────────────────────
  describe('cliente_fiscal (receptor)', () => {
    it('el contador da de alta los datos de un cliente de su empresa', async () => {
      await comoUsuario(db, conA, (tx) =>
        insertar(tx, 'public.cliente_fiscal', {
          cliente_id: clienteA.clienteId,
          empresa_id: a.empresaId,
          rfc: 'XAXX010101000',
          razon_social: 'PUBLICO EN GENERAL',
        }),
      );
      const ve = await comoUsuario(db, a.adminId, (tx) =>
        tx.query('select 1 from public.cliente_fiscal where cliente_id = $1', [clienteA.clienteId]),
      );
      expect(ve.rows).toHaveLength(1);
    });

    it('no se puede colgar de un cliente de otra empresa (padre ajeno)', async () => {
      await expect(
        comoUsuario(db, a.adminId, (tx) =>
          insertar(
            tx,
            'public.cliente_fiscal',
            { cliente_id: clienteB.clienteId, empresa_id: a.empresaId },
            { returning: false },
          ),
        ),
      ).rejects.toThrow(RLS);
    });

    it('supervisor y colaborador no la ven; el cliente tampoco la lee directo', async () => {
      for (const u of [supA, colA, clienteA.userId]) {
        const r = await comoUsuario(db, u, (tx) =>
          tx.query('select 1 from public.cliente_fiscal where cliente_id = $1', [
            clienteA.clienteId,
          ]),
        );
        expect(r.rows).toEqual([]);
      }
    });
  });

  // ── Portal ────────────────────────────────────────────────────────────────
  describe('RPC del portal', () => {
    it('mis_datos_fiscales devuelve solo lo del propio cliente, con el módulo', async () => {
      const r = await comoUsuario(db, clienteA.userId, (tx) =>
        tx.query<{ r: { cliente_id: string; modulo_activo: boolean }[] }>(
          'select public.mis_datos_fiscales() as r',
        ),
      );
      expect(r.rows[0].r).toHaveLength(1);
      expect(r.rows[0].r[0].cliente_id).toBe(clienteA.clienteId);
      expect(r.rows[0].r[0].modulo_activo).toBe(true);

      const rb = await comoUsuario(db, clienteB.userId, (tx) =>
        tx.query<{ r: { modulo_activo: boolean }[] }>('select public.mis_datos_fiscales() as r'),
      );
      expect(rb.rows[0].r[0].modulo_activo).toBe(false);
    });

    it('el cliente confirma sus datos y queda sellado quién y cuándo', async () => {
      const constancia = `${a.empresaId}/constancias/${clienteA.clienteId}/csf.pdf`;
      const r = await confirmar(db, clienteA.userId, clienteA.clienteId, { constancia });
      expect(r).toMatchObject({ ok: true });
      const fila = await db.query<{
        rfc: string;
        fiscales_confirmados_por: string;
        constancia_path: string;
      }>('select * from public.cliente_fiscal where cliente_id = $1', [clienteA.clienteId]);
      expect(fila.rows[0].rfc).toBe(DATOS_CLIENTE.rfc);
      expect(fila.rows[0].fiscales_confirmados_por).toBe(clienteA.userId);
      expect(fila.rows[0].constancia_path).toBe(constancia);

      // Sin constancia nueva se conserva la anterior.
      await confirmar(db, clienteA.userId, clienteA.clienteId, { cp: '06301' });
      const otra = await db.query<{ constancia_path: string; cp_fiscal: string }>(
        'select constancia_path, cp_fiscal from public.cliente_fiscal where cliente_id = $1',
        [clienteA.clienteId],
      );
      expect(otra.rows[0]).toEqual({ constancia_path: constancia, cp_fiscal: '06301' });
    });

    it('no puede confirmar por otro cliente', async () => {
      const r = await confirmar(db, clienteA.userId, clienteB.clienteId);
      expect(r.ok).toBe(false);
    });

    it('si su contratista no usa el módulo, no se le pide nada', async () => {
      const r = await confirmar(db, clienteB.userId, clienteB.clienteId);
      expect(r).toMatchObject({ ok: false, error: expect.stringMatching(/no está pidiendo/) });
    });

    it('valida RFC, régimen, uso y la carpeta de la constancia', async () => {
      expect((await confirmar(db, clienteA.userId, clienteA.clienteId, { rfc: 'MAL' })).ok).toBe(false);
      expect((await confirmar(db, clienteA.userId, clienteA.clienteId, { regimen: '999' })).ok).toBe(
        false,
      );
      expect((await confirmar(db, clienteA.userId, clienteA.clienteId, { uso: 'D01' })).ok).toBe(false);
      const ajena = `${b.empresaId}/constancias/${clienteB.clienteId}/x.pdf`;
      expect(
        (await confirmar(db, clienteA.userId, clienteA.clienteId, { constancia: ajena })).ok,
      ).toBe(false);
    });

    it('anónimo y personal no pueden usar la RPC para escribir', async () => {
      const r = await confirmar(db, a.adminId, clienteA.clienteId);
      expect(r.ok).toBe(false);
    });
  });

  // ── Storage ───────────────────────────────────────────────────────────────
  describe('bucket fiscal', () => {
    const objeto = (bucketName: string) => ({ bucket_id: 'fiscal', name: bucketName });

    it('el cliente sube a SU carpeta de constancias y a ninguna otra', async () => {
      await comoUsuario(db, clienteA.userId, (tx) =>
        insertar(
          tx,
          'storage.objects',
          objeto(`${a.empresaId}/constancias/${clienteA.clienteId}/csf.pdf`),
          { returning: false },
        ),
      );
      await expect(
        comoUsuario(db, clienteA.userId, (tx) =>
          insertar(
            tx,
            'storage.objects',
            objeto(`${a.empresaId}/cfdi/${randomUUID()}/f.xml`),
            { returning: false },
          ),
        ),
      ).rejects.toThrow(RLS);
      await expect(
        comoUsuario(db, clienteA.userId, (tx) =>
          insertar(
            tx,
            'storage.objects',
            objeto(`${b.empresaId}/constancias/${clienteB.clienteId}/x.pdf`),
            { returning: false },
          ),
        ),
      ).rejects.toThrow(RLS);
    });

    it('el contador sube XML de su empresa; el supervisor no', async () => {
      await comoUsuario(db, conA, (tx) =>
        insertar(tx, 'storage.objects', objeto(`${a.empresaId}/cfdi/${randomUUID()}/f.xml`), {
          returning: false,
        }),
      );
      await expect(
        comoUsuario(db, supA, (tx) =>
          insertar(tx, 'storage.objects', objeto(`${a.empresaId}/cfdi/${randomUUID()}/f.xml`), {
            returning: false,
          }),
        ),
      ).rejects.toThrow(RLS);
    });
  });

  // ── Claves SAT ────────────────────────────────────────────────────────────
  describe('claves SAT', () => {
    it('el contador las guarda por RPC, sin tocar precio ni descripción', async () => {
      const { partidaId } = await crearCotizacionConPago(db, a.empresaId, null);
      const r = await comoUsuario(db, conA, (tx) =>
        tx.query<{ r: Resultado }>('select public.guardar_claves_sat($1, $2, $3, $4) as r', [
          'partidas',
          partidaId,
          '72151900',
          'mtk',
        ]),
      );
      expect(r.rows[0].r).toEqual({ ok: true });
      const fila = await db.query<{ clave_sat: string; unidad_sat: string; precio_unitario: number }>(
        'select clave_sat, unidad_sat, precio_unitario from public.partidas where id = $1',
        [partidaId],
      );
      expect(fila.rows[0]).toEqual({ clave_sat: '72151900', unidad_sat: 'MTK', precio_unitario: 500 });
    });

    it('rechaza otra empresa, otra tabla y claves mal escritas', async () => {
      const { partidaId } = await crearCotizacionConPago(db, a.empresaId, null);
      const llamar = (u: string, tabla: string, clave: string) =>
        comoUsuario(db, u, (tx) =>
          tx.query<{ r: Resultado }>('select public.guardar_claves_sat($1, $2, $3, $4) as r', [
            tabla,
            partidaId,
            clave,
            'E48',
          ]),
        ).then((x) => x.rows[0].r);
      expect((await llamar(b.adminId, 'partidas', '72111000')).ok).toBe(false);
      expect((await llamar(supA, 'partidas', '72111000')).ok).toBe(false);
      expect((await llamar(a.adminId, 'pagos', '72111000')).ok).toBe(false);
      expect((await llamar(a.adminId, 'partidas', '7211')).ok).toBe(false);
    });

    it('el CHECK de la columna frena un UPDATE directo con basura', async () => {
      const { partidaId } = await crearCotizacionConPago(db, a.empresaId, null);
      await expect(
        db.query(`update public.partidas set clave_sat = 'abc' where id = $1`, [partidaId]),
      ).rejects.toThrow(/clave_sat_formato/);
    });
  });

  // ── Cobros ────────────────────────────────────────────────────────────────
  describe('cobro_fiscal', () => {
    it('admin y contador marcan un pago como facturado; supervisor no lo ve', async () => {
      const { pagoId } = await crearCotizacionConPago(db, a.empresaId, clienteA.clienteId);
      const id = randomUUID();
      await comoUsuario(db, conA, (tx) =>
        insertar(tx, 'public.cobro_fiscal', {
          id,
          empresa_id: a.empresaId,
          pago_id: pagoId,
          estado: 'facturado',
          metodo_pago: 'PUE',
          uuid: randomUUID(),
        }),
      );
      const sup = await comoUsuario(db, supA, (tx) =>
        tx.query('select 1 from public.cobro_fiscal where id = $1', [id]),
      );
      expect(sup.rows).toEqual([]);
      const cli = await comoUsuario(db, clienteA.userId, (tx) =>
        tx.query('select 1 from public.cobro_fiscal where id = $1', [id]),
      );
      expect(cli.rows).toEqual([]);
    });

    it('no acepta un pago de otra empresa ni una SALIDA de caja', async () => {
      const deB = await crearCotizacionConPago(db, b.empresaId, null);
      await expect(
        comoUsuario(db, a.adminId, (tx) =>
          insertar(
            tx,
            'public.cobro_fiscal',
            { id: randomUUID(), empresa_id: a.empresaId, pago_id: deB.pagoId },
            { returning: false },
          ),
        ),
      ).rejects.toThrow(RLS);

      const obra = await crearObra(db, a.empresaId);
      const salida = await crearMovimiento(db, { empresaId: a.empresaId, obraId: obra, tipo: 'SALIDA' });
      await expect(
        comoUsuario(db, a.adminId, (tx) =>
          insertar(
            tx,
            'public.cobro_fiscal',
            { id: randomUUID(), empresa_id: a.empresaId, movimiento_id: salida },
            { returning: false },
          ),
        ),
      ).rejects.toThrow(RLS);

      const entrada = await crearMovimiento(db, { empresaId: a.empresaId, obraId: obra, tipo: 'ENTRADA' });
      await comoUsuario(db, a.adminId, (tx) =>
        insertar(tx, 'public.cobro_fiscal', {
          id: randomUUID(),
          empresa_id: a.empresaId,
          movimiento_id: entrada,
        }),
      );
    });

    it('un cobro tiene una sola fila fiscal y un origen', async () => {
      const { pagoId } = await crearCotizacionConPago(db, a.empresaId, null);
      await insertar(db, 'public.cobro_fiscal', { id: randomUUID(), empresa_id: a.empresaId, pago_id: pagoId });
      await expect(
        insertar(db, 'public.cobro_fiscal', { id: randomUUID(), empresa_id: a.empresaId, pago_id: pagoId }),
      ).rejects.toThrow(/uq_cobro_fiscal_pago/);
      await expect(
        insertar(db, 'public.cobro_fiscal', { id: randomUUID(), empresa_id: a.empresaId }),
      ).rejects.toThrow(/cobro_fiscal_origen/);
    });

    it('dedup por folio: una factura PUE ampara un solo cobro; una PPD varios', async () => {
      const folio = randomUUID().toUpperCase();
      const p1 = await crearCotizacionConPago(db, a.empresaId, null);
      const p2 = await crearCotizacionConPago(db, a.empresaId, null);
      await insertar(db, 'public.cobro_fiscal', {
        id: randomUUID(), empresa_id: a.empresaId, pago_id: p1.pagoId,
        estado: 'facturado', metodo_pago: 'PUE', uuid: folio,
      });
      await expect(
        insertar(db, 'public.cobro_fiscal', {
          id: randomUUID(), empresa_id: a.empresaId, pago_id: p2.pagoId,
          estado: 'facturado', metodo_pago: 'PUE', uuid: folio.toLowerCase(),
        }),
      ).rejects.toThrow(/uq_cobro_fiscal_uuid_pue/);

      const ppd = randomUUID();
      const p3 = await crearCotizacionConPago(db, a.empresaId, null);
      const p4 = await crearCotizacionConPago(db, a.empresaId, null);
      for (const [p, n] of [[p3.pagoId, 1], [p4.pagoId, 2]] as const) {
        await insertar(db, 'public.cobro_fiscal', {
          id: randomUUID(), empresa_id: a.empresaId, pago_id: p,
          estado: 'facturado', metodo_pago: 'PPD', uuid: ppd, parcialidad: n,
        });
      }
    });

    it('"facturado" exige folio, y los archivos viven en la carpeta de la empresa', async () => {
      const { pagoId } = await crearCotizacionConPago(db, a.empresaId, null);
      await expect(
        insertar(db, 'public.cobro_fiscal', {
          id: randomUUID(), empresa_id: a.empresaId, pago_id: pagoId, estado: 'facturado',
        }),
      ).rejects.toThrow(/cobro_fiscal_facturado_con_folio/);
      await expect(
        insertar(db, 'public.cobro_fiscal', {
          id: randomUUID(), empresa_id: a.empresaId, pago_id: pagoId,
          xml_path: `${b.empresaId}/cfdi/x.xml`,
        }),
      ).rejects.toThrow(/cobro_fiscal_rutas/);
    });
  });
});
