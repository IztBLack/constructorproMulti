import { createClient } from '@/lib/supabase/server';
import { getEmpresaUsuario } from './empresa';
import { PASO_ORDEN } from './notas-obra-calculo';
import type {
  EstadoNota,
  NotaConRenglones,
  NotaObra,
  RenglonNota,
  TipoRenglon,
} from './notas-obra-calculo';

export type { EstadoNota, NotaConRenglones, NotaObra, RenglonNota, TipoRenglon };
export { PASO_ORDEN };

/**
 * Acceso a las NOTAS DE OBRA (migración 0031): los tratos de palabra con socios
 * que no están en el sistema. La aritmética vive en `notas-obra-calculo.ts`;
 * aquí solo se lee y se escribe.
 *
 * Todas las escrituras dependen de las policies de 0031 (escriben admin y
 * supervisor; el contador solo lee). Este código no repite esa comprobación:
 * si un rol sin permiso llega, la base lo rechaza y el error sube tal cual.
 */

export interface ResultadoNota {
  ok: boolean;
  error?: string;
}

export interface NotaInput {
  destinatario: string;
  colaborador_id: string | null;
  titulo: string;
  fecha: number;
  estado: EstadoNota;
  total_override: number | null;
  saldo_override: number | null;
  notas: string;
}

export interface RenglonInput {
  tipo: TipoRenglon;
  etiqueta: string;
  monto: number | null;
  monto_base: number | null;
  porcentaje: number | null;
  texto: string;
  fecha: number | null;
  orden: number;
}

const CAMPOS_NOTA =
  'id, obra_id, destinatario, colaborador_id, titulo, fecha, estado, total_override, saldo_override, notas, orden, texto_final';
const CAMPOS_RENGLON =
  'id, nota_id, tipo, etiqueta, monto, monto_base, porcentaje, texto, fecha, orden';

// ── Lectura ─────────────────────────────────────────────────────────────────

/**
 * Todas las notas de una obra con sus renglones. Dos consultas en vez de un
 * embed porque los renglones borrados se filtran por `deleted_at`, y filtrar
 * dentro de un recurso embebido es justo donde PostgREST se pone sutil.
 */
export async function listNotasObra(
  obraId: string,
): Promise<{ data: NotaConRenglones[]; error: string | null }> {
  const supabase = await createClient();

  const { data: notas, error } = await supabase
    .from('nota_obra')
    .select(CAMPOS_NOTA)
    .eq('obra_id', obraId)
    .is('deleted_at', null)
    .order('orden', { ascending: true })
    .order('fecha', { ascending: false });

  if (error) return { data: [], error: error.message };
  if (!notas || notas.length === 0) return { data: [], error: null };

  const { data: renglones, error: errorRenglones } = await supabase
    .from('nota_obra_renglon')
    .select(CAMPOS_RENGLON)
    .in(
      'nota_id',
      notas.map((n) => n.id as string),
    )
    .is('deleted_at', null)
    .order('orden', { ascending: true });

  if (errorRenglones) return { data: [], error: errorRenglones.message };

  const porNota = new Map<string, RenglonNota[]>();
  for (const r of (renglones ?? []) as RenglonNota[]) {
    const lista = porNota.get(r.nota_id);
    if (lista) lista.push(r);
    else porNota.set(r.nota_id, [r]);
  }

  return {
    data: (notas as NotaObra[]).map((n) => ({ ...n, renglones: porNota.get(n.id) ?? [] })),
    error: null,
  };
}

/** Una nota con sus renglones. `null` si no existe o no es de la empresa (RLS). */
export async function getNotaObra(
  notaId: string,
): Promise<{ data: NotaConRenglones | null; error: string | null }> {
  const supabase = await createClient();

  const { data: nota, error } = await supabase
    .from('nota_obra')
    .select(CAMPOS_NOTA)
    .eq('id', notaId)
    .is('deleted_at', null)
    .maybeSingle();

  if (error) return { data: null, error: error.message };
  if (!nota) return { data: null, error: null };

  const { data: renglones, error: errorRenglones } = await supabase
    .from('nota_obra_renglon')
    .select(CAMPOS_RENGLON)
    .eq('nota_id', notaId)
    .is('deleted_at', null)
    .order('orden', { ascending: true });

  if (errorRenglones) return { data: null, error: errorRenglones.message };

  return {
    data: { ...(nota as NotaObra), renglones: (renglones ?? []) as RenglonNota[] },
    error: null,
  };
}

