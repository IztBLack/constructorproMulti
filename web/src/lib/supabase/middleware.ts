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

  // Ruteo por rol en las zonas protegidas. Si hay error de red o RLS, dejamos
  // pasar — no redirigimos.
  //   /admin:   sin membresía → /onboarding; solo 'cliente' → /cliente; staff → OK.
  //   /cliente: staff (cualquier rol ≠ 'cliente') NO pertenece al portal del
  //             cliente → /admin. Un staff en /cliente vería, vía la RLS de
  //             staff, TODAS las obras/datos de la empresa (no solo los de un
  //             cliente), así que se le saca del portal.
  if (user && (path.startsWith('/admin') || path.startsWith('/cliente'))) {
    const { data: membresias, error: empresaError } = await supabase
      .from('usuarios_empresa')
      .select('rol')
      .eq('user_id', user.id);

    if (!empresaError) {
      const roles = (membresias ?? []).map((m) => m.rol as string);
      const esStaff = roles.some((r) => r !== 'cliente');

      if (path.startsWith('/admin')) {
        if (roles.length === 0) {
          const url = request.nextUrl.clone();
          url.pathname = '/onboarding';
          return NextResponse.redirect(url);
        }
        if (!esStaff) {
          const url = request.nextUrl.clone();
          url.pathname = '/cliente';
          return NextResponse.redirect(url);
        }
      } else if (esStaff) {
        // En /cliente y es staff → panel de oficina.
        const url = request.nextUrl.clone();
        url.pathname = '/admin';
        return NextResponse.redirect(url);
      }
    }
  }

  return supabaseResponse;
}
