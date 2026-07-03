import { createClient } from '@/lib/supabase/server';

/// Tipo para la tabla `archivos_cotizacion`.
export interface ArchivoCotizacion {
  id: string;
  cotizacion_id: string;
  empresa_id: string;
  tipo: string;
  nombre: string;
  uri: string;
  fecha_agregado: number;
  created_at: number;
  updated_at: number;
  deleted_at: number | null;
}

/// Devuelve los archivos de una cotización, excluyendo soft-deletes,
/// ordenados por fecha_agregado desc (más reciente primero).
export async function listArchivosCotizacion(
  cotId: string,
): Promise<{ data: ArchivoCotizacion[]; error: string | null }> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from('archivos_cotizacion')
    .select('*')
    .eq('cotizacion_id', cotId)
    .is('deleted_at', null)
    .order('fecha_agregado', { ascending: false });

  if (error) return { data: [], error: error.message };
  return { data: (data ?? []) as ArchivoCotizacion[], error: null };
}

/// Genera una signed URL válida por 1 hora para descargar un archivo del bucket privado.
/// `uri` es la ruta del objeto en el bucket (ej. `{empresa_id}/{cotizacion_id}/{uuid}-nombre.pdf`).
export async function urlDescarga(
  uri: string,
): Promise<{ url: string | null; error: string | null }> {
  const supabase = await createClient();

  const { data, error } = await supabase.storage
    .from('cotizaciones')
    .createSignedUrl(uri, 60 * 60);

  if (error) return { url: null, error: error.message };
  return { url: data.signedUrl, error: null };
}
