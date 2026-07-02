import { createClient } from '@/lib/supabase/server';
import { getEmpresaUsuario } from './empresa';

/// Tipos para la tabla `pagos`
export interface Pago {
  id: string;
  cotizacion_id: string;
  empresa_id: string;
  fecha: number;
  monto: number;
  metodo: string;
  concepto: string;
  referencia: string | null;
  created_at: number;
  updated_at: number;
  server_updated_at: number | null;
  deleted_at: number | null;
}

export interface NuevoPagoInput {
  cotizacion_id: string;
  fecha: number;
  monto: number;
  metodo: string;
  concepto: string;
  referencia: string;
}

export type ActualizarPagoInput = Omit<NuevoPagoInput, 'cotizacion_id'>;

/// Devuelve los pagos de una cotización, ordenados por fecha desc (más reciente primero).
/// Filtra soft-deletes automáticamente.
export async function listPagosByCotizacion(
  cotId: string,
): Promise<{ data: Pago[]; error: string | null }> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from('pagos')
    .select('*')
    .eq('cotizacion_id', cotId)
    .is('deleted_at', null)
    .order('fecha', { ascending: false });

  if (error) return { data: [], error: error.message };
  return { data: (data ?? []) as Pago[], error: null };
}

/// Crea un nuevo pago. Usa crypto.randomUUID() como id y Date.now() para timestamps.
export async function crearPago(
  input: NuevoPagoInput,
): Promise<{ id: string | null; error: string | null }> {
  const supabase = await createClient();
  const { empresaId } = await getEmpresaUsuario();

  const now = Date.now();
  const id = crypto.randomUUID();

  const { error } = await supabase.from('pagos').insert({
    id,
    empresa_id: empresaId,
    cotizacion_id: input.cotizacion_id,
    fecha: input.fecha,
    monto: input.monto,
    metodo: input.metodo,
    concepto: input.concepto,
    referencia: input.referencia,
    created_at: now,
    updated_at: now,
    deleted_at: null,
  });

  if (error) return { id: null, error: error.message };
  return { id, error: null };
}

/// Actualiza un pago existente (no toca created_at, cotizacion_id ni empresa_id).
export async function actualizarPago(
  id: string,
  input: ActualizarPagoInput,
): Promise<{ error: string | null }> {
  const supabase = await createClient();

  const { error } = await supabase
    .from('pagos')
    .update({
      fecha: input.fecha,
      monto: input.monto,
      metodo: input.metodo,
      concepto: input.concepto,
      referencia: input.referencia,
      updated_at: Date.now(),
    })
    .eq('id', id)
    .is('deleted_at', null);

  if (error) return { error: error.message };
  return { error: null };
}

/// Soft-delete: marca deleted_at y updated_at con epoch ms actual.
export async function eliminarPago(id: string): Promise<{ error: string | null }> {
  const supabase = await createClient();
  const now = Date.now();

  const { error } = await supabase
    .from('pagos')
    .update({ deleted_at: now, updated_at: now })
    .eq('id', id)
    .is('deleted_at', null);

  if (error) return { error: error.message };
  return { error: null };
}

/// Suma los montos de un arreglo de pagos (ya filtrado, sin deleted).
export function sumaPagos(pagos: Pago[]): number {
  return pagos.reduce((acc, p) => acc + p.monto, 0);
}
