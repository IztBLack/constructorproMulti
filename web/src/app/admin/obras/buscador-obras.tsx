'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import type { Obra } from '@/lib/data/types';
import { formatDate } from '@/lib/data/format';

export default function BuscadorObras({ obras }: { obras: Obra[] }) {
  const router = useRouter();
  const [query, setQuery] = useState('');

  const filtradas = obras.filter((o) => {
    const q = query.trim().toLowerCase();
    if (!q) return true;
    return (
      o.nombre.toLowerCase().includes(q) ||
      (o.cliente ?? '').toLowerCase().includes(q) ||
      (o.ubicacion ?? '').toLowerCase().includes(q)
    );
  });

  return (
    <div className="space-y-4">
      <input
        type="search"
        placeholder="Buscar por nombre, cliente o ubicación…"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        className="w-full max-w-md rounded-lg border border-neutral-300 px-3 py-2 text-sm outline-none focus:border-neutral-900"
      />

      {filtradas.length === 0 ? (
        <p className="rounded-xl border border-dashed border-neutral-300 p-8 text-center text-sm text-neutral-400">
          {obras.length === 0 ? 'Aún no hay obras registradas.' : 'Sin resultados para tu búsqueda.'}
        </p>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-neutral-200 bg-white">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-neutral-200 text-left text-neutral-500">
                <th className="px-4 py-3 font-medium">Nombre</th>
                <th className="px-4 py-3 font-medium">Cliente</th>
                <th className="px-4 py-3 font-medium">Ubicación</th>
                <th className="px-4 py-3 font-medium">Inicio</th>
                <th className="px-4 py-3 font-medium">Estado</th>
              </tr>
            </thead>
            <tbody>
              {filtradas.map((o) => (
                <tr
                  key={o.id}
                  onClick={() => router.push(`/admin/obras/${o.id}`)}
                  className="cursor-pointer border-b border-neutral-100 last:border-0 hover:bg-neutral-50"
                >
                  <td className="px-4 py-3 font-medium text-neutral-900">{o.nombre}</td>
                  <td className="px-4 py-3 text-neutral-600">{o.cliente || '—'}</td>
                  <td className="px-4 py-3 text-neutral-600">{o.ubicacion || '—'}</td>
                  <td className="px-4 py-3 text-neutral-600">{formatDate(o.fecha_inicio)}</td>
                  <td className="px-4 py-3">
                    <span
                      className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                        o.activa ? 'bg-green-100 text-green-700' : 'bg-neutral-100 text-neutral-500'
                      }`}
                    >
                      {o.activa ? 'Activa' : 'Inactiva'}
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
