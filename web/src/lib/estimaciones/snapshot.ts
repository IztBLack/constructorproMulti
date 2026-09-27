/**
 * La FOTO de una estimación enviada (`snapshot_json`, la arma
 * `_estimacion_snapshot` en 0039). Es lo que vio el cliente: el PDF y el
 * portal de una estimación enviada salen SIEMPRE de aquí, nunca de los
 * renglones vivos.
 *
 * Se lee con cuidado (viene de un jsonb): lo que falte o no sea número queda en
 * 0/'' en vez de romper la página.
 */

import {
  claveDe,
  type CapturaAvance,
  type ConceptoContrato,
  type ContratoObra,
  type EstimacionConRenglones,
  type RetencionAplicada,
} from './tipos';

export interface GeneradorFoto {
  fecha: number;
  cantidad: number;
  nota: string;
}

export interface RenglonFoto {
  origen: 'presupuesto' | 'extra';
  extraFolio: number | null;
  concepto: string;
  unidad: string;
  seccion: string | null;
  contratado: number;
  anterior: number;
  cantidad: number;
  acumulado: number;
  precioUnitario: number;
  importe: number;
  generadores: GeneradorFoto[];
}

export interface FotoEstimacion {
  folio: number;
  obra: string;
  periodoInicio: number;
  periodoFin: number;
  esFiniquito: boolean;
  notas: string;
  renglones: RenglonFoto[];
  importes: {
    bruto: number;
    amortizacion: number;
    subtotal: number;
    ivaPct: number;
    iva: number;
    total: number;
    fondoGarantiaPct: number;
    fondoGarantia: number;
    retenciones: RetencionAplicada[];
    retencionesTotal: number;
    neto: number;
  };
  contrato: {
    anticipo: number;
    amortizacionPct: number;
    amortizadoPrevio: number;
    anticipoPorAmortizar: number;
  };
  acumulados: {
    brutoPrevio: number;
    brutoAcumulado: number;
    fondoPrevio: number;
    fondoAcumulado: number;
  };
}

type Obj = Record<string, unknown>;

const esObj = (x: unknown): x is Obj => !!x && typeof x === 'object' && !Array.isArray(x);
const num = (x: unknown): number => {
  const n = typeof x === 'number' ? x : Number(x);
  return Number.isFinite(n) ? n : 0;
};
const txt = (x: unknown): string => (typeof x === 'string' ? x : '');
const lista = (x: unknown): unknown[] => (Array.isArray(x) ? x : []);

export function leerRetenciones(x: unknown): RetencionAplicada[] {
  return lista(x)
    .filter(esObj)
    .map((r) => ({
      concepto: txt(r.concepto),
      tipo: r.tipo === 'MONTO' ? 'MONTO' : 'PORCENTAJE',
      valor: num(r.valor),
      importe: num(r.importe),
    }));
}

export function leerFoto(crudo: unknown): FotoEstimacion | null {
  if (!esObj(crudo)) return null;
  const imp = esObj(crudo.importes) ? crudo.importes : {};
  const con = esObj(crudo.contrato) ? crudo.contrato : {};
  const acu = esObj(crudo.acumulados) ? crudo.acumulados : {};
  return {
    folio: num(crudo.folio),
    obra: txt(crudo.obra),
    periodoInicio: num(crudo.periodo_inicio),
    periodoFin: num(crudo.periodo_fin),
    esFiniquito: crudo.es_finiquito === true,
    notas: txt(crudo.notas),
    renglones: lista(crudo.renglones)
      .filter(esObj)
      .map((r) => ({
        origen: r.origen === 'extra' ? 'extra' : 'presupuesto',
        extraFolio: r.extra_folio == null ? null : num(r.extra_folio),
        concepto: txt(r.concepto),
        unidad: txt(r.unidad),
        seccion: typeof r.seccion === 'string' ? r.seccion : null,
        contratado: num(r.contratado),
        anterior: num(r.anterior),
        cantidad: num(r.cantidad),
        acumulado: num(r.acumulado),
        precioUnitario: num(r.precio_unitario),
        importe: num(r.importe),
        generadores: lista(r.generadores)
          .filter(esObj)
          .map((g) => ({ fecha: num(g.fecha), cantidad: num(g.cantidad), nota: txt(g.nota) })),
      })),
    importes: {
      bruto: num(imp.bruto),
      amortizacion: num(imp.amortizacion),
      subtotal: num(imp.subtotal),
      ivaPct: num(imp.iva_pct),
      iva: num(imp.iva),
      total: num(imp.total),
      fondoGarantiaPct: num(imp.fondo_garantia_pct),
      fondoGarantia: num(imp.fondo_garantia),
      retenciones: leerRetenciones(imp.retenciones),
      retencionesTotal: num(imp.retenciones_total),
      neto: num(imp.neto),
    },
    contrato: {
      anticipo: num(con.anticipo),
      amortizacionPct: num(con.amortizacion_pct),
      amortizadoPrevio: num(con.amortizado_previo),
      anticipoPorAmortizar: num(con.anticipo_por_amortizar),
    },
    acumulados: {
      brutoPrevio: num(acu.bruto_previo),
      brutoAcumulado: num(acu.bruto_acumulado),
      fondoPrevio: num(acu.fondo_previo),
      fondoAcumulado: num(acu.fondo_acumulado),
    },
  };
}

