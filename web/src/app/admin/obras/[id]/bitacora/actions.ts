'use server';

import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { getEmpresaUsuario } from '@/lib/data/empresa';
import { BUCKET_BITACORA, personalDelDia } from '@/lib/data/bitacora';
import { fechaInputAMs } from '@/lib/data/tz';
import {
  MAX_TEXTO,
  esClima,
  esTipoEntrada,
  limpiarNombres,
  mensajeErrorBitacora,
} from '@/lib/bitacora/bitacora';

/**
 * Escrituras de la BITÁCORA (0041). La barrera real es la base: RLS (quién),
 * trigger (cierre a las 24 h, máximo de fotos) y las policies del bucket
 * (carpeta de la entrada). Aquí se valida lo básico para dar un mensaje claro
 * antes de ir a la red, y se revalida el rol porque es barato.
 */

// Residente y colaborador: la RLS de 0042 los limita a sus obras asignadas (el
// colaborador, además, no edita ni aclara: esas escrituras las rechaza la base).
const ESCRIBEN = ['admin', 'supervisor', 'residente', 'colaborador'];
const MAX_BYTES = 10 * 1024 * 1024; // igual que el bucket
const TIPOS_FOTO = ['image/jpeg', 'image/png', 'image/webp'];
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const FECHA = /^\d{4}-\d{2}-\d{2}$/;

export interface Resultado {
  ok: boolean;
  error?: string;
}

async function oficinaQueEscribe(): Promise<{ empresaId: string } | { error: string }> {
  try {
    const { empresaId, rol } = await getEmpresaUsuario();
    if (!ESCRIBEN.includes(rol)) return { error: 'Tu rol no escribe en la bitácora.' };
    return { empresaId };
  } catch (e) {
    return { error: e instanceof Error ? e.message : 'Error de autenticación.' };
  }
}

function rutaBitacora(obraId: string) {
  return `/admin/obras/${obraId}/bitacora`;
}

export interface EntradaInput {
  /** Lo genera el navegador: reintentar un envío no duplica la entrada. */
  id: string;
  /** 'YYYY-MM-DD' (día en México). */
  fecha: string;
  tipo: string;
  texto: string;
  clima: string;
  personalNombres: string[];
  /** Conteo manual si no se anotan nombres (null = no se anotó). */
  personalPresente: number | null;
  visibleCliente: boolean;
}

function validarEntrada(input: EntradaInput): string | null {
  if (!UUID.test(input.id)) return 'Identificador inválido.';
  if (!FECHA.test(input.fecha)) return 'Elige el día.';
  if (!esTipoEntrada(input.tipo)) return 'Elige el tipo de entrada.';
  if (!esClima(input.clima)) return 'Clima inválido.';
  const texto = input.texto.trim();
  if (!texto) return 'Escribe qué pasó.';
  if (texto.length > MAX_TEXTO) return `El texto pasa de ${MAX_TEXTO} letras.`;
  if (
    input.personalPresente !== null &&
    (!Number.isInteger(input.personalPresente) || input.personalPresente < 0 || input.personalPresente > 10_000)
  ) {
    return 'El número de personas no es válido.';
  }
  return null;
}

function filaEntrada(input: EntradaInput) {
  const nombres = limpiarNombres(input.personalNombres);
  return {
    fecha: fechaInputAMs(input.fecha),
    tipo: input.tipo,
    texto: input.texto.trim(),
    clima: input.clima,
    personal_nombres: nombres,
    // Con nombres, el conteo sale de la lista; sin ellos, el que se anotó.
    personal_presente: nombres.length > 0 ? nombres.length : input.personalPresente,
    visible_cliente: input.visibleCliente,
  };
}

/** Crea la entrada (sin fotos: esas suben después, directo a Storage). */
export async function crearEntradaBitacora(obraId: string, input: EntradaInput): Promise<Resultado> {
  const quien = await oficinaQueEscribe();
  if ('error' in quien) return { ok: false, error: quien.error };
  const invalido = validarEntrada(input);
  if (invalido) return { ok: false, error: invalido };

  const supabase = await createClient();
  const ahora = Date.now();
  const { error } = await supabase.from('bitacora_entrada').insert({
    id: input.id,
    empresa_id: quien.empresaId,
    obra_id: obraId,
    ...filaEntrada(input),
    created_at: ahora,
    updated_at: ahora,
  });

  if (error) {
    // Reintento del mismo envío (doble clic, señal que va y viene): ya existe.
    if (error.code === '23505') return { ok: true };
    return { ok: false, error: mensajeErrorBitacora(error.message) };
  }
  revalidatePath(rutaBitacora(obraId));
  return { ok: true };
}

