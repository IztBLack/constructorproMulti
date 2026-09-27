import { createClient } from '@/lib/supabase/server';

/**
 * Lectura de los datos fiscales del CLIENTE en su portal, por la RPC
 * `mis_datos_fiscales` (0037): el cliente no tiene policy sobre
 * `cliente_fiscal`, solo ve lo suyo por aquí.
 */
export interface MisDatosFiscales {
  cliente_id: string;
  empresa_id: string;
  empresa_nombre: string;
  modulo_activo: boolean;
  rfc: string | null;
  razon_social: string | null;
  regimen: string | null;
  cp_fiscal: string | null;
  uso_cfdi: string | null;
  correo_factura: string | null;
  constancia_path: string | null;
  confirmados_at: number | null;
}

export async function leerMisDatosFiscales(): Promise<MisDatosFiscales[]> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc('mis_datos_fiscales');
  // Sin la migración 0037 (o con error) no se muestra la sección: a quien no
  // factura no se le pide nada.
  if (error || !Array.isArray(data)) return [];
  return data as MisDatosFiscales[];
}
