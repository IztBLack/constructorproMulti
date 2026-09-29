'use client';

import { useState, useTransition } from 'react';
import { LinkButton } from '@/components/ui';
import { descartarSiguientePaso } from '@/lib/auth/modulos-actions';
import type { SiguientePaso } from '@/lib/modulos';

/**
 * Tarjeta "Siguiente paso" del inicio (plan §4.3): la primera cosa útil según
 * cómo trabaja la empresa, en vez de un tablero vacío.
 *
 * Se descarta PARA SIEMPRE y se recuerda en `empresa_config.perfil` (no en el
 * navegador): quien la cerró en la computadora no la vuelve a ver en el
 * celular. Por eso solo se le muestra al admin, que es quien puede escribir el
 * perfil (policy de 0018).
 */
export function TarjetaSiguientePaso({ paso }: { paso: SiguientePaso }) {
  const [oculta, setOculta] = useState(false);
  const [pendiente, startTransition] = useTransition();

  if (oculta) return null;

  return (
    <section
      aria-labelledby="siguiente-paso-titulo"
      className="flex flex-col gap-4 rounded-xl border border-neutral-900/15 bg-white p-5 sm:flex-row sm:items-center sm:justify-between"
    >
      <div className="min-w-0">
        <p className="text-xs font-semibold uppercase tracking-wide text-neutral-600">
          Siguiente paso
        </p>
        <h2 id="siguiente-paso-titulo" className="mt-1 text-base font-semibold text-neutral-900">
          {paso.titulo}
        </h2>
        <p className="mt-1 text-sm text-neutral-700">{paso.descripcion}</p>
      </div>
      <div className="flex shrink-0 flex-wrap items-center gap-2">
        <LinkButton href={paso.href}>{paso.boton}</LinkButton>
        <button
          type="button"
          disabled={pendiente}
          onClick={() => {
            // Se oculta al instante; si el guardado fallara, a lo más vuelve a
            // salir en la próxima visita. No vale la pena interrumpir por eso.
            setOculta(true);
            startTransition(async () => {
              await descartarSiguientePaso();
            });
          }}
          className="inline-flex min-h-11 cursor-pointer items-center rounded-lg px-3 text-sm font-medium text-neutral-700 hover:bg-neutral-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-neutral-900"
        >
          Ya no mostrar
        </button>
      </div>
    </section>
  );
}
