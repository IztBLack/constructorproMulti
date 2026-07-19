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
}

export async function listCuadrillas(): Promise<{
  data: CuadrillaResumen[];
  error: string | null;
}> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('cuadrillas')
    .select(
      `id, nombre, especialidad, activa,
       cabo:colaboradores!fk_cuad_jefe(nombre),
       cuadrilla_miembro(fecha_salida, deleted_at, colaboradores(nombre)),
       asignacion_cuadrilla_obra(fecha_fin, deleted_at, obras(nombre))`,
    )
    .is('deleted_at', null)
    .order('nombre');

  if (error) return { data: [], error: error.message };

  type Row = {
    id: string;
    nombre: string;
    especialidad: string;
    activa: boolean;
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
