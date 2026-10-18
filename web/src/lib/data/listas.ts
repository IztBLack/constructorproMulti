import { createClient } from '@/lib/supabase/server';
import { getEmpresaUsuario } from './empresa';
import { PASO_ORDEN_LISTA, type EstadoLista, type TipoRenglonLista } from '@/lib/listas/calculo';
import type { RenglonLeido } from '@/lib/listas/leer-nota';

/**
 * Acceso a las LISTAS DE MATERIAL (migración 0050). La aritmética vive en
 * `lib/listas/calculo.ts`; aquí solo se lee y se escribe.
 *
 * Las escrituras dependen de las policies de 0050 (escriben admin, supervisor y
 * el residente en sus obras; contador, compras y almacén solo leen). Este código
 * no repite esa comprobación: si un rol sin permiso llega, la base lo rechaza.
 * Borrar es lógico (`deleted_at`), como en el móvil, para que el borrado viaje.
 */

export interface ListaMaterial {
  id: string;
  obra_id: string;
  titulo: string;
  plano: string;
  fecha: number;
  estado: EstadoLista;
  notas: string;
}

export interface RenglonLista {
  id: string;
  lista_id: string;
  seccion: string;
  tipo: TipoRenglonLista;
  descripcion: string;
  cantidad: number;
  largo: number | null;
  unidad: string;
  separacion_cm: number | null;
  nota: string;
  marcado: boolean;
  marcado_por_nombre: string;
  marcado_at: number | null;
  orden: number;
}

export interface ListaConRenglones extends ListaMaterial {
  renglones: RenglonLista[];
}

export interface Resultado {
  ok: boolean;
  error?: string;
}

const CAMPOS_LISTA = 'id, obra_id, titulo, plano, fecha, estado, notas';
const CAMPOS_RENGLON =
  'id, lista_id, seccion, tipo, descripcion, cantidad, largo, unidad, separacion_cm, nota, marcado, marcado_por_nombre, marcado_at, orden';

/** Los números llegan de PostgREST como number, pero un bigint puede venir como texto. */
function normalizarRenglon(r: Record<string, unknown>): RenglonLista {
  return {
    ...(r as unknown as RenglonLista),
    cantidad: Number(r.cantidad),
    largo: r.largo == null ? null : Number(r.largo),
    separacion_cm: r.separacion_cm == null ? null : Number(r.separacion_cm),
    marcado_at: r.marcado_at == null ? null : Number(r.marcado_at),
    orden: Number(r.orden),
  };
}

function normalizarLista(l: Record<string, unknown>): ListaMaterial {
  return { ...(l as unknown as ListaMaterial), fecha: Number(l.fecha) };
}

// ── Lectura ─────────────────────────────────────────────────────────────────

async function renglonesDe(listaIds: string[]): Promise<{ data: RenglonLista[]; error: string | null }> {
  if (listaIds.length === 0) return { data: [], error: null };
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('lista_material_renglon')
    .select(CAMPOS_RENGLON)
    .in('lista_id', listaIds)
    .is('deleted_at', null)
    .order('orden', { ascending: true })
    .order('created_at', { ascending: true });
  if (error) return { data: [], error: error.message };
  return { data: (data ?? []).map((r) => normalizarRenglon(r as Record<string, unknown>)), error: null };
}

/** Las listas de una obra, la más reciente primero, con sus renglones. */
export async function listListasObra(
  obraId: string,
): Promise<{ data: ListaConRenglones[]; error: string | null }> {
  const supabase = await createClient();
  const { data: listas, error } = await supabase
    .from('lista_material')
    .select(CAMPOS_LISTA)
    .eq('obra_id', obraId)
    .is('deleted_at', null)
    .order('fecha', { ascending: false });
  if (error) return { data: [], error: error.message };

  const normalizadas = (listas ?? []).map((l) => normalizarLista(l as Record<string, unknown>));
  const { data: renglones, error: errorRenglones } = await renglonesDe(normalizadas.map((l) => l.id));
  if (errorRenglones) return { data: [], error: errorRenglones };

  const porLista = new Map<string, RenglonLista[]>();
  for (const r of renglones) {
    const lista = porLista.get(r.lista_id);
    if (lista) lista.push(r);
    else porLista.set(r.lista_id, [r]);
  }
  return {
    data: normalizadas.map((l) => ({ ...l, renglones: porLista.get(l.id) ?? [] })),
    error: null,
  };
}

/** Una lista con sus renglones. `null` si no existe o no es visible (RLS). */
export async function getListaMaterial(
  listaId: string,
): Promise<{ data: ListaConRenglones | null; error: string | null }> {
  const supabase = await createClient();
  const { data: lista, error } = await supabase
    .from('lista_material')
    .select(CAMPOS_LISTA)
    .eq('id', listaId)
    .is('deleted_at', null)
    .maybeSingle();
  if (error) return { data: null, error: error.message };
  if (!lista) return { data: null, error: null };

  const { data: renglones, error: errorRenglones } = await renglonesDe([listaId]);
  if (errorRenglones) return { data: null, error: errorRenglones };
  return { data: { ...normalizarLista(lista as Record<string, unknown>), renglones }, error: null };
}

