'use client';

import { useState } from 'react';
import type { Obra } from '@/lib/data/types';
import type { OrdenModo } from '@/lib/data/orden-modos';
import { formatDate } from '@/lib/data/format';
import { Badge, Button, DataTable, EmptyState, type DataColumn } from '@/components/ui';
import OrdenModoToggle from '@/components/orden-modo-toggle';
import { usarArrastreOrden } from '@/components/usar-arrastre-orden';
import { ordenarPorModo } from '@/lib/data/ordenar';
import { esModoPersonalizado } from '@/lib/data/orden-modos';

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

const RUTA = '/admin/obras';

export default function BuscadorObras({
  obras,
  modo,
  onNuevaObra,
}: {
  obras: Obra[];
  modo: OrdenModo;
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

  // Arrastrar solo tiene sentido sobre la lista completa (sin búsqueda).
  const hayBusqueda = query.trim().length > 0;
  const personalizado = esModoPersonalizado(modo);
  const listado = ordenarPorModo(filtradas, modo, {
    nombre: (o) => o.nombre,
    creado: (o) => o.created_at,
    modificado: (o) => o.updated_at,
  });

  const { guardando, propsFila } = usarArrastreOrden({
    items: listado,
    idDe: (o) => o.id,
    tabla: 'obras',
    modo,
    revalidate: RUTA,
  });
  const puedeMover = personalizado && !hayBusqueda;

  const asaCol: DataColumn<Obra> = {
    key: 'asa',
    header: '',
    cell: () => (
      <span
        aria-hidden
        title="Arrastra la fila para reordenar"
        className="cursor-grab select-none text-lg leading-none text-neutral-400 active:cursor-grabbing"
      >
        ⠿
      </span>
    ),
  };

  const columnas = puedeMover ? [asaCol, ...COLUMNAS] : COLUMNAS;

  const sinResultados = filtradas.length === 0;
  const sinObras = obras.length === 0;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <input
          type="search"
          placeholder="Buscar por nombre, cliente o ubicación…"
          aria-label="Buscar obras"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          className="w-full max-w-md rounded-lg border border-neutral-300 px-3 py-2 text-sm outline-none focus:border-neutral-900"
        />
        <div className="flex items-center gap-2">
          <span className="text-sm text-neutral-500">Orden:</span>
          <OrdenModoToggle listKey="obras" modo={modo} revalidate={RUTA} />
        </div>
      </div>
      {personalizado && hayBusqueda && (
        <p className="text-xs text-neutral-500">Borra la búsqueda para reordenar la lista.</p>
      )}
      {puedeMover && (
        <p className="text-xs text-neutral-500">
          {guardando ? 'Guardando orden…' : 'Arrastra las filas para reordenar.'}
        </p>
      )}

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
          columns={columnas}
          rows={listado}
          rowKey={(o) => o.id}
          // Al mover se quita el enlace de fila para que los botones ↑/↓ sean
          // clicables (un enlace estirado los taparía).
          href={puedeMover ? undefined : (o) => `/admin/obras/${o.id}`}
          rowLabel={(o) => `Ver obra ${o.nombre}`}
          rowProps={puedeMover ? (_, i) => propsFila(i) : undefined}
        />
      )}
    </div>
  );
}
