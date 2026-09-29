import { createClient } from '@/lib/supabase/server';
import {
  esEstadoHerramienta,
  esTipoHerramienta,
  faltaColumnaPermanente,
  type EstadoHerramienta,
  type TipoHerramienta,
} from '@/lib/herramienta/herramienta';

/**
 * Lectura de HERRAMIENTA Y MAQUINARIA (0043). La RLS deja leer a admin,
 * supervisor y contador (con costos); el colaborador no ve nada.
 */

export interface Prestamo {
  id: string;
  herramienta_id: string;
  obra_id: string | null;
  obra_nombre: string | null;
  colaborador_id: string | null;
  colaborador_nombre: string | null;
  desde: number;
  devolver_antes: number | null;
  hasta: number | null;
  entrego_nombre: string;
  recibio_nombre: string;
  estado_regreso: EstadoHerramienta | null;
  notas: string;
  /** Asignación de planta (0047): sin fecha de regreso ni alerta. */
  permanente: boolean;
}

export interface Herramienta {
  id: string;
  nombre: string;
  tipo: TipoHerramienta;
  clave: string;
  serie: string;
  estado: EstadoHerramienta;
  costo: number | null;
  notas: string;
  /** Préstamo abierto (dónde está ahora), o null si está en bodega. */
  prestamo: Prestamo | null;
}

const CAMPOS_PRESTAMO_0043 =
  'id, herramienta_id, obra_id, colaborador_id, desde, devolver_antes, hasta, entrego_nombre, recibio_nombre, estado_regreso, notas, obras(nombre), colaboradores(nombre)';
const CAMPOS_PRESTAMO = `${CAMPOS_PRESTAMO_0043}, permanente`;

type Respuesta = { data: unknown; error: { message: string } | null };

/**
 * Lee los préstamos con `permanente` (0047) y, si la base todavía no tiene la
 * columna, vuelve a leer sin ella: todo sale como préstamo, igual que antes.
 * Así la web puede desplegarse antes de aplicar la migración.
 */
async function conRespaldo0047(consulta: (campos: string) => PromiseLike<Respuesta>): Promise<Respuesta> {
  const r = await consulta(CAMPOS_PRESTAMO);
  if (r.error && faltaColumnaPermanente(r.error.message)) return consulta(CAMPOS_PRESTAMO_0043);
  return r;
}

type FilaPrestamo = {
  id: string;
  herramienta_id: string;
  obra_id: string | null;
  colaborador_id: string | null;
  desde: number;
  devolver_antes: number | null;
  hasta: number | null;
  entrego_nombre: string;
  recibio_nombre: string;
  estado_regreso: string | null;
  notas: string;
  permanente?: boolean | null;
  obras: { nombre: string } | null;
  colaboradores: { nombre: string } | null;
};

function aPrestamo(f: FilaPrestamo): Prestamo {
  return {
    id: f.id,
    herramienta_id: f.herramienta_id,
    obra_id: f.obra_id,
    obra_nombre: f.obras?.nombre ?? null,
    colaborador_id: f.colaborador_id,
    colaborador_nombre: f.colaboradores?.nombre ?? null,
    desde: Number(f.desde),
    devolver_antes: f.devolver_antes === null ? null : Number(f.devolver_antes),
    hasta: f.hasta === null ? null : Number(f.hasta),
    entrego_nombre: f.entrego_nombre ?? '',
    recibio_nombre: f.recibio_nombre ?? '',
    estado_regreso: esEstadoHerramienta(f.estado_regreso) ? f.estado_regreso : null,
    notas: f.notas ?? '',
    permanente: f.permanente === true,
  };
}

function aHerramienta(f: Record<string, unknown>, prestamo: Prestamo | null): Herramienta {
  return {
    id: String(f.id),
    nombre: String(f.nombre),
    tipo: esTipoHerramienta(f.tipo) ? f.tipo : 'OTRO',
    clave: String(f.clave ?? ''),
    serie: String(f.serie ?? ''),
    estado: esEstadoHerramienta(f.estado) ? f.estado : 'BUENO',
    costo: f.costo === null || f.costo === undefined ? null : Number(f.costo),
    notas: String(f.notas ?? ''),
    prestamo,
  };
}

/** Inventario completo con el préstamo abierto de cada una. */
export async function listHerramienta(): Promise<{ data: Herramienta[]; error: string | null }> {
  const supabase = await createClient();
  const [inv, abiertos] = await Promise.all([
    supabase
      .from('herramienta')
      .select('id, nombre, tipo, clave, serie, estado, costo, notas')
      .is('deleted_at', null)
      .order('nombre')
      .limit(2000),
    conRespaldo0047((campos) =>
      supabase.from('herramienta_asignacion').select(campos).is('hasta', null).is('deleted_at', null).limit(2000),
    ),
  ]);
  if (inv.error) return { data: [], error: inv.error.message };
  if (abiertos.error) return { data: [], error: abiertos.error.message };
  const porHerramienta = new Map<string, Prestamo>();
  for (const f of (abiertos.data ?? []) as unknown as FilaPrestamo[]) {
    porHerramienta.set(f.herramienta_id, aPrestamo(f));
  }
  return {
    data: (inv.data ?? []).map((f) =>
      aHerramienta(f as Record<string, unknown>, porHerramienta.get(String((f as { id: string }).id)) ?? null),
    ),
    error: null,
  };
}

/** Una herramienta con TODO su historial de préstamos (el más nuevo arriba). */
export async function getHerramienta(
  id: string,
): Promise<{ data: Herramienta | null; historial: Prestamo[]; error: string | null }> {
  const supabase = await createClient();
  const [h, hist] = await Promise.all([
    supabase
      .from('herramienta')
      .select('id, nombre, tipo, clave, serie, estado, costo, notas')
      .eq('id', id)
      .is('deleted_at', null)
      .maybeSingle(),
    conRespaldo0047((campos) =>
      supabase
        .from('herramienta_asignacion')
        .select(campos)
        .eq('herramienta_id', id)
        .is('deleted_at', null)
        .order('desde', { ascending: false })
        .limit(500),
    ),
  ]);
  if (h.error) return { data: null, historial: [], error: h.error.message };
  if (hist.error) return { data: null, historial: [], error: hist.error.message };
  if (!h.data) return { data: null, historial: [], error: null };
  const historial = ((hist.data ?? []) as unknown as FilaPrestamo[]).map(aPrestamo);
  return {
    data: aHerramienta(h.data as Record<string, unknown>, historial.find((p) => p.hasta === null) ?? null),
    historial,
    error: null,
  };
}

/** Colaboradores activos (id + nombre) para elegir responsable. */
export async function listResponsables(): Promise<{ id: string; nombre: string }[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from('colaboradores')
    .select('id, nombre')
    .is('deleted_at', null)
    .eq('activo', true)
    .order('nombre');
  return (data ?? []) as { id: string; nombre: string }[];
}
