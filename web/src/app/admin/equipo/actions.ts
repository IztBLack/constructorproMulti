'use server';

import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { getEmpresaUsuario } from '@/lib/data/empresa';
import type { PeriodoPago, TipoPago } from '@/lib/data/types';
import { esPeriodoPago, salarioDiarioDesdePeriodo } from '@/lib/data/salario';
import { asignarColaboradorAObra } from '@/lib/data/asignar-obra';

export interface ActionResult {
  ok: boolean;
  error?: string;
}

/// Lee el sueldo por periodo del formulario y deriva el salario diario que
/// consume la nómina (`salario_personalizado`). El diario NO viene del form:
/// siempre se recalcula aquí a partir del periodo, el monto y los días/semana.
/// Escribe (o actualiza) la fila de sueldo. Devuelve el mensaje de error, o
/// null si salió bien.
///
/// Se llama SIEMPRE, incluso cuando el monto quedó vacío: guardar la fila con el
/// monto en null es lo que hace que borrar un sueldo se propague al móvil por el
/// sync. Si no se escribiera, el valor viejo seguiría vivo en el servidor.
///
/// `upsert` y no `insert`: la fila puede existir o no —solo se crea cuando
/// alguien captura un sueldo— y el formulario de edición no sabe cuál es el caso.
async function guardarSueldo(
  supabase: Awaited<ReturnType<typeof createClient>>,
  colaboradorId: string,
  empresaId: string,
  sueldo: {
    periodoPago: PeriodoPago;
    salarioPeriodo: number | null;
    diasSemana: number;
    salarioDiario: number | null;
  },
): Promise<string | null> {
  const now = Date.now();
  const { error } = await supabase.from('colaborador_sueldo').upsert(
    {
      colaborador_id: colaboradorId,
      empresa_id: empresaId,
      salario_personalizado: sueldo.salarioDiario,
      periodo_pago: sueldo.periodoPago,
      salario_periodo: sueldo.salarioPeriodo,
      dias_semana: sueldo.diasSemana,
      created_at: now,
      updated_at: now,
      deleted_at: null,
    },
    { onConflict: 'colaborador_id' },
  );
  return error ? error.message : null;
}

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
  // Obra opcional elegida en el propio formulario: permite dar de alta y asignar
  // en un solo paso (vacío = "asignar después").
  const obraId = String(formData.get('obra_id') ?? '').trim();
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
  const colaboradorId = crypto.randomUUID();

  const supabase = await createClient();
  const { error } = await supabase.from('colaboradores').insert({
    id: colaboradorId,
    empresa_id: empresaId,
    nombre,
    puesto_id: puestoId || null,
    tipo_pago: tipoPago === 'DESTAJO' ? 'DESTAJO' : 'DIA',
    telefono: telefono,
    contacto_nombre: '',
    contacto_telefono: '',
    contacto_parentesco: '',
    activo: true,
    created_at: now,
    updated_at: now,
  });

  if (error) {
    return { ok: false, error: error.message };
  }

  // El sueldo va a su propia tabla desde la migración 0027: la RLS filtra filas
  // y no columnas, y así el rol `colaborador` puede leer los nombres de sus
  // compañeros (los necesita para el pase de lista) sin leer lo que cobran.
  const errSueldo = await guardarSueldo(supabase, colaboradorId, empresaId, {
    periodoPago,
    salarioPeriodo,
    diasSemana,
    salarioDiario,
  });
  if (errSueldo) {
    // El colaborador YA existe: volver a enviar el formulario lo duplicaría. Se
    // avisa del sueldo sin fingir que el alta entera falló.
    revalidatePath('/admin/equipo');
    return {
      ok: false,
      error: `Se creó a ${nombre}, pero no se pudo guardar el sueldo: ${errSueldo}`,
    };
  }

  // Si se eligió obra, se asigna enseguida. El colaborador YA quedó creado: si
  // la asignación fallara, se avisa sin fingir que todo el alta falló (volver a
  // enviar el formulario crearía un duplicado).
  if (obraId) {
    const r = await asignarColaboradorAObra(supabase, empresaId, colaboradorId, obraId);
    if (!r.ok) {
      revalidatePath('/admin/equipo');
      return {
        ok: false,
        error: `Se creó a ${nombre}, pero no se pudo asignar a la obra: ${r.error ?? 'error desconocido'}`,
      };
    }
    revalidatePath('/admin/obras');
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
      updated_at: now,
    })
    .eq('id', id);

  if (error) {
    return { ok: false, error: error.message };
  }

  let empresaId: string;
  try {
    ({ empresaId } = await getEmpresaUsuario());
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Error de autenticación.' };
  }
  const errSueldo = await guardarSueldo(supabase, id, empresaId, {
    periodoPago,
    salarioPeriodo,
    diasSemana,
    salarioDiario,
  });
  if (errSueldo) {
    return { ok: false, error: `No se pudo guardar el sueldo: ${errSueldo}` };
  }

  revalidatePath('/admin/equipo');
  revalidatePath(`/admin/equipo/${id}`);
  return { ok: true };
}

