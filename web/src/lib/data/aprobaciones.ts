import { createClient } from '@/lib/supabase/server';
import type { ReglaAprobacion, SolicitudAprobacion } from '@/lib/aprobaciones/tipos';

export * from '@/lib/aprobaciones/tipos';

/**
 * Visto bueno configurable (0042, RF6.3).
 *
 * Una regla DELEGA hacia abajo: "EXTRA desde $20,000 → admin" quiere decir que
 * el supervisor o el residente mandan solos al cliente los extras de menos de
 * $20,000, y los de $20,000 o más necesitan el visto bueno. Sin regla, todo
 * sigue como antes: solo el admin envía extras y emite órdenes de compra.
 * El cumplimiento vive en la base (`enviar_orden_cambio`, `emitir_orden_compra`).
 */

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