/**
 * La misma forma que la foto, pero armada EN VIVO para un borrador (vista
 * previa del PDF y del editor). Replica lo que hará `_estimacion_snapshot` al
 * enviar: anterior = lo ya estimado en las que cuentan; generadores = lo
 * capturado en campo dentro del periodo.
 */
export function armarFotoEnVivo(p: {
  estimacion: EstimacionConRenglones;
  obra: string;
  conceptos: readonly ConceptoContrato[];
  estimadoPrevio: ReadonlyMap<string, number>;
  capturas: readonly CapturaAvance[];
  contrato: ContratoObra;
  previos: { estimado: number; amortizado: number; fondoRetenido: number };
}): FotoEstimacion {
  const e = p.estimacion;
  const porClave = new Map(p.conceptos.map((c) => [c.clave, c]));
  const r2 = (x: number) => Math.round(x * 100) / 100;
  const r4 = (x: number) => Math.round(x * 10_000) / 10_000;
  return {
    folio: e.folio,
    obra: p.obra,
    periodoInicio: e.periodo_inicio,
    periodoFin: e.periodo_fin,
    esFiniquito: e.es_finiquito,
    notas: e.notas,
    renglones: e.renglones.map((r) => {
      const k = claveDe(r) ?? '';
      const c = porClave.get(k);
      const anterior = p.estimadoPrevio.get(k) ?? 0;
      return {
        origen: r.orden_cambio_renglon_id ? 'extra' : 'presupuesto',
        extraFolio: null,
        concepto: r.concepto,
        unidad: r.unidad,
        seccion: r.seccion,
        contratado: c?.cantidad ?? 0,
        anterior,
        cantidad: r.cantidad,
        acumulado: r4(anterior + r.cantidad),
        precioUnitario: r.precio_unitario,
        importe: r.importe,
        generadores: p.capturas
          .filter((g) => g.clave === k && g.fecha >= e.periodo_inicio && g.fecha <= e.periodo_fin)
          .sort((a, b) => a.fecha - b.fecha)
          .map((g) => ({ fecha: g.fecha, cantidad: g.cantidad, nota: g.nota })),
      };
    }),
    importes: {
      bruto: e.importe_bruto,
      amortizacion: e.amortizacion,
      subtotal: e.subtotal,
      ivaPct: e.iva_pct,
      iva: e.iva,
      total: e.total,
      fondoGarantiaPct: e.fondo_garantia_pct,
      fondoGarantia: e.fondo_garantia,
      retenciones: e.retenciones,
      retencionesTotal: e.retenciones_total,
      neto: e.neto,
    },
    contrato: {
      anticipo: p.contrato.anticipo,
      amortizacionPct: p.contrato.amortizacionPct,
      amortizadoPrevio: p.previos.amortizado,
      anticipoPorAmortizar: r2(Math.max(0, p.contrato.anticipo - p.previos.amortizado - e.amortizacion)),
    },
    acumulados: {
      brutoPrevio: p.previos.estimado,
      brutoAcumulado: r2(p.previos.estimado + e.importe_bruto),
      fondoPrevio: p.previos.fondoRetenido,
      fondoAcumulado: r2(p.previos.fondoRetenido + e.fondo_garantia),
    },
  };
}
