import { createServerClient } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';

/// Refresca la sesión en cada request y protege /admin y /cliente.
/// Sin sesión → redirige a /login.
export async function updateSession(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value),
          );
          supabaseResponse = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options),
          );
        },
      },
    },
  );

  // IMPORTANTE: no metas lógica entre createServerClient y getUser().
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const path = request.nextUrl.pathname;
  const protegida = path.startsWith('/admin') || path.startsWith('/cliente');

  if (!user && protegida) {
    const url = request.nextUrl.clone();
    url.pathname = '/login';
    return NextResponse.redirect(url);
  }

  // Si el usuario está autenticado y accede a /admin, verificar que tenga empresa.
  // Solo aplica a /admin (no a /onboarding para evitar loops).
  // Si hay error de red o RLS, dejamos pasar — no redirigimos.
  if (user && path.startsWith('/admin')) {
    const { count, error: empresaError } = await supabase
      .from('usuarios_empresa')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', user.id);

    if (!empresaError && count === 0) {
      const url = request.nextUrl.clone();
      url.pathname = '/onboarding';
      return NextResponse.redirect(url);
    }
  }

  return supabaseResponse;
}
