'use server';

/// Escenarios de proyección guardados: lectura y escritura.
///
/// Las policies de `supabase/migrations/0034` son la barrera real —leen admin,
/// supervisor y contador; escriben admin y supervisor—. Los cortes de rol de
/// aquí evitan además ofrecer una acción que el servidor iba a rechazar, y
/// convierten el rechazo en un mensaje en español en vez de un error de
/// PostgREST.
///
/// Las acciones devuelven los datos en la respuesta en vez de apoyarse en
/// `revalidatePath`: la pantalla es un escenario en memoria que el usuario está
/// editando, y refrescar la ruta lo tiraría al suelo. Gemelo de
/// `ProyeccionRepository` del móvil.

import { getEmpresaUsuario } from '@/lib/data/empresa';
import { puedeEditarProyeccion, puedeVerSueldos } from '@/lib/auth/sueldos';
import { createClient } from '@/lib/supabase/server';
import {
  SELECT_COMPLETA,
  SELECT_RESUMEN,
  aCompleta,
  aFilaEscritura,
  aResumen,
  type FilaProyeccion,
  type ProyeccionCompleta,
  type ProyeccionResumen,
} from '@/lib/data/proyeccion-guardada';
import type { ProyeccionEstado } from '@/lib/data/proyeccion-nomina';

const SIN_PERMISO_LECTURA =
  'Tu rol no puede ver las proyecciones guardadas.';
const SIN_PERMISO_ESCRITURA =
  'Solo los socios y los supervisores pueden guardar proyecciones.';

export interface ResultadoLista {
  filas: ProyeccionResumen[];
  error: string | null;
}

export async function listarProyecciones(): Promise<ResultadoLista> {
  const { rol } = await getEmpresaUsuario();
  if (!puedeVerSueldos(rol)) return { filas: [], error: SIN_PERMISO_LECTURA };

  const supabase = await createClient();
  const { data, error } = await supabase
    .from('proyeccion_guardada')
    .select(SELECT_RESUMEN)
    .is('deleted_at', null)
    .order('updated_at', { ascending: false });

  if (error) return { filas: [], error: error.message };
  return {
    filas: ((data ?? []) as unknown as FilaProyeccion[]).map(aResumen),
    error: null,
  };
}

export interface ResultadoAbrir {
  proyeccion: ProyeccionCompleta | null;
  error: string | null;
}

export async function abrirProyeccion(id: string): Promise<ResultadoAbrir> {
  const { rol } = await getEmpresaUsuario();
  if (!puedeVerSueldos(rol)) return { proyeccion: null, error: SIN_PERMISO_LECTURA };

  const supabase = await createClient();
  const { data, error } = await supabase
    .from('proyeccion_guardada')
    .select(SELECT_COMPLETA)
    .eq('id', id)
    .is('deleted_at', null)
    .maybeSingle();

  if (error) return { proyeccion: null, error: error.message };
  if (!data) return { proyeccion: null, error: 'Esa proyección ya no existe.' };

  const completa = aCompleta(data as unknown as FilaProyeccion);
  if (!completa) {
    // `aCompleta` devuelve null por dos motivos, y los dos se le dicen igual al
    // usuario: o la guardó una versión más nueva, o el texto está corrupto. En
    // ninguno de los dos casos puede hacer nada distinto.
    return {
      proyeccion: null,
      error:
        'Esa proyección se guardó con una versión más nueva de la app y aquí no se puede abrir.',
    };
  }
  return { proyeccion: completa, error: null };
}

export interface ResultadoGuardar {
  id: string | null;
  error: string | null;
}

export interface GuardarInput {
  /// Sin `id` se CREA; con `id` se reemplaza el escenario de esa fila.
  id?: string;
  nombre: string;
  estado: ProyeccionEstado;
  obraFiltro: string;
  totalSnapshot: number;
  personasSnapshot: number;
  notas?: string;
}

