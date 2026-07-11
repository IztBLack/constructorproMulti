'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import type { Colaborador, Puesto } from '@/lib/data/types';
import { Badge, Button, EmptyState, TableContainer, TBody, Td, Th, THead, Tr } from '@/components/ui';
import { formatCurrency } from '@/lib/data/format';
import { alternarActivoColaborador } from './actions';

const TIPO_PAGO_LABEL: Record<string, string> = {
  DIA: 'Por día',
  DESTAJO: 'Por destajo',
};

export default function TablaColaboradores({
  colaboradores,
  puestos,
}: {
  colaboradores: Colaborador[];
  puestos: Puesto[];
}) {
  const router = useRouter();
  const [loadingId, setLoadingId] = useState<string | null>(null);

  const puestoNombre = (puestoId: string | null) =>
    puestos.find((p) => p.id === puestoId)?.nombre ?? '—';

  const salarioPuesto = (puestoId: string | null) =>
    puestos.find((p) => p.id === puestoId)?.salario_dia_default ?? null;

  async function onToggleActivo(id: string, activo: boolean) {
    const accion = activo ? 'desactivar' : 'activar';
    const nombre = colaboradores.find((c) => c.id === id)?.nombre ?? 'este colaborador';
    if (!confirm(`¿Deseas ${accion} a ${nombre}?`)) return;
    setLoadingId(id);
    await alternarActivoColaborador(id, !activo);
    setLoadingId(null);
    router.refresh();
  }

  if (colaboradores.length === 0) {
    return (
      <EmptyState
        title="Aún no hay colaboradores registrados."
        description="Agrega el primero con el botón Nuevo colaborador."
      />
    );
  }

  return (
    <TableContainer>
      <THead>
        <Th>Nombre</Th>
        <Th>Puesto</Th>
        <Th>Tipo de pago</Th>
        <Th className="text-right">Salario/día</Th>
        <Th>Teléfono</Th>
        <Th>Estado</Th>
        <Th />
      </THead>
      <TBody>
        {colaboradores.map((c) => {
          const salario = c.salario_personalizado ?? salarioPuesto(c.puesto_id);
          const isLoading = loadingId === c.id;
          return (
            <Tr key={c.id}>
              <Td className="font-medium text-neutral-900">
                <Link href={`/admin/equipo/${c.id}`} className="hover:underline">
                  {c.nombre}
                </Link>
              </Td>
              <Td>{puestoNombre(c.puesto_id)}</Td>
              <Td>{TIPO_PAGO_LABEL[c.tipo_pago] ?? c.tipo_pago}</Td>
              <Td className="text-right tabular-nums">
                {salario !== null ? formatCurrency(salario) : '—'}
              </Td>
              <Td>{c.telefono || '—'}</Td>
              <Td>
                <Badge tone={c.activo ? 'green' : 'neutral'}>
                  {c.activo ? 'Activo' : 'Inactivo'}
                </Badge>
              </Td>
              <Td className="text-right">
                <Button
                  variant="secondary"
                  size="sm"
                  disabled={isLoading}
                  onClick={() => onToggleActivo(c.id, c.activo)}
                >
                  {isLoading
                    ? c.activo ? 'Desactivando…' : 'Activando…'
                    : c.activo ? 'Desactivar' : 'Activar'}
                </Button>
              </Td>
            </Tr>
          );
        })}
      </TBody>
    </TableContainer>
  );
}
