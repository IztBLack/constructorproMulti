import { createClient } from '@/lib/supabase/server';
import { getEmpresaUsuario } from './empresa';
import { generarCodigoNumerico } from './codigo';
import type { Cliente, Cotizacion, Obra } from './types';

// ---------- Lectura ----------------------------------------------------------

export async function listClientes(): Promise<{ data: Cliente[]; error: string | null }> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('clientes')
    .select('*')
    .is('deleted_at', null)
    .order('nombre');

  if (error) return { data: [], error: error.message };
  return { data: (data ?? []) as Cliente[], error: null };
}

export async function getCliente(id: string): Promise<{ data: Cliente | null; error: string | null }> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('clientes')
    .select('*')
    .eq('id', id)
    .is('deleted_at', null)
    .maybeSingle();

  if (error) return { data: null, error: error.message };
  return { data: data as Cliente | null, error: null };
}

export async function listObrasDeCliente(
  clienteId: string,
): Promise<{ data: Obra[]; error: string | null }> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('obras')
    .select('*')
    .eq('cliente_id', clienteId)
    .is('deleted_at', null)
    .order('nombre');

  if (error) return { data: [], error: error.message };
  return { data: (data ?? []) as Obra[], error: null };
}

export async function listCotizacionesDeCliente(
  clienteId: string,
): Promise<{ data: Cotizacion[]; error: string | null }> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('cotizaciones')
    .select('*')
    .eq('cliente_id', clienteId)
    .is('deleted_at', null)
    .order('fecha', { ascending: false });

  if (error) return { data: [], error: error.message };
  return { data: (data ?? []) as Cotizacion[], error: null };
}

// ---------- Escritura --------------------------------------------------------

export interface ClienteInput {
  nombre: string;
  email: string;
  telefono: string;
}

export async function crearCliente(
  input: ClienteInput,
): Promise<{ id: string | null; error: string | null }> {
  const supabase = await createClient();
  const { empresaId } = await getEmpresaUsuario();
  const now = Date.now();
  const id = crypto.randomUUID();

  const { error } = await supabase.from('clientes').insert({
    id,
    empresa_id: empresaId,
    nombre: input.nombre,
    email: input.email,
    telefono: input.telefono,
    user_id: null,
    created_at: now,
    updated_at: now,
  });

  if (error) return { id: null, error: error.message };
  return { id, error: null };
}

export async function actualizarCliente(
  id: string,
  input: ClienteInput,
): Promise<{ error: string | null }> {
  const supabase = await createClient();
  const now = Date.now();

  const { error } = await supabase
    .from('clientes')
    .update({
      nombre: input.nombre,
      email: input.email,
      telefono: input.telefono,
      updated_at: now,
    })
    .eq('id', id);

  if (error) return { error: error.message };
  return { error: null };
}

export async function eliminarCliente(id: string): Promise<{ error: string | null }> {
  const supabase = await createClient();
  const now = Date.now();

  const { error } = await supabase
    .from('clientes')
    .update({ deleted_at: now, updated_at: now })
    .eq('id', id);

  if (error) return { error: error.message };
  return { error: null };
}

// ---------- Código de acceso -------------------------------------------------

export interface CodigoAccesoResult {
  ok: boolean;
  code?: string;
  expiresAt?: number;
  error?: string;
}

/**
 * Genera un código de acceso para que el cliente canjee su rol.
 * Inserta en `codigos_vinculacion` con rol='cliente' y cliente_id.
 * Expira en 10 minutos. Reintenta hasta 5 veces ante colisión 23505.
 */
export async function generarCodigoAccesoCliente(
  clienteId: string,
): Promise<CodigoAccesoResult> {
  let empresaId: string;
  try {
    ({ empresaId } = await getEmpresaUsuario());
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Error de autenticación.' };
  }

  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return { ok: false, error: 'No hay sesión activa.' };

  // Verificar que el cliente pertenezca a la empresa del emisor (no emitir un
  // código apuntando a un cliente de otra empresa).
  const { data: cli } = await supabase
    .from('clientes')
    .select('id')
    .eq('id', clienteId)
    .eq('empresa_id', empresaId)
    .is('deleted_at', null)
    .maybeSingle();
  if (!cli) return { ok: false, error: 'Cliente no encontrado.' };

  const now = Date.now();
  const expiresAt = now + 10 * 60 * 1000;
  const MAX_INTENTOS = 5;

  for (let intento = 1; intento <= MAX_INTENTOS; intento++) {
    const code = generarCodigoNumerico();

    const { error: insertError } = await supabase.from('codigos_vinculacion').insert({
      code,
      empresa_id: empresaId,
      created_by: user.id,
      expires_at: expiresAt,
      used_at: null,
      used_by: null,
      rol: 'cliente',
      cliente_id: clienteId,
    });

    if (!insertError) return { ok: true, code, expiresAt };

    const esDuplicado =
      insertError.code === '23505' ||
      insertError.message.toLowerCase().includes('duplicate') ||
      insertError.message.toLowerCase().includes('unique');

    if (!esDuplicado || intento === MAX_INTENTOS) {
      console.error('[generarCodigoAccesoCliente] insert:', insertError.message);
      return { ok: false, error: 'No se pudo crear el código. Intenta de nuevo.' };
    }
  }

  return { ok: false, error: 'No se pudo generar un código único. Intenta de nuevo.' };
}
