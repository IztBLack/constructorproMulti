/**
 * Tipos y textos del visto bueno (0042, RF6.3). Módulo PURO: lo importan los
 * componentes de cliente sin arrastrar el cliente de Supabase del servidor.
 */

export type TipoAprobacion = 'COMPRA' | 'EXTRA' | 'ESTIMACION' | 'PAGO_SUBCONTRATO';

/** Los que la web ofrece hoy (F6-11: estimaciones y pagos ya son solo admin/contador). */
export const TIPOS_CONFIGURABLES: readonly { tipo: TipoAprobacion; titulo: string; quien: string }[] = [
  {
    tipo: 'EXTRA',
    titulo: 'Extras al cliente',
    quien: 'El supervisor o el residente mandan solos los extras de menos de este monto.',
  },
  {
    tipo: 'COMPRA',
    titulo: 'Órdenes de compra',
    quien: 'Compras emite sola las órdenes de menos de este monto (con IVA).',
  },
];

export const TIPO_TEXTO: Readonly<Record<TipoAprobacion, string>> = {
  EXTRA: 'Extra',
  COMPRA: 'Orden de compra',
  ESTIMACION: 'Estimación',
  PAGO_SUBCONTRATO: 'Pago a subcontratista',
};

export interface ReglaAprobacion {
  id: string;
  tipo: TipoAprobacion;
  monto_minimo: number;
  rol_aprobador: string;
  activa: boolean;
}

export interface SolicitudAprobacion {
  id: string;
  tipo: TipoAprobacion;
  objeto_id: string;
  obra_id: string | null;
  monto: number;
  estado: 'PENDIENTE' | 'APROBADA' | 'RECHAZADA';
  solicitado_por: string | null;
  solicitado_nombre: string;
  solicitado_en: number;
  decidido_nombre: string | null;
  motivo: string | null;
}

/** Enlace a la pantalla del objeto (para revisarlo antes de decidir). */
export function enlaceObjeto(s: Pick<SolicitudAprobacion, 'tipo' | 'objeto_id' | 'obra_id'>): string | null {
  if (s.tipo === 'COMPRA') return `/admin/compras/ordenes/${s.objeto_id}`;
  if (s.tipo === 'EXTRA' && s.obra_id) return `/admin/obras/${s.obra_id}/extras/${s.objeto_id}`;
  return null;
}
