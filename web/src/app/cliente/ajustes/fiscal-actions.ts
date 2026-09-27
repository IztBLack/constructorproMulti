'use server';

import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { leerMisDatosFiscales } from '@/lib/data/fiscal-portal';
import { esRegimen, esUsoCfdi } from '@/lib/fiscal/catalogos';
import { limpiarRazonSocial, validarCorreo, validarCp, validarRfc } from '@/lib/fiscal/rfc';

/**
 * Portal del cliente → "Mis datos para factura" (RF1b.1).
 *
 * El cliente NO tiene policy sobre `cliente_fiscal`: lee y confirma lo suyo solo
 * por las RPC SECURITY DEFINER de 0037, que validan que el registro sea suyo y
 * que su contratista use el módulo. Aquí se valida primero en TypeScript para
 * dar mensajes claros; la base vuelve a validar todo.
 */

const TIPOS_CONSTANCIA: Record<string, string> = {
  'application/pdf': 'pdf',
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
};

/** Paso 1 de la constancia: URL firmada para subirla directo a SU carpeta. */
export async function urlSubidaConstanciaAction(
  clienteId: string,
  tipo: string,
  tamano: number,
): Promise<{ ok: boolean; error?: string; ruta?: string; token?: string }> {
  const ext = TIPOS_CONSTANCIA[tipo];
  if (!ext) return { ok: false, error: 'La constancia debe ser PDF o foto (JPG, PNG, WEBP).' };
  if (!tamano || tamano > 5 * 1024 * 1024) return { ok: false, error: 'La constancia debe pesar menos de 5 MB.' };

  const mios = await leerMisDatosFiscales();
  const yo = mios.find((m) => m.cliente_id === clienteId && m.modulo_activo);
  if (!yo) return { ok: false, error: 'No encontramos tu registro de cliente.' };

  const supabase = await createClient();
  const ruta = `${yo.empresa_id}/constancias/${clienteId}/constancia-${crypto.randomUUID().slice(0, 8)}.${ext}`;
  // Se firma con la sesión del cliente: la policy del bucket (0037) solo lo deja
  // escribir en su propia carpeta.
  const { data, error } = await supabase.storage.from('fiscal').createSignedUploadUrl(ruta);
  if (error || !data) return { ok: false, error: `No se pudo preparar la subida: ${error?.message ?? ''}` };
  return { ok: true, ruta: data.path, token: data.token };
}

/** Paso 2: guarda y confirma los datos (con la constancia, si se subió). */
export async function confirmarMisDatosAction(
  clienteId: string,
  constanciaPath: string | null,
  formData: FormData,
): Promise<{ ok: boolean; error?: string; aviso?: string }> {
  const t = (k: string) => String(formData.get(k) ?? '').trim();
  const rfc = validarRfc(t('rfc'));
  if (!rfc.ok) return { ok: false, error: rfc.error };
  const razon = limpiarRazonSocial(t('razon_social'));
  if (!razon) return { ok: false, error: 'Escribe tu nombre o razón social tal como aparece en tu constancia.' };
  if (!esRegimen(t('regimen'))) return { ok: false, error: 'Elige tu régimen fiscal.' };
  const cp = validarCp(t('cp_fiscal'));
  if (!cp.ok) return { ok: false, error: cp.error };
  if (!esUsoCfdi(t('uso_cfdi'))) return { ok: false, error: 'Elige para qué vas a usar la factura.' };
  let correo = '';
  if (t('correo_factura')) {
    const c = validarCorreo(t('correo_factura'));
    if (!c.ok) return { ok: false, error: c.error };
    correo = c.correo;
  }

  const supabase = await createClient();
  const { data, error } = await supabase.rpc('confirmar_mis_datos_fiscales', {
    p_cliente_id: clienteId,
    p_rfc: rfc.rfc,
    p_razon_social: razon,
    p_regimen: t('regimen'),
    p_cp_fiscal: cp.cp,
    p_uso_cfdi: t('uso_cfdi'),
    p_correo_factura: correo,
    p_constancia_path: constanciaPath,
  });
  if (error) return { ok: false, error: 'No se pudieron guardar tus datos. Intenta de nuevo.' };
  const r = data as { ok: boolean; error?: string };
  if (!r.ok) return { ok: false, error: r.error };
  revalidatePath('/cliente/ajustes');
  return { ok: true, aviso: 'Gracias. Tu contratista ya tiene tus datos para la factura.' };
}
