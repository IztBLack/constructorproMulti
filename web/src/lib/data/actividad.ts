import { createClient } from '@/lib/supabase/server';

/**
 * Registro de actividad (0042 `actividad`, RF6.4): quién cambió qué en las
 * tablas de dinero y de permisos. Solo el admin lo lee (RLS); nadie lo edita
 * ni lo borra (trigger). Aquí solo se consulta, paginado hacia atrás por id.
 */

export type AccionActividad = 'CREAR' | 'EDITAR' | 'BORRAR' | 'RESTAURAR' | 'ELIMINAR';

export interface Actividad {
  id: number;
  user_id: string | null;
  usuario_nombre: string;
  usuario_rol: string | null;
  tabla: string;
  registro_id: string | null;
  obra_id: string | null;
  accion: AccionActividad;
  cambios: string[] | null;
  resumen: string | null;
  created_at: number;
}

/** Tablas que se registran y cómo se llaman en la pantalla. */
export const TABLAS_ACTIVIDAD: Readonly<Record<string, string>> = {
  movimientos: 'Caja',
  pagos: 'Pagos de cotización',
  cotizaciones: 'Cotizaciones',
  orden_cambio: 'Extras',
  estimaciones: 'Estimaciones',
  subcontrato_pago: 'Pagos a subcontratistas',
  ordenes_compra: 'Órdenes de compra',
  pagos_proveedor: 'Pagos a proveedores',
  usuarios_empresa: 'Usuarios y roles',
  usuario_obra: 'Obras asignadas',
  empresa_config: 'Módulos',
  regla_aprobacion: 'Reglas de visto bueno',
  aprobacion: 'Vistos buenos',
};

export const ACCION_TEXTO: Readonly<Record<AccionActividad, string>> = {
  CREAR: 'Agregó',
  EDITAR: 'Cambió',
  BORRAR: 'Borró',
  RESTAURAR: 'Recuperó',
  ELIMINAR: 'Eliminó definitivo',
};

export interface FiltroActividad {
  userId?: string;
  tabla?: string;
  /** epoch ms inclusive */
  desde?: number;
  /** epoch ms exclusivo */
  hasta?: number;
  /** id: trae lo anterior a este (página siguiente). */
  antesDe?: number;
}

export const POR_PAGINA = 100;

export async function listActividad(
  filtro: FiltroActividad,
): Promise<{ data: Actividad[]; error: string | null; hayMas: boolean }> {
  const supabase = await createClient();
  let q = supabase
    .from('actividad')
    .select(
      'id, user_id, usuario_nombre, usuario_rol, tabla, registro_id, obra_id, accion, cambios, resumen, created_at',
    )
    .order('id', { ascending: false })
    .limit(POR_PAGINA + 1);
  if (filtro.userId) q = q.eq('user_id', filtro.userId);
  if (filtro.tabla && TABLAS_ACTIVIDAD[filtro.tabla]) q = q.eq('tabla', filtro.tabla);
  if (filtro.desde != null) q = q.gte('created_at', filtro.desde);
  if (filtro.hasta != null) q = q.lt('created_at', filtro.hasta);
  if (filtro.antesDe != null) q = q.lt('id', filtro.antesDe);

  const { data, error } = await q;
  if (error) return { data: [], error: error.message, hayMas: false };
  const filas = (data ?? []) as Actividad[];
  return { data: filas.slice(0, POR_PAGINA), error: null, hayMas: filas.length > POR_PAGINA };
}
