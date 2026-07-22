import { createClient } from '@/lib/supabase/server';
import type { Rol } from './types';

export interface UsuarioEmpresa {
  user_id: string;
  email: string;
  /** Nombre a mostrar (`user_metadata.nombre`). Null si nunca lo puso. */
  nombre: string | null;
  rol: Rol;
  created_at: number;
}

/**
 * Personas con acceso a la empresa del usuario actual.
 *
 * Va por RPC y no por consulta directa porque `usuarios_empresa` solo guarda
 * `user_id`: el correo y el nombre viven en `auth.users`, que no es legible con
 * la llave anónima. La RPC `listar_usuarios_empresa` (migración 0018) es
 * `SECURITY DEFINER`, valida por dentro que quien llama sea admin, y no acepta
 * ningún parámetro — deriva la empresa de `auth.uid()`.
 */
export async function listUsuariosEmpresa(): Promise<{
  data: UsuarioEmpresa[];
  error: string | null;
}> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc('listar_usuarios_empresa');

  if (error) {
    return { data: [], error: error.message };
  }
  return { data: (data ?? []) as UsuarioEmpresa[], error: null };
}
