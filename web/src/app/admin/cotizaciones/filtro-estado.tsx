'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import type { Cotizacion, EstadoCotizacion } from '@/lib/data/types';
import { formatDate } from '@/lib/data/format';

const ESTADOS: EstadoCotizacion[] = ['BORRADOR', 'ENVIADA', 'ACEPTADA', 'RECHAZADA', 'CONVERTIDA'];

const ESTADO_LABEL: Record<EstadoCotizacion, string> = {
  BORRADOR: 'Borrador',
  ENVIADA: 'Enviada',
  ACEPTADA: 'Aceptada',
  RECHAZADA: 'Rechazada',
  CONVERTIDA: 'Convertida',
};

const ESTADO_COLOR: Record<EstadoCotizacion, string> = {
  BORRADOR: 'bg-neutral-100 text-neutral-600',
  ENVIADA: 'bg-blue-100 text-blue-700',
  ACEPTADA: 'bg-green-100 text-green-700',
  RECHAZADA: 'bg-red-100 text-red-600',
  CONVERTIDA: 'bg-purple-100 text-purple-700',
};

export default function FiltroEstadoCotizaciones({ cotizaciones }: { cotizaciones: Cotizacion[] }) {
  const router = useRouter();
  const [estado, setEstado] = useState<EstadoCotizacion | 'TODOS'>('TODOS');

  const filtradas = useMemo(
    () => (estado === 'TODOS' ? cotizaciones : cotizaciones.filter((c) => c.estado === estado)),
    [cotizaciones, estado],
  );

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2">
        <button
          onClick={() => setEstado('TODOS')}
          className={`rounded-full px-3 py-1.5 text-sm font-medium ${
            estado === 'TODOS' ? 'bg-neutral-900 text-white' : 'bg-neutral-100 text-neutral-600 hover:bg-neutral-200'
          }`}
        >
          Todos
        </button>
        {ESTADOS.map((e) => (
          <button
            key={e}
            onClick={() => setEstado(e)}
            className={`rounded-full px-3 py-1.5 text-sm font-medium ${
              estado === e ? 'bg-neutral-900 text-white' : 'bg-neutral-100 text-neutral-600 hover:bg-neutral-200'
            }`}
          >
            {ESTADO_LABEL[e]}
          </button>
        ))}
      </div>

      {filtradas.length === 0 ? (
        <p className="rounded-xl border border-dashed border-neutral-300 p-8 text-center text-sm text-neutral-400">
          {cotizaciones.length === 0
            ? 'Aún no hay cotizaciones registradas.'
            : 'Sin cotizaciones para este estado.'}
        </p>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-neutral-200 bg-white">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-neutral-200 text-left text-neutral-500">
                <th className="px-4 py-3 font-medium">Cliente</th>
                <th className="px-4 py-3 font-medium">Proyecto</th>
                <th className="px-4 py-3 font-medium">Fecha</th>
                <th className="px-4 py-3 font-medium">Estado</th>
              </tr>
            </thead>
            <tbody>
              {filtradas.map((c) => (
                <tr
                  key={c.id}
                  onClick={() => router.push(`/admin/cotizaciones/${c.id}`)}
                  className="cursor-pointer border-b border-neutral-100 last:border-0 hover:bg-neutral-50"
                >
                  <td className="px-4 py-3 font-medium text-neutral-900">{c.cliente}</td>
                  <td className="px-4 py-3 text-neutral-600">{c.nombre_proyecto}</td>
                  <td className="px-4 py-3 text-neutral-600">{formatDate(c.fecha)}</td>
                  <td className="px-4 py-3">
                    <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${ESTADO_COLOR[c.estado]}`}>
                      {ESTADO_LABEL[c.estado]}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
