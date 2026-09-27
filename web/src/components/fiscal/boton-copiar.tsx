'use client';

import { useEffect, useRef, useState } from 'react';

/**
 * Botón "Copiar" de la hoja para facturar: copia UN campo para pegarlo en el
 * facturador del SAT. 44 px de alto (se usa con el dedo en la tableta) y el
 * "Copiado" se anuncia a los lectores de pantalla sin mover el foco.
 */
export function BotonCopiar({
  valor,
  etiqueta,
  texto = 'Copiar',
  className = '',
}: {
  valor: string;
  /** Qué se copia, para el lector de pantalla ("Copiar RFC"). */
  etiqueta: string;
  texto?: string;
  className?: string;
}) {
  const [estado, setEstado] = useState<'listo' | 'copiado' | 'error'>('listo');
  const temporizador = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => () => {
    if (temporizador.current) clearTimeout(temporizador.current);
  }, []);

  async function copiar() {
    try {
      await navigator.clipboard.writeText(valor);
      setEstado('copiado');
    } catch {
      setEstado('error');
    }
    if (temporizador.current) clearTimeout(temporizador.current);
    temporizador.current = setTimeout(() => setEstado('listo'), 1800);
  }

  const vacio = valor.trim() === '';
  return (
    <button
      type="button"
      onClick={copiar}
      disabled={vacio}
      aria-label={`${texto} ${etiqueta}`}
      className={`inline-flex min-h-11 min-w-[5.5rem] shrink-0 cursor-pointer items-center justify-center gap-1 rounded-lg border border-neutral-300 bg-white px-3 text-sm font-medium text-neutral-700 transition hover:bg-neutral-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-neutral-900 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-40 ${className}`}
    >
      <span aria-hidden="true">{estado === 'copiado' ? '✓' : '⧉'}</span>
      <span>{estado === 'copiado' ? 'Copiado' : estado === 'error' ? 'No se pudo' : texto}</span>
      <span className="sr-only" role="status" aria-live="polite">
        {estado === 'copiado' ? `${etiqueta} copiado` : ''}
      </span>
    </button>
  );
}
