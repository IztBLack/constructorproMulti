// 0040 — Cumplimiento (SIROC, REPSE, ICSOE/SISUB, expediente de subcontratistas,
// datos IMSS de colaboradores) + subcontratos.
//
// Qué se prueba (ver el encabezado de la migración):
//   · aislamiento entre empresas y "el padre es de la misma empresa" (0019);
//   · admin y contador leen y escriben todo;
//   · el supervisor lee SOLO los subcontratos (con renglones y pagos): nada de
//     datos IMSS, SIROC, REPSE, padrón de subcontratistas ni su expediente;
//   · colaborador y cliente no ven nada;
//   · formatos de NSS/CURP/RFC y el borrado real de los datos IMSS (ARCO);
//   · Storage: bucket privado, carpeta por empresa y por ámbito.

import { randomUUID } from 'node:crypto';
import { beforeAll, describe, expect, it } from 'vitest';
import type { PGlite } from '@electric-sql/pglite';
import { comoUsuario, dbMigrada, type Consultable } from './pglite/crear-db';
import {
  crearClienteConCuenta,
  crearEmpresaDePrueba,
  crearMovimiento,
  crearNotaObra,
  crearObra,
  idsVisibles,
  insertar,
  invitarConRol,
  type EmpresaDePrueba,
} from './pglite/escenarios';

const RLS = /row-level security/;
const LENTO = 60_000;

async function crearColaborador(db: PGlite, empresaId: string): Promise<string> {
  const puestoId = randomUUID();
  await insertar(db, 'public.puestos', {
    id: puestoId,
    empresa_id: empresaId,
    nombre: 'Albañil',
    salario_dia_default: 500,
  });
  const id = randomUUID();
  await insertar(db, 'public.colaboradores', {
    id,
    empresa_id: empresaId,
    nombre: 'Juan Pérez',
    puesto_id: puestoId,
    tipo_pago: 'DIA',
  });
  return id;
}

async function crearSubcontratista(c: Consultable, empresaId: string, extra: Record<string, unknown> = {}) {
  const id = randomUUID();
  await insertar(
    c,
    'public.subcontratista',
    { id, empresa_id: empresaId, nombre: 'Impermeabilizantes del Norte', ...extra },
    { returning: false },
  );
  return id;
}

async function crearSubcontrato(
  c: Consultable,
  d: { empresaId: string; obraId: string; subId: string; notaId?: string | null },
) {
  const id = randomUUID();
  await insertar(
    c,
    'public.subcontrato',
    {
      id,
      empresa_id: d.empresaId,
      obra_id: d.obraId,
      subcontratista_id: d.subId,
      subcontratista_nombre: 'Impermeabilizantes del Norte',
      nota_obra_id: d.notaId ?? null,
      alcance: 'Impermeabilización de azoteas',
      retencion_pct: 5,
    },
    { returning: false },
  );
  return id;
}

