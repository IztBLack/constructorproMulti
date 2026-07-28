import type { createClient } from '@/lib/supabase/server';
import { hoyMxMs } from './tz';

export type SupabaseServer = Awaited<ReturnType<typeof createClient>>;

export interface ResultadoAsignacionObra {
  ok: boolean;
  error?: string;
  /** Obras de las que se dio de baja al asignar (movimiento). */
  cerradas: string[];
  /**
   * `true` si ya estaba asignado y vigente en la obra destino. NO es un error:
   * en un lote es una omisión esperada (volver a marcar a alguien que ya estaba).
   * Quien llama decide si lo reporta como error (flujo de uno) o lo omite (lote).
   */
  yaEstaba: boolean;
}

/**
 * Núcleo de "asignar un colaborador a una obra", sin auth ni revalidate.
 *
 * Vive aquí —y no en un server action— porque lo comparten el flujo de uno
 * (`asignarObraColaborador`) y los de lote (asignar varios colaboradores, o
 * mandar una cuadrilla completa a una obra). Duplicarlo significaría duplicar
 * la normalización a medianoche de México, que es justo donde es fácil
 * equivocarse: las asistencias se guardan por día natural, así que
 * `fecha_salida` de la obra vieja y `fecha_ingreso` de la nueva tienen que ser
 * el MISMO instante, sin huecos ni solapes.
 */
export async function asignarColaboradorAObra(
  supabase: SupabaseServer,
  empresaId: string,
  colaboradorId: string,
  obraId: string,
  mantenerAnteriores = false,
): Promise<ResultadoAsignacionObra> {
  const vacio = { cerradas: [] as string[], yaEstaba: false };
  if (!obraId) return { ok: false, error: 'Selecciona una obra.', ...vacio };
  if (!colaboradorId) return { ok: false, error: 'Selecciona un colaborador.', ...vacio };

  const now = hoyMxMs();
  const cerradas: string[] = [];

  if (!mantenerAnteriores) {
    const { data: abiertas, error: abiertasError } = await supabase
      .from('obra_colaborador')
      .select('obra_id, obras(nombre)')
      .eq('colaborador_id', colaboradorId)
      .neq('obra_id', obraId)
      .is('fecha_salida', null)
      .is('deleted_at', null);

    if (abiertasError) return { ok: false, error: abiertasError.message, ...vacio };

    for (const a of abiertas ?? []) {
      const { error } = await supabase
        .from('obra_colaborador')
        .update({ fecha_salida: now })
        .eq('colaborador_id', colaboradorId)
        .eq('obra_id', a.obra_id as string);
      if (error) return { ok: false, error: error.message, cerradas, yaEstaba: false };
      const obra = a.obras as { nombre?: string } | null;
      cerradas.push(obra?.nombre ?? 'obra sin nombre');
    }
  }

  // La PK es compuesta (obra_id, colaborador_id): si ya existe la fila por una
  // asignación previa desvinculada, se reabre en vez de insertar un duplicado.
  const { data: existente, error: existenteError } = await supabase
    .from('obra_colaborador')
    .select('obra_id, colaborador_id, fecha_salida')
    .eq('obra_id', obraId)
    .eq('colaborador_id', colaboradorId)
    .maybeSingle();

  if (existenteError) return { ok: false, error: existenteError.message, cerradas, yaEstaba: false };

  if (existente) {
    if (existente.fecha_salida === null) {
      return { ok: true, cerradas, yaEstaba: true };
    }
    const { error } = await supabase
      .from('obra_colaborador')
      .update({ fecha_ingreso: now, fecha_salida: null })
      .eq('obra_id', obraId)
      .eq('colaborador_id', colaboradorId);
    if (error) return { ok: false, error: error.message, cerradas, yaEstaba: false };
  } else {
    const { error } = await supabase.from('obra_colaborador').insert({
      empresa_id: empresaId,
      obra_id: obraId,
      colaborador_id: colaboradorId,
      fecha_ingreso: now,
      fecha_salida: null,
      salario_dia_override: null,
    });
    if (error) return { ok: false, error: error.message, cerradas, yaEstaba: false };
  }

  return { ok: true, cerradas, yaEstaba: false };
}
