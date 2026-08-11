'use client';

import { useState, useTransition, type DragEvent } from 'react';
import { useRouter } from 'next/navigation';
import { reordenarAction } from '@/lib/data/orden';
import { esInvertido, esModoPersonalizado, type OrdenModo } from '@/lib/data/orden-modos';

/**
 * Arrastrar-y-soltar filas para el ORDEN PERSONALIZADO (paridad con el
 * `ReorderableListView` del móvil).
 *
 * Usa los eventos de arrastre nativos del navegador a propósito: no requiere
 * librería (nada que cargar, nada que choque con la CSP) y funciona en las
 * tablas que ya existen. Devuelve los handlers que cada fila debe montar y el
 * índice sobre el que se soltaría, para pintar la guía.
 *
 * `invertido` (modo `personalizado_desc`): lo que se ve está al revés de lo
 * guardado, así que la lista final se persiste al derecho.
 */
export function usarArrastreOrden<T>({
  items,
  idDe,
  tabla,
  modo,
  revalidate,
  pkDe,
}: {
  items: T[];
  idDe: (item: T) => string;
  tabla: string;
  modo: OrdenModo;
  revalidate?: string;
  /** PK compuesta (ej. cuadrilla_miembro). Por defecto: [id]. */
  pkDe?: (id: string) => (string | number)[];
}) {
  const router = useRouter();
  const [guardando, start] = useTransition();
  const [origen, setOrigen] = useState<number | null>(null);
  const [sobre, setSobre] = useState<number | null>(null);

  const activo = esModoPersonalizado(modo);
  const invertido = esInvertido(modo);

  function soltarEn(destino: number) {
    const desde = origen;
    setOrigen(null);
    setSobre(null);
    if (desde === null || desde === destino || guardando) return;

    const ids = items.map(idDe);
    const [movido] = ids.splice(desde, 1);
    ids.splice(destino, 0, movido);
    const finales = invertido ? [...ids].reverse() : ids;

    start(async () => {
      await reordenarAction({
        tabla,
        pks: finales.map((id) => (pkDe ? pkDe(id) : [id])),
        revalidate,
      });
      router.refresh();
    });
  }

  /** Props que cada fila arrastrable debe recibir. */
  function propsFila(index: number) {
    if (!activo) return {};
    return {
      draggable: true,
      onDragStart: (e: DragEvent) => {
        setOrigen(index);
        e.dataTransfer.effectAllowed = 'move';
        // Firefox exige datos para iniciar el arrastre.
        e.dataTransfer.setData('text/plain', String(index));
      },
      onDragOver: (e: DragEvent) => {
        e.preventDefault();
        e.dataTransfer.dropEffect = 'move';
        if (sobre !== index) setSobre(index);
      },
      onDrop: (e: DragEvent) => {
        e.preventDefault();
        soltarEn(index);
      },
      onDragEnd: () => {
        setOrigen(null);
        setSobre(null);
      },
      className: [
        'cursor-grab active:cursor-grabbing',
        origen === index ? 'opacity-40' : '',
        sobre === index && origen !== null && origen !== index
          ? 'outline outline-2 -outline-offset-2 outline-sky-500'
          : '',
      ]
        .filter(Boolean)
        .join(' '),
    };
  }

  return { activo, invertido, guardando, propsFila };
}
