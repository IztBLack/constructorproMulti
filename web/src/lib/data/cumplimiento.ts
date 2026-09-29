import { createClient } from '@/lib/supabase/server';
import { getEmpresaUsuario } from './empresa';
import type { EstadoSiroc, TipoObligacion } from '@/lib/cumplimiento/avisos';

/**
 * Acceso a los datos de CUMPLIMIENTO (migración 0040): SIROC por obra, REPSE
 * propio, entregas cuatrimestrales, subcontratistas con su expediente y datos
 * IMSS de los colaboradores.
 *
 * Todo lo lee y escribe solo admin y contador: lo decide la RLS de 0040. Aquí
 * no se repite la regla; si otro rol llega, la base le devuelve 0 filas o
 * rechaza la escritura y el error sube tal cual.
 */

export const ROLES_CUMPLIMIENTO = ['admin', 'contador'] as const;

export function puedeCumplimiento(rol: string): boolean {
  return (ROLES_CUMPLIMIENTO as readonly string[]).includes(rol);
}

export interface Resultado<T = undefined> {
  ok: boolean;
  error?: string;
  data?: T;
}

// ── Tipos ────────────────────────────────────────────────────────────────────

export interface ObraSiroc {
  id: string;
  obra_id: string;
  fecha_inicio_obra: number;
  numero_registro: string;
  fecha_registro: number | null;
  estado: EstadoSiroc;
  fecha_terminacion: number | null;
  aviso_terminacion_at: number | null;
  notas: string;
  comprobante_path: string | null;
}

export interface EmpresaRepse {
  id: string;
  folio: string;
  fecha_registro: number | null;
  vigencia_hasta: number | null;
  notas: string;
  comprobante_path: string | null;
}

export interface ObligacionPeriodica {
  id: string;
  tipo: TipoObligacion;
  periodo: string;
  descripcion: string;
  fecha_limite: number;
  entregado_at: number | null;
  notas: string;
  comprobante_path: string | null;
}

export type TipoDocumentoSub = 'REPSE' | 'CONSTANCIA_FISCAL' | 'OPINION_32D' | 'IMSS_OPINION' | 'OTRO';

export const TIPOS_DOCUMENTO_SUB: { valor: TipoDocumentoSub; texto: string; ayuda: string }[] = [
  { valor: 'REPSE', texto: 'Registro REPSE', ayuda: 'Aviso de registro ante la STPS (vigencia de 3 años).' },
  {
    valor: 'CONSTANCIA_FISCAL',
    texto: 'Constancia de situación fiscal',
    ayuda: 'La del SAT, con su RFC, régimen y domicilio fiscal.',
  },
  {
    valor: 'OPINION_32D',
    texto: 'Opinión de cumplimiento del SAT (32-D)',
    ayuda: 'Una positiva se considera vigente 30 días naturales.',
  },
  {
    valor: 'IMSS_OPINION',
    texto: 'Opinión de cumplimiento del IMSS',
    ayuda: 'Se saca en el Buzón IMSS; pídela reciente.',
  },
  { valor: 'OTRO', texto: 'Otro documento', ayuda: 'Acuses de ICSOE/SISUB, pólizas, identificación…' },
];

export function esTipoDocumentoSub(x: unknown): x is TipoDocumentoSub {
  return typeof x === 'string' && TIPOS_DOCUMENTO_SUB.some((t) => t.valor === x);
}

export interface SubcontratistaDocumento {
  id: string;
  subcontratista_id: string;
  tipo: TipoDocumentoSub;
  descripcion: string;
  folio: string;
  fecha_emision: number | null;
  vigencia_hasta: number | null;
  path: string | null;
  created_at: number;
}

export interface Subcontratista {
  id: string;
  nombre: string;
  rfc: string | null;
  contacto: string;
  telefono: string;
  correo: string;
  especialidad: string;
  colaborador_id: string | null;
  notas: string;
}

export interface SubcontratistaConDocs extends Subcontratista {
  documentos: SubcontratistaDocumento[];
}

export interface DatosImss {
  colaborador_id: string;
  nss: string | null;
  curp: string | null;
  rfc: string | null;
  documento_path: string | null;
}

const CAMPOS_SIROC =
  'id, obra_id, fecha_inicio_obra, numero_registro, fecha_registro, estado, fecha_terminacion, aviso_terminacion_at, notas, comprobante_path';
const CAMPOS_REPSE = 'id, folio, fecha_registro, vigencia_hasta, notas, comprobante_path';
const CAMPOS_OBLIGACION = 'id, tipo, periodo, descripcion, fecha_limite, entregado_at, notas, comprobante_path';
const CAMPOS_SUB = 'id, nombre, rfc, contacto, telefono, correo, especialidad, colaborador_id, notas';
const CAMPOS_DOC =
  'id, subcontratista_id, tipo, descripcion, folio, fecha_emision, vigencia_hasta, path, created_at';

