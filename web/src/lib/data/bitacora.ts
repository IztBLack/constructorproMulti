import { createClient } from '@/lib/supabase/server';
import {
  BUCKET_BITACORA,
  esClima,
  esTipoEntrada,
  nombresPresentes,
  type AclaracionBitacora,
  type EntradaBitacora,
  type FotoBitacora,
} from '@/lib/bitacora/bitacora';
import { DIA_MS, partesTz } from './tz';

export type { EntradaBitacora, FotoBitacora, AclaracionBitacora };

/**
 * Lectura de la BITÁCORA DE OBRA (migración 0041).
 *
 * Todo se lee con la sesión del usuario: la RLS decide qué ve cada rol. El
 * mismo código sirve al panel (oficina ve todo) y al portal (el cliente recibe
 * solo las entradas publicadas de sus obras, con sus fotos y aclaraciones), sin
 * repetir aquí el filtro de `visible_cliente`: si se repitiera, sería fácil
 * creer que es la barrera.
 */

export { BUCKET_BITACORA };
/** Vigencia de las URLs firmadas de las fotos (pantalla y PDF). */
const URL_SEGUNDOS = 60 * 60;

const CAMPOS_ENTRADA =
  'id, obra_id, fecha, tipo, texto, clima, personal_presente, personal_nombres, visible_cliente, autor_id, autor_nombre, registrada_en';

interface FilaEntrada {
  id: string;
  obra_id: string;
  fecha: number;
  tipo: string;
  texto: string;
  clima: string;
  personal_presente: number | null;
  personal_nombres: string[] | null;
  visible_cliente: boolean;
  autor_id: string | null;
  autor_nombre: string;
  registrada_en: number;
}

export interface FiltroBitacora {
  /** Epoch ms (medianoche) del primer día, inclusivo. */
  desde?: number;
  /** Epoch ms (medianoche) del último día, inclusivo. */
  hasta?: number;
}

/**
 * Entradas de una obra con fotos (URL firmada) y aclaraciones, de la más nueva
 * a la más vieja. La ventana de fechas se pide holgada (±1 día) y se recorta
 * por día de calendario en México, igual que la asistencia.
 */
