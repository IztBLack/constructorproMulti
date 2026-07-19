'use server';

import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { getEmpresaUsuario } from '@/lib/data/empresa';

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

/// Agrega (o reabre) un miembro. PK compuesta (cuadrilla_id, colaborador_id):
/// si ya existía con fecha_salida, se reabre en vez de duplicar.
export async function agregarMiembro(cuadrillaId: string, colaboradorId: string): Promise<ActionResult> {
  if (!colaboradorId) return { ok: false, error: 'Selecciona un colaborador.' };

  let empresaId: string;
  try {
    ({ empresaId } = await getEmpresaUsuario());
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Error de autenticación.' };
  }

  const supabase = await createClient();
  const now = Date.now();

  const { data: existente, error: exErr } = await supabase
    .from('cuadrilla_miembro')
    .select('cuadrilla_id, colaborador_id, fecha_salida')
    .eq('cuadrilla_id', cuadrillaId)
    .eq('colaborador_id', colaboradorId)
    .maybeSingle();
  if (exErr) return { ok: false, error: exErr.message };

  if (existente) {
    if (existente.fecha_salida === null) {
      return { ok: false, error: 'El colaborador ya es miembro de esta cuadrilla.' };
    }
    const { error } = await supabase
      .from('cuadrilla_miembro')
      .update({ fecha_ingreso: now, fecha_salida: null, deleted_at: null, updated_at: now })
      .eq('cuadrilla_id', cuadrillaId)
      .eq('colaborador_id', colaboradorId);
    if (error) return { ok: false, error: error.message };
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
    if (error) return { ok: false, error: error.message };
  }

  revalidatePath(`/admin/cuadrillas/${cuadrillaId}`);
  return { ok: true };
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
