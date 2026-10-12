/**
 * A dónde regresar después de iniciar sesión.
 *
 * Los widgets del móvil abren páginas del panel (material de una obra, su
 * programa…). Sin sesión, el middleware manda a /login con `?next=<ruta>` y,
 * al entrar, se regresa ahí en vez de caer en el inicio.
 *
 * Solo rutas INTERNAS del panel o del portal: nada que empiece con `//` o
 * traiga esquema, que convertiría el parámetro en una redirección abierta.
 */
export function siguienteSeguro(next: string | null | undefined): string | null {
  if (!next) return null;
  if (!next.startsWith('/') || next.startsWith('//') || next.includes(String.fromCharCode(92))) return null;
  if (/[\u0000-\u001f]/.test(next)) return null;
  const zona = next.split(/[?#]/)[0];
  if (zona !== '/admin' && !zona.startsWith('/admin/') && zona !== '/cliente' && !zona.startsWith('/cliente/')) {
    return null;
  }
  return next;
}

/**
 * Elige entre el destino que corresponde al rol y la ruta pedida: la pedida
 * gana solo si cae en la MISMA zona (un cliente no regresa a /admin aunque lo
 * pida; el middleware igual lo sacaría).
 */
export function destinoTrasLogin(porRol: string, next: string | null | undefined): string {
  const pedida = siguienteSeguro(next);
  if (!pedida) return porRol;
  const zona = (r: string) => (r.startsWith('/cliente') ? 'cliente' : r.startsWith('/admin') ? 'admin' : 'otra');
  return zona(pedida) === zona(porRol) ? pedida : porRol;
}
