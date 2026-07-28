'use server';

import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { getEmpresaUsuario } from '@/lib/data/empresa';
import { asignarColaboradorAObra, type SupabaseServer } from '@/lib/data/asignar-obra';

export interface ActionResult {
  ok: boolean;
  error?: string;
}

const ESPECIALIDAD_VALS = [
  'ALBANILERIA',
  'ACERO',
  'CIMBRA',
  'INSTALACIONES',
  'ACABADOS',
  'MIXTA',
];

function normalizaEspecialidad(raw: string): string {
  return ESPECIALIDAD_VALS.includes(raw) ? raw : 'MIXTA';
}

export async function crearCuadrilla(formData: FormData): Promise<ActionResult> {
  const nombre = String(formData.get('nombre') ?? '').trim();
  const especialidad = normalizaEspecialidad(String(formData.get('especialidad') ?? 'MIXTA').trim());

  if (!nombre) return { ok: false, error: 'El nombre de la cuadrilla es obligatorio.' };

  let empresaId: string;
  try {
    ({ empresaId } = await getEmpresaUsuario());
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Error de autenticación.' };
  }

  const supabase = await createClient();
  const now = Date.now();
  const { error } = await supabase.from('cuadrillas').insert({
    id: crypto.randomUUID(),
    empresa_id: empresaId,
    nombre,
    especialidad,
    jefe_colaborador_id: null,
    activa: true,
    created_at: now,
    updated_at: now,
  });

  if (error) return { ok: false, error: error.message };
  revalidatePath('/admin/cuadrillas');
  return { ok: true };
}

export async function editarCuadrilla(id: string, formData: FormData): Promise<ActionResult> {
  const nombre = String(formData.get('nombre') ?? '').trim();
  const especialidad = normalizaEspecialidad(String(formData.get('especialidad') ?? 'MIXTA').trim());
  if (!nombre) return { ok: false, error: 'El nombre de la cuadrilla es obligatorio.' };

  const supabase = await createClient();
  const { error } = await supabase
    .from('cuadrillas')
    .update({ nombre, especialidad, updated_at: Date.now() })
    .eq('id', id);

  if (error) return { ok: false, error: error.message };
  revalidatePath('/admin/cuadrillas');
  revalidatePath(`/admin/cuadrillas/${id}`);
  return { ok: true };
}

/// Baja lógica EN CASCADA: la cuadrilla + sus miembros + sus asignaciones a obra.
export async function eliminarCuadrilla(id: string): Promise<ActionResult> {
  const supabase = await createClient();
  const now = Date.now();
  const patch = { deleted_at: now, updated_at: now };

  const r1 = await supabase.from('cuadrilla_miembro').update(patch).eq('cuadrilla_id', id);
  if (r1.error) return { ok: false, error: r1.error.message };
  const r2 = await supabase.from('asignacion_cuadrilla_obra').update(patch).eq('cuadrilla_id', id);
  if (r2.error) return { ok: false, error: r2.error.message };
  const r3 = await supabase.from('cuadrillas').update(patch).eq('id', id);
  if (r3.error) return { ok: false, error: r3.error.message };

  revalidatePath('/admin/cuadrillas');
  return { ok: true };
}

export async function setActivaCuadrilla(id: string, activa: boolean): Promise<ActionResult> {
  const supabase = await createClient();
  const { error } = await supabase
    .from('cuadrillas')
    .update({ activa, updated_at: Date.now() })
    .eq('id', id);
  if (error) return { ok: false, error: error.message };
  revalidatePath('/admin/cuadrillas');
  revalidatePath(`/admin/cuadrillas/${id}`);
  return { ok: true };
}

/// Resultado de una operación en lote: desglose de qué se aplicó y qué no.
export interface ResultadoLote extends ActionResult {
  /** Ids aplicados con éxito. */
  aplicados: string[];
  /** Ids que ya estaban vigentes: se omiten sin considerarlo error. */
  omitidos: string[];
  /** Ids que fallaron, con el motivo. */
  fallidos: { id: string; error: string }[];
}

