'use server';

import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { getEmpresaUsuario } from '@/lib/data/empresa';
import type { PeriodoPago, TipoPago } from '@/lib/data/types';
import { esPeriodoPago, salarioDiarioDesdePeriodo } from '@/lib/data/salario';

export interface ActionResult {
  ok: boolean;
  error?: string;
}

/// Lee el sueldo por periodo del formulario y deriva el salario diario que
/// consume la nómina (`salario_personalizado`). El diario NO viene del form:
/// siempre se recalcula aquí a partir del periodo, el monto y los días/semana.
function derivarSueldo(formData: FormData): {
  periodoPago: PeriodoPago;
  salarioPeriodo: number | null;
  diasSemana: number;
  salarioDiario: number | null;
} {
  const periodoRaw = String(formData.get('periodo_pago') ?? 'MENSUAL').trim();
  const periodoPago: PeriodoPago = esPeriodoPago(periodoRaw) ? periodoRaw : 'MENSUAL';

  const diasSemanaNum = Number(String(formData.get('dias_semana') ?? '6').trim());
  const diasSemana = [5, 6, 7].includes(diasSemanaNum) ? diasSemanaNum : 6;

  const montoStr = String(formData.get('salario_periodo') ?? '').trim();
  const salarioPeriodo = montoStr ? Number(montoStr) : null;
  const montoValido = salarioPeriodo != null && Number.isFinite(salarioPeriodo) && salarioPeriodo > 0;

  return {
    periodoPago,
    salarioPeriodo: montoValido ? salarioPeriodo : null,
    diasSemana,
    salarioDiario: salarioDiarioDesdePeriodo(
      montoValido ? salarioPeriodo : null,
      periodoPago,
      diasSemana,
    ),
  };
}

export async function crearColaborador(formData: FormData): Promise<ActionResult> {
  const nombre = String(formData.get('nombre') ?? '').trim();
  const puestoId = String(formData.get('puesto_id') ?? '').trim();
  const tipoPago = String(formData.get('tipo_pago') ?? 'DIA').trim() as TipoPago;
  const telefono = String(formData.get('telefono') ?? '').trim();
  const { periodoPago, salarioPeriodo, diasSemana, salarioDiario } = derivarSueldo(formData);

  if (!nombre) {
    return { ok: false, error: 'El nombre del colaborador es obligatorio.' };
  }

  let empresaId: string;
  try {
    ({ empresaId } = await getEmpresaUsuario());
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Error de autenticación.' };
  }

  const now = Date.now();

  const supabase = await createClient();
  const { error } = await supabase.from('colaboradores').insert({
    id: crypto.randomUUID(),
    empresa_id: empresaId,
    nombre,
    puesto_id: puestoId || null,
    tipo_pago: tipoPago === 'DESTAJO' ? 'DESTAJO' : 'DIA',
    telefono: telefono,
    contacto_nombre: '',
    contacto_telefono: '',
    contacto_parentesco: '',
    activo: true,
    salario_personalizado: salarioDiario,
    periodo_pago: periodoPago,
    salario_periodo: salarioPeriodo,
    dias_semana: diasSemana,
    created_at: now,
    updated_at: now,
  });

  if (error) {
    return { ok: false, error: error.message };
  }

  revalidatePath('/admin/equipo');
  revalidatePath('/admin');
  return { ok: true };
}

export async function alternarActivoColaborador(id: string, activo: boolean): Promise<ActionResult> {
  const supabase = await createClient();
  const now = Date.now();
  const { error } = await supabase
    .from('colaboradores')
    .update({ activo, updated_at: now })
    .eq('id', id);

  if (error) {
    return { ok: false, error: error.message };
  }

  revalidatePath('/admin/equipo');
  return { ok: true };
}

