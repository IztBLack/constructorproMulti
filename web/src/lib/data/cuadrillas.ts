import { createClient } from '@/lib/supabase/server';

/// Cuadrilla enriquecida para la vista admin: cabo, miembros vigentes y obras
/// asignadas vigentes. Solo lectura (verificación de la feature de cuadrillas).
export interface CuadrillaResumen {
  id: string;
  nombre: string;
  especialidad: string;
  activa: boolean;
  cabo_nombre: string | null;
  miembros: string[];
  obras: string[];
  /** Marcas de sync; alimentan los modos "agregados recientes"/"modificados". */
  created_at: number | null;
  updated_at: number | null;
}

export async function listCuadrillas(): Promise<{
  data: CuadrillaResumen[];
  error: string | null;
}> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('cuadrillas')
    .select(
      `id, nombre, especialidad, activa, created_at, updated_at,
       cabo:colaboradores!fk_cuad_jefe(nombre),
       cuadrilla_miembro(fecha_salida, deleted_at, colaboradores(nombre)),
       asignacion_cuadrilla_obra(fecha_fin, deleted_at, obras(nombre))`,
    )
    .is('deleted_at', null)
    // Orden personalizado primero (0 = sin fijar → desempata nombre, idéntico al
    // orden natural previo). Espeja el repo del móvil.
    .order('orden')
    .order('nombre');

  if (error) return { data: [], error: error.message };

  type Row = {
    id: string;
    nombre: string;
    especialidad: string;
    activa: boolean;
    created_at: number | null;
    updated_at: number | null;
    cabo: { nombre: string } | null;
    cuadrilla_miembro: {
      fecha_salida: number | null;
      deleted_at: number | null;
      colaboradores: { nombre: string } | null;
    }[];
    asignacion_cuadrilla_obra: {
      fecha_fin: number | null;
      deleted_at: number | null;
      obras: { nombre: string } | null;
    }[];
  };

  const rows = (data ?? []) as unknown as Row[];
  const mapped: CuadrillaResumen[] = rows.map((r) => ({
    id: r.id,
    nombre: r.nombre,
    especialidad: r.especialidad,
    activa: r.activa,
    created_at: r.created_at,
    updated_at: r.updated_at,
    cabo_nombre: r.cabo?.nombre ?? null,
    miembros: (r.cuadrilla_miembro ?? [])
      .filter((m) => m.fecha_salida === null && m.deleted_at === null && m.colaboradores)
      .map((m) => m.colaboradores!.nombre)
      .sort((a, b) => a.localeCompare(b)),
    obras: (r.asignacion_cuadrilla_obra ?? [])
      .filter((a) => a.fecha_fin === null && a.deleted_at === null && a.obras)
      .map((a) => a.obras!.nombre)
      .sort((a, b) => a.localeCompare(b)),
  }));

  return { data: mapped, error: null };
}

/// Cuadrilla con sus miembros vigentes (id+nombre) y obras asignadas vigentes
/// (id+nombre), para la pantalla de detalle/gestión.
export interface CuadrillaDetalle {
  id: string;
  nombre: string;
  especialidad: string;
  activa: boolean;
  jefe_colaborador_id: string | null;
  miembros: { id: string; nombre: string }[];
  obras: { id: string; nombre: string }[];
}

export async function getCuadrilla(
  id: string,
): Promise<{ data: CuadrillaDetalle | null; error: string | null }> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('cuadrillas')
    .select(
      `id, nombre, especialidad, activa, jefe_colaborador_id,
       cuadrilla_miembro(colaborador_id, fecha_salida, deleted_at, colaboradores(id, nombre)),
       asignacion_cuadrilla_obra(obra_id, fecha_fin, deleted_at, obras(id, nombre))`,
    )
    .eq('id', id)
    .is('deleted_at', null)
    .maybeSingle();

  if (error) return { data: null, error: error.message };
  if (!data) return { data: null, error: null };

  type Row = {
    id: string;
    nombre: string;
    especialidad: string;
    activa: boolean;
    jefe_colaborador_id: string | null;
    cuadrilla_miembro: {
      fecha_salida: number | null;
      deleted_at: number | null;
      colaboradores: { id: string; nombre: string } | null;
    }[];
    asignacion_cuadrilla_obra: {
      fecha_fin: number | null;
      deleted_at: number | null;
      obras: { id: string; nombre: string } | null;
    }[];
  };

  const r = data as unknown as Row;
  const detalle: CuadrillaDetalle = {
    id: r.id,
    nombre: r.nombre,
    especialidad: r.especialidad,
    activa: r.activa,
    jefe_colaborador_id: r.jefe_colaborador_id,
    miembros: (r.cuadrilla_miembro ?? [])
      .filter((m) => m.fecha_salida === null && m.deleted_at === null && m.colaboradores)
      .map((m) => ({ id: m.colaboradores!.id, nombre: m.colaboradores!.nombre }))
      .sort((a, b) => a.nombre.localeCompare(b.nombre)),
    obras: (r.asignacion_cuadrilla_obra ?? [])
      .filter((a) => a.fecha_fin === null && a.deleted_at === null && a.obras)
      .map((a) => ({ id: a.obras!.id, nombre: a.obras!.nombre }))
      .sort((a, b) => a.nombre.localeCompare(b.nombre)),
  };

  return { data: detalle, error: null };
}
