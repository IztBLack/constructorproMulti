/**
 * Formas de las filas fiscales (migración 0037), compartidas por la capa de
 * datos, la lógica pura y la interfaz.
 */

export type EstadoFiscal = 'por_facturar' | 'facturado' | 'no_requiere';
export type IvaModo = 'incluido' | 'aparte' | 'sin_iva';
export type OrigenCobro = 'pago' | 'movimiento';

export const ESTADOS_FISCALES: readonly { valor: EstadoFiscal; texto: string }[] = [
  { valor: 'por_facturar', texto: 'Por facturar' },
  { valor: 'facturado', texto: 'Facturado' },
  { valor: 'no_requiere', texto: 'No requiere factura' },
];

export const esEstadoFiscal = (x: unknown): x is EstadoFiscal =>
  x === 'por_facturar' || x === 'facturado' || x === 'no_requiere';
export const esIvaModo = (x: unknown): x is IvaModo =>
  x === 'incluido' || x === 'aparte' || x === 'sin_iva';
export const esOrigenCobro = (x: unknown): x is OrigenCobro => x === 'pago' || x === 'movimiento';

export interface EmpresaFiscal {
  rfc: string | null;
  razon_social: string | null;
  regimen: string | null;
  cp_fiscal: string | null;
}

export interface ClienteFiscal extends EmpresaFiscal {
  cliente_id: string;
  uso_cfdi: string | null;
  correo_factura: string | null;
  constancia_path: string | null;
  fiscales_confirmados_at: number | null;
}

export interface CobroFiscal {
  id: string;
  pago_id: string | null;
  movimiento_id: string | null;
  estado: EstadoFiscal;
  metodo_pago: 'PUE' | 'PPD' | null;
  forma_pago: string | null;
  uso_cfdi: string | null;
  iva_modo: IvaModo | null;
  ret_isr_pct: number | null;
  ret_iva_pct: number | null;
  uuid: string | null;
  fecha_factura: number | null;
  total_factura: number | null;
  xml_path: string | null;
  pdf_path: string | null;
  parcialidad: number | null;
  complemento_uuid: string | null;
  complemento_fecha: number | null;
  complemento_xml_path: string | null;
  notas: string;
}

/** Un cobro al cliente, venga de un pago de cotización o de una entrada de caja. */
export interface Cobro {
  origen: OrigenCobro;
  /** id del pago o del movimiento. */
  id: string;
  fecha: number;
  monto: number;
  /** Método tal cual se capturó en la app (EFECTIVO, TRANSFERENCIA…). */
  metodo: string;
  concepto: string;
  referencia: string;
  /** Cotización (pago) u obra (movimiento) de la que sale. */
  documentoId: string;
  documentoNombre: string;
  clienteId: string | null;
  clienteNombre: string;
  fiscal: CobroFiscal | null;
}

/** Estado efectivo: sin fila fiscal, el cobro está por facturar. */
export function estadoDe(c: Pick<Cobro, 'fiscal'>): EstadoFiscal {
  return c.fiscal?.estado ?? 'por_facturar';
}