export async function editarEntradaBitacora(obraId: string, input: EntradaInput): Promise<Resultado> {
  const quien = await oficinaQueEscribe();
  if ('error' in quien) return { ok: false, error: quien.error };
  const invalido = validarEntrada(input);
  if (invalido) return { ok: false, error: invalido };

  const supabase = await createClient();
  const { data, error } = await supabase
    .from('bitacora_entrada')
    .update({ ...filaEntrada(input), updated_at: Date.now() })
    .eq('id', input.id)
    .eq('obra_id', obraId)
    .select('id');
  if (error) return { ok: false, error: mensajeErrorBitacora(error.message) };
  if (!data || data.length === 0) {
    return { ok: false, error: 'No puedes editar esta entrada (solo el administrador o quien la escribió).' };
  }
  revalidatePath(rutaBitacora(obraId));
  return { ok: true };
}

/** Publicar o retirar del portal del cliente. Se permite aun cerrada. */
export async function cambiarVisibilidadEntrada(
  obraId: string,
  entradaId: string,
  visible: boolean,
): Promise<Resultado> {
  const quien = await oficinaQueEscribe();
  if ('error' in quien) return { ok: false, error: quien.error };

  const supabase = await createClient();
  const { data, error } = await supabase
    .from('bitacora_entrada')
    .update({ visible_cliente: visible, updated_at: Date.now() })
    .eq('id', entradaId)
    .eq('obra_id', obraId)
    .select('id');
  if (error) return { ok: false, error: mensajeErrorBitacora(error.message) };
  if (!data || data.length === 0) return { ok: false, error: 'No puedes cambiar esta entrada.' };
  revalidatePath(rutaBitacora(obraId));
  return { ok: true };
}

/** Borrado lógico. Solo mientras está abierta (el trigger lo impide después). */
export async function borrarEntradaBitacora(obraId: string, entradaId: string): Promise<Resultado> {
  const quien = await oficinaQueEscribe();
  if ('error' in quien) return { ok: false, error: quien.error };

  const supabase = await createClient();
  const { data, error } = await supabase
    .from('bitacora_entrada')
    .update({ deleted_at: Date.now(), updated_at: Date.now() })
    .eq('id', entradaId)
    .eq('obra_id', obraId)
    .select('id');
  if (error) return { ok: false, error: mensajeErrorBitacora(error.message) };
  if (!data || data.length === 0) return { ok: false, error: 'No puedes borrar esta entrada.' };
  revalidatePath(rutaBitacora(obraId));
  return { ok: true };
}

export async function agregarAclaracion(
  obraId: string,
  entradaId: string,
  texto: string,
): Promise<Resultado> {
  const quien = await oficinaQueEscribe();
  if ('error' in quien) return { ok: false, error: quien.error };
  const t = texto.trim();
  if (!t) return { ok: false, error: 'Escribe la aclaración.' };
  if (t.length > MAX_TEXTO) return { ok: false, error: `La aclaración pasa de ${MAX_TEXTO} letras.` };

  const supabase = await createClient();
  const ahora = Date.now();
  const { error } = await supabase.from('bitacora_aclaracion').insert({
    id: crypto.randomUUID(),
    empresa_id: quien.empresaId,
    entrada_id: entradaId,
    texto: t,
    created_at: ahora,
    updated_at: ahora,
  });
  if (error) return { ok: false, error: mensajeErrorBitacora(error.message) };
  revalidatePath(rutaBitacora(obraId));
  return { ok: true };
}

// ── Fotos: firma → subida directa del navegador → registro ──────────────────

export interface UrlSubida extends Resultado {
  path?: string;
  token?: string;
}

