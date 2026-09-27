'use server';

import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { getEmpresaUsuario } from '@/lib/data/empresa';
import { fechaInputAMs } from '@/lib/data/tz';
import {
  agregarDocumento,
  actualizarSubcontratista,
  borrarDatosImss,
  crearSubcontratista,
  esTipoDocumentoSub,
  guardarDatosImss,
  guardarRepse,
  guardarSiroc,
  marcarObligacion,
  puedeCumplimiento,
  quitarDocumento,
  type Resultado,
  type SubcontratistaInput,
} from '@/lib/data/cumplimiento';
import { leerClavePeriodo, type EstadoSiroc } from '@/lib/cumplimiento/avisos';

/**
 * Acciones del módulo CUMPLIMIENTO. Cada una revisa el rol (admin/contador)
 * antes de tocar nada; la RLS de 0040 es la barrera real, esto solo da un
 * mensaje claro en vez de un error de base.
 *
 * Datos personales (NSS, CURP, RFC): nunca se escriben en logs ni en mensajes
 * de error, y nunca viajan en la URL.
 */

const BUCKET = 'cumplimiento';
const MAX_BYTES = 10 * 1024 * 1024; // igual que el bucket (0040)
const TIPOS_OK = ['application/pdf', 'image/jpeg', 'image/png', 'image/webp'];
const AMBITOS = ['siroc', 'repse', 'obligacion', 'subcontratista', 'colaborador'] as const;
export type Ambito = (typeof AMBITOS)[number];

async function exigirRol(): Promise<{ empresaId: string } | { error: string }> {
  try {
    const { empresaId, rol } = await getEmpresaUsuario();
    if (!puedeCumplimiento(rol)) return { error: 'Solo el administrador o el contador pueden hacer esto.' };
    return { empresaId };
  } catch (e) {
    return { error: e instanceof Error ? e.message : 'Error de autenticación.' };
  }
}

function texto(fd: FormData, k: string, max = 2000): string {
  return String(fd.get(k) ?? '').trim().slice(0, max);
}

/** 'YYYY-MM-DD' → epoch ms (medianoche MX); vacío → null. */
function fecha(fd: FormData, k: string): number | null {
  const v = String(fd.get(k) ?? '').trim();
  if (!v) return null;
  const ms = fechaInputAMs(v);
  return Number.isFinite(ms) ? ms : null;
}

function revalidarTablero() {
  revalidatePath('/admin/cumplimiento', 'layout');
}

// ── Archivos (bucket privado `cumplimiento`) ────────────────────────────────

export interface UrlSubida {
  ok: boolean;
  error?: string;
  path?: string;
  token?: string;
}

/**
 * Paso 1: URL de subida FIRMADA para que el navegador suba directo a Storage
 * (mismo esquema que los comprobantes de 0024: el Server Action no aguanta
 * archivos de varios MB). La ruta la arma el servidor: el cliente no elige
 * carpeta ni empresa.
 */
export async function crearUrlSubidaCumplimiento(
  ambito: Ambito,
  registroId: string,
  nombre: string,
  tipo: string,
  bytes: number,
): Promise<UrlSubida> {
  if (!AMBITOS.includes(ambito)) return { ok: false, error: 'Destino de archivo desconocido.' };
  if (!/^[0-9a-f-]{36}$/i.test(registroId)) return { ok: false, error: 'Registro inválido.' };
  if (!bytes) return { ok: false, error: 'Elige un archivo.' };
  if (bytes > MAX_BYTES) return { ok: false, error: 'El archivo pasa de 10 MB.' };
  if (!TIPOS_OK.includes(tipo)) return { ok: false, error: 'Solo PDF o imágenes (JPG, PNG, WEBP).' };
  const r = await exigirRol();
  if ('error' in r) return { ok: false, error: r.error };

  const supabase = await createClient();
  const seguro = nombre.replace(/[^a-zA-Z0-9._-]/g, '_').slice(-60);
  const path = `${r.empresaId}/${ambito}/${registroId}/${crypto.randomUUID()}-${seguro}`;
  const { data, error } = await supabase.storage.from(BUCKET).createSignedUploadUrl(path);
  if (error || !data) return { ok: false, error: 'No se pudo preparar la subida.' };
  return { ok: true, path: data.path, token: data.token };
}

/** Dónde se guarda la ruta de cada ámbito. */
const DESTINO: Record<Ambito, { tabla: string; columna: string; llave: string }> = {
  siroc: { tabla: 'obra_siroc', columna: 'comprobante_path', llave: 'id' },
  repse: { tabla: 'empresa_repse', columna: 'comprobante_path', llave: 'id' },
  obligacion: { tabla: 'obligacion_periodica', columna: 'comprobante_path', llave: 'id' },
  subcontratista: { tabla: 'subcontratista_documento', columna: 'path', llave: 'id' },
  colaborador: { tabla: 'colaborador_datos_imss', columna: 'documento_path', llave: 'colaborador_id' },
};

/**
 * Paso 2: liga el archivo subido (o `null` para quitarlo) a su registro. Si
 * había otro, se borra del bucket. La ruta tiene que caer en la carpeta de
 * ESTE registro de ESTA empresa.
 */
