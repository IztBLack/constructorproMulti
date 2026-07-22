import { createClient } from '@/lib/supabase/server';
import type { Rol } from './types';

export interface EmpresaUsuario {
  empresaId: string;
  rol: Rol;
}

/// Devuelve la empresa y rol del usuario autenticado actual, leyendo
/// `usuarios_empresa`. Lanza error si no hay usuario o no tiene empresa.
/// Úsalo en Server Actions antes de escribir (empresa_id es obligatorio por RLS).
export async function getEmpresaUsuario(): Promise<EmpresaUsuario> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    throw new Error('No hay sesión activa.');
  }

  // El `order` no es cosmético. Con `limit(1)` a secas, si una persona
  // pertenece a dos empresas (es personal de una y cliente de otra, algo
  // perfectamente posible), Postgres devuelve una fila ARBITRARIA que puede
  // cambiar entre peticiones: la pantalla mostraría un rol distinto según el
  // momento. No es explotable —RLS rechaza igual lo que no corresponda al rol
  // real— pero es la clase de indeterminismo del que salen los bugs de permisos
  // en cuanto alguien añada una comprobación de rol en TypeScript.
  // Se ordena por antigüedad: la primera empresa a la que se unió.
  const { data, error } = await supabase
    .from('usuarios_empresa')
    .select('empresa_id, rol')
    .eq('user_id', user.id)
    .order('created_at', { ascending: true })
    .limit(1)
    .maybeSingle();

  if (error) {
    throw new Error(`No se pudo obtener la empresa del usuario: ${error.message}`);
  }

  if (!data) {
    throw new Error('El usuario no tiene una empresa asignada.');
  }

  return { empresaId: data.empresa_id as string, rol: data.rol as Rol };
}

/// Nombre de la empresa del usuario actual, para mostrar como marca en la UI
/// (en vez de un literal "ConstructorPro"). No lanza: devuelve null si no hay
/// sesión o empresa. Lectura acotada por RLS a las empresas del usuario.
export async function getNombreEmpresa(): Promise<string | null> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data: mem } = await supabase
    .from('usuarios_empresa')
    .select('empresa_id')
    .eq('user_id', user.id)
    .limit(1)
    .maybeSingle();
  if (!mem) return null;

  const { data: emp } = await supabase
    .from('empresas')
    .select('nombre')
    .eq('id', mem.empresa_id as string)
    .maybeSingle();

  const nombre = (emp?.nombre as string | undefined)?.trim();
  return nombre && nombre.length > 0 ? nombre : null;
}
