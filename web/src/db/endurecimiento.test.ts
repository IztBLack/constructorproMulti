// Endurecimiento tras la revisión de seguridad de 0035–0044 (SEG-*,
// docs/PROGRESO_ALCANCE.md). Cada test reproduce el escenario con el que la
// revisión DEMOSTRÓ un hueco y afirma que ya no existe.
// Cómo funciona el harness: `src/db/pglite/README.md`.

import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { beforeAll, describe, expect, it } from 'vitest';
import type { PGlite } from '@electric-sql/pglite';
import { comoUsuario, crearDbMigrada, dbMigrada, DIR_MIGRACIONES, listarMigraciones } from './pglite/crear-db';
import {
  agregarMembresia,
  asignarObra,
  crearClienteConCuenta,
  crearEmpresaDePrueba,
  crearObra,
  crearUsuario,
  insertar,
  invitarConRol,
  type EmpresaDePrueba,
} from './pglite/escenarios';

const LENTO = 120_000;
const HORA = 3_600_000;
const DIA = 86_400_000;
const INICIO = Date.UTC(2026, 8, 1, 6);
const RLS = /row-level security/;
const EVIDENCIA = /EVIDENCIA_INMUTABLE/;

// ── Siembra (como superusuario) ──────────────────────────────────────────────

async function crearColaborador(db: PGlite, empresaId: string): Promise<string> {
  const puesto = randomUUID();
  await insertar(db, 'public.puestos', { id: puesto, nombre: 'Albañil', empresa_id: empresaId });
  const id = randomUUID();
  await insertar(db, 'public.colaboradores', {
    id, nombre: 'Juan', puesto_id: puesto, tipo_pago: 'DIA', empresa_id: empresaId,
  });
  return id;
}

async function crearPartida(db: PGlite, empresaId: string, obraId: string): Promise<string> {
  const id = randomUUID();
  await insertar(db, 'public.obra_presupuesto', {
    id, empresa_id: empresaId, obra_id: obraId, concepto: 'Firme', unidad: 'm2',
    cantidad: 100, precio_unitario: 100, orden: 1,
  });
  return id;
}

/** Estimación ENVIADA (con su renglón de la partida) sobre el periodo INICIO…INICIO+10d. */
async function estimacionEnviada(db: PGlite, empresaId: string, obraId: string, partida: string): Promise<string> {
  const id = randomUUID();
  await insertar(db, 'public.estimaciones', {
    id, empresa_id: empresaId, obra_id: obraId, periodo_inicio: INICIO, periodo_fin: INICIO + 10 * DIA,
  });
  await insertar(db, 'public.estimacion_renglon', {
    id: randomUUID(), empresa_id: empresaId, estimacion_id: id, presupuesto_id: partida,
    concepto: 'Firme', unidad: 'm2', cantidad: 1, precio_unitario: 100,
  });
  await db.query(
    `update public.estimaciones set estado = 'ENVIADA', snapshot_json = '{}'::jsonb, enviado_at = 1,
            importe_bruto = 100, subtotal = 100, total = 100, neto = 100
      where id = $1`,
    [id],
  );
  return id;
}

async function extraAprobado(db: PGlite, empresaId: string, obraId: string, foto: string | null = null): Promise<string> {
  const id = randomUUID();
  await insertar(db, 'public.orden_cambio', {
    id, empresa_id: empresaId, obra_id: obraId, titulo: 'Barda', estado: 'APROBADA',
    snapshot_json: '{}', total_enviado: 5000, enviado_at: 1, respondido_at: 2, foto_uri: foto,
  });
  return id;
}

async function bitacoraCerrada(db: PGlite, empresaId: string, obraId: string): Promise<string> {
  const id = randomUUID();
  await insertar(db, 'public.bitacora_entrada', {
    id, empresa_id: empresaId, obra_id: obraId, fecha: Date.now(), texto: 'evidencia', visible_cliente: true,
  });
  await db.transaction(async (tx) => {
    await tx.exec('set local session_replication_role = replica');
    await tx.query('update public.bitacora_entrada set registrada_en = registrada_en - $2 where id = $1', [id, 48 * HORA]);
  });
  return id;
}

/** Orden de compra EMITIDA con un renglón. Devuelve { oc, renglon }. */
async function ordenEmitida(db: PGlite, empresaId: string, obraId: string): Promise<{ oc: string; prov: string }> {
  const prov = randomUUID();
  await insertar(db, 'public.proveedores', { id: prov, empresa_id: empresaId, nombre: `Prov ${prov.slice(0, 6)}` });
  const oc = randomUUID();
  await insertar(db, 'public.ordenes_compra', { id: oc, empresa_id: empresaId, obra_id: obraId, proveedor_id: prov });
  await insertar(db, 'public.orden_compra_renglon', {
    id: randomUUID(), empresa_id: empresaId, orden_compra_id: oc, descripcion: 'Cemento', cantidad: 10, precio_unitario: 100,
  });
  await db.query(`update public.ordenes_compra set estado = 'EMITIDA' where id = $1`, [oc]);
  return { oc, prov };
}

async function recepcion(db: PGlite, empresaId: string, obraId: string, oc: string): Promise<string> {
  const id = randomUUID();
  await insertar(db, 'public.recepciones', { id, empresa_id: empresaId, orden_compra_id: oc, obra_id: obraId });
  return id;
}

async function objeto(db: PGlite, bucket: string, name: string): Promise<void> {
  await db.query(`insert into storage.objects (bucket_id, name, metadata) values ($1, $2, '{"v":1}')`, [bucket, name]);
}

async function existeObjeto(db: PGlite, bucket: string, name: string): Promise<boolean> {
  const r = await db.query('select 1 from storage.objects where bucket_id = $1 and name = $2', [bucket, name]);
  return r.rows.length === 1;
}

async function borrarObjetoComo(db: PGlite, userId: string, bucket: string, name: string): Promise<number> {
  const r = await comoUsuario(db, userId, (tx) =>
    tx.query('delete from storage.objects where bucket_id = $1 and name = $2', [bucket, name]));
  return r.affectedRows ?? 0;
}

