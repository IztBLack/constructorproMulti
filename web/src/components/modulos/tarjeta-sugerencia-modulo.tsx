'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { descartarSugerenciaModulo, prenderModuloSugerido } from '@/lib/auth/modulos-actions';
import type { SugerenciaModulo } from '@/lib/modulos';

/**
 * Sugerencia de módulo por uso (plan §4.3): "¿Quieres controlar tu material?".
 *
 * Solo la ve el admin (es quien prende módulos y escribe el perfil). "No me
 * interesa" la descarta PARA SIEMPRE en `perfil.sugerencias_descartadas`, no en
 * el navegador, igual que la tarjeta "Siguiente paso" (F0-11).
 */
export function TarjetaSugerenciaModulo({ sugerencia }: { sugerencia: SugerenciaModulo }) {
  const router = useRouter();
  const [oculta, setOculta] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pendiente, startTransition] = useTransition();

  if (oculta) return null;

  return (
    <section
      aria-labelledby="sugerencia-modulo-titulo"
      className="flex flex-col gap-4 rounded-xl border border-blue-200 bg-blue-50/60 p-5 sm:flex-row sm:items-center sm:justify-between"
    >
      <div className="min-w-0">
        <p className="text-xs font-semibold uppercase tracking-wide text-blue-800">Sugerencia</p>
        <h2 id="sugerencia-modulo-titulo" className="mt-1 text-base font-semibold text-neutral-900">
          {sugerencia.titulo}
        </h2>
        <p className="mt-1 text-sm text-neutral-700">{sugerencia.descripcion}</p>
        {error && (
          <p role="alert" className="mt-2 text-sm text-red-700">
            {error}
          </p>
        )}
      </div>
      <div className="flex shrink-0 flex-wrap items-center gap-2">
        <button
          type="button"
          disabled={pendiente}
          onClick={() =>
            startTransition(async () => {
              setError(null);
              const r = await prenderModuloSugerido(sugerencia.clave);
              if (!r.ok) {
                setError(r.error ?? 'No se pudo prender.');
                return;
              }
              setOculta(true);
              router.push('/admin/compras');
            })
          }
          className="inline-flex min-h-11 cursor-pointer items-center rounded-lg bg-neutral-900 px-4 text-sm font-medium text-white hover:bg-neutral-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-neutral-900 focus-visible:ring-offset-2 disabled:opacity-60"
        >
          {pendiente ? 'Prendiendo…' : 'Prender Compras'}
        </button>
        <button
          type="button"
          disabled={pendiente}
          onClick={() => {
            setOculta(true);
            startTransition(async () => {
              await descartarSugerenciaModulo(sugerencia.clave);
            });
          }}
          className="inline-flex min-h-11 cursor-pointer items-center rounded-lg px-3 text-sm font-medium text-neutral-700 hover:bg-neutral-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-neutral-900"
        >
          No me interesa
        </button>
      </div>
    </section>
  );
}
