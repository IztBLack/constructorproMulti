// 0043 — Seguridad en obra, garantías (postventa) y herramienta.
//
// Qué se prueba (ver el encabezado de la migración):
//   · aislamiento entre empresas y "el padre es de la misma empresa" (0019);
//   · D8: `incidente_salud` y la carpeta `incidentes/` del bucket son SOLO del
//     admin; el supervisor y el contador ven el incidente pero no la lesión;
//   · el colaborador no ve nada de F7;
//   · el cliente crea reportes con `reportar_garantia`, ve SOLO los de sus
//     obras (ni los de otra obra de la misma empresa ni los de otra empresa),
//     sube fotos solo a su carpeta y mientras el reporte siga abierto;
//   · herramienta: un solo préstamo abierto, la devolución cambia el estado,
//     el historial no se reescribe y una herramienta de baja no se presta.

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

const RLS = /row-level security/;
const LENTO = 60_000;

async function crearColaborador(db: PGlite, empresaId: string): Promise<string> {
  const puesto = randomUUID();
  await insertar(db, 'public.puestos', { id: puesto, nombre: 'Albañil', empresa_id: empresaId });
  const id = randomUUID();
  await insertar(db, 'public.colaboradores', {
    id,
    nombre: 'Juan Pérez',
    puesto_id: puesto,
    tipo_pago: 'DIA',
    empresa_id: empresaId,
  });
  return id;
}

async function crearIncidente(
  c: Consultable,
  empresaId: string,
  obraId: string,
  extra: Record<string, unknown> = {},
): Promise<string> {
  const id = randomUUID();
  await insertar(
    c,
    'public.incidente',
    {
      id,
      empresa_id: empresaId,
      obra_id: obraId,
      fecha: Date.now(),
      tipo: 'ACCIDENTE',
      descripcion: 'Se resbaló al bajar del andamio',
      ...extra,
    },
    { returning: false },
  );
  return id;
}

async function reportar(
  c: Consultable,
  obraId: string,
  descripcion = 'Se cuarteó el muro de la recámara',
  id: string = randomUUID(),
): Promise<{ ok: boolean; error?: string; id?: string }> {
  const r = await c.query<{ r: { ok: boolean; error?: string; id?: string } }>(
    'select public.reportar_garantia($1, $2, $3, $4) as r',
    [id, obraId, descripcion, 'Recámara 2'],
  );
  return r.rows[0].r;
}

