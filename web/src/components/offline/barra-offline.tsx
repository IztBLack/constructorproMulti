'use client';

import { useSyncExternalStore } from 'react';
import { Button } from '@/components/ui';
import type { EstadoOffline } from '@/lib/offline/cola-asistencia';

/**
 * ¿Corre dentro de la app instalada (pantalla de inicio) o en una pestaña?
 *
 * Se lee con `useSyncExternalStore` en vez de `useEffect` + `setState`: es
 * estado externo del navegador, y así React lo resuelve en la hidratación sin
 * un render en cascada. El valor del servidor es `false` porque allá no existe
 * el concepto; el cliente lo corrige al hidratar.
 */
const noSuscribir = () => () => {};

function leerInstalada(): boolean {
  return (
    window.matchMedia?.('(display-mode: standalone)').matches ||
    (window.navigator as Navigator & { standalone?: boolean }).standalone === true
  );
}

/**
 * Estado visible de la cola de captura offline.
 *
 * Existe porque una cola silenciosa es peor que no tener cola: quien pasa lista
 * en obra tiene que poder distinguir "ya quedó guardado" de "está en este
 * teléfono esperando señal". Sin esta barra, la captura offline es una promesa
 * que el usuario no puede verificar.
 */
export default function BarraOffline({
  estado,
  onReintentar,
}: {
  estado: EstadoOffline;
  onReintentar: () => void;
}) {
  const instalada = useSyncExternalStore(noSuscribir, leerInstalada, () => true);

  const { pendientes, enviando, enLinea, ultimoError } = estado;

  // Todo enviado y con señal: no hay nada que reportar.
  if (pendientes === 0 && enLinea) return null;

  const tono = ultimoError
    ? 'border-red-200 bg-red-50 text-red-800'
    : !enLinea
      ? 'border-amber-200 bg-amber-50 text-amber-900'
      : 'border-neutral-200 bg-neutral-50 text-neutral-700';

  return (
    <div className={`rounded-lg border px-3 py-2 text-sm ${tono}`}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span>
          {ultimoError
            ? `${pendientes} marca(s) no se pudieron guardar`
            : enviando
              ? `Enviando ${pendientes} marca(s)…`
              : !enLinea
                ? pendientes > 0
                  ? `Sin conexión · ${pendientes} marca(s) guardada(s) en este dispositivo`
                  : 'Sin conexión · lo que marques se envía al recuperar la señal'
                : `${pendientes} marca(s) por enviar`}
        </span>
        {pendientes > 0 && !enviando && (
          <Button variant="secondary" size="sm" onClick={onReintentar}>
            Reintentar
          </Button>
        )}
      </div>

      {ultimoError && (
        <p className="mt-1 text-xs opacity-80">
          {ultimoError} — no se descartó nada; corrige el problema y toca Reintentar.
        </p>
      )}

      {/* Guarda de instalación: el almacenamiento está particionado por
          navegador y una pestaña suelta de Safari se purga tras ~7 días sin uso.
          Con marcas pendientes, eso puede significar perderlas. */}
      {pendientes > 0 && !instalada && (
        <p className="mt-1 text-xs opacity-80">
          Estás en el navegador, no en la app instalada. Estas marcas viven solo en
          este navegador: no cierres la pestaña hasta que se envíen.
        </p>
      )}
    </div>
  );
}