export async function listBitacoraObra(
  obraId: string,
  filtro: FiltroBitacora = {},
): Promise<{ data: EntradaBitacora[]; error: string | null }> {
  const supabase = await createClient();

  let q = supabase
    .from('bitacora_entrada')
    .select(CAMPOS_ENTRADA)
    .eq('obra_id', obraId)
    .is('deleted_at', null)
    .order('fecha', { ascending: false })
    .order('registrada_en', { ascending: true })
    .limit(1000);
  if (filtro.desde !== undefined) q = q.gte('fecha', filtro.desde - DIA_MS);
  if (filtro.hasta !== undefined) q = q.lte('fecha', filtro.hasta + 2 * DIA_MS - 1);

  const { data, error } = await q;
  if (error) return { data: [], error: error.message };

  const filas = ((data ?? []) as FilaEntrada[]).filter((f) =>
    dentroDelPeriodo(Number(f.fecha), filtro),
  );
  if (filas.length === 0) return { data: [], error: null };

  const ids = filas.map((f) => f.id);
  const [fotosRes, aclRes] = await Promise.all([
    supabase
      .from('bitacora_foto')
      .select('id, entrada_id, path, orden')
      .in('entrada_id', ids)
      .is('deleted_at', null)
      .order('orden', { ascending: true }),
    supabase
      .from('bitacora_aclaracion')
      .select('id, entrada_id, texto, autor_nombre, registrada_en')
      .in('entrada_id', ids)
      .is('deleted_at', null)
      .order('registrada_en', { ascending: true }),
  ]);
  if (fotosRes.error) return { data: [], error: fotosRes.error.message };
  if (aclRes.error) return { data: [], error: aclRes.error.message };

  const fotos = (fotosRes.data ?? []) as { id: string; entrada_id: string; path: string; orden: number }[];
  const urls = new Map<string, string>();
  if (fotos.length > 0) {
    const { data: firmadas } = await supabase.storage
      .from(BUCKET_BITACORA)
      .createSignedUrls(
        fotos.map((f) => f.path),
        URL_SEGUNDOS,
      );
    for (const s of firmadas ?? []) if (s.path && s.signedUrl) urls.set(s.path, s.signedUrl);
  }

  const fotosPorEntrada = new Map<string, FotoBitacora[]>();
  for (const f of fotos) {
    const lista = fotosPorEntrada.get(f.entrada_id) ?? [];
    lista.push({ id: f.id, path: f.path, orden: f.orden, url: urls.get(f.path) ?? null });
    fotosPorEntrada.set(f.entrada_id, lista);
  }

  const aclPorEntrada = new Map<string, AclaracionBitacora[]>();
  for (const a of (aclRes.data ?? []) as (AclaracionBitacora & { entrada_id: string })[]) {
    const lista = aclPorEntrada.get(a.entrada_id) ?? [];
    lista.push({
      id: a.id,
      texto: a.texto,
      autor_nombre: a.autor_nombre,
      registrada_en: Number(a.registrada_en),
    });
    aclPorEntrada.set(a.entrada_id, lista);
  }

  return {
    data: filas.map((f) => ({
      id: f.id,
      obra_id: f.obra_id,
      fecha: Number(f.fecha),
      tipo: esTipoEntrada(f.tipo) ? f.tipo : 'OTRO',
      texto: f.texto,
      clima: esClima(f.clima) ? f.clima : '',
      personal_presente: f.personal_presente,
      personal_nombres: f.personal_nombres ?? [],
      visible_cliente: f.visible_cliente,
      autor_id: f.autor_id,
      autor_nombre: f.autor_nombre,
      registrada_en: Number(f.registrada_en),
      fotos: fotosPorEntrada.get(f.id) ?? [],
      aclaraciones: aclPorEntrada.get(f.id) ?? [],
    })),
    error: null,
  };
}

function numDia(ms: number): number {
  const p = partesTz(ms);
  return p.year * 10_000 + (p.month + 1) * 100 + p.day;
}

function dentroDelPeriodo(fecha: number, filtro: FiltroBitacora): boolean {
  const d = numDia(fecha);
  if (filtro.desde !== undefined && d < numDia(filtro.desde)) return false;
  if (filtro.hasta !== undefined && d > numDia(filtro.hasta)) return false;
  return true;
}

/**
 * Quiénes vinieron ese día según el pase de lista de la obra. Es la sugerencia
 * del formulario; no se guarda nada aquí.
 */
export async function personalDelDia(
  obraId: string,
  diaMs: number,
): Promise<{ nombres: string[]; error: string | null }> {
  const supabase = await createClient();
  const { data: asis, error } = await supabase
    .from('asistencias')
    .select('colaborador_id, fecha, fraccion')
    .eq('obra_id', obraId)
    .gte('fecha', diaMs - DIA_MS)
    .lte('fecha', diaMs + 2 * DIA_MS - 1)
    .is('deleted_at', null);
  if (error) return { nombres: [], error: error.message };

  const delDia = ((asis ?? []) as { colaborador_id: string; fecha: number; fraccion: number }[]).filter(
    (a) => numDia(Number(a.fecha)) === numDia(diaMs),
  );
  if (delDia.length === 0) return { nombres: [], error: null };

  const { data: colabs, error: errC } = await supabase
    .from('colaboradores')
    .select('id, nombre')
    .in('id', [...new Set(delDia.map((a) => a.colaborador_id))]);
  if (errC) return { nombres: [], error: errC.message };

  const nombres = new Map(((colabs ?? []) as { id: string; nombre: string }[]).map((c) => [c.id, c.nombre]));
  return { nombres: nombresPresentes(delDia, nombres), error: null };
}