/**
 * Paso 1: URL de subida FIRMADA para que el navegador suba la foto directo a
 * Storage (mismo esquema que los comprobantes: el cuerpo de un Server Action
 * no aguanta fotos). La ruta la arma el servidor dentro de la carpeta de la
 * entrada; la policy INSERT del bucket vuelve a exigirlo al firmar.
 */
export async function crearUrlSubidaFoto(
  obraId: string,
  entradaId: string,
  tipo: string,
  bytes: number,
): Promise<UrlSubida> {
  if (!bytes || bytes <= 0) return { ok: false, error: 'La foto está vacía.' };
  if (bytes > MAX_BYTES) return { ok: false, error: 'La foto pasa de 10 MB.' };
  if (!TIPOS_FOTO.includes(tipo)) return { ok: false, error: 'Solo fotos JPG, PNG o WEBP.' };
  if (!UUID.test(obraId) || !UUID.test(entradaId)) return { ok: false, error: 'Entrada inválida.' };

  const quien = await oficinaQueEscribe();
  if ('error' in quien) return { ok: false, error: quien.error };

  const ext = tipo === 'image/png' ? 'png' : tipo === 'image/webp' ? 'webp' : 'jpg';
  const path = `${quien.empresaId}/${obraId}/${entradaId}/${crypto.randomUUID()}.${ext}`;
  const supabase = await createClient();
  const { data, error } = await supabase.storage.from(BUCKET_BITACORA).createSignedUploadUrl(path);
  if (error || !data) {
    return { ok: false, error: `No se pudo preparar la subida: ${error?.message ?? 'desconocido'}` };
  }
  return { ok: true, path: data.path, token: data.token };
}

/** Paso 2: enlaza la foto subida a la entrada. Si falla, borra el archivo. */
export async function registrarFoto(
  obraId: string,
  entradaId: string,
  path: string,
  tipo: string,
  bytes: number,
  orden: number,
): Promise<Resultado> {
  const quien = await oficinaQueEscribe();
  if ('error' in quien) return { ok: false, error: quien.error };
  if (!path.startsWith(`${quien.empresaId}/${obraId}/${entradaId}/`)) {
    return { ok: false, error: 'Ruta de foto inválida.' };
  }
  if (!TIPOS_FOTO.includes(tipo)) return { ok: false, error: 'Tipo de foto inválido.' };

  const supabase = await createClient();
  const ahora = Date.now();
  const { error } = await supabase.from('bitacora_foto').insert({
    id: crypto.randomUUID(),
    empresa_id: quien.empresaId,
    entrada_id: entradaId,
    path,
    mime: tipo,
    bytes: Math.min(Math.max(Math.round(bytes), 1), MAX_BYTES),
    orden,
    created_at: ahora,
    updated_at: ahora,
  });
  if (error) {
    await supabase.storage.from(BUCKET_BITACORA).remove([path]);
    return { ok: false, error: mensajeErrorBitacora(error.message) };
  }
  revalidatePath(rutaBitacora(obraId));
  return { ok: true };
}

/** Quita una foto de una entrada ABIERTA: borrado lógico + archivo. */
export async function quitarFoto(obraId: string, fotoId: string): Promise<Resultado> {
  const quien = await oficinaQueEscribe();
  if ('error' in quien) return { ok: false, error: quien.error };

  const supabase = await createClient();
  const { data, error } = await supabase
    .from('bitacora_foto')
    .update({ deleted_at: Date.now(), updated_at: Date.now() })
    .eq('id', fotoId)
    .select('path');
  if (error) return { ok: false, error: mensajeErrorBitacora(error.message) };
  const path = (data?.[0] as { path?: string } | undefined)?.path;
  if (!path) return { ok: false, error: 'No se encontró la foto.' };
  await supabase.storage.from(BUCKET_BITACORA).remove([path]);
  revalidatePath(rutaBitacora(obraId));
  return { ok: true };
}

/** Sugerencia de "personal presente": quién tiene asistencia ese día. */
export async function sugerirPersonal(
  obraId: string,
  fecha: string,
): Promise<{ nombres: string[]; error?: string }> {
  if (!FECHA.test(fecha)) return { nombres: [] };
  const { nombres, error } = await personalDelDia(obraId, fechaInputAMs(fecha));
  return error ? { nombres: [], error } : { nombres };
}
