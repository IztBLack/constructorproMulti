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

  const { data, error } = await supabase
    .from('usuarios_empresa')
    .select('empresa_id, rol')
    .eq('user_id', user.id)
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