export async function actualizarColaborador(id: string, formData: FormData): Promise<ActionResult> {
  const nombre = String(formData.get('nombre') ?? '').trim();
  const puestoId = String(formData.get('puesto_id') ?? '').trim();
  const tipoPago = String(formData.get('tipo_pago') ?? 'DIA').trim() as TipoPago;
  const telefono = String(formData.get('telefono') ?? '').trim();
  const contactoNombre = String(formData.get('contacto_nombre') ?? '').trim();
  const contactoTelefono = String(formData.get('contacto_telefono') ?? '').trim();
  const contactoParentesco = String(formData.get('contacto_parentesco') ?? '').trim();
  const { periodoPago, salarioPeriodo, diasSemana, salarioDiario } = derivarSueldo(formData);

  if (!nombre) {
    return { ok: false, error: 'El nombre del colaborador es obligatorio.' };
  }

  const now = Date.now();

  const supabase = await createClient();
  const { error } = await supabase
    .from('colaboradores')
    .update({
      nombre,
      puesto_id: puestoId || null,
      tipo_pago: tipoPago === 'DESTAJO' ? 'DESTAJO' : 'DIA',
      telefono,
      contacto_nombre: contactoNombre,
      contacto_telefono: contactoTelefono,
      contacto_parentesco: contactoParentesco,
      salario_personalizado: salarioDiario,
      periodo_pago: periodoPago,
      salario_periodo: salarioPeriodo,
      dias_semana: diasSemana,
      updated_at: now,
    })
    .eq('id', id);

  if (error) {
    return { ok: false, error: error.message };
  }

  revalidatePath('/admin/equipo');
  revalidatePath(`/admin/equipo/${id}`);
  return { ok: true };
}

export async function asignarObraColaborador(
  colaboradorId: string,
  obraId: string,
): Promise<ActionResult> {
  if (!obraId) {
    return { ok: false, error: 'Selecciona una obra.' };
  }

  let empresaId: string;
  try {
    ({ empresaId } = await getEmpresaUsuario());
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Error de autenticación.' };
  }

  const supabase = await createClient();
  const now = Date.now();

  // Si ya existe la fila (PK compuesta obra_id, colaborador_id) por una asignación
  // previa que fue desvinculada, la reabrimos en vez de insertar duplicado.
  const { data: existente, error: existenteError } = await supabase
    .from('obra_colaborador')
    .select('obra_id, colaborador_id, fecha_salida')
    .eq('obra_id', obraId)
    .eq('colaborador_id', colaboradorId)
    .maybeSingle();

  if (existenteError) {
    return { ok: false, error: existenteError.message };
  }

  if (existente) {
    if (existente.fecha_salida === null) {
      return { ok: false, error: 'El colaborador ya está asignado a esta obra.' };
    }
    const { error } = await supabase
      .from('obra_colaborador')
      .update({ fecha_ingreso: now, fecha_salida: null })
      .eq('obra_id', obraId)
      .eq('colaborador_id', colaboradorId);

    if (error) {
      return { ok: false, error: error.message };
    }
  } else {
    const { error } = await supabase.from('obra_colaborador').insert({
      empresa_id: empresaId,
      obra_id: obraId,
      colaborador_id: colaboradorId,
      fecha_ingreso: now,
      fecha_salida: null,
      salario_dia_override: null,
    });

    if (error) {
      return { ok: false, error: error.message };
    }
  }

  revalidatePath(`/admin/equipo/${colaboradorId}`);
  return { ok: true };
}

export async function desvincularObraColaborador(
  colaboradorId: string,
  obraId: string,
): Promise<ActionResult> {
  const supabase = await createClient();
  const now = Date.now();
  const { error } = await supabase
    .from('obra_colaborador')
    .update({ fecha_salida: now })
    .eq('obra_id', obraId)
    .eq('colaborador_id', colaboradorId);

  if (error) {
    return { ok: false, error: error.message };
  }

  revalidatePath(`/admin/equipo/${colaboradorId}`);
  return { ok: true };
}
