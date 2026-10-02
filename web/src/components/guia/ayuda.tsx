'use client';

import { useCallback, useEffect, useId, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { AYUDAS, type ClaveAyuda } from '@/lib/guia/ayudas';

const ANCHO = 280;
const MARGEN = 12;

/**
 * Ícono ⓘ con una explicación breve del apartado que tiene al lado.
 *
 * Es un "toggletip", no un tooltip puro: además de abrirse al pasar el cursor
 * o al enfocarlo con el teclado, se abre y cierra TOCÁNDOLO, porque en el
 * celular no hay cursor. Esc o un toque fuera lo cierran. El recuadro va en un
 * portal con posición fija para que ningún `overflow` de tablas o tarjetas lo
 * recorte, y se voltea hacia arriba si abajo no cabe.
 *
 * Es ayuda que el usuario PIDE (NN/g, "pull revelations"): nunca se abre sola.
 */
export function Ayuda({ clave, className = '' }: { clave: ClaveAyuda; className?: string }) {
  const { titulo, texto } = AYUDAS[clave];
  const id = useId();
  const botonRef = useRef<HTMLButtonElement>(null);
  const [fijo, setFijo] = useState(false); // abierto por toque/clic: no se cierra al quitar el cursor
  const [encima, setEncima] = useState(false);
  const [pos, setPos] = useState<{ top: number; left: number; ancho: number; arriba: boolean } | null>(null);
  const abierto = fijo || encima;

  const calcular = useCallback(() => {
    const b = botonRef.current?.getBoundingClientRect();
    if (!b) return;
    const ancho = Math.min(ANCHO, window.innerWidth - MARGEN * 2);
    const left = Math.min(Math.max(MARGEN, b.left + b.width / 2 - ancho / 2), window.innerWidth - ancho - MARGEN);
    const arriba = window.innerHeight - b.bottom < 160 && b.top > 160;
    setPos({ top: arriba ? b.top - 8 : b.bottom + 8, left, ancho, arriba });
  }, []);

  // Mientras está abierto: Esc y toque fuera lo cierran; el scroll lo recoloca.
  useEffect(() => {
    if (!abierto) return;
    const alTeclear = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setFijo(false);
        setEncima(false);
      }
    };
    const alTocar = (e: PointerEvent) => {
      if (!botonRef.current?.contains(e.target as Node)) setFijo(false);
    };
    window.addEventListener('keydown', alTeclear);
    window.addEventListener('pointerdown', alTocar);
    window.addEventListener('scroll', calcular, true);
    window.addEventListener('resize', calcular);
    return () => {
      window.removeEventListener('keydown', alTeclear);
      window.removeEventListener('pointerdown', alTocar);
      window.removeEventListener('scroll', calcular, true);
      window.removeEventListener('resize', calcular);
    };
  }, [abierto, calcular]);

  return (
    <>
      <button
        ref={botonRef}
        type="button"
        aria-label={`Ayuda: ${titulo}`}
        aria-expanded={abierto}
        aria-describedby={abierto ? id : undefined}
        onClick={(e) => {
          // Dentro de un enlace o una fila clicable, el ícono no debe navegar.
          e.preventDefault();
          e.stopPropagation();
          calcular();
          setFijo((f) => !f);
        }}
        onPointerEnter={(e) => {
          if (e.pointerType !== 'mouse') return;
          calcular();
          setEncima(true);
        }}
        onPointerLeave={(e) => {
          if (e.pointerType === 'mouse') setEncima(false);
        }}
        onFocus={() => {
          calcular();
          setEncima(true);
        }}
        onBlur={() => setEncima(false)}
        className={`inline-flex h-6 w-6 shrink-0 cursor-help items-center justify-center rounded-full align-middle text-neutral-500 outline-none transition-colors hover:text-neutral-800 focus-visible:ring-2 focus-visible:ring-neutral-900 print:hidden ${className}`}
      >
        <svg
          aria-hidden="true"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          className="h-4 w-4"
        >
          <circle cx="12" cy="12" r="10" />
          <path d="M12 16v-4" />
          <path d="M12 8h.01" />
        </svg>
      </button>
      {abierto &&
        pos &&
        createPortal(
          <div
            id={id}
            role="tooltip"
            style={{
              top: pos.top,
              left: pos.left,
              width: pos.ancho,
              transform: pos.arriba ? 'translateY(-100%)' : undefined,
            }}
            className="pointer-events-none fixed z-[80] rounded-lg border border-neutral-200 bg-white px-3 py-2 text-left text-sm font-normal normal-case tracking-normal text-neutral-700 shadow-lg"
          >
            <span className="mb-0.5 block font-semibold text-neutral-900">{titulo}</span>
            {texto}
          </div>,
          document.body,
        )}
    </>
  );
}
