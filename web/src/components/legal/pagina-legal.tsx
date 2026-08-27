import Link from 'next/link';
import type { ReactNode } from 'react';
import { BrandMark } from '@/components/marca/brand-mark';
import { AvisoBorrador } from '@/components/legal/pendiente';
import { VERSION_LEGAL } from '@/lib/legal/datos';

/**
 * Cascarón compartido de las páginas públicas de texto (`/privacidad`,
 * `/terminos`, `/soporte`).
 *
 * Reproduce el encabezado y el pie de la landing sin importarlos de
 * `app/page.tsx`: esa página es una sola pieza de ~650 líneas y extraerle el
 * layout completo era un refactor mucho más grande que este trabajo. Lo único
 * que sí se compartió es la marca (`BrandMark`), que es lo que de verdad no
 * puede quedar desincronizado.
 */
export function PaginaLegal({
  titulo,
  entradilla,
  children,
}: {
  titulo: string;
  entradilla?: string;
  children: ReactNode;
}) {
  return (
    <div className="flex min-h-screen flex-col bg-neutral-50 text-neutral-900">
      <header className="border-b border-neutral-200 bg-neutral-50/85 backdrop-blur">
        <div className="mx-auto flex h-16 max-w-3xl items-center justify-between gap-4 px-4 sm:px-6">
          <Link
            href="/"
            className="flex items-center gap-2 rounded-lg outline-none focus-visible:ring-2 focus-visible:ring-neutral-900 focus-visible:ring-offset-2"
          >
            <BrandMark />
            <span className="text-lg font-semibold tracking-tight">ConstructorPro</span>
          </Link>
          <Link
            href="/"
            className="rounded-lg text-sm text-neutral-600 outline-none transition hover:text-neutral-900 focus-visible:ring-2 focus-visible:ring-neutral-900 focus-visible:ring-offset-2"
          >
            Volver al inicio
          </Link>
        </div>
      </header>

      <main className="flex-1">
        <div className="mx-auto max-w-3xl px-4 py-12 sm:px-6 sm:py-16">
          <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">{titulo}</h1>
          {entradilla && (
            <p className="mt-4 text-lg leading-relaxed text-neutral-600">{entradilla}</p>
          )}
          <p className="mt-3 text-sm text-neutral-500">
            Versión vigente desde el {VERSION_LEGAL}.
          </p>

          <div className="mt-8">
            <AvisoBorrador />
          </div>

          <div className="mt-10 space-y-10">{children}</div>
        </div>
      </main>

      <footer className="border-t border-neutral-200 bg-white">
        <div className="mx-auto flex max-w-3xl flex-wrap items-center gap-x-6 gap-y-2 px-4 py-6 text-sm text-neutral-600 sm:px-6">
          <Link href="/privacidad" className="transition hover:text-neutral-900">
            Aviso de privacidad
          </Link>
          <Link href="/terminos" className="transition hover:text-neutral-900">
            Términos del servicio
          </Link>
          <Link href="/soporte" className="transition hover:text-neutral-900">
            Soporte
          </Link>
        </div>
      </footer>
    </div>
  );
}

/** Sección con título. Mantiene el mismo ritmo tipográfico en las tres páginas. */
export function Seccion({ titulo, children }: { titulo: string; children: ReactNode }) {
  return (
    <section className="space-y-3">
      <h2 className="text-xl font-semibold tracking-tight">{titulo}</h2>
      <div className="space-y-3 text-[15px] leading-relaxed text-neutral-700">{children}</div>
    </section>
  );
}
