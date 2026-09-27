import { createClient } from '@/lib/supabase/server';
import { esEstadoReporte, type EstadoReporte } from '@/lib/postventa/garantia';

/**
 * Lectura de GARANTÍAS / POSTVENTA (0043). Con la sesión del usuario: la
 * oficina (admin, supervisor, contador) ve los de su empresa; el cliente solo
 * los de SUS obras (lo decide la RLS, aquí no se repite el filtro).
 */

export const BUCKET_POSTVENTA = 'postventa';
const URL_SEGUNDOS = 60 * 60;

export interface FotoReporte {
  id: string;
  url: string | null;
  subida_por_cliente: boolean;
}

export interface Reporte {
  id: string;
  obra_id: string;
  obra_nombre: string | null;
  cliente_nombre: string | null;
  origen: 'CLIENTE' | 'OFICINA';
  descripcion: string;
  ubicacion: string;
  estado: EstadoReporte;
  respuesta: string;
  programado_para: number | null;
  reportado_nombre: string;
  reportado_en: number;
  cerrado_en: number | null;
  fotos: FotoReporte[];
}

export interface GarantiaObra {
  obra_id: string;
  entrega_fecha: number | null;
  meses: number;
  notas: string;
}

const CAMPOS =
  'id, obra_id, origen, descripcion, ubicacion, estado, respuesta, programado_para, reportado_nombre, reportado_en, cerrado_en, obras(nombre), clientes(nombre)';

type Fila = {
  id: string;
  obra_id: string;
  origen: string;
  descripcion: string;
  ubicacion: string;
  estado: string;
  respuesta: string;
  programado_para: number | null;
  reportado_nombre: string;
  reportado_en: number;
  cerrado_en: number | null;
  obras: { nombre: string } | null;
  clientes: { nombre: string } | null;
};

async function conFotos(filas: Fila[], firmar: boolean): Promise<Reporte[]> {
  const supabase = await createClient();
  const fotosPor = new Map<string, FotoReporte[]>();
  if (filas.length > 0) {
    const { data } = await supabase
      .from('garantia_foto')
      .select('id, reporte_id, path, orden, subida_por_cliente')
      .in(
        'reporte_id',
        filas.map((f) => f.id),
      )
      .is('deleted_at', null)
      .order('orden', { ascending: true });
    const fotos = (data ?? []) as { id: string; reporte_id: string; path: string; subida_por_cliente: boolean }[];
    const urls = new Map<string, string>();
    if (firmar && fotos.length > 0) {
      const { data: firmadas } = await supabase.storage.from(BUCKET_POSTVENTA).createSignedUrls(
        fotos.map((f) => f.path),
        URL_SEGUNDOS,
      );
      for (const s of firmadas ?? []) if (s.path && s.signedUrl) urls.set(s.path, s.signedUrl);
    }
    for (const f of fotos) {
      const l = fotosPor.get(f.reporte_id) ?? [];
      l.push({ id: f.id, url: urls.get(f.path) ?? null, subida_por_cliente: f.subida_por_cliente });
      fotosPor.set(f.reporte_id, l);
    }
  }
  return filas
    .filter((f) => esEstadoReporte(f.estado))
    .map((f) => ({
      id: f.id,
      obra_id: f.obra_id,
      obra_nombre: f.obras?.nombre ?? null,
      cliente_nombre: f.clientes?.nombre ?? null,
      origen: f.origen === 'CLIENTE' ? 'CLIENTE' : 'OFICINA',
      descripcion: f.descripcion,
      ubicacion: f.ubicacion ?? '',
      estado: f.estado as EstadoReporte,
      respuesta: f.respuesta ?? '',
      programado_para: f.programado_para === null ? null : Number(f.programado_para),
      reportado_nombre: f.reportado_nombre ?? '',
      reportado_en: Number(f.reportado_en),
      cerrado_en: f.cerrado_en === null ? null : Number(f.cerrado_en),
      fotos: fotosPor.get(f.id) ?? [],
    }));
}

/** Bandeja de la oficina (sin firmar fotos: solo se cuentan). */
export async function listReportes(): Promise<{ data: Reporte[]; error: string | null }> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('garantia_reporte')
    .select(CAMPOS)
    .is('deleted_at', null)
    .order('reportado_en', { ascending: false })
    .limit(1000);
  if (error) return { data: [], error: error.message };
  return { data: await conFotos((data ?? []) as unknown as Fila[], false), error: null };
}

export async function getReporte(id: string): Promise<{ data: Reporte | null; error: string | null }> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('garantia_reporte')
    .select(CAMPOS)
    .eq('id', id)
    .is('deleted_at', null)
    .maybeSingle();
  if (error) return { data: null, error: error.message };
  if (!data) return { data: null, error: null };
  const [r] = await conFotos([data as unknown as Fila], true);
  return { data: r ?? null, error: null };
}

/** Reportes de una obra con fotos firmadas (sirve al portal: la RLS filtra). */
export async function listReportesObra(obraId: string): Promise<{ data: Reporte[]; error: string | null }> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('garantia_reporte')
    .select(CAMPOS)
    .eq('obra_id', obraId)
    .is('deleted_at', null)
    .order('reportado_en', { ascending: false })
    .limit(200);
  if (error) return { data: [], error: error.message };
  return { data: await conFotos((data ?? []) as unknown as Fila[], true), error: null };
}

/** Periodo de garantía de todas las obras visibles (oficina). */
export async function listGarantias(): Promise<Map<string, GarantiaObra>> {
  const supabase = await createClient();
  const { data } = await supabase
    .from('obra_garantia')
    .select('obra_id, entrega_fecha, meses, notas')
    .is('deleted_at', null);
  const m = new Map<string, GarantiaObra>();
  for (const g of (data ?? []) as Record<string, unknown>[]) {
    m.set(String(g.obra_id), {
      obra_id: String(g.obra_id),
      entrega_fecha: g.entrega_fecha === null ? null : Number(g.entrega_fecha),
      meses: Number(g.meses ?? 12),
      notas: String(g.notas ?? ''),
    });
  }
  return m;
}

/** Periodo de garantía de UNA obra (el cliente ve la de sus obras). */
export async function getGarantiaObra(obraId: string): Promise<GarantiaObra | null> {
  const supabase = await createClient();
  const { data } = await supabase
    .from('obra_garantia')
    .select('obra_id, entrega_fecha, meses, notas')
    .eq('obra_id', obraId)
    .is('deleted_at', null)
    .maybeSingle();
  if (!data) return null;
  const g = data as Record<string, unknown>;
  return {
    obra_id: String(g.obra_id),
    entrega_fecha: g.entrega_fecha === null ? null : Number(g.entrega_fecha),
    meses: Number(g.meses ?? 12),
    notas: String(g.notas ?? ''),
  };
}

/**
 * ¿El contratista de esta obra atiende garantías por la app? (RPC 0043; el
 * cliente no puede leer los módulos). Ante cualquier error, `false`: no se
 * ofrece un botón que nadie va a atender.
 */
export async function postventaDisponible(obraId: string): Promise<boolean> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc('postventa_disponible', { p_obra_id: obraId });
  if (error) return false;
  return data === true;
}
