import Link from 'next/link';
import { ClienteNavLinks } from './nav-links';
import { MOCK_CLIENTE } from './_mock';

// MOCK - en la fase backend, reemplazar MOCK_CLIENTE por la sesión real del usuario.

export default function ClienteLayout({ children }: { children: React.ReactNode }) {
  const cliente = MOCK_CLIENTE;

  return (
    <div className="min-h-screen flex flex-col bg-neutral-50">
      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <header className="border-b border-neutral-200 bg-white sticky top-0 z-10">
        <div className="mx-auto max-w-5xl flex items-center justify-between gap-4 px-4 py-3 sm:px-8">
          {/* Logo + nav escritorio */}
          <div className="flex items-center gap-6">
            <Link
              href="/cliente"
              className="text-base font-semibold text-neutral-900 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-neutral-900 focus-visible:ring-offset-2 rounded"
            >
              ConstructorPro
            </Link>
            {/* Navegación escritorio */}
            <ClienteNavLinks className="hidden sm:flex items-center gap-1" />
          </div>

          {/* Nombre del cliente + botón salir */}
          <div className="flex items-center gap-3">
            <div className="hidden sm:flex items-center gap-2">
              {/* Avatar inicial */}
              <span
                className="flex h-7 w-7 items-center justify-center rounded-full bg-neutral-200 text-xs font-semibold text-neutral-700 select-none"
                aria-hidden="true"
              >
                {cliente.nombre.charAt(0)}
              </span>
              <span className="text-sm text-neutral-600">{cliente.nombre}</span>
            </div>
            <form action="/auth/signout" method="post">
              <button
                type="submit"
                className="rounded-lg border border-neutral-300 px-3 py-1.5 text-sm font-medium text-neutral-700 bg-white hover:bg-neutral-100 cursor-pointer transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-neutral-900 focus-visible:ring-offset-2"
              >
                Salir
              </button>
            </form>
          </div>
        </div>

        {/* Navegación móvil — barra inferior del header */}
        <ClienteNavLinks
          className="flex sm:hidden gap-1 overflow-x-auto border-t border-neutral-100 px-4 py-2"
          itemClassName="shrink-0"
        />
      </header>

      {/* ── Contenido ─────────────────────────────────────────────────────── */}
      <main className="mx-auto w-full max-w-5xl flex-1 px-4 py-8 sm:px-8">
        {children}
      </main>

      {/* ── Footer ────────────────────────────────────────────────────────── */}
      <footer className="border-t border-neutral-200 bg-white mt-auto">
        <div className="mx-auto max-w-5xl px-4 py-4 sm:px-8">
          <p className="text-xs text-neutral-400 text-center">
            Portal del cliente — {cliente.empresa_constructora}. Solo para uso autorizado.
          </p>
        </div>
      </footer>
    </div>
  );
}
