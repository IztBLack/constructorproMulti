/// Lecturas y escrituras de nómina contra Supabase.
///
/// El CÁLCULO vive en `nomina-calculo.ts`, que es puro y lo puede importar el
/// navegador. Aquí se re-exporta para que todo lo que ya importaba de este
/// módulo siga funcionando sin cambios.

import { createClient } from '@/lib/supabase/server';
import { getEmpresaUsuario } from './empresa';
import type { Asistencia, Colaborador, Destajo, Puesto } from './types';
import { siguienteMedianocheMx } from './tz';
import { SELECT_CON_SUELDO, aplanarSueldos } from './colaborador-sueldo';

export {
  semanaDe,
  navegarSemana,
  calcularNomina,
} from './nomina-calculo';
export type { SemanaRango, NominaItem, NominaSummary } from './nomina-calculo';

/// --- Lecturas -----------------------------------------------------------

/**
 * Colaboradores asignados a una obra (vía `obra_colaborador`).
 *
 * Con `vigentesDesdeMs` la consulta es **consciente de la fecha**: devuelve a
 * quien estaba asignado en ese momento, no solo a quien lo está hoy. Sin ese
 * parámetro conserva el comportamiento viejo ("asignados ahora mismo").
 *
 * Hace falta porque al mover a alguien de obra se le cierra la asignación
 * anterior. Con el filtro de solo `fecha_salida is null`, esa persona
 * desaparecería de la obra vieja **también en las semanas pasadas**, cuando sí
 * trabajó ahí, y no se podría corregir una asistencia anterior.
 *
 * `fecha_salida` marca el día en que la persona DEJA de pertenecer a la obra:
 * ese día ya no cuenta como suyo (convención observada en los datos: en las 9
 * asignaciones cerradas, nadie trabajó el día de su salida). Por eso la
 * comparación es contra la medianoche del día siguiente — así además se ignora
 * la hora de reloj con la que se guardaron las filas viejas.
 */
export async function listColaboradoresActivosObra(
  obraId: string,
  vigentesDesdeMs?: number,
): Promise<{ data: Colaborador[]; error: string | null }> {
  const supabase = await createClient();
  const base = supabase.from('obra_colaborador').select('colaborador_id').eq('obra_id', obraId);
  const { data: asignaciones, error: asigError } =
    vigentesDesdeMs === undefined
      ? await base.is('fecha_salida', null)
      : await base.or(
          `fecha_salida.is.null,fecha_salida.gte.${siguienteMedianocheMx(vigentesDesdeMs)}`,
        );

  if (asigError) return { data: [], error: asigError.message };

  const colaboradorIds = (asignaciones ?? []).map((a) => a.colaborador_id as string);
  if (colaboradorIds.length === 0) return { data: [], error: null };

  const { data, error } = await supabase
    .from('colaboradores')
    .select(SELECT_CON_SUELDO)
    .in('id', colaboradorIds)
    .is('deleted_at', null)
    .order('nombre');

  if (error) return { data: [], error: error.message };
  return { data: aplanarSueldos(data), error: null };
}

export async function listAsistenciasObraRango(
  obraId: string,
  inicioMs: number,
  finMs: number,
): Promise<{ data: Asistencia[]; error: string | null }> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('asistencias')
    .select('*')
    .eq('obra_id', obraId)
    .gte('fecha', inicioMs)
    .lte('fecha', finMs)
    .is('deleted_at', null)
    .order('fecha', { ascending: false });

  if (error) return { data: [], error: error.message };
  return { data: (data ?? []) as Asistencia[], error: null };
}

export async function listDestajosObraRango(
  obraId: string,
  inicioMs: number,
  finMs: number,
): Promise<{ data: Destajo[]; error: string | null }> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('destajos')
    .select('*')
    .eq('obra_id', obraId)
    .gte('fecha', inicioMs)
    .lte('fecha', finMs)
    .is('deleted_at', null)
    .order('fecha', { ascending: false });

  if (error) return { data: [], error: error.message };
  return { data: (data ?? []) as Destajo[], error: null };
}

export async function listPuestosLite(): Promise<{ data: Puesto[]; error: string | null }> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('puestos')
    .select('*')
    .is('deleted_at', null);

  if (error) return { data: [], error: error.message };
  return { data: (data ?? []) as Puesto[], error: null };
}

// ── Escrituras (paridad con el móvil) ────────────────────────────────────────

/**
 * Crea un destajo INDIVIDUAL (no de cuadrilla) para un colaborador. La `fecha`
 * debe ser el inicio de la semana mostrada (como en el móvil): así cae dentro
 * del rango que suma esa semana de nómina. `concepto` es obligatorio.
 */
export async function crearDestajo(input: {
  obraId: string;
  colaboradorId: string;
  fecha: number;
  concepto: string;
  monto: number;
}): Promise<{ error: string | null }> {
  const { empresaId } = await getEmpresaUsuario();
  const supabase = await createClient();
  const now = Date.now();

  const { error } = await supabase.from('destajos').insert({
    id: crypto.randomUUID(),
    empresa_id: empresaId,
    colaborador_id: input.colaboradorId,
    obra_id: input.obraId,
    fecha: input.fecha,
    concepto: input.concepto,
    monto: input.monto,
    cuadrilla_id: null,
    created_at: now,
    updated_at: now,
    deleted_at: null,
  });

  if (error) return { error: error.message };
  return { error: null };
}

/** Borrado SUAVE de un destajo (como el móvil): marca deleted_at. */
export async function eliminarDestajo(id: string): Promise<{ error: string | null }> {
  const supabase = await createClient();
  const now = Date.now();
  const { error } = await supabase
    .from('destajos')
    .update({ deleted_at: now, updated_at: now })
    .eq('id', id);

  if (error) return { error: error.message };
  return { error: null };
}

/**
 * ¿Ya se registró en caja la nómina de esta semana? Evita el doble registro que
 * el móvil no previene: busca un movimiento SALIDA de categoría NOMINA con el
 * mismo concepto (rango de la semana) en la obra.
 */
export async function nominaYaRegistrada(obraId: string, concepto: string): Promise<boolean> {
  const supabase = await createClient();
  const { data } = await supabase
    .from('movimientos')
    .select('id')
    .eq('obra_id', obraId)
    .eq('categoria', 'NOMINA')
    .eq('concepto', concepto)
    .is('deleted_at', null)
    .limit(1);
  return (data?.length ?? 0) > 0;
}
