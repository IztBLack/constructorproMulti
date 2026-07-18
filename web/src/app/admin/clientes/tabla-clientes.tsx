'use client';

import { Badge, DataTable, type DataColumn } from '@/components/ui';
import type { Cliente } from '@/lib/data/types';

const COLUMNAS: DataColumn<Cliente>[] = [
  { key: 'nombre', header: 'Nombre', primary: true, cell: (c) => c.nombre },
  { key: 'email', header: 'Correo', cell: (c) => c.email || '—' },
  { key: 'telefono', header: 'Teléfono', cell: (c) => c.telefono || '—' },
  {
    key: 'acceso',
    header: 'Acceso al portal',
    cell: (c) =>
      c.user_id ? (
        <Badge tone="green">Vinculado</Badge>
      ) : (
        <Badge tone="neutral">Sin acceso</Badge>
      ),
  },
];

export default function TablaClientes({ clientes }: { clientes: Cliente[] }) {
  return (
    <DataTable
      columns={COLUMNAS}
      rows={clientes}
      rowKey={(c) => c.id}
      href={(c) => `/admin/clientes/${c.id}`}
      rowLabel={(c) => `Ver cliente ${c.nombre}`}
    />
  );
}
