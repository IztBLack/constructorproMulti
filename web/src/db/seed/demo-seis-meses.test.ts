// Prueba del generador de datos demo (`demo-seis-meses.ts`) sobre PGlite con
// las 45 migraciones reales: el SQL corre completo en una transacción, deja lo
// que dice el guion en cada módulo, el admin lo lee por RLS, el dinero cuadra
// con las mismas funciones que usa la web y correrlo otra vez no hace nada.

import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { beforeAll, describe, expect, it } from 'vitest';
import type { PGlite, Transaction } from '@electric-sql/pglite';
import { comoUsuario, crearDbMigrada } from '../pglite/crear-db';
import { crearEmpresaDePrueba, type EmpresaDePrueba } from '../pglite/escenarios';
import { HOY_GUION, NOMBRE_EMPRESA_DEMO, PUNTOS_NOM_031, generarDemo, generarSqlDemo, type DemoGenerado } from './demo-seis-meses';
import { puntosPlantilla } from '@/lib/seguridad/plantilla';
import { calcularImportes } from '@/lib/estimaciones/calculo';
import { avanceFisico, ejecutadoPorConcepto } from '@/lib/estimaciones/avance';
import { capturasDeFilas, conceptosDeContrato, type FilaAvance } from '@/lib/estimaciones/conceptos';
import { calcularRentabilidad, margenObjetivoDe, rayaCalculada, type ResultadoRentabilidad } from '@/lib/rentabilidad/calculo';
import { calcularTotales, type RenglonNota } from '@/lib/data/notas-obra-calculo';
import { totalExtrasAprobados } from '@/lib/cambios/extras';
import { saldoOrden } from '@/lib/compras/calculo';
import { calcularNomina, semanaDe } from '@/lib/data/nomina-calculo';
import type { Asistencia, Colaborador, Destajo, Puesto } from '@/lib/data/types';

type Fila = Record<string, unknown>;

const HOY_MS = Date.UTC(2026, 8, 27, 6); // medianoche de México del 27-sep-2026

async function filas<T = Fila>(tx: Transaction | PGlite, sql: string, params: unknown[] = []): Promise<T[]> {
  return (await tx.query<T>(sql, params)).rows;
}

const n = (x: unknown) => Number(x);

