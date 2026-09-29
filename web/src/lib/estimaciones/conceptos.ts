/**
 * Arma las partidas del CONTRATO de una obra a partir de filas crudas: el
 * presupuesto de la obra + los renglones de los extras APROBADOS. Puro: lo usan
 * la capa de datos de oficina, la del portal (RPC `avance_obra_portal`) y la
 * utilidad, para que las tres cuenten lo mismo.
 */

import { claveConcepto, claveDe, type CapturaAvance, type ConceptoContrato } from './tipos';

export interface FilaPresupuesto {
  id: string;
  concepto: string;
  unidad: string | null;
  seccion?: string | null;
  cantidad: number | string;
  precio_unitario: number | string;
  orden?: number | null;
}

export interface FilaRenglonExtra {
  id: string;
  concepto: string;
  unidad: string | null;
  cantidad: number | string;
  precio_unitario: number | string;
  orden?: number | null;
  /** Folio del extra (para decir "Extra 3"). */
  extra_folio: number | null;
}

export function conceptosDeContrato(
  presupuesto: readonly FilaPresupuesto[],
  extras: readonly FilaRenglonExtra[] = [],
): ConceptoContrato[] {
  return [
    ...presupuesto.map(
      (p, i): ConceptoContrato => ({
        clave: claveConcepto('presupuesto', p.id),
        origen: 'presupuesto',
        id: p.id,
        concepto: p.concepto ?? '',
        unidad: p.unidad ?? '',
        seccion: p.seccion ?? null,
        cantidad: Number(p.cantidad) || 0,
        precioUnitario: Number(p.precio_unitario) || 0,
        orden: p.orden ?? i,
      }),
    ),
    ...extras.map(
      (r, i): ConceptoContrato => ({
        clave: claveConcepto('extra', r.id),
        origen: 'extra',
        id: r.id,
        concepto: r.concepto ?? '',
        unidad: r.unidad ?? '',
        seccion: r.extra_folio != null ? `Extra ${r.extra_folio}` : 'Extras',
        cantidad: Number(r.cantidad) || 0,
        precioUnitario: Number(r.precio_unitario) || 0,
        orden: 1_000_000 + (r.extra_folio ?? 0) * 1_000 + (r.orden ?? i),
      }),
    ),
  ].sort((a, b) => a.orden - b.orden);
}

export interface FilaAvance {
  id: string;
  presupuesto_id: string | null;
  orden_cambio_renglon_id: string | null;
  fecha: number | string;
  cantidad: number | string;
  nota?: string | null;
  capturo_id?: string | null;
  capturo_nombre?: string | null;
}

export function capturasDeFilas(filas: readonly FilaAvance[]): CapturaAvance[] {
  const out: CapturaAvance[] = [];
  for (const f of filas) {
    const clave = claveDe(f);
    if (!clave) continue;
    out.push({
      id: f.id,
      clave,
      fecha: Number(f.fecha),
      cantidad: Number(f.cantidad) || 0,
      nota: f.nota ?? '',
      capturoId: f.capturo_id ?? null,
      capturoNombre: f.capturo_nombre ?? '',
    });
  }
  return out;
}
