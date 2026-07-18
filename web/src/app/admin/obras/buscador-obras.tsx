'use client';

import { useState } from 'react';
import type { Obra } from '@/lib/data/types';
import { formatDate } from '@/lib/data/format';
import { Badge, Button, DataTable, EmptyState, type DataColumn } from '@/components/ui';

const COLUMNAS: DataColumn<Obra>[] = [
  { key: 'nombre', header: 'Nombre', primary: true, cell: (o) => o.nombre },
  { key: 'cliente', header: 'Cliente', cell: (o) => o.cliente || '—' },
  { key: 'ubicacion', header: 'Ubicación', cell: (o) => o.ubicacion || '—' },
  { key: 'inicio', header: 'Inicio', cell: (o) => formatDate(o.fecha_inicio) },
  {
    key: 'estado',
    header: 'Estado',
    cell: (o) => (
      <Badge tone={o.activa ? 'green' : 'neutral'}>{o.activa ? 'Activa' : 'Inactiva'}</Badge>
    ),
  },
];

export default function BuscadorObras({
  obras,
  onNuevaObra,
}: {
  obras: Obra[];
  /** Abre el modal de "Nueva obra" (elevado desde el padre); ver obras-client.tsx. */
  onNuevaObra?: () => void;
}) {
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

  const sinResultados = filtradas.length === 0;
  const sinObras = obras.length === 0;

  return (
    <div className="space-y-4">
      <input
        type="search"
        placeholder="Buscar por nombre, cliente o ubicación…"
        aria-label="Buscar obras"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        className="w-full max-w-md rounded-lg border border-neutral-300 px-3 py-2 text-sm outline-none focus:border-neutral-900"
      />

      {sinResultados ? (
        <EmptyState
          title={sinObras ? 'Aún no hay obras registradas.' : 'Sin resultados para tu búsqueda.'}
          description={
            sinObras
              ? 'Crea la primera obra usando el botón de arriba.'
              : 'Intenta con otro nombre, cliente o ubicación.'
          }
          action={
            sinObras && onNuevaObra ? (
              <Button onClick={onNuevaObra}>+ Nueva obra</Button>
            ) : undefined
          }
        />
      ) : (
        <DataTable
          columns={COLUMNAS}
          rows={filtradas}
          rowKey={(o) => o.id}
          href={(o) => `/admin/obras/${o.id}`}
          rowLabel={(o) => `Ver obra ${o.nombre}`}
        />
      )}
    </div>
  );
}
