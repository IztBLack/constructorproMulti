import { NextResponse, type NextRequest } from 'next/server';
import { createClient } from '@/lib/supabase/server';

/** Solo se permite volver a rutas internas de esta lista. */
const DESTINOS = new Set([
  '/admin/ajustes',
  '/cliente/ajustes',
  '/nueva-contrasena',
  '/admin',
  '/cliente',
]);

/**
 * Aterrizaje de los enlaces que Supabase manda por correo.
 *
 * Los enlaces de confirmación de correo y de recuperación de contraseña traen
 * un `code` de un solo uso. Aquí se canjea por una sesión real (se escriben las
 * cookies) y se manda al usuario a donde corresponda.
 *
 * El destino se valida contra una lista cerrada. Si se aceptara cualquier valor
 * de `destino`, esta ruta sería un redirector abierto: bastaría mandar un
 * enlace con `?destino=https://sitio-falso.com` —con el dominio real de
 * ConstructorPro a la vista— para llevar a alguien a una página de phishing.
 */
export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get('code');
  const pedido = searchParams.get('destino') ?? '';
  const errorDescripcion = searchParams.get('error_description');

  const destino = DESTINOS.has(pedido) ? pedido : '/admin';

  if (errorDescripcion) {
    return NextResponse.redirect(
      `${origin}/login?error=${encodeURIComponent(errorDescripcion)}`,
    );
  }

  if (!code) {
    return NextResponse.redirect(`${origin}/login?error=enlace_invalido`);
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.exchangeCodeForSession(code);

  if (error) {
    // El enlace ya se usó o caducó. Se manda a /login con aviso en vez de
    // dejar una pantalla en blanco.
    return NextResponse.redirect(`${origin}/login?error=enlace_expirado`);
  }

  return NextResponse.redirect(`${origin}${destino}`);
}
