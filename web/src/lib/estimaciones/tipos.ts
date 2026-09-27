/**
 * Tipos del módulo `estimaciones` (migración 0039), compartidos por la lógica
 * pura, la capa de datos, el PDF, el portal y las pruebas.
 */

export type EstadoEstimacion = 'BORRADOR' | 'ENVIADA' | 'AUTORIZADA' | 'RECHAZADA' | 'COBRADA';

export const ETIQUETA_ESTADO_ESTIMACION: Record<EstadoEstimacion, string> = {
  BORRADOR: 'Borrador',
  ENVIADA: 'Esperando al cliente',
  AUTORIZADA: 'Autorizada',
  RECHAZADA: 'Rechazada',
  COBRADA: 'Cobrada',
};

export const TONO_ESTADO_ESTIMACION: Record<EstadoEstimacion, 'neutral' | 'blue' | 'green' | 'red' | 'amber'> = {
  BORRADOR: 'neutral',
  ENVIADA: 'amber',
  AUTORIZADA: 'blue',
  RECHAZADA: 'red',
  COBRADA: 'green',
};

/**
 * Estados que CUENTAN para los acumulados (cantidades estimadas, anticipo
 * amortizado, fondo retenido). Una enviada cuenta aunque el cliente no conteste:
 * mientras no la rechace, esas cantidades ya se le cobraron. Lo mismo cuenta la
 * base en `enviar_estimacion`.
 */
export const ESTADOS_QUE_CUENTAN: readonly EstadoEstimacion[] = ['ENVIADA', 'AUTORIZADA', 'COBRADA'];

export function cuenta(estado: EstadoEstimacion): boolean {
  return ESTADOS_QUE_CUENTAN.includes(estado);
}

export type OrigenConcepto = 'presupuesto' | 'extra';

/**
 * Una partida del CONTRATO: del presupuesto de la obra o un renglón de un
 * extra APROBADO (lo que se contrató después). Es lo único que se puede avanzar
 * y estimar.
 */
export interface ConceptoContrato {
  /** 'p:<id>' o 'x:<id>'. */
  clave: string;
  origen: OrigenConcepto;
  id: string;
  concepto: string;
  unidad: string;
  /** Sección del presupuesto, o "Extra N". */
  seccion: string | null;
  /** Cantidad contratada. */
  cantidad: number;
  precioUnitario: number;
  orden: number;
}

export function claveConcepto(origen: OrigenConcepto, id: string): string {
  return `${origen === 'extra' ? 'x' : 'p'}:${id}`;
}

export function claveDe(r: { presupuesto_id?: string | null; orden_cambio_renglon_id?: string | null }): string | null {
  if (r.presupuesto_id) return claveConcepto('presupuesto', r.presupuesto_id);
  if (r.orden_cambio_renglon_id) return claveConcepto('extra', r.orden_cambio_renglon_id);
  return null;
}

/** Una captura de avance (fila de `avance_partida`). */
export interface CapturaAvance {
  id: string;
  clave: string;
  fecha: number;
  cantidad: number;
  nota: string;
  capturoId: string | null;
  capturoNombre: string;
}

export type TipoRetencion = 'PORCENTAJE' | 'MONTO';

export interface RetencionObra {
  id?: string;
  concepto: string;
  tipo: TipoRetencion;
  valor: number;
}

/** El contrato de la obra. Sin fila = todo en cero. */
export interface ContratoObra {
  anticipo: number;
  anticipoMovimientoId: string | null;
  amortizacionPct: number;
  fondoGarantiaPct: number;
  ivaPct: number;
  notas: string;
}

export const CONTRATO_VACIO: ContratoObra = {
  anticipo: 0,
  anticipoMovimientoId: null,
  amortizacionPct: 0,
  fondoGarantiaPct: 0,
  ivaPct: 0,
  notas: '',
};

export interface RetencionAplicada {
  concepto: string;
  tipo: TipoRetencion;
  valor: number;
  importe: number;
}

/** Las cuentas de una estimación (lo que se guarda en `estimaciones`). */
export interface Importes {
  importeBruto: number;
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
}

export interface RenglonEstimacion {
  id: string;
  estimacion_id: string;
  presupuesto_id: string | null;
  orden_cambio_renglon_id: string | null;
  concepto: string;
  unidad: string;
  seccion: string | null;
  cantidad: number;
  precio_unitario: number;
  importe: number;
  orden: number;
}

export interface Estimacion {
  id: string;
  empresa_id: string;
  obra_id: string;
  folio: number;
  periodo_inicio: number;
  periodo_fin: number;
  estado: EstadoEstimacion;
  es_finiquito: boolean;
  notas: string;
  texto_final: string | null;
  importe_bruto: number;
  amortizacion: number;
  subtotal: number;
  iva_pct: number;
  iva: number;
  total: number;
  fondo_garantia_pct: number;
  fondo_garantia: number;
  retenciones: RetencionAplicada[];
  retenciones_total: number;
  neto: number;
  snapshot_json: unknown;
  enviado_at: number | null;
  respondido_at: number | null;
  respondido_nombre: string | null;
  respuesta_origen: 'PORTAL' | 'OFICINA' | null;
  motivo_rechazo: string | null;
  cobrado_at: number | null;
  movimiento_id: string | null;
  created_at: number;
}

export interface EstimacionConRenglones extends Estimacion {
  renglones: RenglonEstimacion[];
}

export const LARGO_MOTIVO_RECHAZO = 1000;
