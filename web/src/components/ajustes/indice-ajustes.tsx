'use client';

import { useEffect, useState } from 'react';

/**
 * Índice lateral de Ajustes, con resaltado de la sección visible.
 *
 * POR QUÉ: la página crece con el rol. Un cliente ve dos grupos y no necesita
 * índice; un admin ve cinco y termina desplazándose a ciegas. El índice da la
 * orientación que en una pantalla larga se pierde ("dónde estoy, qué más hay").
 *
 * Solo aparece en pantallas grandes y a partir de 3 grupos: en móvil robaría el
 * espacio que necesita el contenido, y con dos secciones sobra con desplazarse.
 *
 * El resaltado usa IntersectionObserver en vez de escuchar el scroll: no corre
 * en cada píxel desplazado, así que no compite con el hilo principal
 * (`debounce-throttle`, `main-thread-budget`).
 */
export function IndiceAjustes({ grupos }: { grupos: { id: string; titulo: string }[] }) {
  const [activo, setActivo] = useState<string | null>(grupos[0]?.id ?? null);

  useEffect(() => {
    if (grupos.length < 3) return;

    const observador = new IntersectionObserver(
      (entradas) => {
        // Se toma la sección visible más alta, no la última que disparó: al
        // desplazarse rápido pueden entrar varias a la vez y el resaltado
        // saltaría de forma errática.
        const visibles = entradas
          .filter((e) => e.isIntersecting)
          .sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top);
        if (visibles[0]) setActivo(visibles[0].target.id);
      },
      // La banda superior de la pantalla es la que manda: es donde el ojo lee.
      { rootMargin: '-80px 0px -60% 0px', threshold: 0 },
    );

    for (const g of grupos) {
      const el = document.getElementById(g.id);
      if (el) observador.observe(el);
    }
    return () => observador.disconnect();
  }, [grupos]);

  if (grupos.length < 3) return null;

  return (
    <nav aria-label="Secciones de ajustes" className="hidden lg:block">
      <ul className="sticky top-24 space-y-1 border-l border-neutral-200">
        {grupos.map((g) => {
          const esActivo = activo === g.id;
          return (
            <li key={g.id}>
              <a
                href={`#${g.id}`}
                aria-current={esActivo ? 'true' : undefined}
                className={
                  '-ml-px block border-l-2 py-1.5 pl-4 text-sm transition-colors ' +
                  (esActivo
                    ? 'border-neutral-900 font-medium text-neutral-900'
                    : 'border-transparent text-neutral-500 hover:border-neutral-300 hover:text-neutral-900')
                }
              >
                {g.titulo}
              </a>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