// ── Escritura: la nota ──────────────────────────────────────────────────────

export async function crearNotaObra(
  obraId: string,
  input: NotaInput,
  orden: number,
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

  const { error } = await supabase.from('nota_obra').insert({
    id,
    empresa_id: empresaId,
    obra_id: obraId,
    ...input,
    orden,
    created_at: now,
    updated_at: now,
  });

  if (error) return { id: null, error: error.message };
  return { id, error: null };
}

export async function actualizarNotaObra(
  notaId: string,
  input: Partial<NotaInput>,
): Promise<ResultadoNota> {
  const supabase = await createClient();
  const { error } = await supabase
    .from('nota_obra')
    .update({ ...input, updated_at: Date.now() })
    .eq('id', notaId);

  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

/**
 * Borrado lógico de la nota. Los renglones se marcan también: quedan colgando
 * de una nota invisible, y dejarlos "vivos" los haría reaparecer si algún día
 * se restaura la nota a medias.
 */
export async function eliminarNotaObra(notaId: string): Promise<ResultadoNota> {
  const supabase = await createClient();
  const now = Date.now();

  const { error } = await supabase
    .from('nota_obra')
    .update({ deleted_at: now, updated_at: now })
    .eq('id', notaId);

  if (error) return { ok: false, error: error.message };

  const { error: errorRenglones } = await supabase
    .from('nota_obra_renglon')
    .update({ deleted_at: now, updated_at: now })
    .eq('nota_id', notaId)
    .is('deleted_at', null);

  if (errorRenglones) return { ok: false, error: errorRenglones.message };
  return { ok: true };
}

// ── Escritura: los renglones ────────────────────────────────────────────────

export async function crearRenglon(
  notaId: string,
  input: RenglonInput,
): Promise<ResultadoNota> {
  let empresaId: string;
  try {
    ({ empresaId } = await getEmpresaUsuario());
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Error de autenticación.' };
  }

  const supabase = await createClient();
  const now = Date.now();

  const { error } = await supabase.from('nota_obra_renglon').insert({
    id: crypto.randomUUID(),
    empresa_id: empresaId,
    nota_id: notaId,
    ...input,
    created_at: now,
    updated_at: now,
  });

  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

export async function actualizarRenglon(
  renglonId: string,
  input: RenglonInput,
): Promise<ResultadoNota> {
  const supabase = await createClient();
  const { error } = await supabase
    .from('nota_obra_renglon')
    .update({ ...input, updated_at: Date.now() })
    .eq('id', renglonId);

  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

export async function eliminarRenglon(renglonId: string): Promise<ResultadoNota> {
  const supabase = await createClient();
  const now = Date.now();

  const { error } = await supabase
    .from('nota_obra_renglon')
    .update({ deleted_at: now, updated_at: now })
    .eq('id', renglonId);

  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

/**
 * Reordena los renglones de una nota. Recibe los ids en el orden final y les
 * reparte posiciones espaciadas, igual que el resto de las listas arrastrables
 * (0026): así caben inserciones futuras sin renumerar todo.
 */
export async function reordenarRenglones(ids: string[]): Promise<ResultadoNota> {
  const supabase = await createClient();
  const now = Date.now();

  for (const [i, id] of ids.entries()) {
    const { error } = await supabase
      .from('nota_obra_renglon')
      .update({ orden: (i + 1) * PASO_ORDEN, updated_at: now })
      .eq('id', id);
    if (error) return { ok: false, error: error.message };
  }

  return { ok: true };
}
