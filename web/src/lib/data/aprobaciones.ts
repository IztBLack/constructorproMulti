import { createClient } from '@/lib/supabase/server';

/**
 * Visto bueno configurable (0042, RF6.3).
 *
 * Una regla DELEGA hacia abajo: "EXTRA desde $20,000 → admin" quiere decir que
 * el supervisor o el residente mandan solos al cliente los extras de menos de
 * $20,000, y los de $20,000 o más necesitan el visto bueno. Sin regla, todo
 * sigue como antes: solo el admin envía extras y emite órdenes de compra.
 * El cumplimiento vive en la base (`enviar_orden_cambio`, `emitir_orden_compra`).
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

export async function listReglas(): Promise<{ data: ReglaAprobacion[]; error: string | null }> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('regla_aprobacion')
    .select('id, tipo, monto_minimo, rol_aprobador, activa')
    .is('deleted_at', null);
  if (error) return { data: [], error: error.message };
  return { data: (data ?? []) as ReglaAprobacion[], error: null };
}

export async function listSolicitudes(
  estado: 'PENDIENTE' | 'TODAS' = 'PENDIENTE',
): Promise<{ data: SolicitudAprobacion[]; error: string | null }> {
  const supabase = await createClient();
  let q = supabase
    .from('aprobacion')
    .select(
      'id, tipo, objeto_id, obra_id, monto, estado, solicitado_por, solicitado_nombre, solicitado_en, decidido_nombre, motivo',
    )
    .is('deleted_at', null)
    .order('solicitado_en', { ascending: false })
    .limit(50);
  if (estado === 'PENDIENTE') q = q.eq('estado', 'PENDIENTE');
  const { data, error } = await q;
  if (error) return { data: [], error: error.message };
  return { data: (data ?? []) as SolicitudAprobacion[], error: null };
}

/** Enlace a la pantalla del objeto (para revisarlo antes de decidir). */
export function enlaceObjeto(s: Pick<SolicitudAprobacion, 'tipo' | 'objeto_id' | 'obra_id'>): string | null {
  if (s.tipo === 'COMPRA') return `/admin/compras/ordenes/${s.objeto_id}`;
  if (s.tipo === 'EXTRA' && s.obra_id) return `/admin/obras/${s.obra_id}/extras/${s.objeto_id}`;
  return null;
}
