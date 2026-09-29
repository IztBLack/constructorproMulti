'use client';

import type { InputHTMLAttributes } from 'react';

/**
 * Interruptor de prendido/apagado.
 *
 * Es un `<input type="checkbox" role="switch">` REAL, no un div con clic: así
 * funciona con teclado (espacio), lo anuncia el lector de pantalla como
 * "interruptor, activado" y participa en formularios sin trabajo extra.
 *
 * Contraste: la pista apagada lleva borde `neutral-500` (4.7:1 sobre blanco),
 * porque un control de interfaz necesita 3:1 contra su fondo (WCAG 1.4.11) y el
 * gris clarito típico de los switches no llega. El estado además se dice con
 * palabras al lado ("Prendido"/"Apagado"), no solo con color o posición.
 *
 * El área táctil mide 44px de alto aunque la pista se vea más chica.
 */
export function Interruptor({
  className = '',
  ...rest
}: Omit<InputHTMLAttributes<HTMLInputElement>, 'type' | 'role'>) {
  return (
    <span className={`relative inline-flex h-11 w-12 shrink-0 items-center justify-center ${className}`}>
      <input type="checkbox" role="switch" className="peer absolute inset-0 z-10 h-full w-full cursor-pointer opacity-0 disabled:cursor-not-allowed" {...rest} />
      <span
        aria-hidden="true"
        className="h-6 w-11 rounded-full border-2 border-neutral-500 bg-white transition-colors peer-checked:border-neutral-900 peer-checked:bg-neutral-900 peer-focus-visible:ring-2 peer-focus-visible:ring-neutral-900 peer-focus-visible:ring-offset-2 peer-disabled:opacity-50 motion-reduce:transition-none"
      />
      <span
        aria-hidden="true"
        className="pointer-events-none absolute left-[7px] h-4 w-4 rounded-full bg-neutral-500 transition-transform peer-checked:translate-x-[18px] peer-checked:bg-white peer-disabled:opacity-50 motion-reduce:transition-none"
      />
    </span>
  );
}
