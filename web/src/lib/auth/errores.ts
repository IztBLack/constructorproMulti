/**
 * Traducción de los mensajes de error de Supabase Auth.
 *
 * Vive aquí y no dentro de `/login` porque ahora hay cuatro pantallas que hablan
 * con Auth (login, ajustes de cuenta, recuperar contraseña, contraseña nueva) y
 * el usuario debe leer el mismo texto para el mismo problema en todas.
 *
 * Supabase responde en inglés y sin códigos estables, así que se compara por
 * mensaje. Si un mensaje no está en la tabla se muestra tal cual: es feo, pero
 * es preferible a tragarse el error y dejar al usuario sin pista.
 */
const ERRORES: Record<string, string> = {
  'Invalid login credentials': 'Correo o contraseña incorrectos.',
  'Email not confirmed': 'Debes confirmar tu correo antes de iniciar sesión.',
  'User already registered': 'Ya existe una cuenta con ese correo. Inicia sesión.',
  'A user with this email address has already been registered':
    'Ya existe una cuenta con ese correo.',
  'Password should be at least 6 characters':
    'La contraseña debe tener al menos 6 caracteres.',
  'New password should be different from the old password.':
    'La contraseña nueva debe ser distinta de la actual.',
  'Auth session missing!':
    'La sesión expiró. Vuelve a abrir el enlace del correo.',
  'Email address is invalid': 'El correo no tiene un formato válido.',
};

export function traducirErrorAuth(msg: string): string {
  const m = msg.toLowerCase();

  if (m.includes('captcha')) {
    return 'La verificación de seguridad falló. Recárgala e intenta de nuevo.';
  }

  // Supabase limita el envío de correos y los reintentos de login. El texto
  // exacto varía ("For security purposes, you can only request this after 47
  // seconds", "Email rate limit exceeded"), así que se detecta por patrón.
  const segundos = msg.match(/after (\d+) seconds/i);
  if (segundos) {
    return `Por seguridad, espera ${segundos[1]} segundos antes de volver a intentarlo.`;
  }
  if (m.includes('rate limit') || m.includes('too many requests')) {
    return 'Demasiados intentos. Espera unos minutos e intenta de nuevo.';
  }

  return ERRORES[msg] ?? msg;
}
