/**
 * COMPRAS Y MATERIAL (migración 0038): tipos y etiquetas.
 *
 * Módulo PURO (sin Supabase ni `server-only`): lo importan igual las pantallas
 * de cliente, el PDF, el paquete del contador y las pruebas.
 */

export type EstadoRequisicion = 'PENDIENTE' | 'APROBADA' | 'RECHAZADA' | 'COMPRADA' | 'PARCIAL';
export type EstadoOrden = 'BORRADOR' | 'EMITIDA' | 'PARCIAL' | 'RECIBIDA' | 'CANCELADA';
export type Tono = 'neutral' | 'blue' | 'green' | 'red' | 'amber';

/** En palabras de obra: "por aprobar", no "pendiente de autorización". */
export const ETIQUETA_ESTADO_REQUISICION: Record<EstadoRequisicion, string> = {
  PENDIENTE: 'Por aprobar',
  APROBADA: 'Aprobada · por comprar',
  PARCIAL: 'Comprada en parte',
  COMPRADA: 'Comprada',
  RECHAZADA: 'Rechazada',
};

export const TONO_ESTADO_REQUISICION: Record<EstadoRequisicion, Tono> = {
  PENDIENTE: 'amber',
  APROBADA: 'blue',
  PARCIAL: 'blue',
  COMPRADA: 'green',
  RECHAZADA: 'red',
};

export const ETIQUETA_ESTADO_ORDEN: Record<EstadoOrden, string> = {
  BORRADOR: 'Borrador',
  EMITIDA: 'Emitida · por recibir',
  PARCIAL: 'Recibida en parte',
  RECIBIDA: 'Recibida',
  CANCELADA: 'Cancelada',
};

export const TONO_ESTADO_ORDEN: Record<EstadoOrden, Tono> = {
  BORRADOR: 'neutral',
  EMITIDA: 'amber',
  PARCIAL: 'blue',
  RECIBIDA: 'green',
  CANCELADA: 'neutral',
};

export const METODOS_PAGO_PROVEEDOR = ['TRANSFERENCIA', 'EFECTIVO', 'CHEQUE', 'OTRO'] as const;
export type MetodoPagoProveedor = (typeof METODOS_PAGO_PROVEEDOR)[number];

export const ETIQUETA_METODO: Record<MetodoPagoProveedor, string> = {
  TRANSFERENCIA: 'Transferencia',
  EFECTIVO: 'Efectivo',
  CHEQUE: 'Cheque',
  OTRO: 'Otro',
};

export function esMetodoPagoProveedor(x: unknown): x is MetodoPagoProveedor {
  return typeof x === 'string' && (METODOS_PAGO_PROVEEDOR as readonly string[]).includes(x);
}

// ── Filas ─────────────────────────────────────────────────────────────────────

export interface Proveedor {
  id: string;
  empresa_id: string;
  nombre: string;
  rfc: string | null;
  contacto: string;
  telefono: string;
  correo: string;
  dias_credito: number;
  notas: string;
  deleted_at: number | null;
}

export interface Material {
  id: string;
  empresa_id: string;
  nombre: string;
  unidad: string;
  ultimo_precio: number | null;
  proveedor_id: string | null;
  clave_sat: string | null;
  unidad_sat: string | null;
  notas: string;
  deleted_at: number | null;
}

export interface Requisicion {
  id: string;
  empresa_id: string;
  obra_id: string;
  folio: number;
  estado: EstadoRequisicion;
  para_cuando: number | null;
  notas: string;
  pedido_por: string | null;
  pedido_por_nombre: string;
  decidido_at: number | null;
  motivo_rechazo: string | null;
  created_at: number;
  deleted_at: number | null;
}

export interface RenglonRequisicion {
  id: string;
  requisicion_id: string;
  material_id: string | null;
  descripcion: string;
  unidad: string;
  cantidad: number;
  notas: string;
  orden: number;
}

export interface RequisicionConRenglones extends Requisicion {
  renglones: RenglonRequisicion[];
}

export interface OrdenCompra {
  id: string;
  empresa_id: string;
  obra_id: string;
  proveedor_id: string;
  folio: number;
  fecha: number;
  estado: EstadoOrden;
  iva_pct: number;
  condiciones: string;
  dias_credito: number;
  fecha_entrega: number | null;
  notas: string;
  texto_final: string | null;
  subtotal: number | null;
  iva: number | null;
  total: number | null;
  emitida_at: number | null;
  cancelada_at: number | null;
  factura_uuid: string | null;
  factura_rfc: string | null;
  factura_total: number | null;
  factura_iva: number | null;
  factura_fecha: number | null;
  factura_xml_path: string | null;
  factura_pdf_path: string | null;
  factura_resumen: unknown;
  created_at: number;
  deleted_at: number | null;
}

export interface RenglonOrden {
  id: string;
  orden_compra_id: string;
  requisicion_renglon_id: string | null;
  material_id: string | null;
  descripcion: string;
  unidad: string;
  cantidad: number;
  precio_unitario: number;
  orden: number;
}

export interface OrdenConRenglones extends OrdenCompra {
  renglones: RenglonOrden[];
}

export interface Recepcion {
  id: string;
  orden_compra_id: string;
  obra_id: string;
  fecha: number;
  remision_uri: string | null;
  notas: string;
  recibido_por_nombre: string;
  deleted_at: number | null;
}

export interface RenglonRecibido {
  id: string;
  recepcion_id: string;
  orden_compra_renglon_id: string;
  cantidad_recibida: number;
  notas: string;
}

export interface RecepcionConRenglones extends Recepcion {
  renglones: RenglonRecibido[];
}

export interface PagoProveedor {
  id: string;
  orden_compra_id: string;
  proveedor_id: string;
  monto: number;
  fecha: number;
  metodo_pago: string;
  referencia: string;
  notas: string;
  movimiento_id: string;
  deleted_at: number | null;
}

export type TipoMovimientoMaterial = 'CONSUMO' | 'TRASPASO' | 'AJUSTE';

export const ETIQUETA_MOVIMIENTO_MATERIAL: Record<TipoMovimientoMaterial, string> = {
  CONSUMO: 'Se usó en la obra',
  TRASPASO: 'Se mandó a otra obra',
  AJUSTE: 'Ajuste (conteo)',
};

export interface MovimientoMaterial {
  id: string;
  obra_id: string;
  material_id: string;
  tipo: TipoMovimientoMaterial;
  cantidad: number;
  obra_destino_id: string | null;
  fecha: number;
  notas: string;
  deleted_at: number | null;
}

/** Resumen de la factura del proveedor que se guarda en `factura_resumen`. */
export interface ResumenFactura {
  emisor: string;
  conceptos: { descripcion: string; cantidad: number; clave: string; unidad: string; importe: number }[];
}

export function leerResumenFactura(crudo: unknown): ResumenFactura | null {
  if (!crudo || typeof crudo !== 'object' || Array.isArray(crudo)) return null;
  const o = crudo as Record<string, unknown>;
  const conceptos = Array.isArray(o.conceptos) ? o.conceptos : [];
  return {
    emisor: typeof o.emisor === 'string' ? o.emisor : '',
    conceptos: conceptos
      .filter((c): c is Record<string, unknown> => !!c && typeof c === 'object')
      .map((c) => ({
        descripcion: String(c.descripcion ?? ''),
        cantidad: Number(c.cantidad) || 0,
        clave: String(c.clave ?? ''),
        unidad: String(c.unidad ?? ''),
        importe: Number(c.importe) || 0,
      })),
  };
}
