import type { User } from '@supabase/supabase-js';

/// Nombre a mostrar del usuario autenticado. Prefiere el nickname guardado en
/// `user_metadata.nombre` (lo pone el admin al crear/editar la cuenta); cae al
/// email y, en último caso, a un genérico. Función pura → segura en cliente.
export function nombreUsuario(user: Pick<User, 'user_metadata' | 'email'>): string {
  const meta = user.user_metadata as { nombre?: string } | undefined;
  const nick = meta?.nombre?.trim();
  return nick || user.email || 'Usuario';
}