export async function guardarProyeccion(
  input: GuardarInput,
): Promise<ResultadoGuardar> {
  const { empresaId, rol } = await getEmpresaUsuario();
  if (!puedeEditarProyeccion(rol)) return { id: null, error: SIN_PERMISO_ESCRITURA };
  if (!input.nombre.trim()) return { id: null, error: 'Ponle un nombre.' };

  const supabase = await createClient();
  const now = Date.now();
  const campos = aFilaEscritura(input);

  if (input.id) {
    const { error } = await supabase
      .from('proyeccion_guardada')
      .update({ ...campos, updated_at: now })
      .eq('id', input.id)
      .is('deleted_at', null);
    return error ? { id: null, error: error.message } : { id: input.id, error: null };
  }

  const id = crypto.randomUUID();
  const { error } = await supabase.from('proyeccion_guardada').insert({
    id,
    empresa_id: empresaId,
    ...campos,
    created_at: now,
    updated_at: now,
  });
  return error ? { id: null, error: error.message } : { id, error: null };
}

export interface ResultadoSimple {
  ok: boolean;
  error?: string;
}

export async function renombrarProyeccion(
  id: string,
  nombre: string,
): Promise<ResultadoSimple> {
  const { rol } = await getEmpresaUsuario();
  if (!puedeEditarProyeccion(rol)) return { ok: false, error: SIN_PERMISO_ESCRITURA };
  if (!nombre.trim()) return { ok: false, error: 'Ponle un nombre.' };

  const supabase = await createClient();
  const { error } = await supabase
    .from('proyeccion_guardada')
    .update({ nombre: nombre.trim(), updated_at: Date.now() })
    .eq('id', id)
    .is('deleted_at', null);

  return error ? { ok: false, error: error.message } : { ok: true };
}

export async function duplicarProyeccion(
  id: string,
  nombre: string,
): Promise<ResultadoGuardar> {
  const { empresaId, rol } = await getEmpresaUsuario();
  if (!puedeEditarProyeccion(rol)) return { id: null, error: SIN_PERMISO_ESCRITURA };

  const supabase = await createClient();
  const { data, error } = await supabase
    .from('proyeccion_guardada')
    .select(SELECT_COMPLETA)
    .eq('id', id)
    .is('deleted_at', null)
    .maybeSingle();

  if (error) return { id: null, error: error.message };
  if (!data) return { id: null, error: 'Esa proyección ya no existe.' };

  // Se copia el texto del escenario TAL CUAL, sin volver a serializarlo, y con
  // su `esquema` original. Duplicar no es momento de reinterpretar nada: si la
  // fila viniera de una versión que aquí no se entiende, una copia fiel sigue
  // siendo válida para quien sí la entienda, y una reescrita ya no.
  const fila = data as unknown as FilaProyeccion;
  const nuevoId = crypto.randomUUID();
  const now = Date.now();

  const { error: errorInsert } = await supabase.from('proyeccion_guardada').insert({
    id: nuevoId,
    empresa_id: empresaId,
    nombre: nombre.trim() || `${fila.nombre ?? ''} (copia)`.trim(),
    lunes_millis: fila.lunes_millis,
    obra_filtro: fila.obra_filtro ?? '',
    escenario: fila.escenario ?? '{}',
    esquema: fila.esquema ?? 1,
    total_snapshot: fila.total_snapshot ?? 0,
    personas_snapshot: fila.personas_snapshot ?? 0,
    notas: fila.notas ?? '',
    created_at: now,
    updated_at: now,
  });

  return errorInsert
    ? { id: null, error: errorInsert.message }
    : { id: nuevoId, error: null };
}

/// Borrado LÓGICO, como todo en este esquema: la fila se queda para que el
/// móvil se entere por el sync de que desapareció. Un `delete` de verdad se le
/// quedaría en el teléfono para siempre.
export async function eliminarProyeccion(id: string): Promise<ResultadoSimple> {
  const { rol } = await getEmpresaUsuario();
  if (!puedeEditarProyeccion(rol)) return { ok: false, error: SIN_PERMISO_ESCRITURA };

  const supabase = await createClient();
  const now = Date.now();
  const { error } = await supabase
    .from('proyeccion_guardada')
    .update({ deleted_at: now, updated_at: now })
    .eq('id', id);

  return error ? { ok: false, error: error.message } : { ok: true };
}
