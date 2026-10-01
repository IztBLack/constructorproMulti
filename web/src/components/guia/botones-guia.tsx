'use client';

import type { ReactNode } from 'react';
import { Button, type ButtonSize, type ButtonVariant } from '@/components/ui';
import { useGuia } from './guia-provider';

/**
 * El "?" de la barra superior: abre la guía desde cualquier pantalla. Lleva un
 * puntito ámbar mientras la guía no se ha terminado, para que se note sin
 * estorbar.
 */
export function BotonAyuda() {
  const { abrir, avance } = useGuia();
  const pendiente = avance.total > 0 && avance.hechas < avance.total;
  return (
    <button
      type="button"
      onClick={abrir}
      data-guia="ayuda"
      title="Guía: aprende a usar la app"
      aria-label={`Abrir la guía${pendiente ? ` (llevas ${avance.hechas} de ${avance.total} tarjetas)` : ''}`}
      className="relative inline-flex h-11 w-11 shrink-0 cursor-pointer items-center justify-center rounded-lg text-neutral-500 outline-none transition-colors hover:bg-neutral-100 hover:text-neutral-900 focus-visible:ring-2 focus-visible:ring-neutral-900 focus-visible:ring-offset-2"
    >
      <svg
        aria-hidden="true"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        className="h-5 w-5"
      >
        <circle cx="12" cy="12" r="10" />
        <path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3" />
        <path d="M12 17h.01" />
      </svg>
      {pendiente && (
        <span aria-hidden="true" className="absolute right-2 top-2 h-2 w-2 rounded-full bg-amber-500" />
      )}
    </button>
  );
}

/** Botón para abrir la guía desde una pantalla (Inicio, Ajustes). */
export function AbrirGuia({
  children = 'Ver la guía',
  variant = 'secondary',
  size = 'sm',
}: {
  children?: ReactNode;
  variant?: ButtonVariant;
  size?: ButtonSize;
}) {
  const { abrir } = useGuia();
  return (
    <Button type="button" variant={variant} size={size} onClick={abrir}>
      {children}
    </Button>
  );
}
