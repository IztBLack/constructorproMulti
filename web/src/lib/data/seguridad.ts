import { createClient } from '@/lib/supabase/server';
import { normalizarPuntos, type PuntoChecklist } from '@/lib/seguridad/checklist';
import {
  esAtencion,
  esParteCuerpo,
  esTipoIncidente,
  esTipoLesion,
  type Atencion,
  type ParteCuerpo,
  type TipoIncidente,
  type TipoLesion,
} from '@/lib/seguridad/incidentes';

/**
 * Lectura de SEGURIDAD EN OBRA (0043). Todo con la sesión del usuario: la RLS
 * decide. En particular `incidente_salud` solo le regresa filas al admin; para
 * los demás llega vacía y la pantalla simplemente no muestra esa parte (D8).
 */

export const BUCKET_SEGURIDAD = 'seguridad';
const URL_SEGUNDOS = 60 * 10;

export interface Checklist {
  id: string;
  obra_id: string;
  fecha: number;
  puntos: PuntoChecklist[];
  observaciones: string;
  firmo_nombre: string;
  registrada_en: number;
}

export interface SaludIncidente {
  id: string;
  tipo_lesion: TipoLesion;
  parte_cuerpo: ParteCuerpo;
  atencion: Atencion;
  nota: string;
}

export interface Incidente {
  id: string;
  obra_id: string;
  fecha: number;
  tipo: TipoIncidente;
  descripcion: string;
  acciones: string;
  colaborador_id: string | null;
  colaborador_nombre: string | null;
  dias_incapacidad: number | null;
  aviso_imss_hecho: boolean;
  aviso_imss_fecha: number | null;
  tiene_comprobante: boolean;
  registrado_nombre: string;
  /** Solo llega para el admin (RLS). */
  salud: SaludIncidente | null;
}

function aChecklist(f: Record<string, unknown>): Checklist {
  return {
    id: String(f.id),
    obra_id: String(f.obra_id),
    fecha: Number(f.fecha),
    puntos: normalizarPuntos(f.puntos),
    observaciones: String(f.observaciones ?? ''),
    firmo_nombre: String(f.firmo_nombre ?? ''),
    registrada_en: Number(f.registrada_en ?? 0),
  };
}

/** Revisiones de una obra, de la más nueva a la más vieja. */
export async function listChecklistsObra(
  obraId: string,
  limite = 30,
): Promise<{ data: Checklist[]; error: string | null }> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('seguridad_checklist')
    .select('id, obra_id, fecha, puntos, observaciones, firmo_nombre, registrada_en')
    .eq('obra_id', obraId)
    .is('deleted_at', null)
    .order('fecha', { ascending: false })
    .limit(limite);
  if (error) return { data: [], error: error.message };
  return { data: (data ?? []).map((f) => aChecklist(f as Record<string, unknown>)), error: null };
}