/// Agrega (o reabre) un miembro. PK compuesta (cuadrilla_id, colaborador_id):
/// si ya existía con fecha_salida, se reabre en vez de duplicar.
/// Devuelve `yaEra` para que el lote lo omita en vez de tratarlo como error.
async function agregarMiembroCore(
  supabase: SupabaseServer,
  empresaId: string,
  cuadrillaId: string,
  colaboradorId: string,
): Promise<{ ok: boolean; error?: string; yaEra: boolean }> {
  const now = Date.now();

  const { data: existente, error: exErr } = await supabase
    .from('cuadrilla_miembro')
    .select('cuadrilla_id, colaborador_id, fecha_salida')
    .eq('cuadrilla_id', cuadrillaId)
    .eq('colaborador_id', colaboradorId)
    .maybeSingle();
  if (exErr) return { ok: false, error: exErr.message, yaEra: false };

  if (existente) {
    if (existente.fecha_salida === null) return { ok: true, yaEra: true };
    const { error } = await supabase
      .from('cuadrilla_miembro')
      .update({ fecha_ingreso: now, fecha_salida: null, deleted_at: null, updated_at: now })
      .eq('cuadrilla_id', cuadrillaId)
      .eq('colaborador_id', colaboradorId);
    if (error) return { ok: false, error: error.message, yaEra: false };
  } else {
    const { error } = await supabase.from('cuadrilla_miembro').insert({
      empresa_id: empresaId,
      cuadrilla_id: cuadrillaId,
      colaborador_id: colaboradorId,
      fecha_ingreso: now,
      fecha_salida: null,
      created_at: now,
      updated_at: now,
    });
    if (error) return { ok: false, error: error.message, yaEra: false };
  }

  return { ok: true, yaEra: false };
}

export async function agregarMiembro(cuadrillaId: string, colaboradorId: string): Promise<ActionResult> {
  if (!colaboradorId) return { ok: false, error: 'Selecciona un colaborador.' };

  let empresaId: string;
  try {
    ({ empresaId } = await getEmpresaUsuario());
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Error de autenticación.' };
  }

  const supabase = await createClient();
  const r = await agregarMiembroCore(supabase, empresaId, cuadrillaId, colaboradorId);
  if (!r.ok) return { ok: false, error: r.error };
  if (r.yaEra) return { ok: false, error: 'El colaborador ya es miembro de esta cuadrilla.' };

  revalidatePath(`/admin/cuadrillas/${cuadrillaId}`);
  return { ok: true };
}

/**
 * Agrega VARIOS miembros de una pasada. No es atómico (Supabase-js no expone
 * transacciones): se aplica uno por uno y se devuelve el desglose para que la UI
 * pueda decir exactamente quién quedó dentro y quién no.
 */
export async function agregarMiembros(
  cuadrillaId: string,
  colaboradorIds: string[],
): Promise<ResultadoLote> {
  const vacio = { aplicados: [], omitidos: [], fallidos: [] };
  if (colaboradorIds.length === 0) {
    return { ok: false, error: 'Selecciona al menos un colaborador.', ...vacio };
  }

  let empresaId: string;
  try {
    ({ empresaId } = await getEmpresaUsuario());
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Error de autenticación.', ...vacio };
  }

  const supabase = await createClient();
  const aplicados: string[] = [];
  const omitidos: string[] = [];
  const fallidos: { id: string; error: string }[] = [];

  for (const colaboradorId of colaboradorIds) {
    const r = await agregarMiembroCore(supabase, empresaId, cuadrillaId, colaboradorId);
    if (!r.ok) fallidos.push({ id: colaboradorId, error: r.error ?? 'Error desconocido.' });
    else if (r.yaEra) omitidos.push(colaboradorId);
    else aplicados.push(colaboradorId);
  }

  revalidatePath(`/admin/cuadrillas/${cuadrillaId}`);
  return {
    ok: fallidos.length === 0,
    error: fallidos.length > 0 ? `No se pudo agregar a ${fallidos.length}.` : undefined,
    aplicados,
    omitidos,
    fallidos,
  };
}

/// Quita un miembro (baja lógica: fecha_salida). Si era el cabo, deja la
/// cuadrilla sin cabo para no dejar un jefe que ya no pertenece.
export async function quitarMiembro(cuadrillaId: string, colaboradorId: string): Promise<ActionResult> {
  const supabase = await createClient();
  const now = Date.now();

  const { error } = await supabase
    .from('cuadrilla_miembro')
    .update({ fecha_salida: now, updated_at: now })
    .eq('cuadrilla_id', cuadrillaId)
    .eq('colaborador_id', colaboradorId)
    .is('fecha_salida', null);
  if (error) return { ok: false, error: error.message };

  const { error: jefeErr } = await supabase
    .from('cuadrillas')
    .update({ jefe_colaborador_id: null, updated_at: now })
    .eq('id', cuadrillaId)
    .eq('jefe_colaborador_id', colaboradorId);
  if (jefeErr) return { ok: false, error: jefeErr.message };

  revalidatePath(`/admin/cuadrillas/${cuadrillaId}`);
  return { ok: true };
}

