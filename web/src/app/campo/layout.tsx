import Link from 'next/link';
import { ToggleTema } from '@/components/tema/toggle-tema';

/**
 * Layout de la pantalla de campo.
 *
 * Deliberadamente NO consulta la sesión ni la empresa, a diferencia del layout
 * de `/admin` (que es `force-dynamic` e imprime el nombre de la empresa y del
 * usuario en el HTML). Esa es justamente la razón de que esta ruta viva fuera de
 * `/admin`: el HTML tiene que ser **igual para cualquier usuario** para que el
 * service worker pueda cachearlo sin filtrar datos de una empresa a otra.
 *
 * La autenticación no desaparece: los datos los pide el cliente con la sesión de
 * la persona y la RLS de Supabase sigue mandando. Tampoco hay redirección a
 * /login desde el middleware, y es a propósito: una redirección exige red, y
 * esta pantalla tiene que abrir sin señal.
 */
// El layout raíz ya aplica la plantilla "%s · ConstructorPro", así que aquí va
// solo el nombre de la pantalla; incluir la marca la duplicaría en la pestaña.
export const metadata = {
  title: 'Pase de lista',
};

export default function CampoLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col bg-neutral-50">
      <header className="border-b border-neutral-200 bg-white">
        <div className="mx-auto flex max-w-3xl items-center justify-between gap-4 px-4 py-3">
          <span className="text-base font-semibold text-neutral-900">Pase de lista</span>
          {/* El toggle es puramente de cliente (localStorage), así que no rompe
              la premisa de esta ruta: el HTML sigue siendo idéntico para
              cualquier usuario y el service worker lo puede cachear igual. */}
          <div className="flex items-center gap-2">
            <ToggleTema />
            <Link
              href="/admin"
              className="text-sm text-neutral-500 transition hover:text-neutral-900 hover:underline"
            >
              Panel
            </Link>
          </div>
        </div>
      </header>

      <main className="mx-auto w-full max-w-3xl flex-1 px-4 py-6">{children}</main>
    </div>
  );
}
