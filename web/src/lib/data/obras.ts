import { createClient } from '@/lib/supabase/server';
import { getEmpresaUsuario } from './empresa';
import type { Movimiento, Obra, TipoMovimiento } from './types';

export async function listObras(): Promise<{ data: Obra[]; error: string | null }> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('obras')
    .select('*')
    .is('deleted_at', null)
    .order('nombre');

  if (error) return { data: [], error: error.message };
  return { data: (data ?? []) as Obra[], error: null };
}

export async function getObra(id: string): Promise<{ data: Obra | null; error: string | null }> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('obras')
    .select('*')
    .eq('id', id)
    .is('deleted_at', null)
    .maybeSingle();

  if (error) return { data: null, error: error.message };
  return { data: data as Obra | null, error: null };
}

export interface ObraInput {
  nombre: string;
  cliente: string;
  ubicacion: string;
  fechaInicio: number;
}

export async function actualizarObra(
  id: string,
  input: ObraInput,
): Promise<{ error: string | null }> {
  const supabase = await createClient();
  const now = Date.now();

  const { error } = await supabase
    .from('obras')
    .update({
      nombre: input.nombre,
      cliente: input.cliente,
      ubicacion: input.ubicacion,
      fecha_inicio: input.fechaInicio,
      updated_at: now,
    })
    .eq('id', id);

  if (error) return { error: error.message };
  return { error: null };
}

export async function listMovimientosByObra(
  obraId: string,
): Promise<{ data: Movimiento[]; error: string | null }> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('movimientos')
    .select('*')
    .eq('obra_id', obraId)
    .is('deleted_at', null)
    .order('fecha', { ascending: false });

  if (error) return { data: [], error: error.message };
  return { data: (data ?? []) as Movimiento[], error: null };
}

export function calcularSaldo(movimientos: Movimiento[]): number {
  return movimientos.reduce((acc, m) => {
    if (m.tipo === 'ENTRADA') return acc + m.monto;
    if (m.tipo === 'SALIDA') return acc - m.monto;
    return acc;
  }, 0);
}

export async function getMovimiento(
  id: string,
): Promise<{ data: Movimiento | null; error: string | null }> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('movimientos')
    .select('*')
    .eq('id', id)
    .is('deleted_at', null)
    .maybeSingle();

  if (error) return { data: null, error: error.message };
  return { data: data as Movimiento | null, error: null };
}

export interface MovimientoInput {
  obraId: string;
  fecha: number;
  tipo: TipoMovimiento;
  categoria: string;
  concepto: string;
  monto: number;
  metodoPago: string;
  referencia: string;
}

export async function crearMovimiento(
  input: MovimientoInput,
): Promise<{ error: string | null }> {
  const { empresaId } = await getEmpresaUsuario();
  const supabase = await createClient();
  const now = Date.now();

  const { error } = await supabase.from('movimientos').insert({
    id: crypto.randomUUID(),
    empresa_id: empresaId,
    obra_id: input.obraId,
    fecha: input.fecha,
    tipo: input.tipo,
    categoria: input.categoria,
    concepto: input.concepto,
    monto: input.monto,
    metodo_pago: input.metodoPago,
    referencia: input.referencia,
    cotizacion_id: null,
    partida_id: null,
    created_at: now,
    updated_at: now,
  });

  if (error) return { error: error.message };
  return { error: null };
}

export async function actualizarMovimiento(
  id: string,
  input: MovimientoInput,
): Promise<{ error: string | null }> {
  const supabase = await createClient();
  const now = Date.now();

  const { error } = await supabase
    .from('movimientos')
    .update({
      fecha: input.fecha,
      tipo: input.tipo,
      categoria: input.categoria,
      concepto: input.concepto,
      monto: input.monto,
      metodo_pago: input.metodoPago,
      referencia: input.referencia,
      updated_at: now,
    })
    .eq('id', id);

  if (error) return { error: error.message };
  return { error: null };
}

export async function eliminarMovimiento(id: string): Promise<{ error: string | null }> {
  const supabase = await createClient();
  const now = Date.now();

  const { error } = await supabase
    .from('movimientos')
    .update({ deleted_at: now, updated_at: now })
    .eq('id', id);

  if (error) return { error: error.message };
  return { error: null };
}
