'use server';

import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { getEmpresaUsuario } from '@/lib/data/empresa';
import { moduloActivo } from '@/lib/data/modulos';
import {
  BUCKET_EXTRAS,
  MAX_BYTES_FOTO,
  TIPOS_FOTO,
  actualizarExtra,
  actualizarRenglonExtra,
  cancelarExtra,
  crearExtra,
  crearRenglonExtra,
  duplicarExtra,
  eliminarExtra,
  eliminarRenglonExtra,
  enviarExtra,
  fijarFotoExtra,
  getExtra,
  urlFotoExtra,
  type ExtraInput,
  type RenglonExtraInput,
} from '@/lib/data/cambios';
import { fechaInputAMs } from '@/lib/data/tz';

/**
 * Acciones de los EXTRAS de una obra (0036).
 *
 * Los permisos de verdad los ponen la RLS, los triggers y las RPC: aquí solo se
 * valida la forma de lo que llega del navegador (que no es de fiar) y se dan
 * mensajes en lenguaje de obra. Con el módulo apagado no se escribe nada: la
 * pantalla ya no se ofrece, y una acción mandada a mano tampoco pasa.
 */

export interface ActionResult {
  ok: boolean;
  error?: string;
  id?: string;
}

const LARGO_TITULO = 120;
const LARGO_MOTIVO = 1000;
const LARGO_CONCEPTO = 300;

function texto(fd: FormData, campo: string, max: number): string {
  return String(fd.get(campo) ?? '').trim().slice(0, max);
}

function numero(fd: FormData, campo: string): number {
  const bruto = String(fd.get(campo) ?? '').trim().replace(',', '.');
  if (bruto === '') return Number.NaN;
  return Number(bruto);
}

function revalidar(obraId: string, extraId?: string) {
  revalidatePath(`/admin/obras/${obraId}/extras`);
  if (extraId) revalidatePath(`/admin/obras/${obraId}/extras/${extraId}`);
  // El estado de cuenta de la obra suma los aprobados.
  revalidatePath(`/admin/obras/${obraId}`);
}

async function moduloApagado(): Promise<ActionResult | null> {
  if (await moduloActivo('cambios')) return null;
  return {
    ok: false,
    error: 'Los extras están apagados en tu empresa. El administrador puede prenderlos en Ajustes → Módulos.',
  };
}

function parseDatos(fd: FormData): { input: ExtraInput } | { error: string } {
  const titulo = texto(fd, 'titulo', LARGO_TITULO);
  const motivo = texto(fd, 'motivo', LARGO_MOTIVO);
  const fechaStr = String(fd.get('fecha') ?? '').trim();
  if (!titulo) return { error: 'Escribe de qué es el extra (por ejemplo, "Barda en la azotea").' };
  const fecha = fechaStr ? fechaInputAMs(fechaStr) : Date.now();
  if (!Number.isFinite(fecha)) return { error: 'La fecha no es válida.' };
  return { input: { titulo, motivo, fecha } };
}

function parseRenglon(fd: FormData): { input: RenglonExtraInput } | { error: string } {
  const concepto = texto(fd, 'concepto', LARGO_CONCEPTO);
  const unidad = texto(fd, 'unidad', 20);
  const cantidad = numero(fd, 'cantidad');
  const precio = numero(fd, 'precio_unitario');
  const orden = Number(fd.get('orden') ?? 0) || 0;

  if (!concepto) return { error: 'Escribe el concepto.' };
  if (!Number.isFinite(cantidad) || cantidad <= 0) return { error: 'La cantidad debe ser mayor que cero.' };
  if (!Number.isFinite(precio)) return { error: 'El precio no es válido.' };
  if (Math.abs(precio) > 1e10 || cantidad > 1e8) return { error: 'La cantidad o el precio son demasiado grandes.' };
  return { input: { concepto, unidad, cantidad, precio_unitario: precio, orden } };
}

/** El extra existe, es de ESTA obra y la sesión lo puede leer. */
async function extraDeLaObra(obraId: string, extraId: string): Promise<ActionResult | null> {
  const { data, error } = await getExtra(extraId);
  if (error) return { ok: false, error };
  if (!data || data.obra_id !== obraId) return { ok: false, error: 'Extra no encontrado.' };
  return null;
}

// ── Alta y datos ─────────────────────────────────────────────────────────────

