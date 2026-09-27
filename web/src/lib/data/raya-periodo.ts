import { createClient } from '@/lib/supabase/server';
import { getEmpresaUsuario } from './empresa';
import type { Asistencia, Destajo } from './types';

/**
 * Asistencias y destajos de TODA la empresa en un periodo, para la raya del
 * contador (RF5.6). Paginado: PostgREST corta en 1000 filas por respuesta y un
 * mes de pase de lista de varias obras pasa de eso fácil; sin paginar, el
 * Excel saldría incompleto sin avisar.
 */

const PAGINA = 1000;
const MAX_FILAS = 50_000;

async function todasLasFilas<T>(tabla: 'asistencias' | 'destajos', empresaId: string, desde: number, hasta: number) {
  const supabase = await createClient();
  const filas: T[] = [];
  for (let desdeFila = 0; desdeFila < MAX_FILAS; desdeFila += PAGINA) {
    const { data, error } = await supabase
      .from(tabla)
      .select('*')
      .eq('empresa_id', empresaId)
      .gte('fecha', desde)
      .lte('fecha', hasta)
      .is('deleted_at', null)
      .order('id')
      .range(desdeFila, desdeFila + PAGINA - 1);
    if (error) return { data: [] as T[], error: error.message };
    filas.push(...((data ?? []) as T[]));
    if (!data || data.length < PAGINA) return { data: filas, error: null };
  }
  return { data: filas, error: `El periodo tiene más de ${MAX_FILAS} registros; elige uno más corto.` };
}

export async function cargarActividadPeriodo(
  desdeMs: number,
  hastaMs: number,
): Promise<{ asistencias: Asistencia[]; destajos: Destajo[]; error: string | null }> {
  const { empresaId } = await getEmpresaUsuario();
  const [a, d] = await Promise.all([
    todasLasFilas<Asistencia>('asistencias', empresaId, desdeMs, hastaMs),
    todasLasFilas<Destajo>('destajos', empresaId, desdeMs, hastaMs),
  ]);
  return { asistencias: a.data, destajos: d.data, error: a.error ?? d.error };
}
