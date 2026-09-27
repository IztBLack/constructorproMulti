'use server';

import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { getEmpresaUsuario } from '@/lib/data/empresa';
import type { TipoAprobacion } from '@/lib/data/aprobaciones';

/*
 * Escrituras del visto bueno (0042). La barrera es la base: las reglas solo las
 * escribe el admin (RLS) y las solicitudes solo existen por las RPC
 * `solicitar_aprobacion` / `decidir_aprobacion` (sin policies de escritura).
 * Aquí se validan formatos para dar un mensaje claro.
 */

export interface ResultadoAprobacion {
  ok: boolean;
  error?: string;
  /** solicitar: ¿hacía falta el visto bueno? */
  necesaria?: boolean;
  /** solicitar: no hay regla, así que lo tiene que mandar el administrador. */
  sinRegla?: boolean;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const TIPOS_REGLA: readonly TipoAprobacion[] = ['EXTRA', 'COMPRA'];

/** Crea, cambia o apaga la regla de un tipo (una viva por tipo). */
export async function guardarRegla(formData: FormData): Promise<ResultadoAprobacion> {
  const tipo = String(formData.get('tipo') ?? '') as TipoAprobacion;
  const activa = formData.get('activa') === 'on';
  const monto = Number(String(formData.get('monto_minimo') ?? '').replace(/[$,\s]/g, ''));
  if (!TIPOS_REGLA.includes(tipo)) return { ok: false, error: 'Tipo no válido.' };
  if (!Number.isFinite(monto) || monto < 0 || monto >= 1e12) {
    return { ok: false, error: 'Escribe un monto válido (0 o más).' };
  }

  let empresaId: string;
  try {
    const yo = await getEmpresaUsuario();
    if (yo.rol !== 'admin') return { ok: false, error: 'Solo el administrador cambia las reglas.' };
    empresaId = yo.empresaId;
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'No hay sesión activa.' };
  }

  const supabase = await createClient();
  const ahora = Date.now();
  const { data: actual, error: leerError } = await supabase
    .from('regla_aprobacion')
    .select('id')
    .eq('empresa_id', empresaId)
    .eq('tipo', tipo)
    .is('deleted_at', null)
    .maybeSingle();
  if (leerError) return { ok: false, error: leerError.message };

  const { error } = actual
    ? await supabase
        .from('regla_aprobacion')
        .update({ monto_minimo: monto, activa, updated_at: ahora })
        .eq('id', actual.id as string)
    : await supabase.from('regla_aprobacion').insert({
        empresa_id: empresaId,
        tipo,
        monto_minimo: monto,
        rol_aprobador: 'admin',
        activa,
        created_at: ahora,
        updated_at: ahora,
      });
  if (error) return { ok: false, error: error.message };

  revalidatePath('/admin/ajustes');
  return { ok: true };
}

/** Pide el visto bueno de un extra o de una orden de compra en borrador. */
export async function solicitarAprobacion(tipo: TipoAprobacion, objetoId: string): Promise<ResultadoAprobacion> {
  if (!TIPOS_REGLA.includes(tipo) || !UUID.test(objetoId)) return { ok: false, error: 'Solicitud no válida.' };
  const supabase = await createClient();
  const { data, error } = await supabase.rpc('solicitar_aprobacion', { p_tipo: tipo, p_objeto: objetoId });
  if (error) return { ok: false, error: error.message };
  if (!data?.ok) return { ok: false, error: data?.error ?? 'No se pudo pedir el visto bueno.' };
  revalidatePath('/admin/ajustes');
  return { ok: true, necesaria: data.necesaria === true, sinRegla: data.sin_regla === true };
}

/** Aprueba o rechaza (con motivo). La base impide decidir lo que uno mismo pidió. */
export async function decidirAprobacion(formData: FormData): Promise<ResultadoAprobacion> {
  const id = String(formData.get('id') ?? '');
  const aprobar = formData.get('aprobar') === '1';
  const motivo = String(formData.get('motivo') ?? '').trim().slice(0, 1000);
  if (!UUID.test(id)) return { ok: false, error: 'Solicitud no válida.' };
  if (!aprobar && !motivo) return { ok: false, error: 'Escribe por qué no se aprueba.' };

  const supabase = await createClient();
  const { data, error } = await supabase.rpc('decidir_aprobacion', {
    p_id: id,
    p_aprobar: aprobar,
    p_motivo: motivo || null,
  });
  if (error) return { ok: false, error: error.message };
  if (!data?.ok) return { ok: false, error: data?.error ?? 'No se pudo guardar la decisión.' };
  revalidatePath('/admin/ajustes');
  revalidatePath('/admin/compras');
  return { ok: true };
}
