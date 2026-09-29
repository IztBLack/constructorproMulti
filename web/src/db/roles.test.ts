// 0042/0044 — organización grande (F6) sobre Postgres real (PGlite).
// Cómo funciona el harness: `src/db/pglite/README.md`.
//
// Lo que se prueba:
//   · roles nuevos por el flujo real (invitar + canjear) y cambio de rol,
//   · `usuario_obra`: solo el admin asigna, cada quien lee lo suyo,
//   · RESIDENTE (D4): ve y escribe SOLO sus obras en cada tabla clave, y no ve
//     utilidad, datos fiscales, IMSS, salud, expediente de subcontratistas,
//     cotizaciones, pagos de proveedor ni la actividad,
//   · COLABORADOR con obra: escribe y lee la bitácora de SU obra, nada más,
//   · COMPRAS y ALMACÉN según F6-8/F6-9,
//   · visto bueno configurable (extras y órdenes de compra),
//   · `actividad`: registra, solo el admin la lee, nadie la cambia ni la borra,
//   · aislamiento entre empresas.

import { randomUUID } from 'node:crypto';
import { beforeAll, describe, expect, it } from 'vitest';
import type { PGlite } from '@electric-sql/pglite';
import { comoUsuario, dbMigrada, type Consultable } from './pglite/crear-db';
import {
  agregarMembresia,
  asignarObra,
  crearClienteConCuenta,
  crearEmpresaDePrueba,
  crearMovimiento,
  crearNotaObra,
  crearObra,
  crearUsuario,
  idsVisibles,
  insertar,
  invitarConRol,
  type EmpresaDePrueba,
} from './pglite/escenarios';

const LENTO = 60_000;
const RLS = /row-level security/;
const DIA = 24 * 60 * 60 * 1000;

interface R {
  ok: boolean;
  error?: string;
  estado?: string;
  necesaria?: boolean;
  necesita_aprobacion?: boolean;
  id?: string;
}

async function rpc(db: PGlite, userId: string, sql: string, params: unknown[]): Promise<R> {
  const r = await comoUsuario(db, userId, (tx) => tx.query<{ r: R }>(sql, params));
  return r.rows[0].r;
}

async function crearColaborador(c: Consultable, empresaId: string): Promise<string> {
  const puesto = randomUUID();
  await insertar(c, 'public.puestos', { id: puesto, nombre: 'Albañil', empresa_id: empresaId });
  const id = randomUUID();
  await insertar(c, 'public.colaboradores', {
    id,
    nombre: 'Juan Pérez',
    puesto_id: puesto,
    tipo_pago: 'DIA',
    empresa_id: empresaId,
  });
  return id;
}