// ── SIROC ────────────────────────────────────────────────────────────────────

export async function listSirocs(): Promise<{ data: ObraSiroc[]; error: string | null }> {
  const supabase = await createClient();
  const { data, error } = await supabase.from('obra_siroc').select(CAMPOS_SIROC).is('deleted_at', null);
  if (error) return { data: [], error: error.message };
  return { data: (data ?? []) as ObraSiroc[], error: null };
}

export async function getSirocObra(obraId: string): Promise<ObraSiroc | null> {
  const supabase = await createClient();
  const { data } = await supabase
    .from('obra_siroc')
    .select(CAMPOS_SIROC)
    .eq('obra_id', obraId)
    .is('deleted_at', null)
    .maybeSingle();
  return (data as ObraSiroc | null) ?? null;
}

export interface SirocInput {
  fecha_inicio_obra: number;
  numero_registro: string;
  fecha_registro: number | null;
  estado: EstadoSiroc;
  fecha_terminacion: number | null;
  aviso_terminacion_at: number | null;
  notas: string;
}

/** Crea o actualiza el SIROC vivo de la obra (uno por obra). */
export async function guardarSiroc(obraId: string, input: SirocInput): Promise<Resultado<{ id: string }>> {
  const { empresaId } = await getEmpresaUsuario();
  const supabase = await createClient();
  const actual = await getSirocObra(obraId);
  const now = Date.now();
  if (actual) {
    const { error } = await supabase
      .from('obra_siroc')
      .update({ ...input, updated_at: now })
      .eq('id', actual.id);
    return error ? { ok: false, error: error.message } : { ok: true, data: { id: actual.id } };
  }
  const id = crypto.randomUUID();
  const { error } = await supabase.from('obra_siroc').insert({
    id,
    empresa_id: empresaId,
    obra_id: obraId,
    ...input,
    created_at: now,
    updated_at: now,
  });
  return error ? { ok: false, error: error.message } : { ok: true, data: { id } };
}

// ── REPSE propio ─────────────────────────────────────────────────────────────

export async function getRepse(): Promise<EmpresaRepse | null> {
  // Filtrado por empresa: quien es contador de dos empresas vería dos filas.
  const { empresaId } = await getEmpresaUsuario();
  const supabase = await createClient();
  const { data } = await supabase
    .from('empresa_repse')
    .select(CAMPOS_REPSE)
    .eq('empresa_id', empresaId)
    .is('deleted_at', null)
    .maybeSingle();
  return (data as EmpresaRepse | null) ?? null;
}

export interface RepseInput {
  folio: string;
  fecha_registro: number | null;
  vigencia_hasta: number | null;
  notas: string;
}

export async function guardarRepse(input: RepseInput): Promise<Resultado<{ id: string }>> {
  const { empresaId } = await getEmpresaUsuario();
  const supabase = await createClient();
  const actual = await getRepse();
  const now = Date.now();
  if (actual) {
    const { error } = await supabase
      .from('empresa_repse')
      .update({ ...input, updated_at: now })
      .eq('id', actual.id);
    return error ? { ok: false, error: error.message } : { ok: true, data: { id: actual.id } };
  }
  const id = crypto.randomUUID();
  const { error } = await supabase
    .from('empresa_repse')
    .insert({ id, empresa_id: empresaId, ...input, created_at: now, updated_at: now });
  return error ? { ok: false, error: error.message } : { ok: true, data: { id } };
}

// ── Obligaciones periódicas ─────────────────────────────────────────────────

export async function listObligaciones(): Promise<{ data: ObligacionPeriodica[]; error: string | null }> {
  const { empresaId } = await getEmpresaUsuario();
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('obligacion_periodica')
    .select(CAMPOS_OBLIGACION)
    .eq('empresa_id', empresaId)
    .is('deleted_at', null)
    .order('fecha_limite', { ascending: false });
  if (error) return { data: [], error: error.message };
  return { data: (data ?? []) as ObligacionPeriodica[], error: null };
}

/**
 * Marca (o desmarca) una entrega cuatrimestral. La fila se crea la primera
 * vez; después solo se actualiza la fecha de entrega. Nada de upsert: el
 * índice único es parcial (filas vivas) y PostgREST no lo usa como conflicto.
 */
