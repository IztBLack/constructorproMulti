'use client';

import { useEffect, useRef, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { setOrdenModoAction } from '@/lib/data/orden';
import {
  ORDEN_BASES,
  ORDEN_BASE_LABEL,
  ORDEN_DIRECCION_LABEL,
  alternar,
  baseDe,
  esInvertido,
  etiquetaModo,
  type OrdenBase,
  type OrdenModo,
} from '@/lib/data/orden-modos';

/**
 * Botón de ORDEN estilo Spotify: muestra el criterio activo y su sentido y, al
 * hacer clic, despliega los criterios. Volver a elegir el criterio ACTIVO
 * invierte el sentido (A→Z ⇄ Z→A, más nuevos ⇄ más antiguos, etc.), así que no
 * hacen falta opciones separadas para lo mismo al revés.
 *
 * El modo se guarda en `empresa_config.ui_orden` (global por empresa), así que
 * espeja lo que se elija en el móvil y viceversa.
 */
export default function OrdenModoToggle({
  listKey,
  modo,
  revalidate,
}: {
  listKey: string;
  modo: OrdenModo;
  revalidate?: string;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [abierto, setAbierto] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const caja = useRef<HTMLDivElement>(null);

  const activa = baseDe(modo);
  const invertido = esInvertido(modo);

  // Cerrar al hacer clic fuera o con Escape (comportamiento esperado de un menú).
  useEffect(() => {
    if (!abierto) return;
    function fuera(e: MouseEvent) {
      if (caja.current && !caja.current.contains(e.target as Node)) setAbierto(false);
    }
    function esc(e: KeyboardEvent) {
      if (e.key === 'Escape') setAbierto(false);
    }
    document.addEventListener('mousedown', fuera);
    document.addEventListener('keydown', esc);
    return () => {
      document.removeEventListener('mousedown', fuera);
      document.removeEventListener('keydown', esc);
    };
  }, [abierto]);

  function elegir(base: OrdenBase) {
    const nuevo = alternar(modo, base);
    setAbierto(false);
    setError(null);
    start(async () => {
      const r = await setOrdenModoAction(listKey, nuevo, revalidate);
      // Si el guardado falla (p. ej. RLS: solo admin/supervisor escriben), el
      // botón volvería al modo anterior sin decir por qué. Se muestra el error
      // en vez de dejar la impresión de que la opción "no hace nada".
      if (!r.ok) {
        setError(r.error ?? 'No se pudo guardar el orden.');
        return;
      }
      router.refresh();
    });
  }

  return (
    <div ref={caja} className="relative inline-block text-left">
      <button
        type="button"
        disabled={pending}
        aria-haspopup="menu"
        aria-expanded={abierto}
        onClick={() => setAbierto((v) => !v)}
        className="inline-flex max-w-full items-center gap-2 rounded-full border border-neutral-200 bg-white px-3 py-1.5 text-sm font-medium text-neutral-700 hover:bg-neutral-50 disabled:opacity-60"
      >
        <IconoBase base={activa} />
        {/* La etiqueta completa ("criterio · sentido") mide ~356px y no cabe en
            un teléfono de 375. En pantallas chicas se muestra solo el criterio y
            el sentido queda en el ícono ↓/↑ del menú; desde `sm` va completa. */}
        <span className="truncate">
          {pending ? (
            'Guardando…'
          ) : (
            <>
              <span className="sm:hidden">{ORDEN_BASE_LABEL[activa]}</span>
              <span className="hidden sm:inline">{etiquetaModo(modo)}</span>
            </>
          )}
        </span>
        <span aria-hidden className="shrink-0 text-neutral-400">
          {invertido ? '↑' : '↓'}
        </span>
      </button>

      {error && (
        <p role="alert" className="absolute right-0 mt-1 w-64 text-xs text-red-600">
          {error}
        </p>
      )}

      {abierto && (
        <div
          role="menu"
          className="absolute right-0 z-20 mt-1 w-72 overflow-hidden rounded-xl border border-neutral-200 bg-white py-1 shadow-lg"
        >
          {ORDEN_BASES.map((b) => {
            const esActiva = b === activa;
            const [natural, inverso] = ORDEN_DIRECCION_LABEL[b];
            // La activa anuncia a dónde llevará el siguiente clic; las demás,
            // el sentido con el que entrarían.
            const detalle = esActiva
              ? invertido
                ? inverso
                : natural
              : natural;
            return (
              <button
                key={b}
                type="button"
                role="menuitemradio"
                aria-checked={esActiva}
                title={
                  esActiva
                    ? `Tocar de nuevo para invertir (${invertido ? natural : inverso})`
                    : undefined
                }
                onClick={() => elegir(b)}
                className={`flex w-full items-center gap-2 px-3 py-2 text-left text-sm hover:bg-neutral-50 ${
                  esActiva ? 'text-blue-700' : 'text-neutral-700'
                }`}
              >
                <IconoBase base={b} />
                <span className="flex-1">
                  <span className={esActiva ? 'font-semibold' : ''}>
                    {ORDEN_BASE_LABEL[b]}
                  </span>
                  <span className="block text-xs text-neutral-500">{detalle}</span>
                </span>
                {esActiva && (
                  <span aria-hidden className="text-base">
                    {invertido ? '↑' : '↓'}
                  </span>
                )}
              </button>
            );
          })}
          <p className="border-t border-neutral-100 px-3 pt-2 pb-1 text-[11px] text-neutral-400">
            Toca la opción activa para invertir el orden.
          </p>
        </div>
      )}
    </div>
  );
}

function IconoBase({ base }: { base: OrdenBase }) {
  const simbolo =
    base === 'recientes'
      ? '🕒'
      : base === 'modificados'
        ? '✎'
        : base === 'personalizado'
          ? '⠿'
          : 'A';
  return (
    <span aria-hidden className="w-4 text-center text-xs">
      {simbolo}
    </span>
  );
}
