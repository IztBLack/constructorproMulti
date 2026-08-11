import { createClient } from '@/lib/supabase/server';
import type { AsignacionObraColaborador, Colaborador, ObraResumen, Puesto } from './types';

/// Colaborador activo en una obra, enriquecido con el nombre de su puesto
/// (cuando está disponible) para mostrarlo en el detalle de la obra.
export interface ColaboradorEnObra {
  id: string;
  nombre: string;
  puesto_nombre: string | null;
  tipo_pago: Colaborador['tipo_pago'];
  fecha_ingreso: number;
}

export async function listColaboradores(): Promise<{
  data: Colaborador[];
  error: string | null;
}> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('colaboradores')
    .select('*')
    .is('deleted_at', null)
    .order('orden')
    .order('nombre');

  if (error) return { data: [], error: error.message };
  return { data: (data ?? []) as Colaborador[], error: null };
}

export async function getColaborador(
  id: string,
): Promise<{ data: Colaborador | null; error: string | null }> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('colaboradores')
    .select('*')
    .eq('id', id)
    .is('deleted_at', null)
    .maybeSingle();

  if (error) return { data: null, error: error.message };
  return { data: data as Colaborador | null, error: null };
}

export async function listPuestos(): Promise<{ data: Puesto[]; error: string | null }> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('puestos')
    .select('*')
    .is('deleted_at', null)
    .order('nombre');

  if (error) return { data: [], error: error.message };
  return { data: (data ?? []) as Puesto[], error: null };
}

/// Lista liviana de obras (id + nombre) para usar en selectores de asignación.
export async function listObrasDisponibles(): Promise<{
  data: ObraResumen[];
  error: string | null;
}> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('obras')
    .select('id,nombre')
    .is('deleted_at', null)
    .order('nombre');

  if (error) return { data: [], error: error.message };
  return { data: (data ?? []) as ObraResumen[], error: null };
}

/// Colaboradores actualmente asignados (fecha_salida IS NULL) a una obra,
/// con su nombre, puesto y tipo de pago para mostrarlos en el detalle de la obra.
export async function listColaboradoresDeObra(
  obraId: string,
): Promise<{ data: ColaboradorEnObra[]; error: string | null }> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('obra_colaborador')
    .select('fecha_ingreso, colaboradores(id, nombre, tipo_pago, puestos(nombre))')
    .eq('obra_id', obraId)
    .is('fecha_salida', null);

  if (error) return { data: [], error: error.message };

  type Row = {
    fecha_ingreso: number;
    colaboradores: {
      id: string;
      nombre: string;
      tipo_pago: Colaborador['tipo_pago'];
      puestos: { nombre: string } | null;
    } | null;
  };

  const rows = (data ?? []) as unknown as Row[];
  const mapped: ColaboradorEnObra[] = rows
    .filter((r) => r.colaboradores !== null)
    .map((r) => ({
      id: r.colaboradores!.id,
      nombre: r.colaboradores!.nombre,
      puesto_nombre: r.colaboradores!.puestos?.nombre ?? null,
      tipo_pago: r.colaboradores!.tipo_pago,
      fecha_ingreso: r.fecha_ingreso,
    }))
    .sort((a, b) => a.nombre.localeCompare(b.nombre));

  return { data: mapped, error: null };
}

/// Asignaciones (histórico completo, activas e históricas) de un colaborador,
/// enriquecidas con el nombre de la obra para mostrarlas en el detalle.
export async function listAsignacionesColaborador(
  colaboradorId: string,
): Promise<{ data: AsignacionObraColaborador[]; error: string | null }> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('obra_colaborador')
    .select('*, obras(nombre)')
    .eq('colaborador_id', colaboradorId)
    .order('fecha_ingreso', { ascending: false });

  if (error) return { data: [], error: error.message };

  type Row = {
    empresa_id: string;
    obra_id: string;
    colaborador_id: string;
    fecha_ingreso: number;
    fecha_salida: number | null;
    salario_dia_override: number | null;
    obras: { nombre: string } | null;
  };

  const rows = (data ?? []) as unknown as Row[];
  const mapped: AsignacionObraColaborador[] = rows.map((r) => ({
    empresa_id: r.empresa_id,
    obra_id: r.obra_id,
    colaborador_id: r.colaborador_id,
    fecha_ingreso: r.fecha_ingreso,
    fecha_salida: r.fecha_salida,
    salario_dia_override: r.salario_dia_override,
    obra_nombre: r.obras?.nombre ?? 'Obra eliminada',
  }));

  return { data: mapped, error: null };
}

/// Obra(s) VIGENTE(S) por colaborador, para toda la empresa: `colaborador_id` →
/// lista de `{ id, nombre }`. Alimenta el filtro por obra de la pantalla Equipo
/// (el equivalente del `colaboradorObrasProvider` del móvil).
///
/// Solo asignaciones abiertas (`fecha_salida` nula) y no borradas: el filtro
/// pregunta "quién está HOY en esta obra", no quién estuvo alguna vez.
export async function listObrasPorColaborador(): Promise<{
  data: Record<string, { id: string; nombre: string }[]>;
  error: string | null;
}> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('obra_colaborador')
    .select('colaborador_id, obra_id, obras(nombre, activa, deleted_at)')
    .is('fecha_salida', null)
    .is('deleted_at', null);

  if (error) return { data: {}, error: error.message };

  type Row = {
    colaborador_id: string;
    obra_id: string;
    obras: { nombre: string; activa: boolean; deleted_at: number | null } | null;
  };

  const out: Record<string, { id: string; nombre: string }[]> = {};
  for (const r of (data ?? []) as unknown as Row[]) {
    // Una obra archivada o borrada no debe generar un chip de filtro.
    if (!r.obras || r.obras.deleted_at !== null || !r.obras.activa) continue;
    (out[r.colaborador_id] ??= []).push({ id: r.obra_id, nombre: r.obras.nombre });
  }
  for (const lista of Object.values(out)) {
    lista.sort((a, b) => a.nombre.localeCompare(b.nombre));
  }
  return { data: out, error: null };
}
