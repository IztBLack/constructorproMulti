'use server';

import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { getEmpresaUsuario } from '@/lib/data/empresa';
import { fechaInputAMs, hoyMxMs, partesTz, medianocheMx, sumarDiasCalendario } from '@/lib/data/tz';
import { validarPartidaPrograma } from '@/lib/programa/programa';

/**
 * Escrituras del PROGRAMA DE OBRA (0041). Escriben admin y supervisor (lo
 * exige la RLS, que además valida que la partida del presupuesto sea de ESTA
 * obra). Aquí solo se valida para dar un mensaje claro.
 */

export interface Resultado {
  ok: boolean;
  error?: string;
}

export interface PartidaProgramaInput {
  concepto: string;
  presupuestoId: string | null;
  seccion: string | null;
  /** 'YYYY-MM-DD' */
  inicio: string;
  fin: string;
}

const FECHA = /^\d{4}-\d{2}-\d{2}$/;

async function quienEscribe(): Promise<{ empresaId: string } | { error: string }> {
  try {
    const { empresaId, rol } = await getEmpresaUsuario();
    if (!['admin', 'supervisor'].includes(rol)) {
      return { error: 'Solo el administrador o un supervisor cambian el programa.' };
    }
    return { empresaId };
  } catch (e) {
    return { error: e instanceof Error ? e.message : 'Error de autenticación.' };
  }
}

function aFila(input: PartidaProgramaInput): { fila: Record<string, unknown> } | { error: string } {
  if (!FECHA.test(input.inicio) || !FECHA.test(input.fin)) return { error: 'Pon las dos fechas.' };
  const fecha_inicio = fechaInputAMs(input.inicio);
  const fecha_fin = fechaInputAMs(input.fin);
  const concepto = input.concepto.trim();
  const invalido = validarPartidaPrograma({ concepto, fecha_inicio, fecha_fin });
  if (invalido) return { error: invalido };
  return {
    fila: {
      concepto,
      presupuesto_id: input.presupuestoId || null,
      seccion: input.seccion?.trim() || null,
      fecha_inicio,
      fecha_fin,
    },
  };
}

function mensaje(msg: string): string {
  if (/row-level security/i.test(msg)) return 'No tienes permiso, o esa partida no es de esta obra.';
  if (msg.includes('programa_fechas_ok')) return 'La fecha de fin no puede ser antes del inicio.';
  return msg;
}

function ruta(obraId: string) {
  return `/admin/obras/${obraId}/programa`;
}

export async function crearPartidaPrograma(obraId: string, input: PartidaProgramaInput): Promise<Resultado> {
  const q = await quienEscribe();
  if ('error' in q) return { ok: false, error: q.error };
  const f = aFila(input);
  if ('error' in f) return { ok: false, error: f.error };

  const supabase = await createClient();
  const { data: ult } = await supabase
    .from('programa_partida')
    .select('orden')
    .eq('obra_id', obraId)
    .is('deleted_at', null)
    .order('orden', { ascending: false })
    .limit(1)
    .maybeSingle();

  const ahora = Date.now();
  const { error } = await supabase.from('programa_partida').insert({
    id: crypto.randomUUID(),
    empresa_id: q.empresaId,
    obra_id: obraId,
    ...f.fila,
    orden: ((ult as { orden?: number } | null)?.orden ?? -1) + 1,
    created_at: ahora,
    updated_at: ahora,
  });
  if (error) return { ok: false, error: mensaje(error.message) };
  revalidatePath(ruta(obraId));
  return { ok: true };
}

export async function editarPartidaPrograma(
  obraId: string,
  id: string,
  input: PartidaProgramaInput,
): Promise<Resultado> {
  const q = await quienEscribe();
  if ('error' in q) return { ok: false, error: q.error };
  const f = aFila(input);
  if ('error' in f) return { ok: false, error: f.error };

  const supabase = await createClient();
  const { error } = await supabase
    .from('programa_partida')
    .update({ ...f.fila, updated_at: Date.now() })
    .eq('id', id)
    .eq('obra_id', obraId);
  if (error) return { ok: false, error: mensaje(error.message) };
  revalidatePath(ruta(obraId));
  return { ok: true };
}

export async function marcarTerminada(obraId: string, id: string, terminada: boolean): Promise<Resultado> {
  const q = await quienEscribe();
  if ('error' in q) return { ok: false, error: q.error };
  const supabase = await createClient();
  const { error } = await supabase
    .from('programa_partida')
    .update({ terminada, updated_at: Date.now() })
    .eq('id', id)
    .eq('obra_id', obraId);
  if (error) return { ok: false, error: mensaje(error.message) };
  revalidatePath(ruta(obraId));
  return { ok: true };
}

export async function borrarPartidaPrograma(obraId: string, id: string): Promise<Resultado> {
  const q = await quienEscribe();
  if ('error' in q) return { ok: false, error: q.error };
  const supabase = await createClient();
  const { error } = await supabase
    .from('programa_partida')
    .update({ deleted_at: Date.now(), updated_at: Date.now() })
    .eq('id', id)
    .eq('obra_id', obraId);
  if (error) return { ok: false, error: mensaje(error.message) };
  revalidatePath(ruta(obraId));
  return { ok: true };
}

/**
 * Agrega al programa las partidas del presupuesto de la obra que todavía no
 * están, una semana a partir de hoy cada una, para no capturarlas a mano. Las
 * fechas se ajustan después.
 */
export async function traerPartidasDelPresupuesto(obraId: string): Promise<Resultado & { agregadas?: number }> {
  const q = await quienEscribe();
  if ('error' in q) return { ok: false, error: q.error };
  const supabase = await createClient();

  const [{ data: presupuesto, error: e1 }, { data: programa, error: e2 }] = await Promise.all([
    supabase
      .from('obra_presupuesto')
      .select('id, concepto, seccion, orden')
      .eq('obra_id', obraId)
      .is('deleted_at', null)
      .order('orden', { ascending: true }),
    supabase.from('programa_partida').select('presupuesto_id, orden').eq('obra_id', obraId).is('deleted_at', null),
  ]);
  if (e1 || e2) return { ok: false, error: (e1 ?? e2)!.message };

  const ya = new Set(((programa ?? []) as { presupuesto_id: string | null }[]).map((p) => p.presupuesto_id));
  const faltan = ((presupuesto ?? []) as { id: string; concepto: string; seccion: string | null }[]).filter(
    (p) => !ya.has(p.id) && p.concepto.trim(),
  );
  if (faltan.length === 0) return { ok: true, agregadas: 0 };

  const hoy = hoyMxMs();
  const p = partesTz(hoy);
  const c = sumarDiasCalendario(p.year, p.month, p.day, 6);
  const finSemana = medianocheMx(c.y, c.m0, c.d);
  let orden = Math.max(-1, ...((programa ?? []) as { orden: number }[]).map((x) => x.orden)) + 1;
  const ahora = Date.now();

  const { error } = await supabase.from('programa_partida').insert(
    faltan.map((f) => ({
      id: crypto.randomUUID(),
      empresa_id: q.empresaId,
      obra_id: obraId,
      presupuesto_id: f.id,
      seccion: f.seccion,
      concepto: f.concepto.trim().slice(0, 300),
      fecha_inicio: hoy,
      fecha_fin: finSemana,
      orden: orden++,
      created_at: ahora,
      updated_at: ahora,
    })),
  );
  if (error) return { ok: false, error: mensaje(error.message) };
  revalidatePath(ruta(obraId));
  return { ok: true, agregadas: faltan.length };
}
