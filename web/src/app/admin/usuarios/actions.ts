'use server';

import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { esRolInvitable, usaObrasAsignadas } from '@/lib/auth/roles';
import { getEmpresaUsuario } from '@/lib/data/empresa';

export interface ResultadoUsuario {
  ok: boolean;
  error?: string;
  /** Código generado, solo en `invitarUsuario`. */
  code?: string;
  expiresAt?: number;
}

/*
 * Las tres acciones delegan en RPCs `SECURITY DEFINER` de la migración 0018.
 *
 * Ninguna comprueba el rol aquí, y es a propósito: la comprobación vive DENTRO
 * de la RPC, que es la que también corre cuando la llamada no viene de esta
 * pantalla. Duplicarla en TypeScript daría la falsa sensación de que la barrera
 * está aquí, y crearía dos sitios que pueden desincronizarse. Lo que sí se hace
 * aquí es traducir la respuesta a algo que el usuario entienda.
 */

export async function invitarUsuario(formData: FormData): Promise<ResultadoUsuario> {
  const nombre = String(formData.get('nombre') ?? '').trim();
  const rol = String(formData.get('rol') ?? '');

  if (!nombre) return { ok: false, error: 'Escribe el nombre de la persona.' };
  if (!esRolInvitable(rol)) {
    return { ok: false, error: 'Elige un rol válido.' };
  }

  const supabase = await createClient();
  const { data, error } = await supabase.rpc('invitar_usuario', {
    p_nombre: nombre,
    p_rol: rol,
  });

  if (error) return { ok: false, error: error.message };
  if (!data?.ok) return { ok: false, error: data?.error ?? 'No se pudo generar la invitación.' };

  revalidatePath('/admin/usuarios');
  return { ok: true, code: data.code as string, expiresAt: Number(data.expires_at) };
}

/**
 * Registra la invitación de un SOCIO (administrador) ligada a su correo.
 *
 * A diferencia de `invitarUsuario` (código dictado a mano), aquí el canal es el
 * correo: esta acción solo crea la invitación pendiente en la base; el correo lo
 * dispara el cliente con el magic link público de Supabase Auth, y `/auth/callback`
 * la concilia por correo. Así no hace falta la llave `service_role`. La RPC
 * `invitar_socio` (0025) valida que quien invita sea admin.
 */
export async function invitarSocio(formData: FormData): Promise<ResultadoUsuario> {
  const nombre = String(formData.get('nombre') ?? '').trim();
  const email = String(formData.get('email') ?? '').trim();

  if (!nombre) return { ok: false, error: 'Escribe el nombre del socio.' };
  if (!email) return { ok: false, error: 'Escribe el correo del socio.' };

  const supabase = await createClient();
  const { data, error } = await supabase.rpc('invitar_socio', {
    p_nombre: nombre,
    p_email: email,
  });

  if (error) return { ok: false, error: error.message };
  if (!data?.ok) return { ok: false, error: data?.error ?? 'No se pudo crear la invitación.' };

  revalidatePath('/admin/usuarios');
  return { ok: true };
}

export async function cambiarRol(formData: FormData): Promise<ResultadoUsuario> {
  const userId = String(formData.get('user_id') ?? '');
  const rol = String(formData.get('rol') ?? '');

  const supabase = await createClient();
  const { data, error } = await supabase.rpc('cambiar_rol_usuario', {
    p_user_id: userId,
    p_rol: rol,
  });

  if (error) return { ok: false, error: error.message };
  if (!data?.ok) return { ok: false, error: data?.error ?? 'No se pudo cambiar el rol.' };

  revalidatePath('/admin/usuarios');
  return { ok: true };
}

export async function revocarAcceso(formData: FormData): Promise<ResultadoUsuario> {
  const userId = String(formData.get('user_id') ?? '');

  const supabase = await createClient();
  const { data, error } = await supabase.rpc('revocar_acceso_usuario', {
    p_user_id: userId,
  });

  if (error) return { ok: false, error: error.message };
  if (!data?.ok) return { ok: false, error: data?.error ?? 'No se pudo quitar el acceso.' };

  revalidatePath('/admin/usuarios');
  return { ok: true };
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Obras asignadas a un residente o colaborador (0042 `usuario_obra`).
 *
 * Recibe la lista COMPLETA de obras que debe tener y cuadra: agrega las nuevas y
 * quita (borrado lógico) las que ya no van. El registro de actividad dice así
 * exactamente qué se dio y qué se quitó. La barrera es la base: solo el admin
 * escribe `usuario_obra` (RLS) y un trigger exige que la persona sea residente o
 * colaborador de la empresa y que la obra sea de la misma empresa.
 */
export async function guardarObrasAsignadas(formData: FormData): Promise<ResultadoUsuario> {
  const userId = String(formData.get('user_id') ?? '');
  const obras = [...new Set(formData.getAll('obra_id').map(String).filter((o) => UUID.test(o)))];
  if (!UUID.test(userId)) return { ok: false, error: 'Persona no válida.' };

  let empresaId: string;
  try {
    const yo = await getEmpresaUsuario();
    if (yo.rol !== 'admin') return { ok: false, error: 'Solo un administrador asigna obras.' };
    empresaId = yo.empresaId;
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'No hay sesión activa.' };
  }

  const supabase = await createClient();
  const { data: mem, error: memError } = await supabase
    .from('usuarios_empresa')
    .select('rol')
    .eq('user_id', userId)
    .eq('empresa_id', empresaId)
    .maybeSingle();
  if (memError) return { ok: false, error: memError.message };
  if (!mem) return { ok: false, error: 'Esa persona no pertenece a tu empresa.' };
  if (!usaObrasAsignadas(mem.rol as string)) {
    return { ok: false, error: 'Solo se asignan obras a residentes y colaboradores.' };
  }

  const { data: actuales, error: leerError } = await supabase
    .from('usuario_obra')
    .select('id, obra_id')
    .eq('user_id', userId)
    .eq('empresa_id', empresaId)
    .is('deleted_at', null);
  if (leerError) return { ok: false, error: leerError.message };

  const quiero = new Set(obras);
  const tengo = new Map((actuales ?? []).map((a) => [a.obra_id as string, a.id as string]));
  const ahora = Date.now();

  const quitar = [...tengo].filter(([obra]) => !quiero.has(obra)).map(([, id]) => id);
  if (quitar.length > 0) {
    const { error } = await supabase
      .from('usuario_obra')
      .update({ deleted_at: ahora, updated_at: ahora })
      .in('id', quitar);
    if (error) return { ok: false, error: error.message };
  }

  const nuevas = obras.filter((o) => !tengo.has(o));
  if (nuevas.length > 0) {
    const { error } = await supabase.from('usuario_obra').insert(
      nuevas.map((obra) => ({
        empresa_id: empresaId,
        user_id: userId,
        obra_id: obra,
        desde: ahora,
        created_at: ahora,
        updated_at: ahora,
      })),
    );
    if (error) return { ok: false, error: error.message };
  }

  revalidatePath('/admin/usuarios');
  return { ok: true };
}
