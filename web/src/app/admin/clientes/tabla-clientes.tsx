'use client';

import Link from 'next/link';
import { Badge, TableContainer, THead, Th, TBody, Tr, Td } from '@/components/ui';
import type { Cliente } from '@/lib/data/types';

export default function TablaClientes({ clientes }: { clientes: Cliente[] }) {
  return (
    <TableContainer>
      <THead>
        <Th>Nombre</Th>
        <Th>Correo</Th>
        <Th>Teléfono</Th>
        <Th>Acceso al portal</Th>
      </THead>
      <TBody>
        {clientes.map((c) => (
          <Tr key={c.id}>
            <Td className="font-medium text-neutral-900">
              <Link href={`/admin/clientes/${c.id}`} className="hover:underline">
                {c.nombre}
              </Link>
            </Td>
            <Td className="text-neutral-600">{c.email || '—'}</Td>
            <Td className="text-neutral-600">{c.telefono || '—'}</Td>
            <Td>
              {c.user_id ? (
                <Badge tone="green">Vinculado</Badge>
              ) : (
                <Badge tone="neutral">Sin acceso</Badge>
              )}
            </Td>
          </Tr>
        ))}
      </TBody>
    </TableContainer>
  );
}