describe('0042 — roles de organización grande', () => {
  let db: PGlite;
  let a: EmpresaDePrueba;
  let b: EmpresaDePrueba;
  let obra1: string; // asignada al residente y al colaborador
  let obra2: string; // de la misma empresa, NO asignada
  let obraB: string;
  let residente: string;
  let supervisor: string;
  let colaborador: string;
  let colabSinObra: string;
  let compras: string;
  let almacen: string;
  let contador: string;
  let cliente: { userId: string; clienteId: string };
  let colab1: string; // ficha de la raya de la empresa A

  beforeAll(async () => {
    db = await dbMigrada();
    a = await crearEmpresaDePrueba(db);
    b = await crearEmpresaDePrueba(db);
    obra1 = await crearObra(db, a.empresaId, { nombre: 'Casa Juárez' });
    obra2 = await crearObra(db, a.empresaId, { nombre: 'Bodega Norte' });
    obraB = await crearObra(db, b.empresaId);
    residente = await invitarConRol(db, a, 'residente');
    supervisor = await invitarConRol(db, a, 'supervisor');
    colaborador = await invitarConRol(db, a, 'colaborador');
    colabSinObra = await invitarConRol(db, a, 'colaborador');
    compras = await invitarConRol(db, a, 'compras');
    almacen = await invitarConRol(db, a, 'almacen');
    contador = await invitarConRol(db, a, 'contador');
    cliente = await crearClienteConCuenta(db, a.empresaId);
    await asignarObra(db, a, residente, obra1);
    await asignarObra(db, a, colaborador, obra1);
    colab1 = await crearColaborador(db, a.empresaId);
  }, LENTO);

  // ──────────────────────────────────────────────────────────────────────────
  describe('roles y asignación de obras', () => {
    it('los roles nuevos entran por invitar + canjear y quedan con su rol', async () => {
      const r = await db.query<{ rol: string }>(
        'select rol from public.usuarios_empresa where user_id = any($1::uuid[]) order by rol',
        [[residente, compras, almacen]],
      );
      expect(r.rows.map((x) => x.rol)).toEqual(['almacen', 'compras', 'residente']);
    });

    it('cambiar_rol acepta los roles nuevos y rechaza uno inventado', async () => {
      const u = await invitarConRol(db, a, 'supervisor');
      expect((await rpc(db, a.adminId, 'select public.cambiar_rol_usuario($1, $2) as r', [u, 'residente'])).ok).toBe(true);
      expect((await rpc(db, a.adminId, 'select public.cambiar_rol_usuario($1, $2) as r', [u, 'almacen'])).ok).toBe(true);
      const mal = await rpc(db, a.adminId, 'select public.cambiar_rol_usuario($1, $2) as r', [u, 'jefe']);
      expect(mal.ok).toBe(false);
      const inv = await rpc(db, a.adminId, 'select public.invitar_usuario($1, $2) as r', ['Pedro', 'dueño']);
      expect(inv.ok).toBe(false);
    });

    it('solo el admin asigna; cada quien ve SUS asignaciones', async () => {
      await expect(
        comoUsuario(db, supervisor, (tx) =>
          insertar(tx, 'public.usuario_obra', { empresa_id: a.empresaId, user_id: residente, obra_id: obra2 }, { returning: false }),
        ),
      ).rejects.toThrow(RLS);
      const propias = await comoUsuario(db, residente, (tx) =>
        tx.query<{ obra_id: string }>('select obra_id from public.usuario_obra'),
      );
      expect(propias.rows.map((x) => x.obra_id)).toEqual([obra1]);
      // El supervisor y el otro colaborador no ven las asignaciones ajenas.
      for (const u of [supervisor, colabSinObra]) {
        const r = await comoUsuario(db, u, (tx) => tx.query('select 1 from public.usuario_obra'));
        expect(r.rows).toEqual([]);
      }
    });

    it('no se asigna una obra de otra empresa, ni a un supervisor, ni a alguien de fuera', async () => {
      await expect(asignarObra(db, a, residente, obraB)).rejects.toThrow();
      await expect(asignarObra(db, a, supervisor, obra2)).rejects.toThrow(/residentes y colaboradores/);
      const ajeno = await crearUsuario(db);
      await expect(asignarObra(db, a, ajeno, obra2)).rejects.toThrow(/residentes y colaboradores/);
      // El admin de B no asigna obras de A.
      await expect(
        comoUsuario(db, b.adminId, (tx) =>
          insertar(tx, 'public.usuario_obra', { empresa_id: a.empresaId, user_id: residente, obra_id: obra2 }, { returning: false }),
        ),
      ).rejects.toThrow(RLS);
    });

    it('una asignación no se mueve de obra (se quita y se hace otra)', async () => {
      await expect(
        comoUsuario(db, a.adminId, (tx) =>
          tx.query('update public.usuario_obra set obra_id = $2 where user_id = $1', [residente, obra2]),
        ),
      ).rejects.toThrow(/no se mueve/);
    });
  });

  // ──────────────────────────────────────────────────────────────────────────
  describe('residente (D4): solo sus obras', () => {
    // Una fila por tabla en cada obra, sembrada como superusuario.
    const filas: Record<string, { en1: string; en2: string }> = {};

    beforeAll(async () => {
      const sembrar = async (tabla: string, fila: (obra: string) => Record<string, unknown>) => {
        const en1 = randomUUID();
        const en2 = randomUUID();
        await insertar(db, tabla, { id: en1, ...fila(obra1) }, { returning: false });
        await insertar(db, tabla, { id: en2, ...fila(obra2) }, { returning: false });
        filas[tabla] = { en1, en2 };
      };
      const e = a.empresaId;
      filas['public.obras'] = { en1: obra1, en2: obra2 };
      filas['public.movimientos'] = {
        en1: await crearMovimiento(db, { empresaId: e, obraId: obra1, tipo: 'SALIDA' }),
        en2: await crearMovimiento(db, { empresaId: e, obraId: obra2, tipo: 'SALIDA' }),
      };
      filas['public.nota_obra'] = {
        en1: await crearNotaObra(db, { empresaId: e, obraId: obra1 }),
        en2: await crearNotaObra(db, { empresaId: e, obraId: obra2 }),
      };
      let dia = Date.now();
      await sembrar('public.asistencias', (o) => ({
        empresa_id: e, obra_id: o, colaborador_id: colab1, fecha: (dia += DIA), fraccion: 1,
      }));
      await sembrar('public.destajos', (o) => ({
        empresa_id: e, obra_id: o, colaborador_id: colab1, fecha: Date.now(), concepto: 'Aplanado', monto: 500,
      }));
      await sembrar('public.obra_presupuesto', (o) => ({ empresa_id: e, obra_id: o, concepto: 'Cimentación' }));
      await sembrar('public.orden_cambio', (o) => ({ empresa_id: e, obra_id: o, titulo: 'Barda extra' }));
      await sembrar('public.bitacora_entrada', (o) => ({
        empresa_id: e, obra_id: o, fecha: Date.now(), tipo: 'AVANCE', texto: 'Se coló la losa',
      }));
      await sembrar('public.programa_partida', (o) => ({
        empresa_id: e, obra_id: o, concepto: 'Cimentación', fecha_inicio: Date.now(), fecha_fin: Date.now() + 7 * DIA,
      }));
      await sembrar('public.estimaciones', (o) => ({
        empresa_id: e, obra_id: o, periodo_inicio: Date.now(), periodo_fin: Date.now() + 14 * DIA,
      }));
      await sembrar('public.seguridad_checklist', (o) => ({ empresa_id: e, obra_id: o, fecha: Date.now() }));
      await sembrar('public.incidente', (o) => ({
        empresa_id: e, obra_id: o, fecha: Date.now(), tipo: 'CASI_ACCIDENTE', descripcion: 'Se cayó una cubeta',
      }));
      await sembrar('public.garantia_reporte', (o) => ({
        empresa_id: e, obra_id: o, origen: 'OFICINA', descripcion: 'Humedad en el muro',
      }));
      await sembrar('public.requisiciones', (o) => ({ empresa_id: e, obra_id: o }));
    }, LENTO);

    it('ve la fila de su obra y NO la de la otra obra, tabla por tabla', async () => {
      for (const [tabla, { en1, en2 }] of Object.entries(filas)) {
        const ve = await comoUsuario(db, residente, (tx) => idsVisibles(tx, tabla, [en1, en2]));
        expect(ve, tabla).toEqual([en1]);
        // El supervisor, en cambio, ve las dos (no se le tocó nada).
        const sup = await comoUsuario(db, supervisor, (tx) => idsVisibles(tx, tabla, [en1, en2]));
        expect(sup.length, `supervisor en ${tabla}`).toBe(2);
      }
    });

    it('escribe en su obra y NO en la otra', async () => {
      const e = a.empresaId;
      await comoUsuario(db, residente, async (tx) => {
        await crearMovimiento(tx, { empresaId: e, obraId: obra1, tipo: 'SALIDA', monto: 250 });
        await insertar(tx, 'public.asistencias', {
          id: randomUUID(), empresa_id: e, obra_id: obra1, colaborador_id: colab1, fecha: Date.now() + 90 * DIA, fraccion: 1,
        }, { returning: false });
        await insertar(tx, 'public.bitacora_entrada', {
          id: randomUUID(), empresa_id: e, obra_id: obra1, fecha: Date.now(), tipo: 'AVANCE', texto: 'Llegó el acero',
        }, { returning: false });
        await insertar(tx, 'public.orden_cambio', {
          id: randomUUID(), empresa_id: e, obra_id: obra1, titulo: 'Ventana extra',
        }, { returning: false });
        await insertar(tx, 'public.seguridad_checklist', {
          id: randomUUID(), empresa_id: e, obra_id: obra1, fecha: Date.now() + 3 * DIA,
        }, { returning: false });
      });
      for (const [tabla, fila] of [
        ['public.movimientos', { fecha: Date.now(), tipo: 'SALIDA', categoria: 'Material', concepto: 'x', monto: 1, metodo_pago: 'EFECTIVO' }],
        ['public.bitacora_entrada', { fecha: Date.now(), tipo: 'AVANCE', texto: 'x' }],
        ['public.orden_cambio', { titulo: 'x' }],
        ['public.obra_presupuesto', { concepto: 'x' }],
      ] as const) {
        await expect(
          comoUsuario(db, residente, (tx) =>
            insertar(tx, tabla, { id: randomUUID(), empresa_id: e, obra_id: obra2, ...fila }, { returning: false }),
          ),
          tabla,
        ).rejects.toThrow(RLS);
      }
    });

    it('no crea ni borra obras, y no edita la obra que no es suya', async () => {
      await expect(
        comoUsuario(db, residente, (tx) => crearObra(tx, a.empresaId)),
      ).rejects.toThrow(RLS);
      const r = await comoUsuario(db, residente, (tx) =>
        tx.query('update public.obras set avance = 50 where id = $1', [obra2]),
      );
      expect(r.affectedRows).toBe(0);
      const ok = await comoUsuario(db, residente, (tx) =>
        tx.query('update public.obras set avance = 40 where id = $1', [obra1]),
      );
      expect(ok.affectedRows).toBe(1);
    });

    it('no ve utilidad, fiscal, IMSS, salud, subcontratistas, cotizaciones, clientes ni usuarios', async () => {
      const e = a.empresaId;
      const cotizacion = randomUUID();
      await insertar(db, 'public.cotizaciones', {
        id: cotizacion, empresa_id: e, cliente: 'Juan', nombre_proyecto: 'Casa', fecha: Date.now(), estado: 'BORRADOR',
      }, { returning: false });
      await insertar(db, 'public.obra_margen_objetivo', { obra_id: obra1, empresa_id: e, margen_objetivo: 20 }, { returning: false });
      await insertar(db, 'public.empresa_fiscal', {
        empresa_id: e, rfc: 'AAA010101AAA', razon_social: 'Constructora', regimen: '601', cp_fiscal: '64000',
      }, { returning: false });
      await insertar(db, 'public.colaborador_datos_imss', { colaborador_id: colab1, empresa_id: e, nss: '12345678901' }, { returning: false });
      const inc = randomUUID();
      await insertar(db, 'public.incidente', {
        id: inc, empresa_id: e, obra_id: obra1, fecha: Date.now(), tipo: 'ACCIDENTE', descripcion: 'Se cortó',
      }, { returning: false });
      await insertar(db, 'public.incidente_salud', {
        id: randomUUID(), empresa_id: e, incidente_id: inc, tipo_lesion: 'HERIDA', parte_cuerpo: 'OTRA', atencion: 'PRIMEROS_AUXILIOS',
      }, { returning: false });
      const sub = randomUUID();
      await insertar(db, 'public.subcontratista', { id: sub, empresa_id: e, nombre: 'Yesos del Norte' }, { returning: false });

      const cuenta = async (sql: string) =>
        (await comoUsuario(db, residente, (tx) => tx.query(sql, [e]))).rows.length;
      expect(await cuenta('select 1 from public.obra_margen_objetivo where empresa_id = $1')).toBe(0);
      expect(await cuenta('select 1 from public.empresa_fiscal where empresa_id = $1')).toBe(0);
      expect(await cuenta('select 1 from public.cliente_fiscal where empresa_id = $1')).toBe(0);
      expect(await cuenta('select 1 from public.cobro_fiscal where empresa_id = $1')).toBe(0);
      expect(await cuenta('select 1 from public.colaborador_datos_imss where empresa_id = $1')).toBe(0);
      expect(await cuenta('select 1 from public.incidente_salud where empresa_id = $1')).toBe(0);
      expect(await cuenta('select 1 from public.subcontratista where empresa_id = $1')).toBe(0);
      expect(await cuenta('select 1 from public.cotizaciones where empresa_id = $1')).toBe(0);
      expect(await cuenta('select 1 from public.clientes where empresa_id = $1')).toBe(0);
      expect(await cuenta('select 1 from public.pagos where empresa_id = $1')).toBe(0);
      expect(await cuenta('select 1 from public.pagos_proveedor where empresa_id = $1')).toBe(0);
      expect(await cuenta('select 1 from public.actividad where empresa_id = $1')).toBe(0);
      expect(await cuenta('select 1 from public.obra_siroc where empresa_id = $1')).toBe(0);
      // De `usuarios_empresa` solo su propia fila.
      const yo = await comoUsuario(db, residente, (tx) =>
        tx.query<{ user_id: string }>('select user_id from public.usuarios_empresa where empresa_id = $1', [e]),
      );
      expect(yo.rows.map((x) => x.user_id)).toEqual([residente]);
      // Tampoco lista usuarios por la RPC.
      await expect(
        comoUsuario(db, residente, (tx) => tx.query('select * from public.listar_usuarios_empresa()')),
      ).rejects.toThrow(/administrador/);
    });

    it('lee (sin escribir) la plantilla, el catálogo y la configuración de su empresa', async () => {
      const ve = await comoUsuario(db, residente, (tx) => idsVisibles(tx, 'public.colaboradores', [colab1]));
      expect(ve).toEqual([colab1]);
      const conf = await comoUsuario(db, residente, (tx) =>
        tx.query('select modulos from public.empresa_config where empresa_id = $1', [a.empresaId]),
      );
      expect(conf.rows.length).toBe(1);
      await expect(
        comoUsuario(db, residente, (tx) => crearColaborador(tx, a.empresaId)),
      ).rejects.toThrow(RLS);
      const upd = await comoUsuario(db, residente, (tx) =>
        tx.query('update public.empresa_config set iva_porcentaje = 8 where empresa_id = $1', [a.empresaId]),
      );
      expect(upd.affectedRows).toBe(0);
    });

    it('no cuelga una fila de su OTRA empresa bajo la obra asignada (lección 0019)', async () => {
      // El mismo residente también es residente en B, sin obras allá.
      await agregarMembresia(db, b.empresaId, residente, 'residente');
      await expect(
        comoUsuario(db, residente, (tx) =>
          crearMovimiento(tx, { empresaId: b.empresaId, obraId: obra1, tipo: 'SALIDA' }),
        ),
      ).rejects.toThrow(RLS);
      // Y en B no ve nada de B (no tiene obras asignadas allá).
      const ve = await comoUsuario(db, residente, (tx) => idsVisibles(tx, 'public.obras', [obraB]));
      expect(ve).toEqual([]);
    });

    it('la asignación vencida o borrada deja de dar acceso', async () => {
      const r2 = await invitarConRol(db, a, 'residente');
      const asig = await asignarObra(db, a, r2, obra2);
      expect(await comoUsuario(db, r2, (tx) => idsVisibles(tx, 'public.obras', [obra2]))).toEqual([obra2]);
      await comoUsuario(db, a.adminId, (tx) =>
        tx.query('update public.usuario_obra set hasta = desde where id = $1', [asig]),
      );
      expect(await comoUsuario(db, r2, (tx) => idsVisibles(tx, 'public.obras', [obra2]))).toEqual([]);
    });

    it('al quitarle el acceso se cierran sus asignaciones', async () => {
      const r3 = await invitarConRol(db, a, 'residente');
      await asignarObra(db, a, r3, obra1);
      const q = await rpc(db, a.adminId, 'select public.revocar_acceso_usuario($1) as r', [r3]);
      expect(q.ok).toBe(true);
      const vivas = await db.query('select 1 from public.usuario_obra where user_id = $1 and deleted_at is null', [r3]);
      expect(vivas.rows).toEqual([]);
    });

    it('Storage: sube comprobantes solo a la carpeta de SU obra', async () => {
      const subir = (obra: string) =>
        comoUsuario(db, residente, (tx) =>
          insertar(tx, 'storage.objects', {
            bucket_id: 'comprobantes',
            name: `${a.empresaId}/${obra}/${randomUUID()}-recibo.jpg`,
          }, { returning: false }),
        );
      await subir(obra1);
      await expect(subir(obra2)).rejects.toThrow(RLS);
    });
  });

  // ──────────────────────────────────────────────────────────────────────────
  describe('colaborador con obra asignada: bitácora (abre F4-2)', () => {
    const entrada = (obra: string) => ({
      id: randomUUID(), empresa_id: a.empresaId, obra_id: obra, fecha: Date.now(), tipo: 'AVANCE', texto: 'Terminamos el firme',
    });

    it('escribe en SU obra y lee su bitácora; no en la otra', async () => {
      const mia = entrada(obra1);
      await comoUsuario(db, colaborador, (tx) => insertar(tx, 'public.bitacora_entrada', mia, { returning: false }));
      await expect(
        comoUsuario(db, colaborador, (tx) => insertar(tx, 'public.bitacora_entrada', entrada(obra2), { returning: false })),
      ).rejects.toThrow(RLS);
      const otraEnObra2 = entrada(obra2);
      await insertar(db, 'public.bitacora_entrada', otraEnObra2, { returning: false });
      const ve = await comoUsuario(db, colaborador, (tx) =>
        idsVisibles(tx, 'public.bitacora_entrada', [mia.id, otraEnObra2.id]),
      );
      expect(ve).toEqual([mia.id]);
      // Autor sellado por el trigger.
      const autor = await db.query<{ autor_id: string }>('select autor_id from public.bitacora_entrada where id = $1', [mia.id]);
      expect(autor.rows[0].autor_id).toBe(colaborador);
    });

    it('no edita, no aclara y no escribe sin obra asignada', async () => {
      const mia = entrada(obra1);
      await comoUsuario(db, colaborador, (tx) => insertar(tx, 'public.bitacora_entrada', mia, { returning: false }));
      const upd = await comoUsuario(db, colaborador, (tx) =>
        tx.query('update public.bitacora_entrada set texto = $2 where id = $1', [mia.id, 'otra cosa']),
      );
      expect(upd.affectedRows).toBe(0);
      await expect(
        comoUsuario(db, colaborador, (tx) =>
          insertar(tx, 'public.bitacora_aclaracion', {
            id: randomUUID(), empresa_id: a.empresaId, entrada_id: mia.id, texto: 'Aclaro',
          }, { returning: false }),
        ),
      ).rejects.toThrow(RLS);
      await expect(
        comoUsuario(db, colabSinObra, (tx) => insertar(tx, 'public.bitacora_entrada', entrada(obra1), { returning: false })),
      ).rejects.toThrow(RLS);
      expect(await comoUsuario(db, colabSinObra, (tx) => idsVisibles(tx, 'public.bitacora_entrada', [mia.id]))).toEqual([]);
    });

    it('pone fotos solo a SUS entradas de su obra', async () => {
      const mia = entrada(obra1);
      await comoUsuario(db, colaborador, (tx) => insertar(tx, 'public.bitacora_entrada', mia, { returning: false }));
      const ajena = entrada(obra1);
      await comoUsuario(db, residente, (tx) => insertar(tx, 'public.bitacora_entrada', ajena, { returning: false }));
      const foto = (e: { id: string; obra_id: string }) => ({
        id: randomUUID(), empresa_id: a.empresaId, entrada_id: e.id, path: `${a.empresaId}/${e.obra_id}/${e.id}/${randomUUID()}.jpg`,
      });
      await comoUsuario(db, colaborador, (tx) => insertar(tx, 'public.bitacora_foto', foto(mia), { returning: false }));
      await expect(
        comoUsuario(db, colaborador, (tx) => insertar(tx, 'public.bitacora_foto', foto(ajena), { returning: false })),
      ).rejects.toThrow(RLS);
    });

    it('fuera de la bitácora no gana nada: sigue sin ver extras ni seguridad', async () => {
      const ve = await comoUsuario(db, colaborador, (tx) =>
        tx.query('select 1 from public.orden_cambio where empresa_id = $1', [a.empresaId]),
      );
      expect(ve.rows).toEqual([]);
      const seg = await comoUsuario(db, colaborador, (tx) =>
        tx.query('select 1 from public.seguridad_checklist where empresa_id = $1', [a.empresaId]),
      );
      expect(seg.rows).toEqual([]);
    });
  });

  // ──────────────────────────────────────────────────────────────────────────
  describe('compras, almacén y residente en compras (0038)', () => {
    let prov: string;
    let material: string;

    const orden = async (userId: string, obra: string, cantidad: number, precio: number) => {
      const id = randomUUID();
      const rid = randomUUID();
      await comoUsuario(db, userId, async (tx) => {
        await insertar(tx, 'public.ordenes_compra', {
          id, empresa_id: a.empresaId, obra_id: obra, proveedor_id: prov, iva_pct: 16,
        }, { returning: false });
        await insertar(tx, 'public.orden_compra_renglon', {
          id: rid, empresa_id: a.empresaId, orden_compra_id: id, material_id: material,
          descripcion: 'Cemento gris', unidad: 'bulto', cantidad, precio_unitario: precio,
        }, { returning: false });
      });
      return { id, rid };
    };
    const emitir = (u: string, id: string) => rpc(db, u, 'select public.emitir_orden_compra($1) as r', [id]);

    beforeAll(async () => {
      prov = randomUUID();
      material = randomUUID();
      await comoUsuario(db, compras, async (tx) => {
        await insertar(tx, 'public.proveedores', { id: prov, empresa_id: a.empresaId, nombre: 'Materiales del Norte' }, { returning: false });
        await insertar(tx, 'public.materiales', { id: material, empresa_id: a.empresaId, nombre: 'Cemento', unidad: 'bulto' }, { returning: false });
      });
    }, LENTO);

    it('compras da de alta proveedores y materiales; almacén y residente no', async () => {
      for (const u of [almacen, residente]) {
        await expect(
          comoUsuario(db, u, (tx) =>
            insertar(tx, 'public.proveedores', { id: randomUUID(), empresa_id: a.empresaId, nombre: 'X' }, { returning: false }),
          ),
        ).rejects.toThrow(RLS);
      }
      // Todos ven el catálogo para pedir y recibir.
      for (const u of [compras, almacen, residente]) {
        expect(await comoUsuario(db, u, (tx) => idsVisibles(tx, 'public.materiales', [material]))).toEqual([material]);
      }
    });

    it('compras aprueba requisiciones; el residente pide solo en su obra', async () => {
      const req = randomUUID();
      await comoUsuario(db, residente, (tx) =>
        insertar(tx, 'public.requisiciones', { id: req, empresa_id: a.empresaId, obra_id: obra1 }, { returning: false }),
      );
      await expect(
        comoUsuario(db, residente, (tx) =>
          insertar(tx, 'public.requisiciones', { id: randomUUID(), empresa_id: a.empresaId, obra_id: obra2 }, { returning: false }),
        ),
      ).rejects.toThrow(RLS);
      // El residente no se aprueba a sí mismo.
      await expect(
        comoUsuario(db, residente, (tx) =>
          tx.query(`update public.requisiciones set estado = 'APROBADA' where id = $1`, [req]),
        ),
      ).rejects.toThrow(RLS);
      await comoUsuario(db, compras, (tx) =>
        tx.query(`update public.requisiciones set estado = 'APROBADA' where id = $1`, [req]),
      );
      const est = await db.query<{ estado: string }>('select estado from public.requisiciones where id = $1', [req]);
      expect(est.rows[0].estado).toBe('APROBADA');
    });

    it('sin regla, compras arma la orden pero no la emite; con regla, emite lo chico', async () => {
      const chica = await orden(compras, obra1, 10, 200); // 2,000 + IVA = 2,320
      const sin = await emitir(compras, chica.id);
      expect(sin.ok).toBe(false);
      expect(sin.necesita_aprobacion).toBe(true);

      await comoUsuario(db, a.adminId, (tx) =>
        insertar(tx, 'public.regla_aprobacion', {
          empresa_id: a.empresaId, tipo: 'COMPRA', monto_minimo: 10_000, rol_aprobador: 'admin',
        }, { returning: false }),
      );
      expect((await emitir(compras, chica.id)).ok).toBe(true);

      const grande = await orden(compras, obra1, 100, 200); // 23,200
      const r = await emitir(compras, grande.id);
      expect(r.ok).toBe(false);
      expect(r.necesita_aprobacion).toBe(true);

      // Pide el visto bueno; no se lo puede dar él mismo; el admin sí.
      const sol = await rpc(db, compras, 'select public.solicitar_aprobacion($1, $2) as r', ['COMPRA', grande.id]);
      expect(sol.ok).toBe(true);
      expect(sol.necesaria).toBe(true);
      expect(sol.estado).toBe('PENDIENTE');
      const propia = await rpc(db, compras, 'select public.decidir_aprobacion($1, true, null) as r', [sol.id]);
      expect(propia.ok).toBe(false);
      const sup = await rpc(db, supervisor, 'select public.decidir_aprobacion($1, true, null) as r', [sol.id]);
      expect(sup.ok).toBe(false);
      const adm = await rpc(db, a.adminId, 'select public.decidir_aprobacion($1, true, null) as r', [sol.id]);
      expect(adm.ok).toBe(true);
      expect((await emitir(compras, grande.id)).ok).toBe(true);
    });

    it('el visto bueno vale por el monto aprobado: si la orden crece, se pide otra vez', async () => {
      const o = await orden(compras, obra1, 60, 200); // 13,920
      const sol = await rpc(db, compras, 'select public.solicitar_aprobacion($1, $2) as r', ['COMPRA', o.id]);
      await rpc(db, a.adminId, 'select public.decidir_aprobacion($1, true, null) as r', [sol.id]);
      await comoUsuario(db, compras, (tx) =>
        tx.query('update public.orden_compra_renglon set cantidad = 90 where id = $1', [o.rid]),
      );
      expect((await emitir(compras, o.id)).ok).toBe(false);
    });

    it('almacén y compras reciben; almacén registra existencias; nadie de ellos ve pagos ni paga', async () => {
      const o = await orden(a.adminId, obra2, 5, 100);
      expect((await emitir(a.adminId, o.id)).ok).toBe(true);
      const rec = randomUUID();
      await comoUsuario(db, almacen, async (tx) => {
        await insertar(tx, 'public.recepciones', { id: rec, empresa_id: a.empresaId, orden_compra_id: o.id, obra_id: obra2 }, { returning: false });
        await insertar(tx, 'public.recepcion_renglon', {
          id: randomUUID(), empresa_id: a.empresaId, recepcion_id: rec, orden_compra_renglon_id: o.rid, cantidad_recibida: 5,
        }, { returning: false });
        await insertar(tx, 'public.material_movimiento', {
          id: randomUUID(), empresa_id: a.empresaId, obra_id: obra2, material_id: material, tipo: 'TRASPASO',
          cantidad: 2, obra_destino_id: obra1,
        }, { returning: false });
      });
      // Almacén no arma órdenes ni requisiciones.
      await expect(
        comoUsuario(db, almacen, (tx) =>
          insertar(tx, 'public.ordenes_compra', { id: randomUUID(), empresa_id: a.empresaId, obra_id: obra1, proveedor_id: prov }, { returning: false }),
        ),
      ).rejects.toThrow(RLS);
      expect((await emitir(almacen, o.id)).ok).toBe(false);
      // Compras no registra existencias.
      await expect(
        comoUsuario(db, compras, (tx) =>
          insertar(tx, 'public.material_movimiento', {
            id: randomUUID(), empresa_id: a.empresaId, obra_id: obra2, material_id: material, tipo: 'CONSUMO', cantidad: 1,
          }, { returning: false }),
        ),
      ).rejects.toThrow(RLS);
      // Pagar: ninguno de los dos.
      for (const u of [compras, almacen]) {
        const p = await rpc(db, u, 'select public.pagar_orden_compra($1, $2, $3, $4, $5, $6, $7) as r', [
          randomUUID(), o.id, 100, Date.now(), 'TRANSFERENCIA', '', '',
        ]);
        expect(p.ok).toBe(false);
        const vis = await comoUsuario(db, u, (tx) => tx.query('select 1 from public.pagos_proveedor'));
        expect(vis.rows).toEqual([]);
      }
    });

    it('el residente ve y recibe las órdenes de SU obra, no las de otra', async () => {
      const mia = await orden(a.adminId, obra1, 3, 100);
      const otra = await orden(a.adminId, obra2, 3, 100);
      await emitir(a.adminId, mia.id);
      await emitir(a.adminId, otra.id);
      expect(await comoUsuario(db, residente, (tx) => idsVisibles(tx, 'public.ordenes_compra', [mia.id, otra.id]))).toEqual([mia.id]);
      await comoUsuario(db, residente, (tx) =>
        insertar(tx, 'public.recepciones', { id: randomUUID(), empresa_id: a.empresaId, orden_compra_id: mia.id, obra_id: obra1 }, { returning: false }),
      );
      await expect(
        comoUsuario(db, residente, (tx) =>
          insertar(tx, 'public.recepciones', { id: randomUUID(), empresa_id: a.empresaId, orden_compra_id: otra.id, obra_id: obra1 }, { returning: false }),
        ),
      ).rejects.toThrow(RLS);
    });

    it('otra empresa no ve nada de compras de A', async () => {
      expect(await comoUsuario(db, b.adminId, (tx) => idsVisibles(tx, 'public.proveedores', [prov]))).toEqual([]);
    });
  });

  // ──────────────────────────────────────────────────────────────────────────
  describe('visto bueno de extras', () => {
    const extra = async (userId: string, obra: string, importe: number) => {
      const id = randomUUID();
      const rid = randomUUID();
      await comoUsuario(db, userId, async (tx) => {
        await insertar(tx, 'public.orden_cambio', { id, empresa_id: a.empresaId, obra_id: obra, titulo: 'Extra' }, { returning: false });
        await insertar(tx, 'public.orden_cambio_renglon', {
          id: rid, empresa_id: a.empresaId, orden_cambio_id: id, concepto: 'Muro', unidad: 'm2', cantidad: 1, precio_unitario: importe,
        }, { returning: false });
      });
      return { id, rid };
    };
    const enviar = (u: string, id: string) => rpc(db, u, 'select public.enviar_orden_cambio($1) as r', [id]);

    it('sin regla, solo el admin envía (como en F1-12)', async () => {
      const x = await extra(residente, obra1, 1000);
      expect((await enviar(residente, x.id)).ok).toBe(false);
      expect((await enviar(supervisor, x.id)).ok).toBe(false);
      expect((await enviar(a.adminId, x.id)).ok).toBe(true);
    });

    it('con regla, el residente manda lo chico; lo grande pide visto bueno', async () => {
      await comoUsuario(db, a.adminId, (tx) =>
        insertar(tx, 'public.regla_aprobacion', {
          empresa_id: a.empresaId, tipo: 'EXTRA', monto_minimo: 20_000, rol_aprobador: 'admin',
        }, { returning: false }),
      );
      const chico = await extra(residente, obra1, 5_000);
      expect((await enviar(residente, chico.id)).ok).toBe(true);

      const grande = await extra(residente, obra1, 30_000);
      const r = await enviar(residente, grande.id);
      expect(r.ok).toBe(false);
      expect(r.necesita_aprobacion).toBe(true);
      const sol = await rpc(db, residente, 'select public.solicitar_aprobacion($1, $2) as r', ['EXTRA', grande.id]);
      expect(sol.estado).toBe('PENDIENTE');
      // Rechazar exige motivo.
      expect((await rpc(db, a.adminId, 'select public.decidir_aprobacion($1, false, null) as r', [sol.id])).ok).toBe(false);
      expect((await rpc(db, a.adminId, 'select public.decidir_aprobacion($1, true, null) as r', [sol.id])).ok).toBe(true);
      expect((await enviar(residente, grande.id)).ok).toBe(true);
    });

    it('el residente no manda extras de una obra que no es suya', async () => {
      const ajeno = await extra(a.adminId, obra2, 100);
      expect((await enviar(residente, ajeno.id)).ok).toBe(false);
      const sol = await rpc(db, residente, 'select public.solicitar_aprobacion($1, $2) as r', ['EXTRA', ajeno.id]);
      expect(sol.ok).toBe(false);
    });

    it('las reglas las escribe solo el admin; las solicitudes no se escriben directo', async () => {
      await expect(
        comoUsuario(db, supervisor, (tx) =>
          insertar(tx, 'public.regla_aprobacion', { empresa_id: a.empresaId, tipo: 'ESTIMACION', monto_minimo: 1 }, { returning: false }),
        ),
      ).rejects.toThrow(RLS);
      await expect(
        comoUsuario(db, a.adminId, (tx) =>
          insertar(tx, 'public.aprobacion', {
            empresa_id: a.empresaId, tipo: 'EXTRA', objeto_id: randomUUID(), monto: 1, rol_aprobador: 'admin', estado: 'APROBADA',
          }, { returning: false }),
        ),
      ).rejects.toThrow(RLS);
      // Otra empresa no ve las reglas de A.
      const r = await comoUsuario(db, b.adminId, (tx) =>
        tx.query('select 1 from public.regla_aprobacion where empresa_id = $1', [a.empresaId]),
      );
      expect(r.rows).toEqual([]);
    });
  });

  // ──────────────────────────────────────────────────────────────────────────
  describe('registro de actividad', () => {
    const deMovimiento = (id: string) =>
      db.query<{ accion: string; user_id: string | null; cambios: string[] | null; resumen: string; usuario_rol: string | null }>(
        `select accion, user_id, cambios, resumen, usuario_rol from public.actividad
          where tabla = 'movimientos' and registro_id = $1 order by id`,
        [id],
      );

    it('registra alta, cambio y borrado lógico con quién lo hizo; un reenvío sin cambios no', async () => {
      const id = await comoUsuario(db, supervisor, (tx) =>
        crearMovimiento(tx, { empresaId: a.empresaId, obraId: obra1, tipo: 'SALIDA', monto: 800 }),
      );
      await comoUsuario(db, supervisor, (tx) =>
        tx.query('update public.movimientos set monto = 900, updated_at = $2 where id = $1', [id, Date.now()]),
      );
      // Reenvío del móvil: mismos datos, solo cambia updated_at.
      await comoUsuario(db, supervisor, (tx) =>
        tx.query('update public.movimientos set updated_at = $2 where id = $1', [id, Date.now() + 1]),
      );
      await comoUsuario(db, supervisor, (tx) =>
        tx.query('update public.movimientos set deleted_at = $2 where id = $1', [id, Date.now()]),
      );
      const r = await deMovimiento(id);
      expect(r.rows.map((x) => x.accion)).toEqual(['CREAR', 'EDITAR', 'BORRAR']);
      expect(r.rows.every((x) => x.user_id === supervisor && x.usuario_rol === 'supervisor')).toBe(true);
      expect(r.rows[1].cambios).toEqual(['monto']);
      expect(r.rows[0].resumen).toContain('monto: 800');
    });

    it('registra cambios de rol, asignaciones y módulos', async () => {
      const u = await invitarConRol(db, a, 'colaborador');
      await rpc(db, a.adminId, 'select public.cambiar_rol_usuario($1, $2) as r', [u, 'residente']);
      await asignarObra(db, a, u, obra2);
      await comoUsuario(db, a.adminId, (tx) =>
        tx.query(`select public.activar_modulos(array['obras','caja']) as r`),
      );
      const r = await db.query<{ tabla: string; accion: string }>(
        `select tabla, accion from public.actividad
          where empresa_id = $1 and tabla in ('usuarios_empresa','usuario_obra','empresa_config')
            and user_id = $2 order by id`,
        [a.empresaId, a.adminId],
      );
      const pares = r.rows.map((x) => `${x.tabla}:${x.accion}`);
      expect(pares).toContain('usuarios_empresa:EDITAR');
      expect(pares).toContain('usuario_obra:CREAR');
      expect(pares).toContain('empresa_config:EDITAR');
    });

    it('solo el admin la lee; otra empresa no', async () => {
      const cuenta = async (u: string) =>
        (await comoUsuario(db, u, (tx) => tx.query('select 1 from public.actividad where empresa_id = $1', [a.empresaId]))).rows.length;
      expect(await cuenta(a.adminId)).toBeGreaterThan(0);
      for (const u of [supervisor, residente, contador, compras, cliente.userId, b.adminId]) {
        expect(await cuenta(u)).toBe(0);
      }
    });

    it('nadie la escribe, cambia ni borra (ni el admin ni el superusuario)', async () => {
      await expect(
        comoUsuario(db, a.adminId, (tx) =>
          insertar(tx, 'public.actividad', { empresa_id: a.empresaId, tabla: 'x', accion: 'CREAR' }, { returning: false }),
        ),
      ).rejects.toThrow(/permission denied/);
      await expect(
        comoUsuario(db, a.adminId, (tx) => tx.query('delete from public.actividad where empresa_id = $1', [a.empresaId])),
      ).rejects.toThrow(/permission denied/);
      await expect(
        db.query(`update public.actividad set resumen = 'nada' where empresa_id = $1`, [a.empresaId]),
      ).rejects.toThrow(/no se puede cambiar/);
      await expect(db.query('delete from public.actividad where empresa_id = $1', [a.empresaId])).rejects.toThrow(
        /no se puede cambiar/,
      );
      await expect(db.query('truncate public.actividad')).rejects.toThrow(/no se puede vaciar/);
    });

    it('borrar una empresa completa sí se lleva su actividad (cascada)', async () => {
      const c = await crearEmpresaDePrueba(db);
      const obra = await crearObra(db, c.empresaId);
      await comoUsuario(db, c.adminId, (tx) => crearMovimiento(tx, { empresaId: c.empresaId, obraId: obra, tipo: 'ENTRADA' }));
      const antes = await db.query('select 1 from public.actividad where empresa_id = $1', [c.empresaId]);
      expect(antes.rows.length).toBeGreaterThan(0);
      await db.query('delete from public.empresas where id = $1', [c.empresaId]);
      const despues = await db.query('select 1 from public.actividad where empresa_id = $1', [c.empresaId]);
      expect(despues.rows).toEqual([]);
    });
  });
});