export async function marcarObligacion(p: {
  tipo: TipoObligacion;
  periodo: string;
  fechaLimite: number;
  entregadoAt: number | null;
}): Promise<Resultado<{ id: string }>> {
  const { empresaId } = await getEmpresaUsuario();
  const supabase = await createClient();
  const now = Date.now();
  const { data: actual, error: errLeer } = await supabase
    .from('obligacion_periodica')
    .select('id')
    .eq('empresa_id', empresaId)
    .eq('tipo', p.tipo)
    .eq('periodo', p.periodo)
    .is('deleted_at', null)
    .maybeSingle();
  if (errLeer) return { ok: false, error: errLeer.message };

  if (actual) {
    const { error } = await supabase
      .from('obligacion_periodica')
      .update({ entregado_at: p.entregadoAt, updated_at: now })
      .eq('id', actual.id);
    return error ? { ok: false, error: error.message } : { ok: true, data: { id: actual.id as string } };
  }
  const id = crypto.randomUUID();
  const { error } = await supabase.from('obligacion_periodica').insert({
    id,
    empresa_id: empresaId,
    tipo: p.tipo,
    periodo: p.periodo,
    fecha_limite: p.fechaLimite,
    entregado_at: p.entregadoAt,
    created_at: now,
    updated_at: now,
  });
  return error ? { ok: false, error: error.message } : { ok: true, data: { id } };
}

// ── Subcontratistas ─────────────────────────────────────────────────────────

export async function listSubcontratistas(): Promise<{ data: SubcontratistaConDocs[]; error: string | null }> {
  const { empresaId } = await getEmpresaUsuario();
  const supabase = await createClient();
  const { data: subs, error } = await supabase
    .from('subcontratista')
    .select(CAMPOS_SUB)
    .eq('empresa_id', empresaId)
    .is('deleted_at', null)
    .order('nombre');
  if (error) return { data: [], error: error.message };
  if (!subs || subs.length === 0) return { data: [], error: null };

  const { data: docs, error: errDocs } = await supabase
    .from('subcontratista_documento')
    .select(CAMPOS_DOC)
    .in(
      'subcontratista_id',
      subs.map((s) => s.id as string),
    )
    .is('deleted_at', null)
    .order('created_at', { ascending: false });
  if (errDocs) return { data: [], error: errDocs.message };

  const porSub = new Map<string, SubcontratistaDocumento[]>();
  for (const d of (docs ?? []) as SubcontratistaDocumento[]) {
    const l = porSub.get(d.subcontratista_id);
    if (l) l.push(d);
    else porSub.set(d.subcontratista_id, [d]);
  }
  return {
    data: (subs as Subcontratista[]).map((s) => ({ ...s, documentos: porSub.get(s.id) ?? [] })),
    error: null,
  };
}

export async function getSubcontratista(id: string): Promise<SubcontratistaConDocs | null> {
  const supabase = await createClient();
  const { data: sub } = await supabase
    .from('subcontratista')
    .select(CAMPOS_SUB)
    .eq('id', id)
    .is('deleted_at', null)
    .maybeSingle();
  if (!sub) return null;
  const { data: docs } = await supabase
    .from('subcontratista_documento')
    .select(CAMPOS_DOC)
    .eq('subcontratista_id', id)
    .is('deleted_at', null)
    .order('created_at', { ascending: false });
  return { ...(sub as Subcontratista), documentos: (docs ?? []) as SubcontratistaDocumento[] };
}

export interface SubcontratistaInput {
  nombre: string;
  rfc: string | null;
  contacto: string;
  telefono: string;
  correo: string;
  especialidad: string;
  colaborador_id: string | null;
  notas: string;
}

export async function crearSubcontratista(input: SubcontratistaInput): Promise<Resultado<{ id: string }>> {
  const { empresaId } = await getEmpresaUsuario();
  const supabase = await createClient();
  const id = crypto.randomUUID();
  const now = Date.now();
  const { error } = await supabase
    .from('subcontratista')
    .insert({ id, empresa_id: empresaId, ...input, created_at: now, updated_at: now });
  return error ? { ok: false, error: error.message } : { ok: true, data: { id } };
}

export async function actualizarSubcontratista(id: string, input: SubcontratistaInput): Promise<Resultado> {
  const supabase = await createClient();
  const { error } = await supabase
    .from('subcontratista')
    .update({ ...input, updated_at: Date.now() })
    .eq('id', id);
  return error ? { ok: false, error: error.message } : { ok: true };
}

/**
 * Busca un subcontratista por nombre (sin distinguir mayúsculas ni espacios) o
 * por colaborador; si no existe, lo crea. Sirve para "Convertir nota en
 * contrato", donde el socio solo existe como texto en la nota.
 */