describe('0040 cumplimiento y subcontratos', () => {
  let db: PGlite;
  let a: EmpresaDePrueba;
  let b: EmpresaDePrueba;
  let obraA: string;
  let obraB: string;
  let contadorA: string;
  let supervisorA: string;
  let colaboradorA: string;
  let clienteA: { userId: string; clienteId: string };
  let colabA: string;
  let colabB: string;
  let subA: string;
  let subB: string;
  let contratoA: string;

  beforeAll(async () => {
    db = await dbMigrada();
    a = await crearEmpresaDePrueba(db);
    b = await crearEmpresaDePrueba(db);
    obraA = await crearObra(db, a.empresaId);
    obraB = await crearObra(db, b.empresaId);
    contadorA = await invitarConRol(db, a, 'contador');
    supervisorA = await invitarConRol(db, a, 'supervisor');
    colaboradorA = await invitarConRol(db, a, 'colaborador');
    clienteA = await crearClienteConCuenta(db, a.empresaId);
    colabA = await crearColaborador(db, a.empresaId);
    colabB = await crearColaborador(db, b.empresaId);
    subA = await crearSubcontratista(db, a.empresaId, { rfc: 'INO120101AB1' });
    subB = await crearSubcontratista(db, b.empresaId);
    contratoA = await crearSubcontrato(db, { empresaId: a.empresaId, obraId: obraA, subId: subA });
  }, LENTO);

  // ── SIROC / REPSE / obligaciones ─────────────────────────────────────────
  describe('SIROC, REPSE y obligaciones', () => {
    it('el contador registra el SIROC de su obra y el admin lo ve', async () => {
      const id = randomUUID();
      await comoUsuario(db, contadorA, (tx) =>
        insertar(tx, 'public.obra_siroc', {
          id,
          empresa_id: a.empresaId,
          obra_id: obraA,
          fecha_inicio_obra: Date.now(),
          numero_registro: '123456789',
          estado: 'REGISTRADA',
        }),
      );
      const ve = await comoUsuario(db, a.adminId, (tx) => idsVisibles(tx, 'public.obra_siroc', [id]));
      expect(ve).toEqual([id]);
      const supervisor = await comoUsuario(db, supervisorA, (tx) =>
        idsVisibles(tx, 'public.obra_siroc', [id]),
      );
      expect(supervisor).toEqual([]);
      const adminB = await comoUsuario(db, b.adminId, (tx) => idsVisibles(tx, 'public.obra_siroc', [id]));
      expect(adminB).toEqual([]);
    });

    it('no cuelga un SIROC de A bajo una obra de B', async () => {
      await expect(
        comoUsuario(db, a.adminId, (tx) =>
          insertar(tx, 'public.obra_siroc', {
            id: randomUUID(),
            empresa_id: a.empresaId,
            obra_id: obraB,
            fecha_inicio_obra: Date.now(),
          }),
        ),
      ).rejects.toThrow(RLS);
    });

    it('un solo SIROC vivo por obra', async () => {
      const obra = await crearObra(db, a.empresaId);
      const fila = { empresa_id: a.empresaId, obra_id: obra, fecha_inicio_obra: Date.now() };
      await comoUsuario(db, a.adminId, (tx) => insertar(tx, 'public.obra_siroc', { id: randomUUID(), ...fila }));
      await expect(
        comoUsuario(db, a.adminId, (tx) => insertar(tx, 'public.obra_siroc', { id: randomUUID(), ...fila })),
      ).rejects.toThrow(/duplicate key|unique/);
    });

    it('el supervisor no escribe SIROC', async () => {
      await expect(
        comoUsuario(db, supervisorA, (tx) =>
          insertar(
            tx,
            'public.obra_siroc',
            { id: randomUUID(), empresa_id: a.empresaId, obra_id: obraA, fecha_inicio_obra: Date.now() },
            { returning: false },
          ),
        ),
      ).rejects.toThrow(RLS);
    });

    it('el comprobante no puede apuntar a la carpeta de otra empresa', async () => {
      await expect(
        comoUsuario(db, a.adminId, (tx) =>
          insertar(tx, 'public.empresa_repse', {
            id: randomUUID(),
            empresa_id: a.empresaId,
            folio: 'AR1234/2025',
            comprobante_path: `${b.empresaId}/repse/x/acuse.pdf`,
          }),
        ),
      ).rejects.toThrow(RLS);
    });

    it('REPSE: una fila viva por empresa; supervisor y cliente no la ven', async () => {
      const id = randomUUID();
      await comoUsuario(db, a.adminId, (tx) =>
        insertar(tx, 'public.empresa_repse', {
          id,
          empresa_id: a.empresaId,
          folio: 'AR1234/2025',
          vigencia_hasta: Date.now() + 1000 * 86_400_000,
          comprobante_path: `${a.empresaId}/repse/${id}/acuse.pdf`,
        }),
      );
      await expect(
        comoUsuario(db, a.adminId, (tx) =>
          insertar(tx, 'public.empresa_repse', { id: randomUUID(), empresa_id: a.empresaId }),
        ),
      ).rejects.toThrow(/duplicate key|unique/);
      for (const u of [supervisorA, colaboradorA, clienteA.userId]) {
        const ve = await comoUsuario(db, u, (tx) => idsVisibles(tx, 'public.empresa_repse', [id]));
        expect(ve).toEqual([]);
      }
    });

    it('ICSOE: marcar dos veces el mismo periodo no duplica', async () => {
      const fila = {
        empresa_id: a.empresaId,
        tipo: 'ICSOE',
        periodo: '2026-C2',
        fecha_limite: Date.now(),
        entregado_at: Date.now(),
      };
      await comoUsuario(db, contadorA, (tx) =>
        insertar(tx, 'public.obligacion_periodica', { id: randomUUID(), ...fila }),
      );
      await expect(
        comoUsuario(db, contadorA, (tx) =>
          insertar(tx, 'public.obligacion_periodica', { id: randomUUID(), ...fila }),
        ),
      ).rejects.toThrow(/duplicate key|unique/);
      // SISUB del mismo periodo sí es otra obligación.
      await comoUsuario(db, contadorA, (tx) =>
        insertar(tx, 'public.obligacion_periodica', { id: randomUUID(), ...fila, tipo: 'SISUB' }),
      );
    });
  });

  // ── Datos IMSS ───────────────────────────────────────────────────────────
  describe('datos IMSS del colaborador', () => {
    beforeAll(async () => {
      await comoUsuario(db, a.adminId, (tx) =>
        insertar(tx, 'public.colaborador_datos_imss', {
          colaborador_id: colabA,
          empresa_id: a.empresaId,
          nss: '12345678901',
          curp: 'PEJJ800101HDFRRN09',
          rfc: 'PEJJ800101AB1',
        }),
      );
    }, LENTO);

    it('admin y contador los ven', async () => {
      for (const u of [a.adminId, contadorA]) {
        const r = await comoUsuario(db, u, (tx) =>
          tx.query<{ nss: string }>(
            'select nss from public.colaborador_datos_imss where colaborador_id = $1',
            [colabA],
          ),
        );
        expect(r.rows).toEqual([{ nss: '12345678901' }]);
      }
    });

    it('el supervisor, el colaborador y el cliente NO los ven', async () => {
      for (const u of [supervisorA, colaboradorA, clienteA.userId]) {
        const r = await comoUsuario(db, u, (tx) =>
          tx.query('select nss from public.colaborador_datos_imss where colaborador_id = $1', [colabA]),
        );
        expect(r.rows).toEqual([]);
      }
    });

    it('el supervisor tampoco los escribe (ni para un colaborador sin datos)', async () => {
      const otro = await crearColaborador(db, a.empresaId);
      await expect(
        comoUsuario(db, supervisorA, (tx) =>
          insertar(
            tx,
            'public.colaborador_datos_imss',
            { colaborador_id: otro, empresa_id: a.empresaId, nss: '11111111111' },
            { returning: false },
          ),
        ),
      ).rejects.toThrow(RLS);
    });

    it('no se cuelgan de un colaborador de otra empresa', async () => {
      await expect(
        comoUsuario(db, a.adminId, (tx) =>
          insertar(tx, 'public.colaborador_datos_imss', {
            colaborador_id: colabB,
            empresa_id: a.empresaId,
            nss: '11111111111',
          }),
        ),
      ).rejects.toThrow(RLS);
    });

    it('rechaza formatos inválidos de NSS y CURP', async () => {
      const otro = await crearColaborador(db, a.empresaId);
      await expect(
        comoUsuario(db, a.adminId, (tx) =>
          insertar(tx, 'public.colaborador_datos_imss', {
            colaborador_id: otro,
            empresa_id: a.empresaId,
            nss: '123',
          }),
        ),
      ).rejects.toThrow(/check constraint/);
      await expect(
        comoUsuario(db, a.adminId, (tx) =>
          insertar(tx, 'public.colaborador_datos_imss', {
            colaborador_id: otro,
            empresa_id: a.empresaId,
            curp: 'no-es-curp',
          }),
        ),
      ).rejects.toThrow(/check constraint/);
    });

    it('el borrado (ARCO) es real y solo para admin/contador', async () => {
      const otro = await crearColaborador(db, a.empresaId);
      await insertar(db, 'public.colaborador_datos_imss', {
        colaborador_id: otro,
        empresa_id: a.empresaId,
        nss: '22222222222',
      });
      const sup = await comoUsuario(db, supervisorA, (tx) =>
        tx.query('delete from public.colaborador_datos_imss where colaborador_id = $1', [otro]),
      );
      expect(sup.affectedRows ?? 0).toBe(0);
      await comoUsuario(db, contadorA, (tx) =>
        tx.query('delete from public.colaborador_datos_imss where colaborador_id = $1', [otro]),
      );
      const r = await db.query('select 1 from public.colaborador_datos_imss where colaborador_id = $1', [otro]);
      expect(r.rows).toEqual([]);
    });
  });

  // ── Subcontratistas y expediente ─────────────────────────────────────────
  describe('subcontratistas y expediente', () => {
    it('el supervisor no ve el padrón (trae RFC) ni el expediente', async () => {
      const docId = randomUUID();
      await comoUsuario(db, contadorA, (tx) =>
        insertar(tx, 'public.subcontratista_documento', {
          id: docId,
          empresa_id: a.empresaId,
          subcontratista_id: subA,
          tipo: 'OPINION_32D',
          vigencia_hasta: Date.now() + 30 * 86_400_000,
        }),
      );
      const sub = await comoUsuario(db, supervisorA, (tx) => idsVisibles(tx, 'public.subcontratista', [subA]));
      const doc = await comoUsuario(db, supervisorA, (tx) =>
        idsVisibles(tx, 'public.subcontratista_documento', [docId]),
      );
      expect(sub).toEqual([]);
      expect(doc).toEqual([]);
      const admin = await comoUsuario(db, a.adminId, (tx) =>
        idsVisibles(tx, 'public.subcontratista_documento', [docId]),
      );
      expect(admin).toEqual([docId]);
    });

    it('no se agrega un documento de A a un subcontratista de B', async () => {
      await expect(
        comoUsuario(db, a.adminId, (tx) =>
          insertar(tx, 'public.subcontratista_documento', {
            id: randomUUID(),
            empresa_id: a.empresaId,
            subcontratista_id: subB,
            tipo: 'REPSE',
          }),
        ),
      ).rejects.toThrow(RLS);
    });

    it('RFC con formato inválido se rechaza', async () => {
      await expect(
        comoUsuario(db, a.adminId, (tx) => crearSubcontratista(tx, a.empresaId, { rfc: 'XYZ' })),
      ).rejects.toThrow(/check constraint/);
    });

    it('el colaborador y el cliente no ven nada', async () => {
      for (const u of [colaboradorA, clienteA.userId]) {
        expect(await comoUsuario(db, u, (tx) => idsVisibles(tx, 'public.subcontratista', [subA]))).toEqual([]);
      }
    });
  });

  // ── Subcontratos ─────────────────────────────────────────────────────────
  describe('subcontratos', () => {
    it('el supervisor LEE el subcontrato, sus renglones y pagos, pero no escribe', async () => {
      const renglon = randomUUID();
      const pago = randomUUID();
      await comoUsuario(db, a.adminId, async (tx) => {
        await insertar(tx, 'public.subcontrato_renglon', {
          id: renglon,
          empresa_id: a.empresaId,
          subcontrato_id: contratoA,
          concepto: 'Impermeabilizante prefabricado',
          importe: 100000,
        });
        await insertar(tx, 'public.subcontrato_pago', {
          id: pago,
          empresa_id: a.empresaId,
          subcontrato_id: contratoA,
          fecha: Date.now(),
          monto: 50000,
          retencion: 2500,
        });
      });

      const ve = await comoUsuario(db, supervisorA, async (tx) => ({
        c: await idsVisibles(tx, 'public.subcontrato', [contratoA]),
        r: await idsVisibles(tx, 'public.subcontrato_renglon', [renglon]),
        p: await idsVisibles(tx, 'public.subcontrato_pago', [pago]),
      }));
      expect(ve).toEqual({ c: [contratoA], r: [renglon], p: [pago] });

      await expect(
        comoUsuario(db, supervisorA, (tx) =>
          crearSubcontrato(tx, { empresaId: a.empresaId, obraId: obraA, subId: subA }),
        ),
      ).rejects.toThrow(RLS);
      const upd = await comoUsuario(db, supervisorA, (tx) =>
        tx.query('update public.subcontrato set monto = 1 where id = $1', [contratoA]),
      );
      expect(upd.affectedRows ?? 0).toBe(0);
    });

    it('colaborador y cliente no ven subcontratos', async () => {
      for (const u of [colaboradorA, clienteA.userId]) {
        expect(await comoUsuario(db, u, (tx) => idsVisibles(tx, 'public.subcontrato', [contratoA]))).toEqual([]);
      }
    });

    it('el admin de B no ve el de A', async () => {
      expect(
        await comoUsuario(db, b.adminId, (tx) => idsVisibles(tx, 'public.subcontrato', [contratoA])),
      ).toEqual([]);
    });

    it('padres de otra empresa: obra, subcontratista o nota', async () => {
      await expect(
        comoUsuario(db, a.adminId, (tx) =>
          crearSubcontrato(tx, { empresaId: a.empresaId, obraId: obraB, subId: subA }),
        ),
      ).rejects.toThrow(RLS);
      await expect(
        comoUsuario(db, a.adminId, (tx) =>
          crearSubcontrato(tx, { empresaId: a.empresaId, obraId: obraA, subId: subB }),
        ),
      ).rejects.toThrow(RLS);
      const notaB = await crearNotaObra(db, { empresaId: b.empresaId, obraId: obraB });
      await expect(
        comoUsuario(db, a.adminId, (tx) =>
          crearSubcontrato(tx, { empresaId: a.empresaId, obraId: obraA, subId: subA, notaId: notaB }),
        ),
      ).rejects.toThrow(RLS);
    });

    it('nace de una nota de la MISMA obra', async () => {
      const notaA = await crearNotaObra(db, { empresaId: a.empresaId, obraId: obraA });
      const otraObra = await crearObra(db, a.empresaId);
      await comoUsuario(db, a.adminId, (tx) =>
        crearSubcontrato(tx, { empresaId: a.empresaId, obraId: obraA, subId: subA, notaId: notaA }),
      );
      await expect(
        comoUsuario(db, a.adminId, (tx) =>
          crearSubcontrato(tx, { empresaId: a.empresaId, obraId: otraObra, subId: subA, notaId: notaA }),
        ),
      ).rejects.toThrow(RLS);
    });

    it('el pago se liga a un movimiento de la misma empresa y obra', async () => {
      const movA = await crearMovimiento(db, { empresaId: a.empresaId, obraId: obraA, tipo: 'SALIDA' });
      const movB = await crearMovimiento(db, { empresaId: b.empresaId, obraId: obraB, tipo: 'SALIDA' });
      const otraObra = await crearObra(db, a.empresaId);
      const movOtraObra = await crearMovimiento(db, {
        empresaId: a.empresaId,
        obraId: otraObra,
        tipo: 'SALIDA',
      });
      const pago = (movimiento_id: string) => ({
        id: randomUUID(),
        empresa_id: a.empresaId,
        subcontrato_id: contratoA,
        fecha: Date.now(),
        monto: 1000,
        retencion: 50,
        movimiento_id,
      });
      await comoUsuario(db, contadorA, (tx) => insertar(tx, 'public.subcontrato_pago', pago(movA)));
      await expect(
        comoUsuario(db, contadorA, (tx) => insertar(tx, 'public.subcontrato_pago', pago(movB))),
      ).rejects.toThrow(RLS);
      await expect(
        comoUsuario(db, contadorA, (tx) => insertar(tx, 'public.subcontrato_pago', pago(movOtraObra))),
      ).rejects.toThrow(RLS);
    });

    it('la retención no puede ser mayor que el pago', async () => {
      await expect(
        comoUsuario(db, a.adminId, (tx) =>
          insertar(tx, 'public.subcontrato_pago', {
            id: randomUUID(),
            empresa_id: a.empresaId,
            subcontrato_id: contratoA,
            fecha: Date.now(),
            monto: 100,
            retencion: 200,
          }),
        ),
      ).rejects.toThrow(/check constraint/);
    });

    it('el borrado lógico lo hace el contador por UPDATE', async () => {
      const id = await comoUsuario(db, contadorA, (tx) =>
        crearSubcontrato(tx, { empresaId: a.empresaId, obraId: obraA, subId: subA }),
      );
      const r = await comoUsuario(db, contadorA, (tx) =>
        tx.query('update public.subcontrato set deleted_at = $2 where id = $1', [id, Date.now()]),
      );
      expect(r.affectedRows).toBe(1);
    });
  });

  // ── Storage ──────────────────────────────────────────────────────────────
  describe('bucket cumplimiento', () => {
    const subir = (userId: string, path: string) =>
      comoUsuario(db, userId, (tx) =>
        tx.query(`insert into storage.objects (bucket_id, name) values ('cumplimiento', $1)`, [path]),
      );

    it('es privado, 10 MB, solo PDF e imágenes (nada de .key/.cer)', async () => {
      const r = await db.query<{ public: boolean; file_size_limit: string; allowed_mime_types: string[] }>(
        `select public, file_size_limit, allowed_mime_types from storage.buckets where id = 'cumplimiento'`,
      );
      expect(r.rows[0].public).toBe(false);
      expect(Number(r.rows[0].file_size_limit)).toBe(10 * 1024 * 1024);
      expect(r.rows[0].allowed_mime_types).toEqual([
        'application/pdf',
        'image/jpeg',
        'image/png',
        'image/webp',
      ]);
    });

    it('admin y contador suben a SU carpeta y a un ámbito conocido', async () => {
      await subir(a.adminId, `${a.empresaId}/repse/${randomUUID()}/acuse.pdf`);
      await subir(contadorA, `${a.empresaId}/subcontratista/${subA}/opinion.pdf`);
      await expect(subir(a.adminId, `${a.empresaId}/otra-cosa/${randomUUID()}/x.pdf`)).rejects.toThrow(RLS);
      await expect(subir(a.adminId, `${b.empresaId}/repse/${randomUUID()}/x.pdf`)).rejects.toThrow(RLS);
    });

    it('supervisor, colaborador y cliente no suben ni ven', async () => {
      const path = `${a.empresaId}/colaborador/${colabA}/alta-imss.pdf`;
      await subir(a.adminId, path);
      for (const u of [supervisorA, colaboradorA, clienteA.userId]) {
        await expect(subir(u, `${a.empresaId}/siroc/${randomUUID()}/x.pdf`)).rejects.toThrow(RLS);
        const ve = await comoUsuario(db, u, (tx) =>
          tx.query(`select name from storage.objects where bucket_id = 'cumplimiento' and name = $1`, [path]),
        );
        expect(ve.rows).toEqual([]);
      }
      const adminB = await comoUsuario(db, b.adminId, (tx) =>
        tx.query(`select name from storage.objects where bucket_id = 'cumplimiento' and name = $1`, [path]),
      );
      expect(adminB.rows).toEqual([]);
      const contador = await comoUsuario(db, contadorA, (tx) =>
        tx.query(`select name from storage.objects where bucket_id = 'cumplimiento' and name = $1`, [path]),
      );
      expect(contador.rows).toHaveLength(1);
    });
  });
});
