'use server';

import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { getEmpresaUsuario } from '@/lib/data/empresa';
import { fechaInputAMs } from '@/lib/data/tz';
import {
  MAX_DESCRIPCION,
  MAX_RESPUESTA,
  MAX_UBICACION,
  MIN_DESCRIPCION,
  esEstadoReporte,
  mensajeErrorPostventa,
} from '@/lib/postventa/garantia';

/**
 * Oficina: seguimiento de reportes de garantía y periodo de garantía por obra
 * (0043). La RLS permite gestionar a admin y supervisor; el periodo lo pone
 * solo el admin (son condiciones del contrato).
 */

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const FECHA = /^\d{4}-\d{2}-\d{2}$/;

export interface Resultado {
  ok: boolean;
  error?: string;
}

async function quien(roles: string[]): Promise<{ empresaId: string } | { error: string }> {
  try {
    const { empresaId, rol } = await getEmpresaUsuario();
    if (!roles.includes(rol)) {
      return { error: roles.length === 1 ? 'Solo el administrador.' : 'Solo el administrador, un supervisor o el residente de la obra.' };
    }
    return { empresaId };
  } catch (e) {
    return { error: e instanceof Error ? e.message : 'Error de autenticación.' };
  }
}

function refrescar(id?: string, obraId?: string) {
  revalidatePath('/admin/postventa');
  if (id) revalidatePath(`/admin/postventa/${id}`);
  if (obraId) revalidatePath(`/cliente/obras/${obraId}`);
}

export interface SeguimientoInput {
  estado: string;
  respuesta: string;
  /** 'YYYY-MM-DD' o '' */
  programadoPara: string;
}

export async function actualizarReporte(id: string, obraId: string, input: SeguimientoInput): Promise<Resultado> {
  const q = await quien(['admin', 'supervisor', 'residente']);
  if ('error' in q) return { ok: false, error: q.error };
  if (!UUID.test(id)) return { ok: false, error: 'Reporte inválido.' };
  if (!esEstadoReporte(input.estado)) return { ok: false, error: 'Elige el estado.' };
  const respuesta = input.respuesta.trim();
  if (respuesta.length > MAX_RESPUESTA) return { ok: false, error: 'La respuesta es muy larga.' };
  if (input.estado === 'NO_PROCEDE' && !respuesta) {
    return { ok: false, error: 'Para marcarlo "no procede" escribe la respuesta al cliente (por qué).' };
  }
  if (input.programadoPara && !FECHA.test(input.programadoPara)) return { ok: false, error: 'Fecha inválida.' };
  if (input.estado === 'PROGRAMADO' && !input.programadoPara) {
    return { ok: false, error: 'Para programar la visita, pon la fecha.' };
  }

  const supabase = await createClient();
  const { data, error } = await supabase
    .from('garantia_reporte')
    .update({
      estado: input.estado,
      respuesta,
      programado_para: input.programadoPara ? fechaInputAMs(input.programadoPara) : null,
      updated_at: Date.now(),
    })
    .eq('id', id)
    .select('id');
  if (error) return { ok: false, error: mensajeErrorPostventa(error.message) };
  if (!data || data.length === 0) return { ok: false, error: 'No se encontró el reporte.' };
  refrescar(id, obraId);
  return { ok: true };
}

/** La oficina levanta un reporte (p. ej. el cliente llamó por teléfono). */
export async function crearReporteOficina(input: {
  id: string;
  obraId: string;
  descripcion: string;
  ubicacion: string;
}): Promise<Resultado> {
  const q = await quien(['admin', 'supervisor', 'residente']);
  if ('error' in q) return { ok: false, error: q.error };
  if (!UUID.test(input.id) || !UUID.test(input.obraId)) return { ok: false, error: 'Elige la obra.' };
  const descripcion = input.descripcion.trim();
  if (descripcion.length < MIN_DESCRIPCION || descripcion.length > MAX_DESCRIPCION) {
    return { ok: false, error: 'Describe el problema.' };
  }
  const ubicacion = input.ubicacion.trim().slice(0, MAX_UBICACION);
  const supabase = await createClient();
  const ahora = Date.now();
  const { error } = await supabase.from('garantia_reporte').insert({
    id: input.id,
    empresa_id: q.empresaId,
    obra_id: input.obraId,
    origen: 'OFICINA',
    descripcion,
    ubicacion,
    created_at: ahora,
    updated_at: ahora,
  });
  if (error && error.code !== '23505') return { ok: false, error: mensajeErrorPostventa(error.message) };
  refrescar(undefined, input.obraId);
  return { ok: true };
}

export async function guardarGarantiaObra(input: {
  obraId: string;
  entregaFecha: string;
  meses: number;
  notas: string;
}): Promise<Resultado> {
  const q = await quien(['admin']);
  if ('error' in q) return { ok: false, error: q.error };
  if (!UUID.test(input.obraId)) return { ok: false, error: 'Obra inválida.' };
  if (input.entregaFecha && !FECHA.test(input.entregaFecha)) return { ok: false, error: 'Fecha inválida.' };
  if (!Number.isInteger(input.meses) || input.meses < 0 || input.meses > 120) {
    return { ok: false, error: 'Los meses van de 0 a 120.' };
  }
  const supabase = await createClient();
  const ahora = Date.now();
  // Fila COMPLETA (nada de upsert parcial en configuración, RT7).
  const fila = {
    entrega_fecha: input.entregaFecha ? fechaInputAMs(input.entregaFecha) : null,
    meses: input.meses,
    notas: input.notas.trim().slice(0, 500),
    deleted_at: null,
    updated_at: ahora,
  };
  const { data: existe } = await supabase
    .from('obra_garantia')
    .select('id')
    .eq('obra_id', input.obraId)
    .maybeSingle();
  const { error } = existe
    ? await supabase.from('obra_garantia').update(fila).eq('id', (existe as { id: string }).id)
    : await supabase.from('obra_garantia').insert({
        id: crypto.randomUUID(),
        empresa_id: q.empresaId,
        obra_id: input.obraId,
        created_at: ahora,
        ...fila,
      });
  if (error) return { ok: false, error: mensajeErrorPostventa(error.message) };
  refrescar(undefined, input.obraId);
  return { ok: true };
}
