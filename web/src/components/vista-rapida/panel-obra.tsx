'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { formatCurrency } from '@/lib/data/format';
import { resumenObra, type ResumenObra } from './acciones';

/**
 * VISTA RÁPIDA de una obra: sus números sin salir de la lista.
 *
 * El punto es no perder el sitio. Antes, comparar el saldo de tres obras
 * costaba entrar, volver, entrar, volver — y cada vuelta te devolvía al
 * principio de la lista. Aquí la lista se queda donde está.
 *
 * ES SOLO LECTURA, a propósito. En cuanto un panel deja editar hay que decidir
 * qué pasa si editas ahí y en la vista principal a la vez; el panel ofrece
 * "Abrir la obra" y deja la edición donde siempre estuvo.
 */
export function PanelObra({
  obraId,
  obraNombre,
  onCerrar,
}: {
  obraId: string;
  obraNombre: string;
  onCerrar: () => void;
}) {
  const [datos, setDatos] = useState<ResumenObra | null>(null);

  // El padre monta este panel con `key={obraId}`, así que al cambiar de obra se
  // remonta y el estado nace en `null`. Por eso aquí no hay que reiniciarlo a
  // mano: un `setDatos(null)` síncrono dentro del efecto es justo lo que
  // `react-hooks/set-state-in-effect` señala, y con razón — provoca un render
  // de más en cada cambio.
  useEffect(() => {
    let vivo = true;
    void resumenObra(obraId).then((r) => {
      if (vivo) setDatos(r);
    });
    return () => {
      vivo = false;
    };
  }, [obraId]);

  // Esc cierra: es lo que espera cualquiera con un panel abierto, y evita tener
  // que buscar la ✕ con el ratón.
  useEffect(() => {
    const alTeclear = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onCerrar();
    };
    window.addEventListener('keydown', alTeclear);
    return () => window.removeEventListener('keydown', alTeclear);
  }, [onCerrar]);

  return (
    <aside
      aria-label={`Vista rápida de ${obraNombre}`}
      className="w-full shrink-0 rounded-xl border border-neutral-200 bg-white p-4 lg:w-80 motion-safe:animate-[aterrizar_.24s_ease-out]"
    >
      <div className="mb-3 flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="truncate font-semibold text-neutral-900">{obraNombre}</p>
          <p className="text-xs text-neutral-500">Vista rápida</p>
        </div>
        <button
          type="button"
          onClick={onCerrar}
          aria-label="Cerrar vista rápida"
          className="-mr-1 -mt-1 inline-flex h-9 w-9 items-center justify-center rounded-lg text-neutral-500 transition hover:bg-neutral-100"
        >
          ✕
        </button>
      </div>

      {datos === null ? (
        // Esqueleto con la forma de lo que llega, no un girador: así el panel no
        // cambia de alto cuando entran los números.
        <div className="space-y-3" role="status" aria-label="Cargando">
          {[70, 55, 62, 48].map((w, i) => (
            <div
              key={i}
              style={{ width: `${w}%` }}
              className="h-4 animate-pulse rounded bg-neutral-200 motion-reduce:animate-none"
            />
          ))}
        </div>
      ) : !datos.ok ? (
        <p className="text-sm text-red-700">{datos.error ?? 'No se pudo cargar.'}</p>
      ) : (
        <>
          <dl className="space-y-1 text-sm">
            <Fila etiqueta="Personas asignadas" valor={String(datos.personas ?? 0)} />
            <Fila etiqueta="Costo total" valor={formatCurrency(datos.costoTotal ?? 0)} />
            <Fila
              etiqueta={`Recibido (${datos.pagadoPct ?? 0}%)`}
              valor={formatCurrency(datos.recibido ?? 0)}
              tono="verde"
            />
            <Fila
              etiqueta="Pendiente"
              valor={formatCurrency(datos.pendiente ?? 0)}
              tono={(datos.pendiente ?? 0) > 0 ? 'rojo' : 'verde'}
              fuerte
            />
            {(datos.notas ?? 0) > 0 && (
              <Fila etiqueta="Notas de trato" valor={String(datos.notas)} />
            )}
          </dl>

          <div className="mt-4 flex flex-col gap-2">
            <Link
              href={`/admin/obras/${obraId}`}
              className="inline-flex min-h-11 items-center justify-center rounded-lg bg-neutral-900 px-4 text-sm font-medium text-white transition hover:bg-neutral-700"
            >
              Abrir la obra
            </Link>
            <Link
              href={`/admin/obras/${obraId}/asistencia`}
              className="inline-flex min-h-11 items-center justify-center rounded-lg border border-neutral-300 px-4 text-sm font-medium text-neutral-700 transition hover:bg-neutral-50"
            >
              Ir a la asistencia
            </Link>
          </div>
        </>
      )}
    </aside>
  );
}

function Fila({
  etiqueta,
  valor,
  tono,
  fuerte,
}: {
  etiqueta: string;
  valor: string;
  tono?: 'verde' | 'rojo';
  fuerte?: boolean;
}) {
  const color =
    tono === 'verde' ? 'text-green-700' : tono === 'rojo' ? 'text-red-700' : 'text-neutral-900';
  return (
    <div className="flex items-baseline justify-between gap-3 border-b border-neutral-100 py-1.5 last:border-0">
      <dt className="text-neutral-600">{etiqueta}</dt>
      <dd className={`tabular-nums ${color} ${fuerte ? 'font-semibold' : 'font-medium'}`}>
        {valor}
      </dd>
    </div>
  );
}