describe('0043 seguridad, postventa y herramienta', () => {
  let db: PGlite;
  let a: EmpresaDePrueba;
  let b: EmpresaDePrueba;
  let obraA: string;
  let obraAOtroCliente: string;
  let obraB: string;
  let supervisorA: string;
  let colaboradorA: string;
  let contadorA: string;
  let clienteA: { userId: string; clienteId: string };
  let clienteA2: { userId: string; clienteId: string };
  let clienteB: { userId: string; clienteId: string };
  let colabA: string;
  let colabB: string;

  beforeAll(async () => {
    db = await dbMigrada();
    a = await crearEmpresaDePrueba(db, 'Constructora A');
    b = await crearEmpresaDePrueba(db, 'Constructora B');
    supervisorA = await invitarConRol(db, a, 'supervisor');
    colaboradorA = await invitarConRol(db, a, 'colaborador');
    contadorA = await invitarConRol(db, a, 'contador');
    clienteA = await crearClienteConCuenta(db, a.empresaId);
    clienteA2 = await crearClienteConCuenta(db, a.empresaId);
    clienteB = await crearClienteConCuenta(db, b.empresaId);
    obraA = await crearObra(db, a.empresaId, { cliente_id: clienteA.clienteId });
    obraAOtroCliente = await crearObra(db, a.empresaId, { cliente_id: clienteA2.clienteId });
    obraB = await crearObra(db, b.empresaId, { cliente_id: clienteB.clienteId });
    colabA = await crearColaborador(db, a.empresaId);
    colabB = await crearColaborador(db, b.empresaId);
  }, LENTO);

  // ── Revisión diaria ──────────────────────────────────────────────────────

  describe('revisión diaria', () => {
    const puntos = [
      { clave: 'epp_casco', texto: 'Todos traen casco', resultado: 'CUMPLE' },
      { clave: 'orden', texto: 'Orden y limpieza', resultado: 'NO_CUMPLE', nota: 'Varilla tirada' },
      { clave: 'excavacion', texto: 'Excavaciones', resultado: 'NO_APLICA' },
    ];

    it('el supervisor la registra; la base sella quién y cuándo', async () => {
      const id = randomUUID();
      await comoUsuario(db, supervisorA, (tx) =>
        insertar(
          tx,
          'public.seguridad_checklist',
          { id, empresa_id: a.empresaId, obra_id: obraA, fecha: 1_700_000_000_000, puntos: JSON.stringify(puntos) },
          { returning: false },
        ),
      );
      const r = await db.query<{ revisado_por: string; registrada_en: string; firmo_nombre: string }>(
        'select revisado_por, registrada_en, firmo_nombre from public.seguridad_checklist where id = $1',
        [id],
      );
      expect(r.rows[0].revisado_por).toBe(supervisorA);
      expect(Number(r.rows[0].registrada_en)).toBeGreaterThan(0);
      expect(r.rows[0].firmo_nombre).toBe('Prueba');
    });

    it('una sola revisión viva por obra y día', async () => {
      const fila = () => ({
        id: randomUUID(),
        empresa_id: a.empresaId,
        obra_id: obraA,
        fecha: 1_700_086_400_000,
        puntos: '[]',
      });
      await comoUsuario(db, a.adminId, (tx) =>
        insertar(tx, 'public.seguridad_checklist', fila(), { returning: false }),
      );
      await expect(
        comoUsuario(db, a.adminId, (tx) => insertar(tx, 'public.seguridad_checklist', fila(), { returning: false })),
      ).rejects.toThrow(/uq_seguridad_checklist_obra_dia|duplicate key/);
    });

    it('rechaza puntos con un resultado que no existe', async () => {
      await expect(
        comoUsuario(db, a.adminId, (tx) =>
          insertar(
            tx,
            'public.seguridad_checklist',
            {
              id: randomUUID(),
              empresa_id: a.empresaId,
              obra_id: obraA,
              fecha: 1_700_172_800_000,
              puntos: JSON.stringify([{ clave: 'x', texto: 'X', resultado: 'MAS_O_MENOS' }]),
            },
            { returning: false },
          ),
        ),
      ).rejects.toThrow(/check constraint/);
    });

    it('no se cuelga de una obra de otra empresa; el contador y el colaborador no la ven', async () => {
      await expect(
        comoUsuario(db, a.adminId, (tx) =>
          insertar(
            tx,
            'public.seguridad_checklist',
            { id: randomUUID(), empresa_id: a.empresaId, obra_id: obraB, fecha: 1, puntos: '[]' },
            { returning: false },
          ),
        ),
      ).rejects.toThrow(RLS);

      const id = randomUUID();
      await comoUsuario(db, a.adminId, (tx) =>
        insertar(
          tx,
          'public.seguridad_checklist',
          { id, empresa_id: a.empresaId, obra_id: obraA, fecha: 2, puntos: '[]' },
          { returning: false },
        ),
      );
      for (const quien of [contadorA, colaboradorA, clienteA.userId, b.adminId]) {
        const ve = await comoUsuario(db, quien, (tx) => idsVisibles(tx, 'public.seguridad_checklist', [id]));
        expect(ve).toEqual([]);
      }
    });
  });

  // ── EPP ───────────────────────────────────────────────────────────────────

  describe('entrega de EPP', () => {
    it('el supervisor entrega EPP a un colaborador de su empresa', async () => {
      const id = randomUUID();
      await comoUsuario(db, supervisorA, (tx) =>
        insertar(
          tx,
          'public.epp_entrega',
          { id, empresa_id: a.empresaId, colaborador_id: colabA, articulo: 'Casco', fecha: Date.now() },
          { returning: false },
        ),
      );
      const ve = await comoUsuario(db, a.adminId, (tx) => idsVisibles(tx, 'public.epp_entrega', [id]));
      expect(ve).toEqual([id]);
      const noVen = await Promise.all(
        [contadorA, colaboradorA, b.adminId].map((u) =>
          comoUsuario(db, u, (tx) => idsVisibles(tx, 'public.epp_entrega', [id])),
        ),
      );
      expect(noVen).toEqual([[], [], []]);
    });

    it('no se entrega EPP a un colaborador de otra empresa', async () => {
      await expect(
        comoUsuario(db, a.adminId, (tx) =>
          insertar(
            tx,
            'public.epp_entrega',
            { id: randomUUID(), empresa_id: a.empresaId, colaborador_id: colabB, articulo: 'Botas', fecha: 1 },
            { returning: false },
          ),
        ),
      ).rejects.toThrow(RLS);
    });

    it('la evidencia solo puede apuntar a la carpeta de esa entrega', async () => {
      const id = randomUUID();
      await expect(
        comoUsuario(db, a.adminId, (tx) =>
          insertar(
            tx,
            'public.epp_entrega',
            {
              id,
              empresa_id: a.empresaId,
              colaborador_id: colabA,
              articulo: 'Guantes',
              fecha: 1,
              evidencia_path: `${a.empresaId}/epp/${randomUUID()}/firma.png`,
              evidencia_tipo: 'FIRMA',
            },
            { returning: false },
          ),
        ),
      ).rejects.toThrow(RLS);
    });
  });

  // ── Incidentes y datos de salud (D8) ──────────────────────────────────────

  describe('incidentes y datos de salud', () => {
    let incidente: string;
    let salud: string;

    beforeAll(async () => {
      incidente = await comoUsuario(db, supervisorA, (tx) =>
        crearIncidente(tx, a.empresaId, obraA, { colaborador_id: colabA, dias_incapacidad: 3 }),
      );
      salud = randomUUID();
      await comoUsuario(db, a.adminId, (tx) =>
        insertar(
          tx,
          'public.incidente_salud',
          {
            id: salud,
            empresa_id: a.empresaId,
            incidente_id: incidente,
            tipo_lesion: 'TORCEDURA',
            parte_cuerpo: 'PIERNA_PIE',
            atencion: 'IMSS',
          },
          { returning: false },
        ),
      );
    }, LENTO);

    it('admin, supervisor y contador ven el incidente; colaborador, cliente y otra empresa no', async () => {
      for (const u of [a.adminId, supervisorA, contadorA]) {
        expect(await comoUsuario(db, u, (tx) => idsVisibles(tx, 'public.incidente', [incidente]))).toEqual([
          incidente,
        ]);
      }
      for (const u of [colaboradorA, clienteA.userId, b.adminId]) {
        expect(await comoUsuario(db, u, (tx) => idsVisibles(tx, 'public.incidente', [incidente]))).toEqual([]);
      }
    });

    it('SOLO el admin lee incidente_salud (el supervisor NO)', async () => {
      expect(await comoUsuario(db, a.adminId, (tx) => idsVisibles(tx, 'public.incidente_salud', [salud]))).toEqual([
        salud,
      ]);
      for (const u of [supervisorA, contadorA, colaboradorA, clienteA.userId, b.adminId]) {
        expect(await comoUsuario(db, u, (tx) => idsVisibles(tx, 'public.incidente_salud', [salud]))).toEqual([]);
      }
    });

    it('el supervisor no puede escribir datos de salud ni cambiarlos', async () => {
      const otro = await comoUsuario(db, supervisorA, (tx) => crearIncidente(tx, a.empresaId, obraA));
      await expect(
        comoUsuario(db, supervisorA, (tx) =>
          insertar(
            tx,
            'public.incidente_salud',
            { id: randomUUID(), empresa_id: a.empresaId, incidente_id: otro },
            { returning: false },
          ),
        ),
      ).rejects.toThrow(RLS);
      const r = await comoUsuario(db, supervisorA, (tx) =>
        tx.query(`update public.incidente_salud set nota = 'x' where id = $1`, [salud]),
      );
      expect(r.affectedRows ?? 0).toBe(0);
    });

    it('el admin de B no cuelga datos de salud de un incidente de A', async () => {
      await expect(
        comoUsuario(db, b.adminId, (tx) =>
          insertar(
            tx,
            'public.incidente_salud',
            { id: randomUUID(), empresa_id: b.empresaId, incidente_id: incidente },
            { returning: false },
          ),
        ),
      ).rejects.toThrow(RLS);
    });

    it('la nota de salud es corta (no es un expediente)', async () => {
      const otro = await comoUsuario(db, a.adminId, (tx) => crearIncidente(tx, a.empresaId, obraA));
      await expect(
        comoUsuario(db, a.adminId, (tx) =>
          insertar(
            tx,
            'public.incidente_salud',
            { id: randomUUID(), empresa_id: a.empresaId, incidente_id: otro, nota: 'x'.repeat(281) },
            { returning: false },
          ),
        ),
      ).rejects.toThrow(/check constraint/);
    });

    it('incapacidad y aviso al IMSS solo en accidentes', async () => {
      await expect(
        comoUsuario(db, a.adminId, (tx) =>
          crearIncidente(tx, a.empresaId, obraA, { tipo: 'CASI_ACCIDENTE', dias_incapacidad: 2 }),
        ),
      ).rejects.toThrow(/incidente_incapacidad_solo_accidente/);
    });

    it('el supervisor puede marcar el aviso hecho, pero el comprobante lo pone el admin', async () => {
      const r = await comoUsuario(db, supervisorA, (tx) =>
        tx.query(`update public.incidente set aviso_imss_hecho = true, aviso_imss_fecha = 1 where id = $1`, [
          incidente,
        ]),
      );
      expect(r.affectedRows).toBe(1);
      const path = `${a.empresaId}/incidentes/${incidente}/st7.pdf`;
      await expect(
        comoUsuario(db, supervisorA, (tx) =>
          tx.query(`update public.incidente set comprobante_path = $2 where id = $1`, [incidente, path]),
        ),
      ).rejects.toThrow(/INCIDENTE_SOLO_ADMIN/);
      const ok = await comoUsuario(db, a.adminId, (tx) =>
        tx.query(`update public.incidente set comprobante_path = $2 where id = $1`, [incidente, path]),
      );
      expect(ok.affectedRows).toBe(1);
    });

    it('storage: la carpeta incidentes/ es solo del admin; epp/ la abre también el supervisor', async () => {
      const pathInc = `${a.empresaId}/incidentes/${incidente}/st7.pdf`;
      await expect(
        comoUsuario(db, supervisorA, (tx) =>
          tx.query(`insert into storage.objects (bucket_id, name) values ('seguridad', $1)`, [pathInc]),
        ),
      ).rejects.toThrow(RLS);
      await comoUsuario(db, a.adminId, (tx) =>
        tx.query(`insert into storage.objects (bucket_id, name) values ('seguridad', $1)`, [pathInc]),
      );
      const veSup = await comoUsuario(db, supervisorA, (tx) =>
        tx.query(`select 1 from storage.objects where bucket_id = 'seguridad' and name = $1`, [pathInc]),
      );
      expect(veSup.rows).toHaveLength(0);
      const veAdmin = await comoUsuario(db, a.adminId, (tx) =>
        tx.query(`select 1 from storage.objects where bucket_id = 'seguridad' and name = $1`, [pathInc]),
      );
      expect(veAdmin.rows).toHaveLength(1);

      const entrega = randomUUID();
      await comoUsuario(db, supervisorA, (tx) =>
        insertar(
          tx,
          'public.epp_entrega',
          { id: entrega, empresa_id: a.empresaId, colaborador_id: colabA, articulo: 'Lentes', fecha: 1 },
          { returning: false },
        ),
      );
      const pathEpp = `${a.empresaId}/epp/${entrega}/firma.png`;
      await comoUsuario(db, supervisorA, (tx) =>
        tx.query(`insert into storage.objects (bucket_id, name) values ('seguridad', $1)`, [pathEpp]),
      );
      for (const [u, n] of [
        [supervisorA, 1],
        [contadorA, 0],
        [colaboradorA, 0],
        [b.adminId, 0],
      ] as const) {
        const r = await comoUsuario(db, u, (tx) =>
          tx.query(`select 1 from storage.objects where bucket_id = 'seguridad' and name = $1`, [pathEpp]),
        );
        expect(r.rows).toHaveLength(n);
      }
      // Carpeta inventada (entrega que no existe): no se sube.
      await expect(
        comoUsuario(db, supervisorA, (tx) =>
          tx.query(`insert into storage.objects (bucket_id, name) values ('seguridad', $1)`, [
            `${a.empresaId}/epp/${randomUUID()}/x.png`,
          ]),
        ),
      ).rejects.toThrow(RLS);
    });
  });

  // ── Garantías ─────────────────────────────────────────────────────────────

  describe('garantías (postventa)', () => {
    it('el cliente reporta en SU obra; el reporte queda como origen CLIENTE y abierto', async () => {
      const r = await comoUsuario(db, clienteA.userId, (tx) => reportar(tx, obraA));
      expect(r.ok).toBe(true);
      const f = await db.query<{ origen: string; estado: string; cliente_id: string; reportado_por: string }>(
        'select origen, estado, cliente_id, reportado_por from public.garantia_reporte where id = $1',
        [r.id],
      );
      expect(f.rows[0]).toMatchObject({
        origen: 'CLIENTE',
        estado: 'ABIERTO',
        cliente_id: clienteA.clienteId,
        reportado_por: clienteA.userId,
      });
    });

    it('reintentar el mismo envío no duplica', async () => {
      const id = randomUUID();
      const r1 = await comoUsuario(db, clienteA.userId, (tx) => reportar(tx, obraA, 'Gotea la regadera', id));
      const r2 = await comoUsuario(db, clienteA.userId, (tx) => reportar(tx, obraA, 'Gotea la regadera', id));
      expect(r1.ok && r2.ok).toBe(true);
      const n = await db.query<{ n: number }>('select count(*)::int as n from public.garantia_reporte where id = $1', [
        id,
      ]);
      expect(n.rows[0].n).toBe(1);
    });

    it('el cliente NO reporta en una obra ajena (misma empresa u otra) ni inserta directo', async () => {
      const r1 = await comoUsuario(db, clienteA.userId, (tx) => reportar(tx, obraAOtroCliente));
      expect(r1).toMatchObject({ ok: false, error: 'No autorizado' });
      const r2 = await comoUsuario(db, clienteA.userId, (tx) => reportar(tx, obraB));
      expect(r2).toMatchObject({ ok: false, error: 'No autorizado' });
      await expect(
        comoUsuario(db, clienteA.userId, (tx) =>
          insertar(
            tx,
            'public.garantia_reporte',
            { id: randomUUID(), empresa_id: a.empresaId, obra_id: obraA, origen: 'CLIENTE', descripcion: 'x' },
            { returning: false },
          ),
        ),
      ).rejects.toThrow(RLS);
    });

    it('cada cliente ve solo los reportes de sus obras', async () => {
      const mio = (await comoUsuario(db, clienteA.userId, (tx) => reportar(tx, obraA))).id!;
      const deOtro = (await comoUsuario(db, clienteA2.userId, (tx) => reportar(tx, obraAOtroCliente))).id!;
      const deB = (await comoUsuario(db, clienteB.userId, (tx) => reportar(tx, obraB))).id!;
      const ids = [mio, deOtro, deB].sort();
      expect(await comoUsuario(db, clienteA.userId, (tx) => idsVisibles(tx, 'public.garantia_reporte', ids))).toEqual([
        mio,
      ]);
      expect(await comoUsuario(db, clienteB.userId, (tx) => idsVisibles(tx, 'public.garantia_reporte', ids))).toEqual([
        deB,
      ]);
      // Oficina de A: los dos de A; contador lee; colaborador nada.
      expect(
        await comoUsuario(db, contadorA, (tx) => idsVisibles(tx, 'public.garantia_reporte', ids)),
      ).toEqual([mio, deOtro].sort());
      expect(await comoUsuario(db, colaboradorA, (tx) => idsVisibles(tx, 'public.garantia_reporte', ids))).toEqual(
        [],
      );
    });

    it('la oficina responde: no puede reescribir lo que dijo el cliente, y "no procede" exige respuesta', async () => {
      const id = (await comoUsuario(db, clienteA.userId, (tx) => reportar(tx, obraA, 'Se botó el piso'))).id!;
      await comoUsuario(db, supervisorA, (tx) =>
        tx.query(
          `update public.garantia_reporte set descripcion = 'otra cosa', estado = 'EN_REVISION', respuesta = 'Vamos el lunes' where id = $1`,
          [id],
        ),
      );
      const f = await db.query<{ descripcion: string; estado: string; cerrado_en: string | null }>(
        'select descripcion, estado, cerrado_en from public.garantia_reporte where id = $1',
        [id],
      );
      expect(f.rows[0]).toMatchObject({ descripcion: 'Se botó el piso', estado: 'EN_REVISION', cerrado_en: null });

      await expect(
        comoUsuario(db, supervisorA, (tx) =>
          tx.query(`update public.garantia_reporte set estado = 'NO_PROCEDE', respuesta = '' where id = $1`, [id]),
        ),
      ).rejects.toThrow(/garantia_no_procede_con_respuesta/);

      await comoUsuario(db, a.adminId, (tx) =>
        tx.query(`update public.garantia_reporte set estado = 'RESUELTO' where id = $1`, [id]),
      );
      const g = await db.query<{ cerrado_en: string | null }>(
        'select cerrado_en from public.garantia_reporte where id = $1',
        [id],
      );
      expect(Number(g.rows[0].cerrado_en)).toBeGreaterThan(0);
    });

    it('el cliente no cambia el estado de su reporte', async () => {
      const id = (await comoUsuario(db, clienteA.userId, (tx) => reportar(tx, obraA))).id!;
      const r = await comoUsuario(db, clienteA.userId, (tx) =>
        tx.query(`update public.garantia_reporte set estado = 'RESUELTO' where id = $1`, [id]),
      );
      expect(r.affectedRows ?? 0).toBe(0);
    });

    it('storage por carpeta: el cliente sube a SU reporte abierto; no a otro ni a uno cerrado', async () => {
      const mio = (await comoUsuario(db, clienteA.userId, (tx) => reportar(tx, obraA))).id!;
      const ajeno = (await comoUsuario(db, clienteA2.userId, (tx) => reportar(tx, obraAOtroCliente))).id!;
      const pathMio = `${a.empresaId}/${obraA}/${mio}/${randomUUID()}.jpg`;
      await comoUsuario(db, clienteA.userId, async (tx) => {
        await tx.query(`insert into storage.objects (bucket_id, name) values ('postventa', $1)`, [pathMio]);
        await insertar(
          tx,
          'public.garantia_foto',
          { id: randomUUID(), empresa_id: a.empresaId, reporte_id: mio, path: pathMio, subida_por_cliente: true },
          { returning: false },
        );
      });
      // Lo ve él y la oficina; el otro cliente y la empresa B no.
      const ve = async (u: string) =>
        (
          await comoUsuario(db, u, (tx) =>
            tx.query(`select 1 from storage.objects where bucket_id = 'postventa' and name = $1`, [pathMio]),
          )
        ).rows.length;
      expect(await ve(clienteA.userId)).toBe(1);
      expect(await ve(contadorA)).toBe(1);
      expect(await ve(clienteA2.userId)).toBe(0);
      expect(await ve(b.adminId)).toBe(0);
      expect(await ve(colaboradorA)).toBe(0);

      // A la carpeta del reporte de otro cliente: no.
      await expect(
        comoUsuario(db, clienteA.userId, (tx) =>
          tx.query(`insert into storage.objects (bucket_id, name) values ('postventa', $1)`, [
            `${a.empresaId}/${obraAOtroCliente}/${ajeno}/x.jpg`,
          ]),
        ),
      ).rejects.toThrow(RLS);
      // Con su reporte en carpeta de OTRA obra (ruta inventada): no.
      await expect(
        comoUsuario(db, clienteA.userId, (tx) =>
          tx.query(`insert into storage.objects (bucket_id, name) values ('postventa', $1)`, [
            `${a.empresaId}/${obraAOtroCliente}/${mio}/x.jpg`,
          ]),
        ),
      ).rejects.toThrow(RLS);
      // Cerrado el reporte, ya no sube más.
      await comoUsuario(db, a.adminId, (tx) =>
        tx.query(`update public.garantia_reporte set estado = 'RESUELTO' where id = $1`, [mio]),
      );
      await expect(
        comoUsuario(db, clienteA.userId, (tx) =>
          tx.query(`insert into storage.objects (bucket_id, name) values ('postventa', $1)`, [
            `${a.empresaId}/${obraA}/${mio}/y.jpg`,
          ]),
        ),
      ).rejects.toThrow(RLS);
      // El cliente no borra la evidencia.
      const del = await comoUsuario(db, clienteA.userId, (tx) =>
        tx.query(`delete from storage.objects where bucket_id = 'postventa' and name = $1`, [pathMio]),
      );
      expect(del.affectedRows ?? 0).toBe(0);
    });

    it('periodo de garantía: el cliente ve el de su obra; solo el admin lo escribe', async () => {
      const id = randomUUID();
      await expect(
        comoUsuario(db, supervisorA, (tx) =>
          insertar(
            tx,
            'public.obra_garantia',
            { id, empresa_id: a.empresaId, obra_id: obraA, meses: 12 },
            { returning: false },
          ),
        ),
      ).rejects.toThrow(RLS);
      await comoUsuario(db, a.adminId, (tx) =>
        insertar(
          tx,
          'public.obra_garantia',
          { id, empresa_id: a.empresaId, obra_id: obraA, meses: 12, entrega_fecha: 1 },
          { returning: false },
        ),
      );
      expect(await comoUsuario(db, clienteA.userId, (tx) => idsVisibles(tx, 'public.obra_garantia', [id]))).toEqual([
        id,
      ]);
      expect(await comoUsuario(db, clienteA2.userId, (tx) => idsVisibles(tx, 'public.obra_garantia', [id]))).toEqual(
        [],
      );
    });

    it('postventa_disponible: solo con el módulo prendido y solo para el cliente de la obra', async () => {
      const disp = async (u: string, obra: string) =>
        (
          await comoUsuario(db, u, (tx) =>
            tx.query<{ d: boolean }>('select public.postventa_disponible($1) as d', [obra]),
          )
        ).rows[0].d;
      expect(await disp(clienteA.userId, obraA)).toBe(false);
      await db.query(
        `update public.empresa_config set modulos = array_append(modulos, 'postventa') where empresa_id = $1`,
        [a.empresaId],
      );
      expect(await disp(clienteA.userId, obraA)).toBe(true);
      expect(await disp(clienteA2.userId, obraA)).toBe(false);
      expect(await disp(clienteB.userId, obraA)).toBe(false);
    });
  });

  // ── Herramienta ───────────────────────────────────────────────────────────

  describe('herramienta', () => {
    async function crearHerramienta(u: string, extra: Record<string, unknown> = {}): Promise<string> {
      const id = randomUUID();
      await comoUsuario(db, u, (tx) =>
        insertar(
          tx,
          'public.herramienta',
          { id, empresa_id: a.empresaId, nombre: 'Revolvedora', tipo: 'MAQUINARIA', costo: 18500, ...extra },
          { returning: false },
        ),
      );
      return id;
    }

    it('el contador lee el inventario (con costos) pero no escribe; el colaborador no ve nada', async () => {
      const h = await crearHerramienta(supervisorA);
      expect(await comoUsuario(db, contadorA, (tx) => idsVisibles(tx, 'public.herramienta', [h]))).toEqual([h]);
      expect(await comoUsuario(db, colaboradorA, (tx) => idsVisibles(tx, 'public.herramienta', [h]))).toEqual([]);
      expect(await comoUsuario(db, b.adminId, (tx) => idsVisibles(tx, 'public.herramienta', [h]))).toEqual([]);
      await expect(
        comoUsuario(db, contadorA, (tx) =>
          insertar(tx, 'public.herramienta', { id: randomUUID(), empresa_id: a.empresaId, nombre: 'x' }, {
            returning: false,
          }),
        ),
      ).rejects.toThrow(RLS);
    });

    it('un solo préstamo abierto; al devolverla queda en el estado en que regresó', async () => {
      const h = await crearHerramienta(a.adminId, { clave: `H-${randomUUID().slice(0, 4)}` });
      const asig = randomUUID();
      await comoUsuario(db, supervisorA, (tx) =>
        insertar(
          tx,
          'public.herramienta_asignacion',
          { id: asig, empresa_id: a.empresaId, herramienta_id: h, obra_id: obraA, colaborador_id: colabA, desde: 1 },
          { returning: false },
        ),
      );
      await expect(
        comoUsuario(db, supervisorA, (tx) =>
          insertar(
            tx,
            'public.herramienta_asignacion',
            { id: randomUUID(), empresa_id: a.empresaId, herramienta_id: h, obra_id: obraA, desde: 2 },
            { returning: false },
          ),
        ),
      ).rejects.toThrow(/uq_herramienta_asignacion_abierta|duplicate key/);

      await comoUsuario(db, supervisorA, (tx) =>
        tx.query(
          `update public.herramienta_asignacion set hasta = 5, estado_regreso = 'REPARACION', recibio_nombre = 'Beto' where id = $1`,
          [asig],
        ),
      );
      const e = await db.query<{ estado: string }>('select estado from public.herramienta where id = $1', [h]);
      expect(e.rows[0].estado).toBe('REPARACION');

      // Historial: no se reescribe.
      await expect(
        comoUsuario(db, a.adminId, (tx) =>
          tx.query(`update public.herramienta_asignacion set recibio_nombre = 'Otro' where id = $1`, [asig]),
        ),
      ).rejects.toThrow(/HERRAMIENTA_HISTORIAL/);
    });

    it('no se presta una herramienta de baja, ni sin destino, ni a una obra de otra empresa', async () => {
      const baja = await crearHerramienta(a.adminId, { estado: 'BAJA' });
      await expect(
        comoUsuario(db, a.adminId, (tx) =>
          insertar(
            tx,
            'public.herramienta_asignacion',
            { id: randomUUID(), empresa_id: a.empresaId, herramienta_id: baja, obra_id: obraA, desde: 1 },
            { returning: false },
          ),
        ),
      ).rejects.toThrow(/HERRAMIENTA_BAJA/);

      const h = await crearHerramienta(a.adminId);
      await expect(
        comoUsuario(db, a.adminId, (tx) =>
          insertar(
            tx,
            'public.herramienta_asignacion',
            { id: randomUUID(), empresa_id: a.empresaId, herramienta_id: h, desde: 1 },
            { returning: false },
          ),
        ),
      ).rejects.toThrow(/HERRAMIENTA_SIN_DESTINO/);
      await expect(
        comoUsuario(db, a.adminId, (tx) =>
          insertar(
            tx,
            'public.herramienta_asignacion',
            { id: randomUUID(), empresa_id: a.empresaId, herramienta_id: h, obra_id: obraB, desde: 1 },
            { returning: false },
          ),
        ),
      ).rejects.toThrow(RLS);
    });

    it('el número de inventario no se repite dentro de la empresa', async () => {
      const clave = `INV-${randomUUID().slice(0, 6)}`;
      await crearHerramienta(a.adminId, { clave });
      await expect(crearHerramienta(a.adminId, { clave: clave.toLowerCase() })).rejects.toThrow(
        /uq_herramienta_clave|duplicate key/,
      );
    });
  });
});
