import type { Metadata } from 'next';
import Link from 'next/link';
import { LinkButton } from '@/components/ui';
import { BrandMark } from '@/components/marca/brand-mark';

export const metadata: Metadata = {
  title: 'Página no encontrada',
  // Un 404 no debe indexarse ni aparecer en resultados: no tiene contenido y
  // ensucia el sitio en los buscadores.
  robots: { index: false, follow: true },
};

/**
 * 404 del sitio (convención de Next: `app/not-found.tsx`).
 *
 * Antes salía la página por defecto de Next —fondo blanco, texto en inglés y la
 * marca del framework—, que en un servicio de paga se lee como un sitio
 * abandonado justo en el momento en que alguien se perdió. Aquí, además, se
 * ofrecen salidas distintas según quién llegó: constructor, cliente o alguien
 * que necesita ayuda.
 */
export default function NotFound() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-neutral-50 px-4 py-16 text-neutral-900">
      <div className="w-full max-w-lg text-center">
        <div className="flex justify-center">
          <BrandMark className="h-12 w-12" />
        </div>

        <p className="mt-8 text-sm font-semibold text-neutral-500">Error 404</p>
        <h1 className="mt-2 text-3xl font-semibold tracking-tight sm:text-4xl">
          Esta página no existe
        </h1>
        <p className="mt-4 text-lg leading-relaxed text-neutral-600">
          Puede que el enlace esté mal escrito, o que la página haya cambiado de lugar. Tu
          información está a salvo: esto no afecta nada de lo que tengas capturado.
        </p>

        <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
          <LinkButton href="/">Ir al inicio</LinkButton>
          <LinkButton href="/login" variant="secondary">
            Entrar a mi cuenta
          </LinkButton>
        </div>

        <p className="mt-8 text-sm text-neutral-600">
          ¿Llegaste aquí desde un enlace que te compartimos?{' '}
          <Link
            href="/soporte"
            className="font-medium text-neutral-900 underline underline-offset-4"
          >
            Avísanos
          </Link>{' '}
          y lo corregimos.
        </p>
      </div>
    </div>
  );
}