describe('demo de seis meses', () => {
  let db: PGlite;
  let emp: EmpresaDePrueba;
  let demo: DemoGenerado;
  /** Conteos por tabla, leídos COMO EL ADMIN (RLS). */
  let conteos: Record<string, number>;
  let rentabilidad: Map<string, ResultadoRentabilidad>;

  const TABLAS = [
    'obras', 'obra_presupuesto', 'obra_margen_objetivo', 'obra_caja_nota', 'clientes', 'cliente_fiscal',
    'catalogo_conceptos', 'cotizaciones', 'secciones', 'partidas', 'pagos',
    'puestos', 'colaboradores', 'colaborador_sueldo', 'cuadrillas', 'cuadrilla_miembro', 'asignacion_cuadrilla_obra',
    'obra_colaborador', 'asistencias', 'destajos', 'movimientos',
    'orden_cambio', 'orden_cambio_renglon', 'obra_contrato', 'obra_retencion', 'avance_partida',
    'estimaciones', 'estimacion_renglon', 'proveedores', 'materiales', 'requisiciones', 'requisicion_renglon',
    'ordenes_compra', 'orden_compra_renglon', 'recepciones', 'recepcion_renglon', 'pagos_proveedor',
    'material_movimiento', 'regla_aprobacion', 'aprobacion', 'nota_obra', 'nota_obra_renglon',
    'subcontratista', 'subcontratista_documento', 'subcontrato', 'subcontrato_renglon', 'subcontrato_pago',
    'empresa_repse', 'obra_siroc', 'obligacion_periodica', 'colaborador_datos_imss',
    'bitacora_entrada', 'bitacora_aclaracion', 'programa_partida', 'seguridad_checklist', 'epp_entrega',
    'incidente', 'incidente_salud', 'herramienta', 'herramienta_asignacion', 'obra_garantia', 'garantia_reporte',
    'cobro_fiscal', 'empresa_fiscal',
  ] as const;

  async function contarComoAdmin(): Promise<Record<string, number>> {
    return comoUsuario(db, emp.adminId, async (tx) => {
      const out: Record<string, number> = {};
      for (const t of TABLAS) {
        const r = await filas<{ n: number }>(tx, `select count(*)::int as n from public.${t} where empresa_id = $1`, [emp.empresaId]);
        out[t] = r[0].n;
      }
      return out;
    });
  }

  beforeAll(async () => {
    db = await crearDbMigrada();
    // Otra empresa con datos propios: nada del demo debe tocarla.
    const vecina = await crearEmpresaDePrueba(db, 'Constructora vecina');
    emp = await crearEmpresaDePrueba(db, 'Prueba');
    demo = generarDemo({ userId: emp.adminId, empresaId: emp.empresaId, hoy: HOY_GUION });
    await db.exec(demo.sql);
    conteos = await contarComoAdmin();
    rentabilidad = await calcularUtilidadComoLaWeb(db, emp);
    const r = await filas<{ n: number }>(db, 'select count(*)::int as n from public.obras where empresa_id = $1', [vecina.empresaId]);
    expect(r[0].n).toBe(0);
  }, 240_000);

  it('siembra la empresa: nombre, módulos, marca y margen', async () => {
    const [e] = await filas<{ nombre: string }>(db, 'select nombre from public.empresas where id = $1', [emp.empresaId]);
    expect(e.nombre).toBe(NOMBRE_EMPRESA_DEMO);
    const [c] = await filas<{ modulos: string[]; perfil: Fila; iva: number; pdf: Fila }>(
      db,
      'select modulos, perfil, iva_porcentaje as iva, pdf_config as pdf from public.empresa_config where empresa_id = $1',
      [emp.empresaId],
    );
    expect(c.modulos.length).toBe(20);
    expect(c.perfil).toMatchObject({ demo: { guion: 'seis-meses', hasta: HOY_GUION } });
    expect(n(c.iva)).toBe(16);
    expect(c.pdf).toMatchObject({ colorHex: '#1E5B8C' });
    const [m] = await filas<{ m: number }>(db, 'select margen_objetivo as m from public.empresa_margen where empresa_id = $1', [emp.empresaId]);
    expect(n(m.m)).toBe(15);
    const [o] = await filas<{ id: string }>(db, 'select id from public.obras where id = $1', [demo.resumen.marcaObraId]);
    expect(o.id).toBe(demo.resumen.marcaObraId);
  });

  it('el admin ve por RLS exactamente lo que el guion dice que creó', () => {
    for (const [tabla, esperado] of Object.entries(demo.resumen.conteos)) {
      if (tabla === 'empresa_fiscal' || tabla === 'catalogo_conceptos') continue; // ya traían filas
      expect.soft(conteos[tabla], tabla).toBe(esperado);
    }
    // crear_empresa siembra 10 conceptos; el demo agrega los suyos.
    expect(conteos.catalogo_conceptos).toBe(10 + demo.resumen.conteos.catalogo_conceptos);
  });

  it('cada módulo tiene lo mínimo que pide el encargo', () => {
    const minimos: Record<string, [number, number?]> = {
      obras: [4, 5],
      cotizaciones: [5],
      clientes: [5],
      colaboradores: [25, 35],
      cuadrillas: [3, 4],
      asistencias: [3000],
      destajos: [40],
      movimientos: [150],
      proveedores: [8, 10],
      materiales: [40, 60],
      ordenes_compra: [20],
      requisiciones: [20],
      recepciones: [20],
      pagos_proveedor: [20],
      material_movimiento: [15],
      estimaciones: [12],
      orden_cambio: [5],
      nota_obra: [3],
      subcontrato: [2],
      subcontrato_pago: [4],
      obra_siroc: [4],
      obligacion_periodica: [4],
      colaborador_datos_imss: [8],
      bitacora_entrada: [35],
      bitacora_aclaracion: [3],
      programa_partida: [40],
      seguridad_checklist: [50],
      epp_entrega: [80],
      incidente: [2, 2],
      herramienta: [20, 30],
      herramienta_asignacion: [15],
      garantia_reporte: [2, 2],
      aprobacion: [2],
      regla_aprobacion: [1, 1],
      cobro_fiscal: [15],
      cliente_fiscal: [4],
      avance_partida: [200],
      empresa_repse: [1, 1],
    };
    for (const [t, [min, max]] of Object.entries(minimos)) {
      expect.soft(conteos[t], `${t} ≥ ${min}`).toBeGreaterThanOrEqual(min);
      if (max !== undefined) expect.soft(conteos[t], `${t} ≤ ${max}`).toBeLessThanOrEqual(max);
    }
  });

  it('los estados cuentan la historia del guion', async () => {
    const q = (sql: string) => comoUsuario(db, emp.adminId, (tx) => filas<{ estado: string; n: number }>(tx, sql, [emp.empresaId]));
    const porEstado = async (tabla: string) =>
      Object.fromEntries((await q(`select estado, count(*)::int as n from public.${tabla} where empresa_id = $1 group by estado`)).map((x) => [x.estado, x.n]));

    const est = await porEstado('estimaciones');
    expect(est.COBRADA).toBeGreaterThanOrEqual(8);
    expect(est).toMatchObject({ AUTORIZADA: 1, ENVIADA: 1, BORRADOR: 1, RECHAZADA: 1 });

    const ext = await porEstado('orden_cambio');
    expect(ext.APROBADA).toBeGreaterThanOrEqual(3);
    expect(ext).toMatchObject({ RECHAZADA: 1, ENVIADA: 1, BORRADOR: 1 });
    const [rech] = await q(`select motivo_rechazo as estado, 0 as n from public.orden_cambio where empresa_id = $1 and estado = 'RECHAZADA'`);
    expect(rech.estado.length).toBeGreaterThan(5);

    const oc = await porEstado('ordenes_compra');
    expect(oc.RECIBIDA).toBeGreaterThanOrEqual(15);
    expect(oc).toMatchObject({ PARCIAL: 1, EMITIDA: 1, BORRADOR: 1, CANCELADA: 1 });

    const req = await porEstado('requisiciones');
    expect(req).toMatchObject({ RECHAZADA: 1, PENDIENTE: 1 });
    expect(req.COMPRADA).toBeGreaterThanOrEqual(15);

    const gar = await porEstado('garantia_reporte');
    expect(gar).toEqual({ RESUELTO: 1, EN_REVISION: 1 });

    const apr = await porEstado('aprobacion');
    expect(apr.APROBADA).toBeGreaterThanOrEqual(1);
    expect(apr.PENDIENTE).toBe(1);

    const siroc = await porEstado('obra_siroc');
    expect(siroc).toMatchObject({ REGISTRADA: 2, PENDIENTE: 1, TERMINADA: 1 });

    const fiscal = await comoUsuario(db, emp.adminId, (tx) =>
      filas<{ estado: string; n: number }>(tx, 'select estado, count(*)::int as n from public.cobro_fiscal where empresa_id = $1 group by estado', [emp.empresaId]),
    );
    expect(fiscal.map((x) => x.estado).sort()).toEqual(['facturado', 'no_requiere', 'por_facturar']);

    // Un préstamo de herramienta vencido (abierto con fecha de regreso pasada).
    const vencidos = await comoUsuario(db, emp.adminId, (tx) =>
      filas(tx, 'select id from public.herramienta_asignacion where empresa_id = $1 and hasta is null and devolver_antes < $2', [emp.empresaId, HOY_MS]),
    );
    expect(vencidos.length).toBe(1);

    // La salud del accidente la ve el admin; el incidente dice incapacidad corta.
    const inc = await comoUsuario(db, emp.adminId, (tx) =>
      filas<{ tipo: string; dias: number | null }>(tx, 'select tipo, dias_incapacidad as dias from public.incidente where empresa_id = $1 order by tipo', [emp.empresaId]),
    );
    expect(inc).toEqual([
      { tipo: 'ACCIDENTE', dias: 3 },
      { tipo: 'CASI_ACCIDENTE', dias: null },
    ]);

    // La bodega terminada; el programa del local tiene una partida atrasada.
    const obras = await comoUsuario(db, emp.adminId, (tx) =>
      filas<{ nombre: string; activa: boolean; avance: number }>(tx, 'select nombre, activa, avance from public.obras where empresa_id = $1', [emp.empresaId]),
    );
    expect(obras.filter((o) => !o.activa).map((o) => o.avance)).toEqual([100]);
    const atrasadas = await comoUsuario(db, emp.adminId, (tx) =>
      filas(
        tx,
        `select p.id from public.programa_partida p where p.empresa_id = $1 and not p.terminada and p.fecha_fin < $2 and p.deleted_at is null`,
        [emp.empresaId, HOY_MS],
      ),
    );
    expect(atrasadas.length).toBeGreaterThanOrEqual(1);
  });

  it('la revisión de seguridad usa la plantilla NOM-031 de la web', () => {
    expect(PUNTOS_NOM_031.map(([clave, texto]) => ({ clave, texto }))).toEqual(
      puntosPlantilla().map((p) => ({ clave: p.clave, texto: p.texto })),
    );
  });

  it('las estimaciones cuadran al centavo con la cuenta de la web', async () => {
    const ests = await comoUsuario(db, emp.adminId, (tx) =>
      filas<Fila>(tx, 'select * from public.estimaciones where empresa_id = $1 order by obra_id, folio', [emp.empresaId]),
    );
    const porObra = new Map<string, Fila[]>();
    for (const e of ests) porObra.set(String(e.obra_id), [...(porObra.get(String(e.obra_id)) ?? []), e]);
    expect(porObra.size).toBe(2);
    for (const [obraId, lista] of porObra) {
      const [c] = await filas<Fila>(db, 'select * from public.obra_contrato where obra_id = $1', [obraId]);
      const rets = await filas<Fila>(db, 'select * from public.obra_retencion where obra_id = $1 and deleted_at is null order by orden', [obraId]);
      let amortizadoPrevio = 0;
      for (const e of lista) {
        const renglones = await filas<Fila>(
          db,
          'select cantidad, precio_unitario, importe from public.estimacion_renglon where estimacion_id = $1 and deleted_at is null',
          [e.id],
        );
        const imp = calcularImportes({
          renglones: renglones.map((r) => ({ cantidad: n(r.cantidad), precioUnitario: n(r.precio_unitario) })),
          contrato: {
            anticipo: n(c.anticipo_monto),
            anticipoMovimientoId: null,
            amortizacionPct: n(c.amortizacion_pct),
            fondoGarantiaPct: n(c.fondo_garantia_pct),
            ivaPct: n(c.iva_pct),
            notas: '',
          },
          retenciones: rets.map((r) => ({ concepto: String(r.concepto), tipo: r.tipo as 'PORCENTAJE', valor: n(r.valor) })),
          amortizadoPrevio,
          esFiniquito: Boolean(e.es_finiquito),
        });
        const ctx = `obra ${obraId.slice(0, 8)} folio ${e.folio}`;
        expect(n(e.importe_bruto), ctx).toBe(renglones.reduce((a, r) => a + Math.round(n(r.importe) * 100), 0) / 100);
        expect(
          {
            bruto: n(e.importe_bruto),
            amortizacion: n(e.amortizacion),
            iva: n(e.iva),
            total: n(e.total),
            fondo: n(e.fondo_garantia),
            ret: n(e.retenciones_total),
            neto: n(e.neto),
          },
          ctx,
        ).toEqual({
          bruto: imp.importeBruto,
          amortizacion: imp.amortizacion,
          iva: imp.iva,
          total: imp.total,
          fondo: imp.fondoGarantia,
          ret: imp.retencionesTotal,
          neto: imp.neto,
        });
        if (['ENVIADA', 'AUTORIZADA', 'COBRADA'].includes(String(e.estado))) amortizadoPrevio += n(e.amortizacion);
        if (e.estado === 'COBRADA') {
          const [m] = await filas<Fila>(db, 'select tipo, monto from public.movimientos where id = $1', [e.movimiento_id]);
          expect(m, ctx).toMatchObject({ tipo: 'ENTRADA' });
          expect(n(m.monto), ctx).toBe(n(e.neto));
        }
      }
      // Nunca se amortiza más que el anticipo.
      expect(amortizadoPrevio).toBeLessThanOrEqual(n(c.anticipo_monto) + 0.001);
    }
  });

  it('la caja cuadra: raya en caja = raya calculada por semana, pagos a proveedores = salidas de material', async () => {
    const dat = await leerDatosObra(db, emp);
    for (const o of dat.obras) {
      const asis = dat.asistencias.filter((a) => a.obra_id === o.id);
      const dest = dat.destajos.filter((d) => d.obra_id === o.id);
      const nomina = dat.movimientos.filter((m) => m.obra_id === o.id && m.categoria === 'NOMINA');
      for (const m of nomina) {
        const s = semanaDe(new Date(n(m.fecha)));
        const semana = calcularNomina({
          colaboradores: dat.colaboradores,
          asistencias: asis.filter((a) => a.fecha >= s.inicioMs && a.fecha <= s.finMs),
          destajos: dest.filter((d) => d.fecha >= s.inicioMs && d.fecha <= s.finMs),
          puestos: dat.puestos,
        }).totalNomina;
        expect(n(m.monto), `${o.nombre} ${m.concepto}`).toBeCloseTo(semana, 2);
      }
      const resumen = demo.resumen.obras.find((x) => x.id === o.id)!;
      const raya = rayaCalculada({ colaboradores: dat.colaboradores, asistencias: asis, destajos: dest, puestos: dat.puestos });
      expect(raya, o.nombre).toBeCloseTo(resumen.rayaTotal, 1);
    }
    const [pp] = await filas<{ p: number; m: number }>(
      db,
      `select (select coalesce(sum(monto), 0) from public.pagos_proveedor where empresa_id = $1) as p,
              (select coalesce(sum(m.monto), 0) from public.movimientos m join public.pagos_proveedor x on x.movimiento_id = m.id where m.empresa_id = $1 and m.categoria_costo = 'MATERIAL') as m`,
      [emp.empresaId],
    );
    expect(n(pp.p)).toBeGreaterThan(0);
    expect(n(pp.p)).toBeCloseTo(n(pp.m), 2);
  });

  it('la utilidad de cada obra (calculada como la web) cae entre −3 % y 22 %, con al menos una obra en amarillo o rojo', () => {
    const semaforos: string[] = [];
    for (const o of demo.resumen.obras) {
      const r = rentabilidad.get(o.id)!;
      expect(r, o.nombre).toBeDefined();
      expect(r.margenProyectado, o.nombre).not.toBeNull();
      expect(r.margenProyectado!, o.nombre).toBeGreaterThanOrEqual(-3);
      expect(r.margenProyectado!, o.nombre).toBeLessThanOrEqual(22);
      // Lo que el guion buscó, con medio punto de tolerancia por redondeos.
      expect(Math.abs(r.margenProyectado! - o.margenBuscado), o.nombre).toBeLessThan(0.6);
      expect(r.fuenteAvance, o.nombre).toBe('partidas');
      expect(r.avanceUsado, o.nombre).toBe(o.avanceFisico);
      semaforos.push(r.semaforo);
    }
    expect(semaforos.some((s) => s === 'amarillo' || s === 'rojo')).toBe(true);
    expect(semaforos).toContain('verde');
  });

  it('es determinista: mismos parámetros, mismo SQL', () => {
    const otra = generarSqlDemo({ userId: emp.adminId, empresaId: emp.empresaId, hoy: HOY_GUION });
    expect(otra).toBe(demo.sql);
  });

  it('correrlo dos veces no duplica ni truena', async () => {
    await db.exec(demo.sql);
    expect(await contarComoAdmin()).toEqual(conteos);
  });

  it('el script de línea de comandos escribe el mismo SQL (Node importa el .ts sin tsx)', () => {
    const dir = mkdtempSync(join(tmpdir(), 'demo-seis-meses-'));
    try {
      const out = join(dir, 'demo.sql');
      const script = fileURLToPath(new URL('../../../scripts/demo-seis-meses.mjs', import.meta.url));
      const salida = execFileSync(process.execPath, [script, '--user-id', emp.adminId, '--empresa-id', emp.empresaId, '--out', out], {
        encoding: 'utf8',
      });
      expect(salida).toMatch(/SQL escrito en/);
      expect(readFileSync(out, 'utf8')).toBe(demo.sql + '\n');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('rechaza ids que no son UUID (el SQL no se arma con texto arbitrario)', () => {
    expect(() => generarSqlDemo({ userId: "x'; drop table obras; --", empresaId: emp.empresaId })).toThrow(/UUID/);
    expect(() => generarSqlDemo({ userId: emp.adminId, empresaId: emp.empresaId, hoy: '2026-01-01' })).toThrow();
  });

  it('se niega a sembrar si el usuario no es admin de esa empresa', async () => {
    const otra = await crearEmpresaDePrueba(db, 'Otra');
    const sql = generarSqlDemo({ userId: emp.adminId, empresaId: otra.empresaId, transaccion: false });
    await expect(db.transaction((tx) => tx.exec(sql))).rejects.toThrow(/no es admin/);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Utilidad "como la web": mismas lecturas que `lib/data/rentabilidad.ts`, hechas
// como el admin (RLS), y las mismas funciones puras.
// ─────────────────────────────────────────────────────────────────────────────

interface DatosObra {
  obras: { id: string; nombre: string; avance: number }[];
  asistencias: Asistencia[];
  destajos: Destajo[];
  colaboradores: Colaborador[];
  puestos: Puesto[];
  movimientos: Fila[];
}

async function leerDatosObra(db: PGlite, emp: EmpresaDePrueba): Promise<DatosObra> {
  return comoUsuario(db, emp.adminId, async (tx) => {
    const e = [emp.empresaId];
    const obras = (await filas<Fila>(tx, 'select id, nombre, avance from public.obras where empresa_id = $1 and deleted_at is null', e)).map((o) => ({
      id: String(o.id),
      nombre: String(o.nombre),
      avance: n(o.avance),
    }));
    const asistencias = (await filas<Fila>(tx, 'select * from public.asistencias where empresa_id = $1 and deleted_at is null', e)).map(
      (a) => ({ ...a, fecha: n(a.fecha), fraccion: n(a.fraccion) }) as unknown as Asistencia,
    );
    const destajos = (await filas<Fila>(tx, 'select * from public.destajos where empresa_id = $1 and deleted_at is null', e)).map(
      (d) => ({ ...d, fecha: n(d.fecha), monto: n(d.monto) }) as unknown as Destajo,
    );
    const colaboradores = (
      await filas<Fila>(
        tx,
        `select c.*, s.salario_personalizado as sp from public.colaboradores c
           left join public.colaborador_sueldo s on s.colaborador_id = c.id
          where c.empresa_id = $1`,
        e,
      )
    ).map((c) => ({ ...c, salario_personalizado: c.sp == null ? null : n(c.sp) }) as unknown as Colaborador);
    const puestos = (await filas<Fila>(tx, 'select * from public.puestos where empresa_id = $1', e)).map(
      (p) => ({ ...p, salario_dia_default: n(p.salario_dia_default) }) as unknown as Puesto,
    );
    const movimientos = await filas<Fila>(tx, 'select * from public.movimientos where empresa_id = $1 and deleted_at is null', e);
    return { obras, asistencias, destajos, colaboradores, puestos, movimientos };
  });
}

async function calcularUtilidadComoLaWeb(db: PGlite, emp: EmpresaDePrueba): Promise<Map<string, ResultadoRentabilidad>> {
  const d = await leerDatosObra(db, emp);
  return comoUsuario(db, emp.adminId, async (tx) => {
    const e = [emp.empresaId];
    const pres = await filas<Fila>(tx, 'select * from public.obra_presupuesto where empresa_id = $1 and deleted_at is null', e);
    const extras = await filas<Fila>(tx, `select * from public.orden_cambio where empresa_id = $1 and deleted_at is null`, e);
    const renglonesExtra = await filas<Fila>(
      tx,
      `select r.*, oc.folio as extra_folio, oc.obra_id from public.orden_cambio_renglon r
         join public.orden_cambio oc on oc.id = r.orden_cambio_id
        where r.empresa_id = $1 and r.deleted_at is null and oc.estado = 'APROBADA' and oc.deleted_at is null`,
      e,
    );
    const avances = await filas<Fila>(tx, 'select * from public.avance_partida where empresa_id = $1 and deleted_at is null', e);
    const notas = await filas<Fila>(tx, 'select * from public.nota_obra where empresa_id = $1 and deleted_at is null', e);
    const renglonesNota = await filas<Fila>(tx, 'select * from public.nota_obra_renglon where empresa_id = $1 and deleted_at is null', e);
    const margenesObra = await filas<Fila>(tx, 'select * from public.obra_margen_objetivo where empresa_id = $1 and deleted_at is null', e);
    const [margenEmp] = await filas<Fila>(tx, 'select margen_objetivo from public.empresa_margen where empresa_id = $1', e);
    const ordenes = await filas<Fila>(
      tx,
      `select id, obra_id, total from public.ordenes_compra where empresa_id = $1 and deleted_at is null and estado in ('EMITIDA','PARCIAL','RECIBIDA')`,
      e,
    );
    const pagosProv = await filas<Fila>(tx, 'select orden_compra_id, monto, deleted_at from public.pagos_proveedor where empresa_id = $1', e);

    const out = new Map<string, ResultadoRentabilidad>();
    for (const o of d.obras) {
      const presO = pres.filter((p) => p.obra_id === o.id);
      const conceptos = conceptosDeContrato(
        presO.map((p) => ({ id: String(p.id), concepto: String(p.concepto), unidad: String(p.unidad), cantidad: n(p.cantidad), precio_unitario: n(p.precio_unitario), orden: n(p.orden) })),
        renglonesExtra
          .filter((r) => r.obra_id === o.id)
          .map((r) => ({ id: String(r.id), concepto: String(r.concepto), unidad: String(r.unidad), cantidad: n(r.cantidad), precio_unitario: n(r.precio_unitario), extra_folio: n(r.extra_folio) })),
      );
      const capturas = capturasDeFilas(avances.filter((a) => a.obra_id === o.id) as unknown as FilaAvance[]);
      const fis = avanceFisico(conceptos, ejecutadoPorConcepto(capturas));
      const notasO = notas
        .filter((x) => x.obra_id === o.id)
        .map((x) => {
          const t = calcularTotales(
            { total_override: x.total_override == null ? null : n(x.total_override), saldo_override: x.saldo_override == null ? null : n(x.saldo_override) },
            renglonesNota
              .filter((r) => r.nota_id === x.id)
              .map((r) => ({ ...r, monto: r.monto == null ? null : n(r.monto), monto_base: r.monto_base == null ? null : n(r.monto_base), porcentaje: r.porcentaje == null ? null : n(r.porcentaje) }) as unknown as RenglonNota),
          );
          return { estado: String(x.estado), total: t.total, pagado: t.pagado, saldo: t.saldo };
        });
      const comprometido = ordenes
        .filter((x) => x.obra_id === o.id)
        .reduce((a, x) => a + saldoOrden(n(x.total), pagosProv.filter((p) => p.orden_compra_id === x.id).map((p) => ({ monto: n(p.monto), deleted_at: p.deleted_at as number | null }))), 0);
      const margenObra = margenesObra.find((m) => m.obra_id === o.id);
      out.set(
        o.id,
        calcularRentabilidad({
          presupuesto: presO.reduce((a, p) => a + n(p.cantidad) * n(p.precio_unitario), 0),
          extrasAprobados: totalExtrasAprobados(
            extras.filter((x) => x.obra_id === o.id).map((x) => ({ estado: x.estado as 'APROBADA', total_enviado: x.total_enviado == null ? null : n(x.total_enviado), deleted_at: null })),
          ),
          movimientos: d.movimientos
            .filter((m) => m.obra_id === o.id)
            .map((m) => ({ tipo: String(m.tipo), monto: n(m.monto), categoria: m.categoria as string | null, categoria_costo: m.categoria_costo as string | null })),
          rayaCalculada: rayaCalculada({
            colaboradores: d.colaboradores,
            asistencias: d.asistencias.filter((a) => a.obra_id === o.id),
            destajos: d.destajos.filter((x) => x.obra_id === o.id),
            puestos: d.puestos,
          }),
          notas: notasO,
          avance: o.avance,
          avanceFisico: fis.hayCapturas ? fis.pct : null,
          margenObjetivo: margenObjetivoDe(margenObra ? n(margenObra.margen_objetivo) : null, margenEmp ? n(margenEmp.margen_objetivo) : null),
          comprometidoCompras: comprometido,
        }),
      );
    }
    return out;
  });
}