export async function vincularArchivoCumplimiento(
  ambito: Ambito,
  registroId: string,
  path: string | null,
): Promise<Resultado> {
  if (!AMBITOS.includes(ambito)) return { ok: false, error: 'Destino de archivo desconocido.' };
  const r = await exigirRol();
  if ('error' in r) return { ok: false, error: r.error };
  if (path !== null && !path.startsWith(`${r.empresaId}/${ambito}/${registroId}/`)) {
    return { ok: false, error: 'Ruta de archivo inválida.' };
  }

  const supabase = await createClient();
  const d = DESTINO[ambito];
  const { data: antes } = await supabase.from(d.tabla).select(d.columna).eq(d.llave, registroId).maybeSingle();
  const anterior = (antes as Record<string, string | null> | null)?.[d.columna] ?? null;

  const { data: fila, error } = await supabase
    .from(d.tabla)
    .update({ [d.columna]: path, updated_at: Date.now() })
    .eq(d.llave, registroId)
    .select(d.llave)
    .maybeSingle();
  if (error || !fila) {
    if (path) await supabase.storage.from(BUCKET).remove([path]);
    return { ok: false, error: error?.message ?? 'No se encontró el registro.' };
  }
  if (anterior && anterior !== path) await supabase.storage.from(BUCKET).remove([anterior]);

  revalidarTablero();
  revalidatePath('/admin/obras', 'layout');
  return { ok: true };
}

/** URL firmada de 10 minutos para ver un archivo. Solo de la propia empresa. */
export async function urlArchivoCumplimiento(path: string): Promise<string | null> {
  const r = await exigirRol();
  if ('error' in r || !path.startsWith(`${r.empresaId}/`)) return null;
  const supabase = await createClient();
  const { data } = await supabase.storage.from(BUCKET).createSignedUrl(path, 600);
  return data?.signedUrl ?? null;
}

// ── SIROC ────────────────────────────────────────────────────────────────────

const ESTADOS_SIROC: EstadoSiroc[] = ['PENDIENTE', 'REGISTRADA', 'SUSPENDIDA', 'TERMINADA', 'NO_APLICA'];

export async function guardarSirocAction(obraId: string, fd: FormData): Promise<Resultado<{ id: string }>> {
  const r = await exigirRol();
  if ('error' in r) return { ok: false, error: r.error };
  const inicio = fecha(fd, 'fecha_inicio_obra');
  if (inicio === null) return { ok: false, error: 'Anota la fecha en que empezaron los trabajos.' };
  const estado = texto(fd, 'estado') as EstadoSiroc;
  if (!ESTADOS_SIROC.includes(estado)) return { ok: false, error: 'Estado no válido.' };
  const numero = texto(fd, 'numero_registro', 60);
  if (estado === 'REGISTRADA' && !numero) {
    return { ok: false, error: 'Para marcarla registrada, anota el número de registro que te dio el SIROC.' };
  }

  const res = await guardarSiroc(obraId, {
    fecha_inicio_obra: inicio,
    numero_registro: numero,
    fecha_registro: fecha(fd, 'fecha_registro'),
    estado,
    fecha_terminacion: fecha(fd, 'fecha_terminacion'),
    aviso_terminacion_at: fecha(fd, 'aviso_terminacion_at'),
    notas: texto(fd, 'notas'),
  });
  if (res.ok) {
    revalidatePath(`/admin/obras/${obraId}`);
    revalidarTablero();
  }
  return res;
}

// ── REPSE ────────────────────────────────────────────────────────────────────

export async function guardarRepseAction(fd: FormData): Promise<Resultado<{ id: string }>> {
  const r = await exigirRol();
  if ('error' in r) return { ok: false, error: r.error };
  const res = await guardarRepse({
    folio: texto(fd, 'folio', 60),
    fecha_registro: fecha(fd, 'fecha_registro'),
    vigencia_hasta: fecha(fd, 'vigencia_hasta'),
    notas: texto(fd, 'notas'),
  });
  if (res.ok) revalidarTablero();
  return res;
}

// ── ICSOE / SISUB ────────────────────────────────────────────────────────────

export async function marcarObligacionAction(
  tipo: 'ICSOE' | 'SISUB',
  periodo: string,
  entregado: boolean,
): Promise<Resultado<{ id: string }>> {
  const r = await exigirRol();
  if ('error' in r) return { ok: false, error: r.error };
  if (tipo !== 'ICSOE' && tipo !== 'SISUB') return { ok: false, error: 'Tipo no válido.' };
  // La fecha límite se recalcula aquí, no se toma del navegador.
  const p = leerClavePeriodo(periodo);
  if (!p) return { ok: false, error: 'Periodo no válido.' };
  const res = await marcarObligacion({
    tipo,
    periodo: p.clave,
    fechaLimite: p.fechaLimite,
    entregadoAt: entregado ? Date.now() : null,
  });
  if (res.ok) revalidarTablero();
  return res;
}