describe('endurecimiento tras la revisión de seguridad (SEG-*)', () => {
  let db: PGlite;
  let a: EmpresaDePrueba;
  let supA: string;
  let colA: string;
  let resA: string;

  beforeAll(async () => {
    db = await dbMigrada();
    a = await crearEmpresaDePrueba(db);
    supA = await invitarConRol(db, a, 'supervisor');
    colA = await invitarConRol(db, a, 'colaborador');
    resA = await invitarConRol(db, a, 'residente');
  }, LENTO);

  // ══════════════════════════════════════════════════════════════════════════
  // SEG-A1 — la evidencia no se borra físicamente
  // ══════════════════════════════════════════════════════════════════════════
  describe('SEG-A1: borrado físico en cascada', () => {
    it('el supervisor (y el residente) ya NO borran físicamente la obra ni partidas del presupuesto', async () => {
      const obra = await crearObra(db, a.empresaId);
      const partida = await crearPartida(db, a.empresaId, obra);
      await asignarObra(db, a, resA, obra);
      for (const u of [supA, resA]) {
        const p = await comoUsuario(db, u, (tx) => tx.query('delete from public.obra_presupuesto where id = $1', [partida]));
        expect(p.affectedRows).toBe(0);
        const o = await comoUsuario(db, u, (tx) => tx.query('delete from public.obras where id = $1', [obra]));
        expect(o.affectedRows).toBe(0);
      }
      expect((await db.query('select 1 from public.obras where id = $1', [obra])).rows).toHaveLength(1);
      expect((await db.query('select 1 from public.obra_presupuesto where id = $1', [partida])).rows).toHaveLength(1);
    }, LENTO);

    it('ni el admin borra una obra con evidencia: cada tipo de evidencia detiene la cascada', async () => {
      const casos: Record<string, (obra: string) => Promise<void>> = {
        'extra aprobado': async (obra) => { await extraAprobado(db, a.empresaId, obra); },
        'estimación enviada': async (obra) => {
          await estimacionEnviada(db, a.empresaId, obra, await crearPartida(db, a.empresaId, obra));
        },
        'bitácora cerrada': async (obra) => { await bitacoraCerrada(db, a.empresaId, obra); },
        'aclaración de bitácora': async (obra) => {
          const e = randomUUID();
          await insertar(db, 'public.bitacora_entrada', { id: e, empresa_id: a.empresaId, obra_id: obra, fecha: 1, texto: 'x' });
          await insertar(db, 'public.bitacora_aclaracion', { id: randomUUID(), empresa_id: a.empresaId, entrada_id: e, texto: 'aclaro' });
        },
        'reporte de garantía': async (obra) => {
          await insertar(db, 'public.garantia_reporte', { id: randomUUID(), empresa_id: a.empresaId, obra_id: obra, descripcion: 'Gotera' });
        },
        incidente: async (obra) => {
          await insertar(db, 'public.incidente', {
            id: randomUUID(), empresa_id: a.empresaId, obra_id: obra, fecha: 1, tipo: 'ACCIDENTE', descripcion: 'cayó',
          });
        },
        'orden de compra emitida': async (obra) => { await ordenEmitida(db, a.empresaId, obra); },
      };
      for (const [nombre, sembrar] of Object.entries(casos)) {
        const obra = await crearObra(db, a.empresaId);
        await sembrar(obra);
        await expect(
          comoUsuario(db, a.adminId, (tx) => tx.query('delete from public.obras where id = $1', [obra])),
          nombre,
        ).rejects.toThrow(EVIDENCIA);
        // Tampoco la llave de servicio (el trigger aplica a todos).
        await expect(db.query('delete from public.obras where id = $1', [obra]), nombre).rejects.toThrow(EVIDENCIA);
      }
    }, LENTO);

    it('el escenario completo de la revisión (H1): la obra no se borra y la evidencia sigue ahí', async () => {
      const obra = await crearObra(db, a.empresaId);
      const { clienteId } = await crearClienteConCuenta(db, a.empresaId);
      await db.query('update public.obras set cliente_id = $2 where id = $1', [obra, clienteId]);
      const extra = await extraAprobado(db, a.empresaId, obra);
      const ent = await bitacoraCerrada(db, a.empresaId, obra);
      const inc = randomUUID();
      await insertar(db, 'public.incidente', {
        id: inc, empresa_id: a.empresaId, obra_id: obra, fecha: 1, tipo: 'ACCIDENTE', descripcion: 'cayó',
      });
      await insertar(db, 'public.incidente_salud', { id: randomUUID(), empresa_id: a.empresaId, incidente_id: inc });

      const r = await comoUsuario(db, supA, (tx) => tx.query('delete from public.obras where id = $1', [obra]));
      expect(r.affectedRows).toBe(0);
      await expect(
        comoUsuario(db, a.adminId, (tx) => tx.query('delete from public.obras where id = $1', [obra])),
      ).rejects.toThrow(EVIDENCIA);
      const quedan = await db.query<{ n: number }>(
        `select (select count(*) from public.orden_cambio where id = $1)
              + (select count(*) from public.bitacora_entrada where id = $2)
              + (select count(*) from public.incidente where id = $3)
              + (select count(*) from public.incidente_salud where incidente_id = $3) as n`,
        [extra, ent, inc],
      );
      expect(Number(quedan.rows[0].n)).toBe(4);
    }, LENTO);

    it('las filas de evidencia tampoco se borran directo (ni la llave de servicio); un borrador sí', async () => {
      const obra = await crearObra(db, a.empresaId);
      const extra = await extraAprobado(db, a.empresaId, obra);
      await expect(db.query('delete from public.orden_cambio where id = $1', [extra])).rejects.toThrow(EVIDENCIA);
      const { oc } = await ordenEmitida(db, a.empresaId, obra);
      const rec = await recepcion(db, a.empresaId, obra, oc);
      await expect(db.query('delete from public.recepciones where id = $1', [rec])).rejects.toThrow(EVIDENCIA);
      await expect(db.query('delete from public.ordenes_compra where id = $1', [oc])).rejects.toThrow(EVIDENCIA);

      const borrador = randomUUID();
      await insertar(db, 'public.orden_cambio', { id: borrador, empresa_id: a.empresaId, obra_id: obra, titulo: 'Borrador' });
      await db.query('delete from public.orden_cambio where id = $1', [borrador]);
      expect((await db.query('select 1 from public.orden_cambio where id = $1', [borrador])).rows).toHaveLength(0);

      // Una obra SIN evidencia la sigue pudiendo borrar el admin.
      const vacia = await crearObra(db, a.empresaId);
      const d = await comoUsuario(db, a.adminId, (tx) => tx.query('delete from public.obras where id = $1', [vacia]));
      expect(d.affectedRows).toBe(1);
    }, LENTO);

    it('una captura de avance ya estimada no se va con la partida ni con la obra', async () => {
      const obra = await crearObra(db, a.empresaId);
      const partida = await crearPartida(db, a.empresaId, obra);
      const cap = randomUUID();
      await insertar(db, 'public.avance_partida', {
        id: cap, empresa_id: a.empresaId, obra_id: obra, presupuesto_id: partida, fecha: INICIO + 2 * DIA, cantidad: 5,
      });
      await estimacionEnviada(db, a.empresaId, obra, partida);
      await expect(db.query('delete from public.avance_partida where id = $1', [cap])).rejects.toThrow(EVIDENCIA);
      await expect(db.query('delete from public.obra_presupuesto where id = $1', [partida])).rejects.toThrow(EVIDENCIA);
    }, LENTO);

    it('eliminar la EMPRESA completa sigue funcionando (la única cascada que se deja pasar)', async () => {
      const db2 = await crearDbMigrada();
      const e = await crearEmpresaDePrueba(db2);
      const obra = await crearObra(db2, e.empresaId);
      await bitacoraCerrada(db2, e.empresaId, obra);
      const ent = randomUUID();
      await insertar(db2, 'public.bitacora_entrada', { id: ent, empresa_id: e.empresaId, obra_id: obra, fecha: 1, texto: 'x' });
      await insertar(db2, 'public.bitacora_aclaracion', { id: randomUUID(), empresa_id: e.empresaId, entrada_id: ent, texto: 'a' });
      await insertar(db2, 'public.garantia_reporte', { id: randomUUID(), empresa_id: e.empresaId, obra_id: obra, descripcion: 'Gotera' });
      const inc = randomUUID();
      await insertar(db2, 'public.incidente', {
        id: inc, empresa_id: e.empresaId, obra_id: obra, fecha: 1, tipo: 'ACCIDENTE', descripcion: 'cayó',
      });
      await insertar(db2, 'public.incidente_salud', { id: randomUUID(), empresa_id: e.empresaId, incidente_id: inc });
      const col = await crearColaborador(db2, e.empresaId);
      await insertar(db2, 'public.colaborador_datos_imss', { colaborador_id: col, empresa_id: e.empresaId, nss: '12345678901' });
      await db2.query('delete from public.empresas where id = $1', [e.empresaId]);
      expect((await db2.query('select 1 from public.obras where id = $1', [obra])).rows).toHaveLength(0);
      await db2.close();
    }, LENTO);

    it('H1b: el supervisor ya no borra al colaborador; y aunque el admin lo intente, los datos IMSS no se van en cascada', async () => {
      const col = await crearColaborador(db, a.empresaId);
      await insertar(db, 'public.colaborador_datos_imss', { colaborador_id: col, empresa_id: a.empresaId, nss: '12345678901' });
      const r = await comoUsuario(db, supA, (tx) => tx.query('delete from public.colaboradores where id = $1', [col]));
      expect(r.affectedRows).toBe(0);
      await expect(
        comoUsuario(db, a.adminId, (tx) => tx.query('delete from public.colaboradores where id = $1', [col])),
      ).rejects.toThrow(/foreign key/);
      expect((await db.query('select 1 from public.colaborador_datos_imss where colaborador_id = $1', [col])).rows).toHaveLength(1);
      // El borrado ARCO explícito sigue existiendo (admin/contador, 0040).
      const d = await comoUsuario(db, a.adminId, (tx) =>
        tx.query('delete from public.colaborador_datos_imss where colaborador_id = $1', [col]));
      expect(d.affectedRows).toBe(1);
    }, LENTO);
  });

  // ══════════════════════════════════════════════════════════════════════════
  // SEG-B4 — ARCO sobre los datos de salud
  // ══════════════════════════════════════════════════════════════════════════
  it('SEG-B4: solo el admin borra de verdad los datos de salud, y queda rastro en el incidente', async () => {
    const obra = await crearObra(db, a.empresaId);
    const inc = randomUUID();
    await insertar(db, 'public.incidente', {
      id: inc, empresa_id: a.empresaId, obra_id: obra, fecha: 1, tipo: 'ACCIDENTE', descripcion: 'cayó',
    });
    const salud = randomUUID();
    await insertar(db, 'public.incidente_salud', { id: salud, empresa_id: a.empresaId, incidente_id: inc, nota: 'golpe' });

    const sup = await comoUsuario(db, supA, (tx) => tx.query('delete from public.incidente_salud where id = $1', [salud]));
    expect(sup.affectedRows).toBe(0);
    await expect(db.query('delete from public.incidente_salud where id = $1', [salud])).rejects.toThrow(EVIDENCIA);
    // Ni el supervisor se inventa el rastro.
    await comoUsuario(db, supA, (tx) => tx.query('update public.incidente set salud_borrada_at = 1 where id = $1', [inc]));
    expect((await db.query('select salud_borrada_at from public.incidente where id = $1', [inc])).rows[0]).toMatchObject({
      salud_borrada_at: null,
    });

    const adm = await comoUsuario(db, a.adminId, (tx) => tx.query('delete from public.incidente_salud where id = $1', [salud]));
    expect(adm.affectedRows).toBe(1);
    const i = await db.query<{ salud_borrada_at: string | null; salud_borrada_por: string | null }>(
      'select salud_borrada_at, salud_borrada_por from public.incidente where id = $1', [inc]);
    expect(i.rows[0].salud_borrada_at).not.toBeNull();
    expect(i.rows[0].salud_borrada_por).toBe(a.adminId);
  }, LENTO);

  // ══════════════════════════════════════════════════════════════════════════
  // SEG-M1 — Storage: la evidencia ligada no se borra ni se reemplaza
  // ══════════════════════════════════════════════════════════════════════════
  describe('SEG-M1: evidencia en Storage', () => {
    it('H3: la foto de un extra ENVIADO no la borra el supervisor ni el residente; la de un borrador sí', async () => {
      const obra = await crearObra(db, a.empresaId);
      await asignarObra(db, a, resA, obra);
      const foto = `${a.empresaId}/${obra}/${randomUUID()}.jpg`;
      await extraAprobado(db, a.empresaId, obra, foto);
      await objeto(db, 'extras', foto);
      expect(await borrarObjetoComo(db, supA, 'extras', foto)).toBe(0);
      expect(await borrarObjetoComo(db, resA, 'extras', foto)).toBe(0);
      // Sin policy de UPDATE: tampoco se sobreescribe (upsert) ni se re-sube con el mismo nombre.
      const u = await comoUsuario(db, supA, (tx) =>
        tx.query(`update storage.objects set metadata = '{"v":2}' where bucket_id = 'extras' and name = $1`, [foto]));
      expect(u.affectedRows).toBe(0);
      await expect(
        comoUsuario(db, supA, (tx) =>
          tx.query(`insert into storage.objects (bucket_id, name, metadata) values ('extras', $1, '{"v":2}')`, [foto])),
      ).rejects.toThrow();
      expect(await existeObjeto(db, 'extras', foto)).toBe(true);

      const suelta = `${a.empresaId}/${obra}/${randomUUID()}.jpg`;
      await objeto(db, 'extras', suelta);
      expect(await borrarObjetoComo(db, supA, 'extras', suelta)).toBe(1);
    }, LENTO);

    it('H7: la remisión ligada a una entrega no la borra nadie de campo, y solo el admin la cambia', async () => {
      const obra = await crearObra(db, a.empresaId);
      await asignarObra(db, a, resA, obra);
      const { oc } = await ordenEmitida(db, a.empresaId, obra);
      const rec = await recepcion(db, a.empresaId, obra, oc);
      const foto = `${a.empresaId}/remisiones/${rec}/foto.jpg`;
      await objeto(db, 'compras', foto);
      await comoUsuario(db, supA, (tx) =>
        tx.query('update public.recepciones set remision_uri = $2 where id = $1', [rec, foto]));
      const almacen = await invitarConRol(db, a, 'almacen');
      for (const u of [supA, resA, almacen]) expect(await borrarObjetoComo(db, u, 'compras', foto)).toBe(0);
      expect(await existeObjeto(db, 'compras', foto)).toBe(true);

      const otra = `${a.empresaId}/remisiones/${rec}/otra.jpg`;
      await objeto(db, 'compras', otra);
      await expect(
        comoUsuario(db, supA, (tx) => tx.query('update public.recepciones set remision_uri = $2 where id = $1', [rec, otra])),
      ).rejects.toThrow(/solo el administrador/);
      // Lo que se subió y no se ligó sí se limpia.
      expect(await borrarObjetoComo(db, supA, 'compras', otra)).toBe(1);
      // El admin sí la cambia; la vieja queda sin ligar y se puede limpiar.
      await objeto(db, 'compras', otra);
      await comoUsuario(db, a.adminId, (tx) =>
        tx.query('update public.recepciones set remision_uri = $2 where id = $1', [rec, otra]));
      expect(await borrarObjetoComo(db, a.adminId, 'compras', foto)).toBe(1);
    }, LENTO);

    it('H8: la oficina (y el residente) no ocultan ni borran la foto que subió el cliente a su reclamo', async () => {
      const obra = await crearObra(db, a.empresaId);
      await asignarObra(db, a, resA, obra);
      const { clienteId, userId } = await crearClienteConCuenta(db, a.empresaId);
      await db.query('update public.obras set cliente_id = $2 where id = $1', [obra, clienteId]);
      const rep = randomUUID();
      const r = await comoUsuario(db, userId, (tx) =>
        tx.query<{ r: { ok: boolean } }>('select public.reportar_garantia($1,$2,$3,$4) as r', [rep, obra, 'Gotera en baño', 'Baño']));
      expect(r.rows[0].r.ok).toBe(true);
      const name = `${a.empresaId}/${obra}/${rep}/f.jpg`;
      await comoUsuario(db, userId, async (tx) => {
        await tx.query(`insert into storage.objects (bucket_id, name) values ('postventa', $1)`, [name]);
        await tx.query(
          `insert into public.garantia_foto (id, empresa_id, reporte_id, path, subida_por_cliente) values ($1,$2,$3,$4,true)`,
          [randomUUID(), a.empresaId, rep, name]);
      });
      for (const u of [supA, resA, a.adminId]) {
        const oculta = await comoUsuario(db, u, (tx) =>
          tx.query('update public.garantia_foto set deleted_at = 1 where reporte_id = $1', [rep]));
        expect(oculta.affectedRows).toBe(0);
        expect(await borrarObjetoComo(db, u, 'postventa', name)).toBe(0);
      }
      expect(await existeObjeto(db, 'postventa', name)).toBe(true);
    }, LENTO);

    it('la evidencia de entrega de EPP ligada no se borra del bucket', async () => {
      const obra = await crearObra(db, a.empresaId);
      await asignarObra(db, a, resA, obra);
      const col = await crearColaborador(db, a.empresaId);
      const ent = randomUUID();
      const path = `${a.empresaId}/epp/${ent}/firma.png`;
      await insertar(db, 'public.epp_entrega', {
        id: ent, empresa_id: a.empresaId, colaborador_id: col, obra_id: obra, articulo: 'Casco', fecha: 1,
        evidencia_path: path, evidencia_tipo: 'FIRMA',
      });
      await objeto(db, 'seguridad', path);
      for (const u of [supA, resA, a.adminId]) expect(await borrarObjetoComo(db, u, 'seguridad', path)).toBe(0);
      await expect(db.query('delete from public.epp_entrega where id = $1', [ent])).rejects.toThrow(EVIDENCIA);
    }, LENTO);
  });

  // ══════════════════════════════════════════════════════════════════════════
  // SEG-M2 — préstamo de herramienta devuelto
  // ══════════════════════════════════════════════════════════════════════════
  it('SEG-M2 (H2): un préstamo devuelto no se reescribe cambiando deleted_at en el mismo UPDATE ni se des-borra', async () => {
    const h = randomUUID();
    await insertar(db, 'public.herramienta', { id: h, empresa_id: a.empresaId, nombre: 'Rotomartillo' });
    const obra = await crearObra(db, a.empresaId);
    const asig = randomUUID();
    await insertar(db, 'public.herramienta_asignacion', {
      id: asig, empresa_id: a.empresaId, herramienta_id: h, obra_id: obra, desde: 1000,
      hasta: 2000, estado_regreso: 'BAJA', recibio_nombre: 'Pedro',
    });
    await expect(
      comoUsuario(db, supA, (tx) =>
        tx.query(
          `update public.herramienta_asignacion
              set estado_regreso = 'BUENO', recibio_nombre = 'Otro', desde = 1500, deleted_at = 1 where id = $1`, [asig])),
    ).rejects.toThrow(/HERRAMIENTA_HISTORIAL/);
    // Ocultarlo (solo deleted_at) sí se puede; des-ocultarlo, no.
    await comoUsuario(db, supA, (tx) => tx.query('update public.herramienta_asignacion set deleted_at = 1 where id = $1', [asig]));
    await expect(
      comoUsuario(db, supA, (tx) => tx.query('update public.herramienta_asignacion set deleted_at = null where id = $1', [asig])),
    ).rejects.toThrow(/HERRAMIENTA_HISTORIAL/);
    const r = await db.query<{ estado_regreso: string; recibio_nombre: string }>(
      'select estado_regreso, recibio_nombre from public.herramienta_asignacion where id = $1', [asig]);
    expect(r.rows[0]).toMatchObject({ estado_regreso: 'BAJA', recibio_nombre: 'Pedro' });
  }, LENTO);

  // ══════════════════════════════════════════════════════════════════════════
  // SEG-M3 — movimientos ligados y roles de campo
  // ══════════════════════════════════════════════════════════════════════════
  describe('SEG-M3: movimientos de caja ligados', () => {
    async function pagoLigado(obra: string): Promise<{ mov: string; pago: string }> {
      const { oc, prov } = await ordenEmitida(db, a.empresaId, obra);
      const mov = randomUUID();
      await insertar(db, 'public.movimientos', {
        id: mov, empresa_id: a.empresaId, obra_id: obra, fecha: 1, tipo: 'SALIDA', categoria: 'MATERIAL',
        concepto: 'Pago OC', monto: 1000, metodo_pago: 'TRANSFERENCIA',
      });
      const pago = randomUUID();
      await insertar(db, 'public.pagos_proveedor', {
        id: pago, empresa_id: a.empresaId, orden_compra_id: oc, proveedor_id: prov, monto: 1000, fecha: 1, movimiento_id: mov,
      });
      return { mov, pago };
    }

    it('H4: el colaborador ya no anula ni cambia el pago a proveedor editando su salida de caja (sin lanzar error)', async () => {
      const obra = await crearObra(db, a.empresaId);
      const { mov, pago } = await pagoLigado(obra);
      const antes = await db.query<{ s: string }>('select server_updated_at::text as s from public.movimientos where id = $1', [mov]);
      await comoUsuario(db, colA, (tx) =>
        tx.query('update public.movimientos set monto = 1, deleted_at = 5 where id = $1', [mov]));
      // El push del móvil es un UPSERT: tampoco lanza (no se atora el sync).
      await comoUsuario(db, colA, (tx) =>
        tx.query(
          `insert into public.movimientos (id, empresa_id, obra_id, fecha, tipo, categoria, concepto, monto, metodo_pago)
           values ($1, $2, $3, 1, 'SALIDA', 'MATERIAL', 'Pago OC', 2, 'EFECTIVO')
           on conflict (id) do update set monto = excluded.monto, metodo_pago = excluded.metodo_pago`,
          [mov, a.empresaId, obra]));
      const m = await db.query<{ monto: number; deleted_at: string | null; s: string }>(
        'select monto, deleted_at, server_updated_at::text as s from public.movimientos where id = $1', [mov]);
      expect(Number(m.rows[0].monto)).toBe(1000);
      expect(m.rows[0].deleted_at).toBeNull();
      // server_updated_at sí sube: el siguiente pull del teléfono corrige su copia.
      expect(BigInt(m.rows[0].s)).toBeGreaterThan(BigInt(antes.rows[0].s));
      const p = await db.query<{ monto: number; deleted_at: string | null }>(
        'select monto, deleted_at from public.pagos_proveedor where id = $1', [pago]);
      expect(Number(p.rows[0].monto)).toBe(1000);
      expect(p.rows[0].deleted_at).toBeNull();
    }, LENTO);

    it('el residente tampoco edita ni borra un movimiento ligado; lo no ligado sigue igual que antes', async () => {
      const obra = await crearObra(db, a.empresaId);
      await asignarObra(db, a, resA, obra);
      const { mov } = await pagoLigado(obra);
      await comoUsuario(db, resA, (tx) => tx.query('update public.movimientos set monto = 3 where id = $1', [mov]));
      const d = await comoUsuario(db, resA, (tx) => tx.query('delete from public.movimientos where id = $1', [mov]));
      expect(d.affectedRows).toBe(0);
      expect(Number((await db.query<{ monto: number }>('select monto from public.movimientos where id = $1', [mov])).rows[0].monto)).toBe(1000);

      const libre = randomUUID();
      await insertar(db, 'public.movimientos', {
        id: libre, empresa_id: a.empresaId, obra_id: obra, fecha: 1, tipo: 'SALIDA', categoria: 'Varios',
        concepto: 'Clavos', monto: 50, metodo_pago: 'EFECTIVO',
      });
      await comoUsuario(db, colA, (tx) => tx.query('update public.movimientos set monto = 60 where id = $1', [libre]));
      expect(Number((await db.query<{ monto: number }>('select monto from public.movimientos where id = $1', [libre])).rows[0].monto)).toBe(60);
      const dl = await comoUsuario(db, resA, (tx) => tx.query('delete from public.movimientos where id = $1', [libre]));
      expect(dl.affectedRows).toBe(1);
    }, LENTO);

    it('la oficina (supervisor) sí corrige la caja y el pago lo refleja ("la caja manda", F2)', async () => {
      const obra = await crearObra(db, a.empresaId);
      const { mov, pago } = await pagoLigado(obra);
      await comoUsuario(db, supA, (tx) => tx.query('update public.movimientos set monto = 900 where id = $1', [mov]));
      expect(Number((await db.query<{ monto: number }>('select monto from public.pagos_proveedor where id = $1', [pago])).rows[0].monto)).toBe(900);
    }, LENTO);

    it('también protege la entrada que cobra una estimación y la del anticipo', async () => {
      const obra = await crearObra(db, a.empresaId);
      const ent = randomUUID();
      await insertar(db, 'public.movimientos', {
        id: ent, empresa_id: a.empresaId, obra_id: obra, fecha: 1, tipo: 'ENTRADA', categoria: 'Anticipo',
        concepto: 'Anticipo', monto: 5000, metodo_pago: 'TRANSFERENCIA',
      });
      await insertar(db, 'public.obra_contrato', { obra_id: obra, empresa_id: a.empresaId, anticipo_monto: 5000, anticipo_movimiento_id: ent });
      await comoUsuario(db, colA, (tx) => tx.query('update public.movimientos set monto = 1 where id = $1', [ent]));
      expect(Number((await db.query<{ monto: number }>('select monto from public.movimientos where id = $1', [ent])).rows[0].monto)).toBe(5000);
    }, LENTO);
  });

  // ══════════════════════════════════════════════════════════════════════════
  // SEG-B1 — re-correr 0037 no pisa la policy de 0039
  // ══════════════════════════════════════════════════════════════════════════
  it('SEG-B1 (H5): re-ejecutar 0037 sola después de 0039 conserva la rama de estimaciones', async () => {
    const db2 = await crearDbMigrada();
    const sql = readFileSync(join(DIR_MIGRACIONES, '0037_datos_fiscales.sql'), 'utf8');
    await db2.transaction(async (tx) => { await tx.exec(sql); });
    const despues = await db2.query<{ q: string }>(
      `select with_check as q from pg_policies where tablename = 'cobro_fiscal' and policyname = 'cobro_fiscal_oficina'`);
    expect(despues.rows[0].q).toContain('estimacion');
    await db2.close();
  }, LENTO);

  // ══════════════════════════════════════════════════════════════════════════
  // SEG-B2 — la foto de la estimación no lleva notas internas
  // ══════════════════════════════════════════════════════════════════════════
  it('SEG-B2: la foto que ve el cliente no trae la nota de las capturas de avance', async () => {
    const obra = await crearObra(db, a.empresaId);
    const partida = await crearPartida(db, a.empresaId, obra);
    await insertar(db, 'public.avance_partida', {
      id: randomUUID(), empresa_id: a.empresaId, obra_id: obra, presupuesto_id: partida,
      fecha: INICIO + DIA, cantidad: 3, nota: 'nota interna del residente',
    });
    const est = randomUUID();
    await insertar(db, 'public.estimaciones', {
      id: est, empresa_id: a.empresaId, obra_id: obra, periodo_inicio: INICIO, periodo_fin: INICIO + 10 * DIA,
    });
    await insertar(db, 'public.estimacion_renglon', {
      id: randomUUID(), empresa_id: a.empresaId, estimacion_id: est, presupuesto_id: partida,
      concepto: 'Firme', unidad: 'm2', cantidad: 3, precio_unitario: 100,
    });
    const f = await db.query<{ s: { renglones: { generadores: Record<string, unknown>[] }[] } }>(
      'select public._estimacion_snapshot($1) as s', [est]);
    const gen = f.rows[0].s.renglones[0].generadores;
    expect(gen).toHaveLength(1);
    expect(gen[0]).not.toHaveProperty('nota');
    expect(JSON.stringify(f.rows[0].s)).not.toContain('nota interna');
  }, LENTO);

  // ══════════════════════════════════════════════════════════════════════════
  // SEG-B3 — el margen objetivo de la empresa solo lo ve el dueño
  // ══════════════════════════════════════════════════════════════════════════
  it('SEG-B3: el margen objetivo no está en empresa_config y solo lo leen admin y contador', async () => {
    const col = await db.query(
      `select 1 from information_schema.columns
        where table_schema = 'public' and table_name = 'empresa_config' and column_name = 'margen_objetivo'`);
    expect(col.rows).toHaveLength(0);
    await db.query(
      `insert into public.empresa_margen (empresa_id, margen_objetivo) values ($1, 22)
       on conflict (empresa_id) do update set margen_objetivo = 22`, [a.empresaId]);
    for (const u of [supA, colA, resA]) {
      const r = await comoUsuario(db, u, (tx) => tx.query('select 1 from public.empresa_margen where empresa_id = $1', [a.empresaId]));
      expect(r.rows).toHaveLength(0);
    }
    const ad = await comoUsuario(db, a.adminId, (tx) => tx.query('select 1 from public.empresa_margen where empresa_id = $1', [a.empresaId]));
    expect(ad.rows).toHaveLength(1);
  }, LENTO);

  // ══════════════════════════════════════════════════════════════════════════
  // SEG-B5 — tope de archivos del cliente
  // ══════════════════════════════════════════════════════════════════════════
  it('SEG-B5: el cliente sube máximo 8 archivos por reclamo y 10 constancias', async () => {
    const obra = await crearObra(db, a.empresaId);
    const { clienteId, userId } = await crearClienteConCuenta(db, a.empresaId);
    await db.query('update public.obras set cliente_id = $2 where id = $1', [obra, clienteId]);
    const rep = randomUUID();
    await comoUsuario(db, userId, (tx) =>
      tx.query('select public.reportar_garantia($1,$2,$3,$4)', [rep, obra, 'Se cuarteó el muro', 'Sala']));
    const carpeta = `${a.empresaId}/${obra}/${rep}/`;
    for (let i = 0; i < 8; i++) {
      await comoUsuario(db, userId, (tx) =>
        tx.query(`insert into storage.objects (bucket_id, name) values ('postventa', $1)`, [`${carpeta}${i}.jpg`]));
    }
    await expect(
      comoUsuario(db, userId, (tx) =>
        tx.query(`insert into storage.objects (bucket_id, name) values ('postventa', $1)`, [`${carpeta}9.jpg`])),
    ).rejects.toThrow(RLS);

    const constancias = `${a.empresaId}/constancias/${clienteId}/`;
    for (let i = 0; i < 10; i++) {
      await comoUsuario(db, userId, (tx) =>
        tx.query(`insert into storage.objects (bucket_id, name) values ('fiscal', $1)`, [`${constancias}${i}.pdf`]));
    }
    await expect(
      comoUsuario(db, userId, (tx) =>
        tx.query(`insert into storage.objects (bucket_id, name) values ('fiscal', $1)`, [`${constancias}11.pdf`])),
    ).rejects.toThrow(RLS);
  }, LENTO);

  // ══════════════════════════════════════════════════════════════════════════
  // SEG-B6 — renglón de estimación: el UPDATE revalida la partida
  // ══════════════════════════════════════════════════════════════════════════
  it('SEG-B6: al editar un renglón no se puede colgar de una partida de otra obra', async () => {
    const obra = await crearObra(db, a.empresaId);
    const otraObra = await crearObra(db, a.empresaId);
    const partida = await crearPartida(db, a.empresaId, obra);
    const ajena = await crearPartida(db, a.empresaId, otraObra);
    const est = randomUUID();
    await insertar(db, 'public.estimaciones', {
      id: est, empresa_id: a.empresaId, obra_id: obra, periodo_inicio: INICIO, periodo_fin: INICIO + DIA,
    });
    const ren = randomUUID();
    await comoUsuario(db, a.adminId, (tx) =>
      insertar(tx, 'public.estimacion_renglon', {
        id: ren, empresa_id: a.empresaId, estimacion_id: est, presupuesto_id: partida,
        concepto: 'Firme', unidad: 'm2', cantidad: 1, precio_unitario: 100,
      }));
    await expect(
      comoUsuario(db, a.adminId, (tx) =>
        tx.query('update public.estimacion_renglon set presupuesto_id = $2 where id = $1', [ren, ajena])),
    ).rejects.toThrow(RLS);
    // Borrarlo (lógico) sí.
    await comoUsuario(db, a.adminId, (tx) =>
      tx.query('update public.estimacion_renglon set deleted_at = 1 where id = $1', [ren]));
  }, LENTO);

  // ══════════════════════════════════════════════════════════════════════════
  // SEG-B7 — la confirmación del cliente no se falsifica
  // ══════════════════════════════════════════════════════════════════════════
  it('SEG-B7: la oficina no puede marcar los datos fiscales como "confirmados por el cliente"', async () => {
    const contador = await invitarConRol(db, a, 'contador');
    const { clienteId, userId } = await crearClienteConCuenta(db, a.empresaId);
    await db.query(
      `update public.empresa_config set modulos = public.modulos_resolver(modulos || array['fiscal']) where empresa_id = $1`,
      [a.empresaId]);
    const leer = async () =>
      (await db.query<{ at: string | null; por: string | null }>(
        'select fiscales_confirmados_at::text as at, fiscales_confirmados_por::text as por from public.cliente_fiscal where cliente_id = $1',
        [clienteId])).rows[0];

    // Alta por la oficina con una confirmación inventada → nace vacía.
    await comoUsuario(db, contador, (tx) =>
      insertar(tx, 'public.cliente_fiscal', {
        cliente_id: clienteId, empresa_id: a.empresaId, rfc: 'GODE561231GR8', razon_social: 'Juan',
        fiscales_confirmados_at: 123, fiscales_confirmados_por: userId,
      }, { returning: false }));
    expect(await leer()).toEqual({ at: null, por: null });

    // El cliente confirma por su RPC → queda su confirmación.
    const c = await comoUsuario(db, userId, (tx) =>
      tx.query<{ r: { ok: boolean } }>(
        'select public.confirmar_mis_datos_fiscales($1, $2, $3, $4, $5, $6, $7, $8) as r',
        [clienteId, 'GODE561231GR8', 'Juan Pérez', '612', '64000', 'G03', '', null]));
    expect(c.rows[0].r.ok).toBe(true);
    const confirmada = await leer();
    expect(confirmada.at).not.toBeNull();
    expect(confirmada.por).toBe(userId);

    // La oficina "re-confirma" sin cambiar datos → se conserva la del cliente.
    await comoUsuario(db, contador, (tx) =>
      tx.query('update public.cliente_fiscal set fiscales_confirmados_at = 1, fiscales_confirmados_por = $2 where cliente_id = $1',
        [clienteId, contador]));
    expect(await leer()).toEqual(confirmada);

    // La oficina cambia un dato → la confirmación se borra (F1b-5), aunque mande otra.
    await comoUsuario(db, contador, (tx) =>
      tx.query(`update public.cliente_fiscal set cp_fiscal = '64001', fiscales_confirmados_at = 5 where cliente_id = $1`,
        [clienteId]));
    expect(await leer()).toEqual({ at: null, por: null });
  }, LENTO);

  // ══════════════════════════════════════════════════════════════════════════
  // SEG-B8 — captura de avance ya estimada
  // ══════════════════════════════════════════════════════════════════════════
  it('SEG-B8: una captura que respalda una estimación enviada no se edita ni se borra; lo demás sí', async () => {
    const obra = await crearObra(db, a.empresaId);
    const partida = await crearPartida(db, a.empresaId, obra);
    const cap = randomUUID();
    const despues = randomUUID();
    await comoUsuario(db, supA, async (tx) => {
      await insertar(tx, 'public.avance_partida', {
        id: cap, empresa_id: a.empresaId, obra_id: obra, presupuesto_id: partida, fecha: INICIO + 2 * DIA, cantidad: 5,
      });
      await insertar(tx, 'public.avance_partida', {
        id: despues, empresa_id: a.empresaId, obra_id: obra, presupuesto_id: partida, fecha: INICIO + 20 * DIA, cantidad: 5,
      });
    });
    const est = await estimacionEnviada(db, a.empresaId, obra, partida);

    for (const u of [supA, a.adminId]) {
      await expect(
        comoUsuario(db, u, (tx) => tx.query('update public.avance_partida set cantidad = 50 where id = $1', [cap])),
      ).rejects.toThrow(/AVANCE_ESTIMADO/);
      await expect(
        comoUsuario(db, u, (tx) => tx.query('update public.avance_partida set deleted_at = 1 where id = $1', [cap])),
      ).rejects.toThrow(/AVANCE_ESTIMADO/);
    }
    // Lo capturado DESPUÉS del periodo estimado se sigue corrigiendo.
    await comoUsuario(db, supA, (tx) => tx.query('update public.avance_partida set cantidad = 4 where id = $1', [despues]));
    // La corrección de lo ya estimado es otra captura (negativa).
    await comoUsuario(db, supA, (tx) =>
      insertar(tx, 'public.avance_partida', {
        id: randomUUID(), empresa_id: a.empresaId, obra_id: obra, presupuesto_id: partida, fecha: INICIO + 21 * DIA, cantidad: -1,
      }));
    // Si el cliente RECHAZA la estimación, lo capturado se libera (F3-6).
    await db.query(
      `update public.estimaciones set estado = 'RECHAZADA', respondido_at = 2, motivo_rechazo = 'mal medido' where id = $1`, [est]);
    await comoUsuario(db, supA, (tx) => tx.query('update public.avance_partida set cantidad = 4 where id = $1', [cap]));
  }, LENTO);

  // ══════════════════════════════════════════════════════════════════════════
  // SEG-B9 — casts seguros en Storage
  // ══════════════════════════════════════════════════════════════════════════
  it('SEG-B9: una ruta basura en Storage niega en vez de tronar (también al listar)', async () => {
    const buckets = ['extras', 'fiscal', 'cumplimiento', 'bitacora', 'seguridad', 'postventa'];
    for (const b of buckets) await objeto(db, b, `basura-${randomUUID()}/x/y/z.jpg`);
    // Con los casts ::uuid de antes, este SELECT reventaba con "invalid input syntax for type uuid".
    for (const u of [supA, a.adminId]) {
      const r = await comoUsuario(db, u, (tx) =>
        tx.query(`select name from storage.objects where bucket_id = any($1) and name like 'basura-%'`, [buckets]));
      expect(r.rows).toHaveLength(0);
    }
    for (const b of buckets) {
      await expect(
        comoUsuario(db, a.adminId, (tx) =>
          tx.query('insert into storage.objects (bucket_id, name) values ($1, $2)', [b, `basura/${randomUUID()}/x/y.jpg`])),
        b,
      ).rejects.toThrow(RLS);
    }
  }, LENTO);

  // ══════════════════════════════════════════════════════════════════════════
  // F6: lo aditivo de 0042/0044 no reabre los huecos
  // ══════════════════════════════════════════════════════════════════════════
  it('F6: compras y almacén no borran obras ni partidas; el colaborador con obra asignada tampoco', async () => {
    const obra = await crearObra(db, a.empresaId);
    const partida = await crearPartida(db, a.empresaId, obra);
    await asignarObra(db, a, colA, obra);
    const compras = await crearUsuario(db);
    await agregarMembresia(db, a.empresaId, compras, 'admin');
    await db.query(`update public.usuarios_empresa set rol = 'compras' where user_id = $1`, [compras]);
    for (const u of [compras, colA]) {
      expect((await comoUsuario(db, u, (tx) => tx.query('delete from public.obra_presupuesto where id = $1', [partida]))).affectedRows).toBe(0);
      expect((await comoUsuario(db, u, (tx) => tx.query('delete from public.obras where id = $1', [obra]))).affectedRows).toBe(0);
    }
  }, LENTO);

  // ══════════════════════════════════════════════════════════════════════════
  // Idempotencia (H6)
  // ══════════════════════════════════════════════════════════════════════════
  it('idempotencia: 0035 en adelante aplicadas DOS veces (con datos) no fallan', async () => {
    const db2 = await crearDbMigrada();
    await crearEmpresaDePrueba(db2);
    const nuevas = listarMigraciones().filter((f) => f >= '0035');
    expect(nuevas).toContain('0045_endurecimiento.sql');
    const errores: string[] = [];
    for (const f of nuevas) {
      const sql = readFileSync(join(DIR_MIGRACIONES, f), 'utf8');
      try {
        await db2.transaction(async (tx) => { await tx.exec(sql); });
      } catch (e) {
        errores.push(`${f}: ${(e as Error).message}`);
      }
    }
    expect(errores).toEqual([]);
    await crearEmpresaDePrueba(db2);
    await db2.close();
  }, LENTO);
});
