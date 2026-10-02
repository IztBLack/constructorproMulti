'use client';

import Link from 'next/link';
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
  // Ancla del recorrido guiado en el nombre de la PRIMERA fila (la tabla
  // genérica no deja poner atributos en su enlace de fila). tabIndex -1: la
  // fila ya tiene su parada de teclado.
  const primeraId = clientes[0]?.id;
  const columnas: DataColumn<Cliente>[] = [
    {
      ...COLUMNAS[0],
      cell: (c) =>
        c.id === primeraId ? (
          <Link href={`/admin/clientes/${c.id}`} data-guia="clientes-fila" tabIndex={-1} className="relative hover:underline">
            {c.nombre}
          </Link>
        ) : (
          c.nombre
        ),
    },
    ...COLUMNAS.slice(1),
  ];
  return (
    <DataTable
      columns={columnas}
      rows={clientes}
      rowKey={(c) => c.id}
      href={(c) => `/admin/clientes/${c.id}`}
      rowLabel={(c) => `Ver cliente ${c.nombre}`}
    />
  );
}