export async function crearExtraAction(obraId: string, fd: FormData): Promise<ActionResult> {
  const apagado = await moduloApagado();
  if (apagado) return apagado;
  const p = parseDatos(fd);
  if ('error' in p) return { ok: false, error: p.error };

  const { id, error } = await crearExtra(obraId, p.input);
  if (error || !id) return { ok: false, error: error ?? 'No se pudo crear el extra.' };
  revalidar(obraId);
  return { ok: true, id };
}

export async function guardarDatosExtraAction(
  obraId: string,
  extraId: string,
  fd: FormData,
): Promise<ActionResult> {
  const apagado = await moduloApagado();
  if (apagado) return apagado;
  const ajeno = await extraDeLaObra(obraId, extraId);
  if (ajeno) return ajeno;
  const p = parseDatos(fd);
  if ('error' in p) return { ok: false, error: p.error };

  const r = await actualizarExtra(extraId, p.input);
  if (!r.ok) return r;
  revalidar(obraId, extraId);
  return { ok: true };
}

export async function eliminarExtraAction(obraId: string, extraId: string): Promise<ActionResult> {
  const apagado = await moduloApagado();
  if (apagado) return apagado;
  const ajeno = await extraDeLaObra(obraId, extraId);
  if (ajeno) return ajeno;
  const r = await eliminarExtra(extraId);
  if (!r.ok) return r;
  revalidar(obraId);
  return { ok: true };
}

// ── Renglones ────────────────────────────────────────────────────────────────

export async function agregarRenglonExtraAction(
  obraId: string,
  extraId: string,
  fd: FormData,
): Promise<ActionResult> {
  const apagado = await moduloApagado();
  if (apagado) return apagado;
  const ajeno = await extraDeLaObra(obraId, extraId);
  if (ajeno) return ajeno;
  const p = parseRenglon(fd);
  if ('error' in p) return { ok: false, error: p.error };
  const r = await crearRenglonExtra(extraId, p.input);
  if (!r.ok) return r;
  revalidar(obraId, extraId);
  return { ok: true };
}

export async function actualizarRenglonExtraAction(
  obraId: string,
  extraId: string,
  renglonId: string,
  fd: FormData,
): Promise<ActionResult> {
  const apagado = await moduloApagado();
  if (apagado) return apagado;
  const ajeno = await extraDeLaObra(obraId, extraId);
  if (ajeno) return ajeno;
  const p = parseRenglon(fd);
  if ('error' in p) return { ok: false, error: p.error };
  const r = await actualizarRenglonExtra(extraId, renglonId, p.input);
  if (!r.ok) return r;
  revalidar(obraId, extraId);
  return { ok: true };
}

export async function eliminarRenglonExtraAction(
  obraId: string,
  extraId: string,
  renglonId: string,
): Promise<ActionResult> {
  const apagado = await moduloApagado();
  if (apagado) return apagado;
  const ajeno = await extraDeLaObra(obraId, extraId);
  if (ajeno) return ajeno;
  const r = await eliminarRenglonExtra(extraId, renglonId);
  if (!r.ok) return r;
  revalidar(obraId, extraId);
  return { ok: true };
}

// ── Estados ──────────────────────────────────────────────────────────────────

export async function enviarExtraAction(obraId: string, extraId: string): Promise<ActionResult> {
  const apagado = await moduloApagado();
  if (apagado) return apagado;
  const ajeno = await extraDeLaObra(obraId, extraId);
  if (ajeno) return ajeno;
  const r = await enviarExtra(extraId);
  if (!r.ok) return r;
  revalidar(obraId, extraId);
  return { ok: true };
}

export async function cancelarExtraAction(obraId: string, extraId: string): Promise<ActionResult> {
  const apagado = await moduloApagado();
  if (apagado) return apagado;
  const ajeno = await extraDeLaObra(obraId, extraId);
  if (ajeno) return ajeno;
  const r = await cancelarExtra(extraId);
  if (!r.ok) return r;
  revalidar(obraId, extraId);
  return { ok: true };
}

export async function duplicarExtraAction(obraId: string, extraId: string): Promise<ActionResult> {
  const apagado = await moduloApagado();
  if (apagado) return apagado;
  const ajeno = await extraDeLaObra(obraId, extraId);
  if (ajeno) return ajeno;
  const { id, error } = await duplicarExtra(extraId);
  if (error || !id) return { ok: false, error: error ?? 'No se pudo duplicar el extra.' };
  revalidar(obraId);
  return { ok: true, id };
}