export interface ResultadoAsignacion extends ActionResult {
  /** Obras de las que se dio de baja al asignar (para poder informarlo). */
  cerradas?: string[];
}

/**
 * Asigna un colaborador a una obra. Por defecto es un **movimiento**: le cierra
 * las asignaciones abiertas en otras obras con la misma fecha de ingreso.
 *
 * El motivo es que asignar de forma puramente aditiva dejaba a la gente
 * acumulada en varias obras a la vez (al detectarlo, 13 de 16 colaboradores
 * estaban en más de una, y ninguno trabajaba realmente en dos). Eso obliga a
 * adivinar en qué obra pasarle lista y abre la puerta a marcar el mismo día en
 * dos obras distintas.
 *
 * `mantenerAnteriores` deja el comportamiento viejo, para el caso legítimo de
 * quien sí atiende dos frentes (un maestro que supervisa).
 *
 * La fecha se normaliza a la **medianoche de México**: `fecha_salida` de la obra
 * vieja y `fecha_ingreso` de la nueva son el MISMO instante, sin huecos ni
 * solapes. Ese día ya cuenta como de la obra nueva.
 */
export async function asignarObraColaborador(
  colaboradorId: string,
  obraId: string,
  mantenerAnteriores = false,
): Promise<ResultadoAsignacion> {
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
  const r = await asignarColaboradorAObra(
    supabase,
    empresaId,
    colaboradorId,
    obraId,
    mantenerAnteriores,
  );

  if (!r.ok) return { ok: false, error: r.error };
  // En el flujo de uno, reasignar a quien ya estaba es un error de usuario que
  // conviene decirle. En lote es solo una omisión (ver `asignarObraColaboradores`).
  if (r.yaEstaba) return { ok: false, error: 'El colaborador ya está asignado a esta obra.' };

  revalidatePath(`/admin/equipo/`);
  revalidatePath('/admin/obras');
  return { ok: true, cerradas: r.cerradas };
}

/** Resultado de una asignación en lote, para poder reportar éxitos y fallos por separado. */
export interface ResultadoLoteAsignacion extends ActionResult {
  /** Ids efectivamente asignados. */
  asignados: string[];
  /** Ids que ya estaban vigentes en la obra: se omiten sin considerarlo error. */
  omitidos: string[];
  /** Ids que fallaron, con el motivo. */
  fallidos: { id: string; error: string }[];
  /** Nombres de obras de las que se dio de baja a alguien (sin repetir). */
  cerradas: string[];
}

/**
 * Asigna VARIOS colaboradores a una obra de una sola pasada.
 *
 * No es atómico: Supabase-js no expone transacciones, así que se aplica uno por
 * uno y se reporta el desglose. Un fallo a la mitad NO cancela los anteriores,
 * por eso se devuelven `asignados`/`fallidos` en vez de un booleano: la UI tiene
 * que poder decir exactamente quién sí quedó y quién no.
 */
export async function asignarObraColaboradores(
  colaboradorIds: string[],
  obraId: string,
  mantenerAnteriores = false,
): Promise<ResultadoLoteAsignacion> {
  const vacio = { asignados: [], omitidos: [], fallidos: [], cerradas: [] };
  if (!obraId) return { ok: false, error: 'Selecciona una obra.', ...vacio };
  if (colaboradorIds.length === 0) {
    return { ok: false, error: 'Selecciona al menos un colaborador.', ...vacio };
  }

  let empresaId: string;
  try {
    ({ empresaId } = await getEmpresaUsuario());
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : 'Error de autenticación.',
      ...vacio,
    };
  }

  const supabase = await createClient();
  const asignados: string[] = [];
  const omitidos: string[] = [];
  const fallidos: { id: string; error: string }[] = [];
  const cerradas = new Set<string>();

  for (const colaboradorId of colaboradorIds) {
    const r = await asignarColaboradorAObra(
      supabase,
      empresaId,
      colaboradorId,
      obraId,
      mantenerAnteriores,
    );
    r.cerradas.forEach((c) => cerradas.add(c));
    if (!r.ok) fallidos.push({ id: colaboradorId, error: r.error ?? 'Error desconocido.' });
    else if (r.yaEstaba) omitidos.push(colaboradorId);
    else asignados.push(colaboradorId);
  }

  revalidatePath('/admin/equipo');
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