/// Fija/limpia el cabo. `colaboradorId` vacío = sin cabo.
export async function setJefe(cuadrillaId: string, colaboradorId: string): Promise<ActionResult> {
  const supabase = await createClient();
  const { error } = await supabase
    .from('cuadrillas')
    .update({ jefe_colaborador_id: colaboradorId || null, updated_at: Date.now() })
    .eq('id', cuadrillaId);
  if (error) return { ok: false, error: error.message };
  revalidatePath(`/admin/cuadrillas/${cuadrillaId}`);
  return { ok: true };
}

export async function asignarObra(cuadrillaId: string, obraId: string): Promise<ActionResult> {
  if (!obraId) return { ok: false, error: 'Selecciona una obra.' };

  let empresaId: string;
  try {
    ({ empresaId } = await getEmpresaUsuario());
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Error de autenticación.' };
  }

  const supabase = await createClient();
  const now = Date.now();

  const { data: vigente, error: vErr } = await supabase
    .from('asignacion_cuadrilla_obra')
    .select('id')
    .eq('cuadrilla_id', cuadrillaId)
    .eq('obra_id', obraId)
    .is('fecha_fin', null)
    .is('deleted_at', null)
    .maybeSingle();
  if (vErr) return { ok: false, error: vErr.message };
  if (vigente) return { ok: false, error: 'La cuadrilla ya está asignada a esta obra.' };

  const { error } = await supabase.from('asignacion_cuadrilla_obra').insert({
    id: crypto.randomUUID(),
    empresa_id: empresaId,
    cuadrilla_id: cuadrillaId,
    obra_id: obraId,
    fecha_inicio: now,
    fecha_fin: null,
    fase: '',
    created_at: now,
    updated_at: now,
  });
  if (error) return { ok: false, error: error.message };

  revalidatePath(`/admin/cuadrillas/${cuadrillaId}`);
  return { ok: true };
}

/// Miembros vigentes de una cuadrilla (solo ids). Base de la cascada a la obra.
async function miembrosVigentes(
  supabase: SupabaseServer,
  cuadrillaId: string,
): Promise<{ ids: string[]; error?: string }> {
  const { data, error } = await supabase
    .from('cuadrilla_miembro')
    .select('colaborador_id')
    .eq('cuadrilla_id', cuadrillaId)
    .is('fecha_salida', null)
    .is('deleted_at', null);
  if (error) return { ids: [], error: error.message };
  return { ids: (data ?? []).map((m) => m.colaborador_id as string) };
}

export interface ResultadoMandarEquipo extends ActionResult {
  /** Miembros que quedaron asignados a la obra (ids). */
  asignados: string[];
  /** Miembros que ya estaban en la obra (ids). */
  omitidos: string[];
  fallidos: { id: string; error: string }[];
  /** Nombres de obras de las que se dio de baja a alguien. */
  cerradas: string[];
}

/**
 * Manda a TODOS los miembros vigentes de la cuadrilla a la obra, además de
 * dejar asignada la cuadrilla.
 *
 * Existe porque asignar la cuadrilla a una obra (`asignacion_cuadrilla_obra`) y
 * asignar a cada persona a esa obra (`obra_colaborador`) son cosas INDEPENDIENTES
 * en el modelo: si solo se hace lo primero, la cuadrilla se ve asignada pero su
 * gente no aparece en el pase de lista. Este es el atajo para no tener que
 * recordarlo ni repetir el paso por cada miembro.
 *
 * Es un MOVIMIENTO: a cada miembro se le cierran sus asignaciones abiertas en
 * otras obras, igual que al asignar de uno en uno desde Equipo.
 */
export async function mandarEquipoAObra(
  cuadrillaId: string,
  obraId: string,
): Promise<ResultadoMandarEquipo> {
  const vacio = { asignados: [], omitidos: [], fallidos: [], cerradas: [] };
  if (!obraId) return { ok: false, error: 'Selecciona una obra.', ...vacio };

  let empresaId: string;
  try {
    ({ empresaId } = await getEmpresaUsuario());
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Error de autenticación.', ...vacio };
  }

  const supabase = await createClient();

  const { ids, error: miembrosError } = await miembrosVigentes(supabase, cuadrillaId);
  if (miembrosError) return { ok: false, error: miembrosError, ...vacio };
  if (ids.length === 0) {
    return { ok: false, error: 'La cuadrilla no tiene miembros vigentes.', ...vacio };
  }

  // Si la cuadrilla aún no está ligada a la obra, se liga de paso: mandar al
  // equipo sin dejar el vínculo dejaría la obra sin registro de qué cuadrilla
  // está trabajando ahí.
  const vinculo = await asignarObra(cuadrillaId, obraId);
  if (!vinculo.ok && vinculo.error !== 'La cuadrilla ya está asignada a esta obra.') {
    return { ok: false, error: vinculo.error, ...vacio };
  }

  const asignados: string[] = [];
  const omitidos: string[] = [];
  const fallidos: { id: string; error: string }[] = [];
  const cerradas = new Set<string>();

  for (const colaboradorId of ids) {
    const r = await asignarColaboradorAObra(supabase, empresaId, colaboradorId, obraId);
    r.cerradas.forEach((c) => cerradas.add(c));
    if (!r.ok) fallidos.push({ id: colaboradorId, error: r.error ?? 'Error desconocido.' });
    else if (r.yaEstaba) omitidos.push(colaboradorId);
    else asignados.push(colaboradorId);
  }

  revalidatePath(`/admin/cuadrillas/${cuadrillaId}`);
  revalidatePath('/admin/obras');
  return {
    ok: fallidos.length === 0,
    error: fallidos.length > 0 ? `No se pudo asignar a ${fallidos.length}.` : undefined,
    asignados,
    omitidos,
    fallidos,
    cerradas: [...cerradas],
  };
}

