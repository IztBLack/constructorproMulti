'use client';

import { useEffect, useRef, useState } from 'react';
import { usePathname } from 'next/navigation';
import { Button } from '@/components/ui';
import { devolverFoco, useGuia } from './guia-provider';

/** Atributo que pinta el resaltado (estilo en globals.css). */
const RESALTADO = 'data-guia-resaltado';

/** El primero VISIBLE: la barra existe dos veces (escritorio y celular) y una está oculta. */
function buscarVisible(ancla: string): HTMLElement | null {
  const todos = document.querySelectorAll<HTMLElement>(`[data-guia="${CSS.escape(ancla)}"]`);
  for (const el of todos) {
    if (el.getClientRects().length > 0) return el;
  }
  return null;
}

/**
 * Lo que queda en pantalla después de "Llévame ahí": los pasos de la tarjeta
 * en un panel abajo, y el botón o la sección importante resaltada en la
 * pantalla REAL. Aquí lo que el usuario haga sí es de verdad (es su cuenta), por
 * eso el panel solo explica: no toca nada.
 */
export function CoachGuia() {
  const { coach, terminarCoach, abrir } = useGuia();
  const pathname = usePathname();
  // Se guarda QUÉ "Llévame ahí" se minimizó: uno nuevo sale abierto.
  const [minimizadoEn, setMinimizadoEn] = useState<number | null>(null);
  const tituloRef = useRef<HTMLHeadingElement>(null);
  const destino = coach?.tarjeta.destino;
  const enDestino = !!destino && pathname === destino.href;
  const minimizado = !!coach && minimizadoEn === coach.t;

  // Mientras navega, la ruta sigue siendo la de origen. Si aparece una que no
  // es ni el origen ni el destino (se fue a otro lado, o el middleware lo
  // redirigió), el recorrido terminó.
  useEffect(() => {
    if (coach && !enDestino && pathname !== coach.desde) terminarCoach();
  }, [coach, enDestino, pathname, terminarCoach]);

  // Al llegar, el foco pasa al panel: quien usa teclado o lector de pantalla
  // sabe que hay pasos esperándolo (el botón que tocó ya no existe).
  const llegada = enDestino ? coach?.t : undefined;
  useEffect(() => {
    if (llegada !== undefined) tituloRef.current?.focus();
  }, [llegada]);

  // Resaltar el ancla. La pantalla se pinta del servidor y puede tardar: se
  // reintenta unos segundos y se limpia al salir.
  const ancla = destino?.ancla;
  useEffect(() => {
    if (!enDestino || !ancla) return;
    let el: HTMLElement | null = null;
    let intentos = 0;
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const id = window.setInterval(() => {
      intentos += 1;
      el = buscarVisible(ancla);
      if (el) {
        el.setAttribute(RESALTADO, '');
        // Arriba y no al centro: abajo está el panel y lo taparía.
        el.scrollIntoView({ block: 'start', behavior: reduce ? 'auto' : 'smooth' });
        window.clearInterval(id);
      } else if (intentos >= 20) {
        window.clearInterval(id);
      }
    }, 150);
    return () => {
      window.clearInterval(id);
      el?.removeAttribute(RESALTADO);
    };
  }, [enDestino, ancla]);

  if (!coach || !enDestino) return null;

  return (
    <aside
      aria-labelledby="guia-coach-titulo"
      className="fixed inset-x-3 bottom-3 z-40 rounded-2xl border border-neutral-200 bg-white p-4 shadow-xl sm:inset-x-auto sm:bottom-6 sm:right-6 sm:w-96 print:hidden motion-safe:animate-[aterrizar_250ms_ease-out]"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs font-semibold uppercase tracking-wide text-amber-700">Guía · Estás aquí</p>
          <h2 id="guia-coach-titulo" ref={tituloRef} tabIndex={-1} className="text-sm font-semibold text-neutral-900 outline-none">
            {coach.tarjeta.titulo}
          </h2>
        </div>
        <button
          type="button"
          onClick={() => setMinimizadoEn(minimizado ? null : coach.t)}
          aria-expanded={!minimizado}
          aria-controls="guia-coach-pasos"
          className="min-h-11 shrink-0 cursor-pointer rounded-lg px-2 text-xs font-medium text-neutral-600 outline-none hover:bg-neutral-100 focus-visible:ring-2 focus-visible:ring-neutral-900"
        >
          {minimizado ? 'Ver pasos' : 'Ocultar'}
        </button>
      </div>

      {!minimizado && (
        <div id="guia-coach-pasos">
          {/* Más bajo en el celular: el panel no debe tapar lo que señala. */}
          <ol className="mt-3 max-h-[25dvh] space-y-1.5 overflow-y-auto sm:max-h-[40dvh]">
            {coach.tarjeta.pasos.map((p, i) => (
              <li key={i} className="flex gap-2 text-sm text-neutral-800">
                <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-neutral-900 text-xs font-semibold text-white">
                  {i + 1}
                </span>
                <span>{p}</span>
              </li>
            ))}
          </ol>
          {ancla && (
            <p className="mt-2 text-xs text-neutral-600">
              Lo que está marcado con un contorno amarillo es por donde empiezas.
            </p>
          )}
          <p className="mt-2 rounded-lg bg-blue-50 px-2.5 py-1.5 text-xs text-blue-700">
            Esta pantalla es la real: lo que captures aquí sí se guarda en tu cuenta.
          </p>
        </div>
      )}

      <div className="mt-3 flex flex-wrap gap-2">
        <Button
          size="sm"
          variant="secondary"
          onClick={() => {
            terminarCoach();
            abrir();
          }}
        >
          ← Volver a la guía
        </Button>
        <Button
          size="sm"
          variant="ghost"
          onClick={() => {
            terminarCoach();
            devolverFoco();
          }}
        >
          Cerrar
        </Button>
      </div>
    </aside>
  );
}