// ── Subcontratistas ─────────────────────────────────────────────────────────

const RFC_RE = /^[A-ZÑ&]{3,4}[0-9]{6}[A-Z0-9]{3}$/;

function leerSubcontratista(fd: FormData): SubcontratistaInput | { error: string } {
  const nombre = texto(fd, 'nombre', 200);
  if (!nombre) return { error: 'El nombre es obligatorio.' };
  const rfcCrudo = texto(fd, 'rfc', 20).toUpperCase().replace(/\s|-/g, '');
  if (rfcCrudo && !RFC_RE.test(rfcCrudo)) {
    return { error: 'El RFC no tiene el formato correcto (12 o 13 caracteres). Puedes dejarlo vacío.' };
  }
  const colab = texto(fd, 'colaborador_id', 40);
  return {
    nombre,
    rfc: rfcCrudo || null,
    contacto: texto(fd, 'contacto', 200),
    telefono: texto(fd, 'telefono', 40),
    correo: texto(fd, 'correo', 200),
    especialidad: texto(fd, 'especialidad', 200),
    colaborador_id: colab || null,
    notas: texto(fd, 'notas'),
  };
}

export async function crearSubcontratistaAction(fd: FormData): Promise<Resultado<{ id: string }>> {
  const r = await exigirRol();
  if ('error' in r) return { ok: false, error: r.error };
  const input = leerSubcontratista(fd);
  if ('error' in input) return { ok: false, error: input.error };
  const res = await crearSubcontratista(input);
  if (res.ok) revalidarTablero();
  return res;
}

export async function actualizarSubcontratistaAction(id: string, fd: FormData): Promise<Resultado> {
  const r = await exigirRol();
  if ('error' in r) return { ok: false, error: r.error };
  const input = leerSubcontratista(fd);
  if ('error' in input) return { ok: false, error: input.error };
  const res = await actualizarSubcontratista(id, input);
  if (res.ok) revalidarTablero();
  return res;
}

export async function agregarDocumentoAction(
  subcontratistaId: string,
  fd: FormData,
): Promise<Resultado<{ id: string }>> {
  const r = await exigirRol();
  if ('error' in r) return { ok: false, error: r.error };
  const tipo = texto(fd, 'tipo', 30);
  if (!esTipoDocumentoSub(tipo)) return { ok: false, error: 'Elige qué documento es.' };
  const res = await agregarDocumento(subcontratistaId, {
    tipo,
    descripcion: texto(fd, 'descripcion', 200),
    folio: texto(fd, 'folio', 80),
    fecha_emision: fecha(fd, 'fecha_emision'),
    vigencia_hasta: fecha(fd, 'vigencia_hasta'),
  });
  if (res.ok) revalidarTablero();
  return res;
}

export async function quitarDocumentoAction(id: string): Promise<Resultado> {
  const r = await exigirRol();
  if ('error' in r) return { ok: false, error: r.error };
  const res = await quitarDocumento(id);
  if (!res.ok) return { ok: false, error: res.error };
  if (res.data?.path) {
    const supabase = await createClient();
    await supabase.storage.from(BUCKET).remove([res.data.path]);
  }
  revalidarTablero();
  return { ok: true };
}

// ── Datos IMSS de colaboradores ─────────────────────────────────────────────

const NSS_RE = /^[0-9]{11}$/;
const CURP_RE = /^[A-Z][AEIOUX][A-Z]{2}[0-9]{6}[HMX][A-Z]{5}[A-Z0-9][0-9]$/;
const RFC_PF_RE = /^[A-ZÑ&]{4}[0-9]{6}[A-Z0-9]{3}$/;

export async function guardarDatosImssAction(colaboradorId: string, fd: FormData): Promise<Resultado> {
  const r = await exigirRol();
  if ('error' in r) return { ok: false, error: r.error };
  const nss = texto(fd, 'nss', 20).replace(/\D/g, '');
  const curp = texto(fd, 'curp', 25).toUpperCase().replace(/\s/g, '');
  const rfc = texto(fd, 'rfc', 20).toUpperCase().replace(/\s|-/g, '');
  // Mensajes sin el dato: no se repite un dato personal en un error.
  if (nss && !NSS_RE.test(nss)) return { ok: false, error: 'El NSS lleva 11 dígitos.' };
  if (curp && !CURP_RE.test(curp)) return { ok: false, error: 'La CURP no tiene el formato correcto (18 caracteres).' };
  if (rfc && !RFC_PF_RE.test(rfc)) return { ok: false, error: 'El RFC de una persona lleva 13 caracteres.' };
  const res = await guardarDatosImss(colaboradorId, { nss: nss || null, curp: curp || null, rfc: rfc || null });
  if (res.ok) revalidatePath('/admin/cumplimiento/colaboradores');
  return res;
}

export async function borrarDatosImssAction(colaboradorId: string): Promise<Resultado> {
  const r = await exigirRol();
  if ('error' in r) return { ok: false, error: r.error };
  const res = await borrarDatosImss(colaboradorId);
  if (res.ok) revalidatePath('/admin/cumplimiento/colaboradores');
  return res;
}