/** Incidentes de una obra con el nombre del colaborador y, si es admin, su parte de salud. */
export async function listIncidentesObra(
  obraId: string,
): Promise<{ data: Incidente[]; error: string | null }> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('incidente')
    .select(
      'id, obra_id, fecha, tipo, descripcion, acciones, colaborador_id, dias_incapacidad, aviso_imss_hecho, aviso_imss_fecha, comprobante_path, registrado_nombre, colaboradores(nombre)',
    )
    .eq('obra_id', obraId)
    .is('deleted_at', null)
    .order('fecha', { ascending: false })
    .limit(500);
  if (error) return { data: [], error: error.message };

  type Fila = {
    id: string;
    obra_id: string;
    fecha: number;
    tipo: string;
    descripcion: string;
    acciones: string;
    colaborador_id: string | null;
    dias_incapacidad: number | null;
    aviso_imss_hecho: boolean;
    aviso_imss_fecha: number | null;
    comprobante_path: string | null;
    registrado_nombre: string;
    colaboradores: { nombre: string } | null;
  };
  const filas = (data ?? []) as unknown as Fila[];

  // Salud: la RLS solo le regresa filas al admin. Para los demás, vacío.
  const saludPorIncidente = new Map<string, SaludIncidente>();
  if (filas.length > 0) {
    const { data: salud } = await supabase
      .from('incidente_salud')
      .select('id, incidente_id, tipo_lesion, parte_cuerpo, atencion, nota')
      .in(
        'incidente_id',
        filas.map((f) => f.id),
      )
      .is('deleted_at', null);
    for (const s of (salud ?? []) as Record<string, unknown>[]) {
      saludPorIncidente.set(String(s.incidente_id), {
        id: String(s.id),
        tipo_lesion: esTipoLesion(s.tipo_lesion) ? s.tipo_lesion : 'OTRA',
        parte_cuerpo: esParteCuerpo(s.parte_cuerpo) ? s.parte_cuerpo : 'OTRA',
        atencion: esAtencion(s.atencion) ? s.atencion : 'NINGUNA',
        nota: String(s.nota ?? ''),
      });
    }
  }

  return {
    data: filas
      .filter((f) => esTipoIncidente(f.tipo))
      .map((f) => ({
        id: f.id,
        obra_id: f.obra_id,
        fecha: Number(f.fecha),
        tipo: f.tipo as TipoIncidente,
        descripcion: f.descripcion,
        acciones: f.acciones ?? '',
        colaborador_id: f.colaborador_id,
        colaborador_nombre: f.colaboradores?.nombre ?? null,
        dias_incapacidad: f.dias_incapacidad,
        aviso_imss_hecho: f.aviso_imss_hecho,
        aviso_imss_fecha: f.aviso_imss_fecha === null ? null : Number(f.aviso_imss_fecha),
        tiene_comprobante: !!f.comprobante_path,
        registrado_nombre: f.registrado_nombre ?? '',
        salud: saludPorIncidente.get(f.id) ?? null,
      })),
    error: null,
  };
}

// ── EPP ─────────────────────────────────────────────────────────────────────

export interface EntregaEpp {
  id: string;
  articulo: string;
  cantidad: number;
  fecha: number;
  obra_id: string | null;
  obra_nombre: string | null;
  entrego_nombre: string;
  notas: string;
  evidencia_tipo: 'FIRMA' | 'FOTO' | null;
  /** URL firmada para ver la evidencia (10 min). */
  evidencia_url: string | null;
}

export async function listEppColaborador(
  colaboradorId: string,
): Promise<{ data: EntregaEpp[]; error: string | null }> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('epp_entrega')
    .select('id, articulo, cantidad, fecha, obra_id, entrego_nombre, notas, evidencia_tipo, evidencia_path, obras(nombre)')
    .eq('colaborador_id', colaboradorId)
    .is('deleted_at', null)
    .order('fecha', { ascending: false })
    .limit(300);
  if (error) return { data: [], error: error.message };

  type Fila = {
    id: string;
    articulo: string;
    cantidad: number;
    fecha: number;
    obra_id: string | null;
    entrego_nombre: string;
    notas: string;
    evidencia_tipo: 'FIRMA' | 'FOTO' | null;
    evidencia_path: string | null;
    obras: { nombre: string } | null;
  };
  const filas = (data ?? []) as unknown as Fila[];
  const paths = filas.map((f) => f.evidencia_path).filter((p): p is string => !!p);
  const urls = new Map<string, string>();
  if (paths.length > 0) {
    const { data: firmadas } = await supabase.storage.from(BUCKET_SEGURIDAD).createSignedUrls(paths, URL_SEGUNDOS);
    for (const s of firmadas ?? []) if (s.path && s.signedUrl) urls.set(s.path, s.signedUrl);
  }
  return {
    data: filas.map((f) => ({
      id: f.id,
      articulo: f.articulo,
      cantidad: f.cantidad,
      fecha: Number(f.fecha),
      obra_id: f.obra_id,
      obra_nombre: f.obras?.nombre ?? null,
      entrego_nombre: f.entrego_nombre ?? '',
      notas: f.notas ?? '',
      evidencia_tipo: f.evidencia_tipo,
      evidencia_url: f.evidencia_path ? (urls.get(f.evidencia_path) ?? null) : null,
    })),
    error: null,
  };
}