export async function subcontratistaParaNombre(
  nombre: string,
  colaboradorId: string | null,
): Promise<Resultado<{ id: string; nombre: string }>> {
  const limpio = nombre.trim().replace(/\s+/g, ' ');
  if (!limpio) return { ok: false, error: 'La nota no dice a quién va: ponle destinatario antes de convertirla.' };
  const { data: todos, error } = await listSubcontratistas();
  if (error) return { ok: false, error };
  const clave = limpio.toLocaleLowerCase('es');
  const existente =
    (colaboradorId && todos.find((s) => s.colaborador_id === colaboradorId)) ||
    todos.find((s) => s.nombre.trim().replace(/\s+/g, ' ').toLocaleLowerCase('es') === clave);
  if (existente) return { ok: true, data: { id: existente.id, nombre: existente.nombre } };

  const r = await crearSubcontratista({
    nombre: limpio,
    rfc: null,
    contacto: '',
    telefono: '',
    correo: '',
    especialidad: '',
    colaborador_id: colaboradorId,
    notas: '',
  });
  if (!r.ok || !r.data) return { ok: false, error: r.error };
  return { ok: true, data: { id: r.data.id, nombre: limpio } };
}

export interface DocumentoInput {
  tipo: TipoDocumentoSub;
  descripcion: string;
  folio: string;
  fecha_emision: number | null;
  vigencia_hasta: number | null;
}

export async function agregarDocumento(
  subcontratistaId: string,
  input: DocumentoInput,
): Promise<Resultado<{ id: string }>> {
  const { empresaId } = await getEmpresaUsuario();
  const supabase = await createClient();
  const id = crypto.randomUUID();
  const now = Date.now();
  const { error } = await supabase.from('subcontratista_documento').insert({
    id,
    empresa_id: empresaId,
    subcontratista_id: subcontratistaId,
    ...input,
    created_at: now,
    updated_at: now,
  });
  return error ? { ok: false, error: error.message } : { ok: true, data: { id } };
}

/** Borrado lógico del documento. Devuelve la ruta del archivo para quitarlo del bucket. */
export async function quitarDocumento(id: string): Promise<Resultado<{ path: string | null }>> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('subcontratista_documento')
    .update({ deleted_at: Date.now(), updated_at: Date.now() })
    .eq('id', id)
    .select('path')
    .maybeSingle();
  if (error) return { ok: false, error: error.message };
  return { ok: true, data: { path: (data?.path as string | null) ?? null } };
}

// ── Datos IMSS de colaboradores ─────────────────────────────────────────────

export async function listDatosImss(): Promise<{ data: Map<string, DatosImss>; error: string | null }> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('colaborador_datos_imss')
    .select('colaborador_id, nss, curp, rfc, documento_path')
    .is('deleted_at', null);
  if (error) return { data: new Map(), error: error.message };
  return {
    data: new Map(((data ?? []) as DatosImss[]).map((d) => [d.colaborador_id, d])),
    error: null,
  };
}

/**
 * Guarda NSS/CURP/RFC de un colaborador. Si los tres quedan vacíos y no hay
 * documento, la fila se BORRA (no se guarda una fila vacía de datos
 * personales). Nada de upsert parcial: se lee y se decide.
 */
export async function guardarDatosImss(
  colaboradorId: string,
  datos: { nss: string | null; curp: string | null; rfc: string | null },
): Promise<Resultado> {
  const { empresaId } = await getEmpresaUsuario();
  const supabase = await createClient();
  const now = Date.now();
  const { data: actual, error: errLeer } = await supabase
    .from('colaborador_datos_imss')
    .select('colaborador_id, documento_path')
    .eq('colaborador_id', colaboradorId)
    .maybeSingle();
  if (errLeer) return { ok: false, error: errLeer.message };

  const vacio = !datos.nss && !datos.curp && !datos.rfc;
  if (actual) {
    if (vacio && !actual.documento_path) return borrarDatosImss(colaboradorId);
    const { error } = await supabase
      .from('colaborador_datos_imss')
      .update({ ...datos, updated_at: now })
      .eq('colaborador_id', colaboradorId);
    return error ? { ok: false, error: error.message } : { ok: true };
  }
  if (vacio) return { ok: true };
  const { error } = await supabase.from('colaborador_datos_imss').insert({
    colaborador_id: colaboradorId,
    empresa_id: empresaId,
    ...datos,
    created_at: now,
    updated_at: now,
  });
  return error ? { ok: false, error: error.message } : { ok: true };
}

/** Borra de verdad los datos IMSS (derecho de cancelación) y su documento. */
export async function borrarDatosImss(colaboradorId: string): Promise<Resultado> {
  const supabase = await createClient();
  const { data: actual } = await supabase
    .from('colaborador_datos_imss')
    .select('documento_path')
    .eq('colaborador_id', colaboradorId)
    .maybeSingle();
  const { error } = await supabase.from('colaborador_datos_imss').delete().eq('colaborador_id', colaboradorId);
  if (error) return { ok: false, error: error.message };
  if (actual?.documento_path) await supabase.storage.from('cumplimiento').remove([actual.documento_path as string]);
  return { ok: true };
}
