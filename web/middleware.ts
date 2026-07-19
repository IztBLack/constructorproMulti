import { type NextRequest } from 'next/server';
import { updateSession } from '@/lib/supabase/middleware';

export async function middleware(request: NextRequest) {
  return await updateSession(request);
}

export const config = {
  matcher: [
    // Todo menos estáticos, imágenes y los archivos de la PWA.
    //
    // `sw.js`, el manifest y los íconos se excluyen a propósito: no son rutas
    // protegidas, pero sin excluirlos cada revalidación del service worker
    // dispara un `getUser()` contra Supabase. Es una llamada de red inútil
    // justo en el camino del arranque offline.
    '/((?!_next/static|_next/image|favicon.ico|sw\\.js|manifest\\.webmanifest|icons/|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
};
