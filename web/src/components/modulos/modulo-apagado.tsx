import Link from 'next/link';
import { LinkButton } from '@/components/ui';
import type { Modulo } from '@/lib/modulos';

/**
 * Pantalla de "este módulo está apagado" (plan RF0.5).
 *
 * Existe para el enlace directo: un marcador guardado, un link pegado por
 * WhatsApp, la paleta de un navegador con historial. Sin esto, quien llegue a
 * una pantalla de un módulo apagado vería una página vacía o rota y pensaría
 * que se perdieron sus datos. Aquí se le dice lo contrario: están guardados.
 *
 * El admin ve el botón para prenderlo (lo lleva a Ajustes → Módulos, donde se
 * confirma); los demás roles no pueden prender módulos y se les dice a quién
 * pedírselo.
 */
export function ModuloApagado({
  modulo,
  esAdmin,
  volverHref = '/admin',
  volverTexto = 'Volver al inicio',
}: {
  modulo: Modulo;
  esAdmin: boolean;
  volverHref?: string;
  volverTexto?: string;
}) {
  return (
    <section
      aria-labelledby="modulo-apagado-titulo"
      className="mx-auto max-w-lg rounded-xl border border-neutral-200 bg-white p-6 text-center sm:p-8"
    >
      <p className="text-sm font-medium text-neutral-600">{modulo.nombre}</p>
      <h1 id="modulo-apagado-titulo" className="mt-1 text-xl font-semibold text-neutral-900">
        Este módulo está apagado
      </h1>
      <p className="mt-3 text-sm text-neutral-700">{modulo.descripcion}</p>
      <p className="mt-3 text-sm text-neutral-700">
        Si ya lo usabas, tus datos siguen guardados: al prenderlo aparece todo como lo dejaste.
      </p>

      <div className="mt-6 flex flex-col items-center gap-3 sm:flex-row sm:justify-center">
        {esAdmin ? (
          <LinkButton href="/admin/ajustes#modulos">Activarlo</LinkButton>
        ) : (
          <p className="rounded-lg bg-neutral-100 px-3 py-2 text-sm text-neutral-700">
            Para usarlo, pídeselo al administrador de tu empresa.
          </p>
        )}
        <Link
          href={volverHref}
          className="inline-flex min-h-11 items-center px-3 text-sm font-medium text-neutral-700 underline-offset-4 hover:underline"
        >
          {volverTexto}
        </Link>
      </div>
    </section>
  );
}
