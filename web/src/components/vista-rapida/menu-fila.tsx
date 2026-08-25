'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';

export interface AccionFila {
  etiqueta: string;
  href: string;
  /** Abre en otra pestaña (documentos que se van a imprimir o mandar). */
  nuevaPestana?: boolean;
}

/**
 * Menú de acciones de una fila: lo que hoy exige entrar a la ficha, asomado en
 * la propia lista.
 *
 * No es una vista nueva: es un menú que ya sabe sobre qué fila está, así que
 * ninguna de sus opciones necesita que elijas nada después.
 *
 * Se abre con clic y se cierra al tocar fuera o con Esc. Deliberadamente NO se
 * abre al pasar el ratón: en una lista larga, los menús que aparecen solos se
 * disparan mientras uno baja la vista, y en tableta el ratón ni existe.
 */
export function MenuFila({ etiqueta, acciones }: { etiqueta: string; acciones: AccionFila[] }) {
  const [abierto, setAbierto] = useState(false);
  const caja = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!abierto) return;

    const fuera = (e: MouseEvent) => {
      if (caja.current && !caja.current.contains(e.target as Node)) setAbierto(false);
    };
    const escape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setAbierto(false);
    };

    document.addEventListener('mousedown', fuera);
    document.addEventListener('keydown', escape);
    return () => {
      document.removeEventListener('mousedown', fuera);
      document.removeEventListener('keydown', escape);
    };
  }, [abierto]);

  return (
    <div ref={caja} className="relative inline-block text-left">
      <button
        type="button"
        aria-label={`Acciones de ${etiqueta}`}
        aria-expanded={abierto}
        aria-haspopup="menu"
        onClick={(e) => {
          // La fila entera suele ser un enlace: sin esto, abrir el menú navega.
          e.preventDefault();
          e.stopPropagation();
          setAbierto((v) => !v);
        }}
        className="inline-flex h-11 w-11 items-center justify-center rounded-lg text-neutral-500 transition hover:bg-neutral-100 hover:text-neutral-900"
      >
        ⋯
      </button>

      {abierto && (
        <div
          role="menu"
          className="absolute right-0 z-30 mt-1 w-56 overflow-hidden rounded-xl border border-neutral-200 bg-white py-1 shadow-lg motion-safe:animate-[aterrizar_.16s_ease-out]"
        >
          {acciones.map((a) => (
            <Link
              key={a.href + a.etiqueta}
              href={a.href}
              role="menuitem"
              target={a.nuevaPestana ? '_blank' : undefined}
              rel={a.nuevaPestana ? 'noopener noreferrer' : undefined}
              onClick={(e) => {
                e.stopPropagation();
                setAbierto(false);
              }}
              className="flex min-h-11 items-center px-4 text-sm text-neutral-700 transition hover:bg-neutral-50 hover:text-neutral-900"
            >
              {a.etiqueta}
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