// ── Escritura: la lista ─────────────────────────────────────────────────────

export async function crearLista(
  obraId: string,
  input: { titulo: string; plano: string },
): Promise<{ id: string | null; error: string | null }> {
  let empresaId: string;
  try {
    ({ empresaId } = await getEmpresaUsuario());
  } catch (e) {
    return { id: null, error: e instanceof Error ? e.message : 'Error de autenticación.' };
  }
  const supabase = await createClient();
  const id = crypto.randomUUID();
  const now = Date.now();
  const { error } = await supabase.from('lista_material').insert({
    id,
    empresa_id: empresaId,
    obra_id: obraId,
    titulo: input.titulo,
    plano: input.plano,
    fecha: now,
    created_at: now,
    updated_at: now,
  });
  if (error) return { id: null, error: error.message };
  return { id, error: null };
}

export async function actualizarLista(
  listaId: string,
  input: Partial<Pick<ListaMaterial, 'titulo' | 'plano' | 'notas' | 'estado'>>,
): Promise<Resultado> {
  const supabase = await createClient();
  const { error } = await supabase
    .from('lista_material')
    .update({ ...input, updated_at: Date.now() })
    .eq('id', listaId);
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

/** Borrado lógico de la lista Y de sus renglones. */
export async function eliminarLista(listaId: string): Promise<Resultado> {
  const supabase = await createClient();
  const now = Date.now();
  const { error } = await supabase
    .from('lista_material')
    .update({ deleted_at: now, updated_at: now })
    .eq('id', listaId);
  if (error) return { ok: false, error: error.message };
  const { error: errorRenglones } = await supabase
    .from('lista_material_renglon')
    .update({ deleted_at: now, updated_at: now })
    .eq('lista_id', listaId)
    .is('deleted_at', null);
  if (errorRenglones) return { ok: false, error: errorRenglones.message };
  return { ok: true };
}

// ── Escritura: los renglones ────────────────────────────────────────────────

export interface RenglonInput {
  seccion: string;
  tipo: TipoRenglonLista;
  cantidad: number;
  largo: number | null;
  separacion_cm: number | null;
  unidad: string;
  descripcion: string;
  nota: string;
}

async function siguienteOrden(listaId: string): Promise<number> {
  const supabase = await createClient();
  const { data } = await supabase
    .from('lista_material_renglon')
    .select('orden')
    .eq('lista_id', listaId)
    .order('orden', { ascending: false })
    .limit(1)
    .maybeSingle();
  return Number(data?.orden ?? 0) + PASO_ORDEN_LISTA;
}

/** Inserta renglones al final de la lista, en su orden. Todo o nada. */
export async function crearRenglones(listaId: string, renglones: RenglonInput[]): Promise<Resultado> {
  if (renglones.length === 0) return { ok: true };
  let empresaId: string;
  try {
    ({ empresaId } = await getEmpresaUsuario());
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Error de autenticación.' };
  }
  const inicio = await siguienteOrden(listaId);
  const now = Date.now();
  const supabase = await createClient();
  const { error } = await supabase.from('lista_material_renglon').insert(
    renglones.map((r, i) => ({
      id: crypto.randomUUID(),
      empresa_id: empresaId,
      lista_id: listaId,
      ...r,
      orden: inicio + i * PASO_ORDEN_LISTA,
      created_at: now,
      updated_at: now,
    })),
  );
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

export function renglonDeLeido(r: RenglonLeido): RenglonInput {
  return {
    seccion: r.seccion,
    tipo: r.tipo,
    cantidad: r.cantidad,
    largo: r.largo,
    separacion_cm: r.separacionCm,
    unidad: r.unidad,
    descripcion: r.descripcion,
    nota: r.nota,
  };
}

export async function actualizarRenglon(renglonId: string, input: RenglonInput): Promise<Resultado> {
  const supabase = await createClient();
  const { error } = await supabase
    .from('lista_material_renglon')
    .update({ ...input, updated_at: Date.now() })
    .eq('id', renglonId);
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

/** Palomea o despalomea, con quién y cuándo (igual que el móvil). */
export async function marcarRenglon(renglonId: string, marcado: boolean): Promise<Resultado> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const nombreMeta = user?.user_metadata?.nombre;
  const nombre = typeof nombreMeta === 'string' && nombreMeta.trim() ? nombreMeta.trim() : (user?.email ?? '');
  const now = Date.now();
  const { error } = await supabase
    .from('lista_material_renglon')
    .update({
      marcado,
      marcado_por: marcado ? (user?.id ?? null) : null,
      marcado_por_nombre: marcado ? nombre.slice(0, 200) : '',
      marcado_at: marcado ? now : null,
      updated_at: now,
    })
    .eq('id', renglonId);
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

export async function eliminarRenglon(renglonId: string): Promise<Resultado> {
  const supabase = await createClient();
  const now = Date.now();
  const { error } = await supabase
    .from('lista_material_renglon')
    .update({ deleted_at: now, updated_at: now })
    .eq('id', renglonId);
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}