// ── Foto (bucket `extras`) ───────────────────────────────────────────────────

export interface UrlSubida {
  ok: boolean;
  error?: string;
  path?: string;
  token?: string;
}

/**
 * Paso 1: URL de subida FIRMADA para que el navegador suba directo a Storage
 * (mismo esquema que los comprobantes: el cuerpo de un Server Action no aguanta
 * una foto de varios MB). La ruta la arma el servidor, con la empresa y la obra
 * al frente, para que el navegador no pueda apuntar a otra carpeta.
 */
export async function crearUrlSubidaFotoExtra(
  obraId: string,
  extraId: string,
  fileName: string,
  fileType: string,
  fileSize: number,
): Promise<UrlSubida> {
  const apagado = await moduloApagado();
  if (apagado) return apagado;
  if (!fileSize) return { ok: false, error: 'Elige una foto.' };
  if (fileSize > MAX_BYTES_FOTO) return { ok: false, error: 'La foto pasa de 10 MB.' };
  if (!TIPOS_FOTO.includes(fileType)) return { ok: false, error: 'Solo fotos (JPG, PNG, WEBP o HEIC).' };
  const ajeno = await extraDeLaObra(obraId, extraId);
  if (ajeno) return ajeno;

  let empresaId: string;
  try {
    ({ empresaId } = await getEmpresaUsuario());
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Error de autenticación.' };
  }

  const supabase = await createClient();
  const nombre = fileName.replace(/[^a-zA-Z0-9._-]/g, '_').slice(-60);
  const path = `${empresaId}/${obraId}/${extraId}-${crypto.randomUUID()}-${nombre}`;
  const { data, error } = await supabase.storage.from(BUCKET_EXTRAS).createSignedUploadUrl(path);
  if (error || !data) {
    return { ok: false, error: `No se pudo preparar la subida: ${error?.message ?? 'desconocido'}` };
  }
  return { ok: true, path: data.path, token: data.token };
}

/** Paso 2: liga la foto subida al extra (solo borradores: lo exige la base). */
export async function registrarFotoExtra(
  obraId: string,
  extraId: string,
  path: string,
): Promise<ActionResult> {
  let empresaId: string;
  try {
    ({ empresaId } = await getEmpresaUsuario());
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Error de autenticación.' };
  }
  if (!path.startsWith(`${empresaId}/${obraId}/${extraId}-`)) {
    return { ok: false, error: 'Ruta de foto inválida.' };
  }
  const { data: extra, error } = await getExtra(extraId);
  if (error) return { ok: false, error };
  if (!extra || extra.obra_id !== obraId) return { ok: false, error: 'Extra no encontrado.' };

  const supabase = await createClient();
  const r = await fijarFotoExtra(extraId, path);
  if (!r.ok) {
    await supabase.storage.from(BUCKET_EXTRAS).remove([path]);
    return r;
  }
  // Al CAMBIAR la foto, la anterior ya no la referencia nadie: se borra para no
  // dejar archivos huérfanos en el bucket.
  if (extra.foto_uri && extra.foto_uri !== path) {
    await supabase.storage.from(BUCKET_EXTRAS).remove([extra.foto_uri]);
  }
  revalidar(obraId, extraId);
  return { ok: true };
}

export async function quitarFotoExtra(obraId: string, extraId: string): Promise<ActionResult> {
  const { data, error } = await getExtra(extraId);
  if (error) return { ok: false, error };
  if (!data || data.obra_id !== obraId) return { ok: false, error: 'Extra no encontrado.' };
  if (!data.foto_uri) return { ok: true };

  const r = await fijarFotoExtra(extraId, null);
  if (!r.ok) return r;
  const supabase = await createClient();
  await supabase.storage.from(BUCKET_EXTRAS).remove([data.foto_uri]);
  revalidar(obraId, extraId);
  return { ok: true };
}

/** URL firmada (1 h) para ver la foto de un extra de esta obra. */
export async function verFotoExtra(obraId: string, extraId: string): Promise<string | null> {
  const { data } = await getExtra(extraId);
  if (!data || data.obra_id !== obraId) return null;
  return urlFotoExtra(data.foto_uri);
}