/// Asigna la cuadrilla a VARIAS obras de una pasada (solo el vínculo, sin cascada).
export async function asignarObras(cuadrillaId: string, obraIds: string[]): Promise<ResultadoLote> {
  const vacio = { aplicados: [], omitidos: [], fallidos: [] };
  if (obraIds.length === 0) return { ok: false, error: 'Selecciona al menos una obra.', ...vacio };

  const aplicados: string[] = [];
  const omitidos: string[] = [];
  const fallidos: { id: string; error: string }[] = [];

  for (const obraId of obraIds) {
    const r = await asignarObra(cuadrillaId, obraId);
    if (r.ok) aplicados.push(obraId);
    else if (r.error === 'La cuadrilla ya está asignada a esta obra.') omitidos.push(obraId);
    else fallidos.push({ id: obraId, error: r.error ?? 'Error desconocido.' });
  }

  revalidatePath(`/admin/cuadrillas/${cuadrillaId}`);
  return {
    ok: fallidos.length === 0,
    error: fallidos.length > 0 ? `No se pudo asignar ${fallidos.length} obra(s).` : undefined,
    aplicados,
    omitidos,
    fallidos,
  };
}

export async function desasignarObra(cuadrillaId: string, obraId: string): Promise<ActionResult> {
  const supabase = await createClient();
  const now = Date.now();
  const { error } = await supabase
    .from('asignacion_cuadrilla_obra')
    .update({ fecha_fin: now, updated_at: now })
    .eq('cuadrilla_id', cuadrillaId)
    .eq('obra_id', obraId)
    .is('fecha_fin', null);
  if (error) return { ok: false, error: error.message };
  revalidatePath(`/admin/cuadrillas/${cuadrillaId}`);
  return { ok: true };
}

/// Fase 4 — Destajo por cuadrilla: registra una BOLSA ya repartida como UNA fila
/// de `destajos` por miembro (monto = bolsa × %), todas con el mismo
/// `cuadrilla_id` y concepto. La nómina las suma por colaborador sin cambios.
/// El repartidor (UI) garantiza que la suma de montos = total de la bolsa.
export async function registrarDestajoCuadrilla(
  cuadrillaId: string,
  obraId: string,
  concepto: string,
  reparto: { colaboradorId: string; monto: number }[],
): Promise<ActionResult> {
  if (!obraId) return { ok: false, error: 'Selecciona una obra.' };
  if (!concepto.trim()) return { ok: false, error: 'Captura el concepto del destajo.' };
  if (reparto.length === 0) return { ok: false, error: 'La cuadrilla no tiene miembros.' };
  if (reparto.some((r) => !Number.isFinite(r.monto) || r.monto < 0)) {
    return { ok: false, error: 'Montos inválidos en el reparto.' };
  }

  let empresaId: string;
  try {
    ({ empresaId } = await getEmpresaUsuario());
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Error de autenticación.' };
  }

  const supabase = await createClient();
  const now = Date.now();
  const rows = reparto.map((r) => ({
    id: crypto.randomUUID(),
    empresa_id: empresaId,
    colaborador_id: r.colaboradorId,
    obra_id: obraId,
    fecha: now,
    concepto: concepto.trim(),
    monto: r.monto,
    cuadrilla_id: cuadrillaId,
    created_at: now,
    updated_at: now,
  }));

  const { error } = await supabase.from('destajos').insert(rows);
  if (error) return { ok: false, error: error.message };

  revalidatePath(`/admin/cuadrillas/${cuadrillaId}`);
  return { ok: true };
}
