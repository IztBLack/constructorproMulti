/// Lecturas de Supabase para la proyección de nómina.
///
/// Separado de `proyeccion-nomina.ts` porque aquel es PURO y lo importa la
/// tabla, que es un componente de cliente: si el cálculo y las lecturas
/// vivieran juntos, el bundler arrastraría el cliente de Supabase de servidor
/// al navegador y el build fallaría.

import { createClient } from '@/lib/supabase/server';
import type { Asistencia, Colaborador, Destajo, Puesto } from './types';
import { SELECT_CON_SUELDO, aplanarSueldos } from './colaborador-sueldo';

// ═══════════════════════════════════════════════════════════════════════════
// Lecturas
// ═══════════════════════════════════════════════════════════════════════════

export interface DatosProyeccion {
  colaboradores: Colaborador[];
  puestos: Puesto[];
  asistencias: Asistencia[];
  destajos: Destajo[];
  /// `colaboradorId → obraId` (su última obra activa asignada).
  obraPorColaborador: Record<string, string>;
  /// `colaboradorId → cuadrillaId`.
  cuadrillaPorColaborador: Record<string, string>;
  nombreObra: Record<string, string>;
  nombreCuadrilla: Record<string, string>;
  error: string | null;
}

/// Todo lo que la pantalla necesita, en una sola función.
///
/// Lee las asistencias y destajos de la semana **sin filtrar obra**: la
/// proyección razona por persona, no por obra. Sumar asistencias entre obras es
/// seguro porque el trigger de la migración 0016 impide que las fracciones de un
/// mismo día natural pasen de 1.
export async function cargarDatosProyeccion(
  inicioMs: number,
  finMs: number,
): Promise<DatosProyeccion> {
  const supabase = await createClient();
  const vacio: DatosProyeccion = {
    colaboradores: [],
    puestos: [],
    asistencias: [],
    destajos: [],
    obraPorColaborador: {},
    cuadrillaPorColaborador: {},
    nombreObra: {},
    nombreCuadrilla: {},
    error: null,
  };

  const [colabsRes, puestosRes, asisRes, destRes, obrasRes, asigRes, cuadRes, miembrosRes] =
    await Promise.all([
      supabase.from('colaboradores').select(SELECT_CON_SUELDO).is('deleted_at', null).eq('activo', true).order('nombre'),
      supabase.from('puestos').select('*').is('deleted_at', null),
      supabase.from('asistencias').select('*').gte('fecha', inicioMs).lte('fecha', finMs).is('deleted_at', null),
      supabase.from('destajos').select('*').gte('fecha', inicioMs).lte('fecha', finMs).is('deleted_at', null),
      supabase.from('obras').select('id, nombre, activa').is('deleted_at', null),
      supabase.from('obra_colaborador').select('colaborador_id, obra_id, fecha_entrada').is('fecha_salida', null),
      supabase.from('cuadrillas').select('id, nombre').is('deleted_at', null),
      // `fecha_salida` importa tanto como `deleted_at`: sin ella, un exmiembro
      // seguiría recibiendo su parte de los ajustes de la cuadrilla.
      supabase
        .from('cuadrilla_miembro')
        .select('cuadrilla_id, colaborador_id')
        .is('fecha_salida', null)
        .is('deleted_at', null),
    ]);

  const primerError =
    colabsRes.error ?? puestosRes.error ?? asisRes.error ?? destRes.error ?? obrasRes.error;
  if (primerError) return { ...vacio, error: primerError.message };

  const obras = (obrasRes.data ?? []) as { id: string; nombre: string; activa: boolean }[];
  const obrasActivas = new Set(obras.filter((o) => o.activa).map((o) => o.id));

  // Última obra ACTIVA por colaborador, igual que el pase de lista del móvil:
  // quien está en dos obras se cuenta una sola vez, o su raya saldría doble.
  const obraPorColaborador: Record<string, string> = {};
  const entradaPorColab: Record<string, number> = {};
  for (const a of (asigRes.data ?? []) as {
    colaborador_id: string;
    obra_id: string;
    fecha_entrada: number | null;
  }[]) {
    if (!obrasActivas.has(a.obra_id)) continue;
    const entrada = a.fecha_entrada ?? 0;
    if (obraPorColaborador[a.colaborador_id] === undefined || entrada >= entradaPorColab[a.colaborador_id]) {
      obraPorColaborador[a.colaborador_id] = a.obra_id;
      entradaPorColab[a.colaborador_id] = entrada;
    }
  }

  const cuadrillaPorColaborador: Record<string, string> = {};
  for (const m of (miembrosRes.data ?? []) as {
    cuadrilla_id: string;
    colaborador_id: string;
  }[]) {
    cuadrillaPorColaborador[m.colaborador_id] = m.cuadrilla_id;
  }

  return {
    colaboradores: aplanarSueldos(colabsRes.data),
    puestos: (puestosRes.data ?? []) as Puesto[],
    asistencias: (asisRes.data ?? []) as Asistencia[],
    destajos: (destRes.data ?? []) as Destajo[],
    obraPorColaborador,
    cuadrillaPorColaborador,
    nombreObra: Object.fromEntries(obras.map((o) => [o.id, o.nombre])),
    nombreCuadrilla: Object.fromEntries(
      ((cuadRes.data ?? []) as { id: string; nombre: string }[]).map((c) => [c.id, c.nombre]),
    ),
    error: null,
  };
}
