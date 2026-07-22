'use client';

import { useTema } from './use-tema';

/**
 * Botón sol ↔ luna de la barra superior.
 *
 * Un clic alterna claro/oscuro. Volver a "Automático" se hace desde Ajustes →
 * Preferencias: se descartó ciclar los tres estados con un solo icono porque no
 * hay manera de distinguir a simple vista "oscuro fijo" de "automático que
 * resultó oscuro", y el 95% de los usos es simplemente querer el otro tema.
 *
 * DETALLE QUE IMPORTA: qué icono se ve lo decide el CSS (`dark:`), no React. El
 * servidor no conoce el tema del dispositivo, así que si el icono dependiera del
 * estado de React habría discrepancia de hidratación y un parpadeo del icono
 * equivocado en cada carga. Los dos iconos van siempre en el DOM, superpuestos, y
 * la variante CSS decide cuál tiene escala 1. Así el botón sale correcto desde el
 * primer pintado, incluso antes de que React hidrate.
 */
export function ToggleTema({ className = '' }: { className?: string }) {
  const { efectivo, alternar } = useTema();

  return (
    <button
      type="button"
      onClick={alternar}
      // Estática a propósito: una etiqueta que dependiera del tema volvería a
      // meter el problema de hidratación que el truco de CSS evita. El estado
      // actual se anuncia aparte, ya montado (ver el <span> de abajo).
      aria-label="Cambiar entre tema claro y oscuro"
      title="Cambiar tema"
      className={
        'relative inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-lg ' +
        'text-neutral-500 transition-colors outline-none cursor-pointer ' +
        'hover:bg-neutral-100 hover:text-neutral-900 ' +
        'focus-visible:ring-2 focus-visible:ring-neutral-900 focus-visible:ring-offset-2 ' +
        className
      }
    >
      {/* Sol — visible en claro */}
      <svg
        aria-hidden="true"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        className="absolute h-5 w-5 rotate-0 scale-100 transition-transform duration-300 motion-reduce:transition-none dark:-rotate-90 dark:scale-0"
      >
        <circle cx="12" cy="12" r="4" />
        <path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M6.34 17.66l-1.41 1.41M19.07 4.93l-1.41 1.41" />
      </svg>

      {/* Luna — visible en oscuro */}
      <svg
        aria-hidden="true"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        className="absolute h-5 w-5 rotate-90 scale-0 transition-transform duration-300 motion-reduce:transition-none dark:rotate-0 dark:scale-100"
      >
        <path d="M21 12.79A9 9 0 1 1 11.21 3a7 7 0 0 0 9.79 9.79Z" />
      </svg>

      {/* Estado actual para lectores de pantalla. Aquí sí se puede depender del
          tema: `useSyncExternalStore` renderiza el valor del servidor durante la
          hidratación y recién después el real, así que no hay discrepancia. */}
      <span className="sr-only">
        Tema actual: {efectivo === 'oscuro' ? 'oscuro' : 'claro'}
      </span>
    </button>
  );
}
