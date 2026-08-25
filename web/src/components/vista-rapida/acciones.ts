'use server';

import { getEstadoCuentaObraAdmin } from '@/lib/data/estado-cuenta-obra-admin';
import { listColaboradoresDeObra } from '@/lib/data/equipo';
import { listNotasObra } from '@/lib/data/notas-obra';

/**
 * Resumen de una obra para la VISTA RÁPIDA: lo que se puede responder sin
 * abrirla. Deliberadamente corto — cuatro números y nada más.
 *
 * Se pide BAJO DEMANDA, al abrir el panel, y no junto con la lista: cargar el
 * resumen de treinta obras para que se mire una sería pagar treinta consultas
 * por adelantado a cambio de nada.
 */
export interface ResumenObra {
  ok: boolean;
  error?: string;
  personas?: number;
  costoTotal?: number;
  recibido?: number;
  pendiente?: number;
  pagadoPct?: number;
  notas?: number;
}

export async function resumenObra(obraId: string): Promise<ResumenObra> {
  try {
    const [{ estado, error }, { data: equipo }, { data: notas }] = await Promise.all([
      getEstadoCuentaObraAdmin(obraId),
      listColaboradoresDeObra(obraId),
      listNotasObra(obraId),
    ]);

    if (error) return { ok: false, error };

    return {
      ok: true,
      personas: equipo.length,
      costoTotal: estado.costoTotal,
      recibido: estado.recibido,
      pendiente: estado.pendiente,
      pagadoPct: estado.pagadoPct,
      notas: notas.length,
    };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'No se pudo cargar.' };
  }
}
