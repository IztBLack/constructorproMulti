'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button, EmptyState, Modal, TableContainer, TBody, Td, Th, THead, Tr } from '@/components/ui';
import { formatCurrency } from '@/lib/data/format';
import type { Puesto } from '@/lib/data/types';
import { eliminarPuesto } from './actions';
import EditarPuestoForm from './editar-puesto-form';

export default function TablaPuestos({ puestos }: { puestos: Puesto[] }) {
  const router = useRouter();
  const [editandoPuesto, setEditandoPuesto] = useState<Puesto | null>(null);
  const [eliminandoId, setEliminandoId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function onEliminar(id: string) {
    if (!confirm('¿Eliminar este puesto? Los colaboradores asignados conservarán su salario personalizado si lo tienen.')) return;
    setEliminandoId(id);
    setError(null);
    const result = await eliminarPuesto(id);
    setEliminandoId(null);
    if (!result.ok) {
      setError(result.error ?? 'No se pudo eliminar el puesto.');
      return;
    }
    router.refresh();
  }

  if (puestos.length === 0) {
    return (
      <EmptyState
        title="Aún no hay puestos registrados."
        description="Usa el botón “Nuevo puesto” para crear el primero."
      />
    );
  }

  return (
    <div className="space-y-4">
      {error && (
        <p className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">{error}</p>
      )}

      <TableContainer>
        <THead>
          <Th>Nombre</Th>
          <Th className="text-right">Salario/día</Th>
          <Th className="text-right">Acciones</Th>
        </THead>
        <TBody>
          {puestos.map((p) => (
            <Tr key={p.id}>
              <Td className="font-medium text-neutral-900">{p.nombre}</Td>
              <Td className="text-right">{formatCurrency(p.salario_dia_default)}</Td>
              <Td className="text-right">
                <div className="flex items-center justify-end gap-2">
                  <Button
                    type="button"
                    variant="secondary"
                    size="sm"
                    onClick={() => setEditandoPuesto(p)}
                  >
                    Editar
                  </Button>
                  <Button
                    type="button"
                    variant="danger"
                    size="sm"
                    disabled={eliminandoId === p.id}
                    onClick={() => onEliminar(p.id)}
                  >
                    {eliminandoId === p.id ? 'Eliminando…' : 'Eliminar'}
                  </Button>
                </div>
              </Td>
            </Tr>
          ))}
        </TBody>
      </TableContainer>

      {/* Modal de edición de puesto */}
      <Modal
        open={editandoPuesto !== null}
        onClose={() => setEditandoPuesto(null)}
        title="Editar puesto"
        size="sm"
      >
        {editandoPuesto && (
          <EditarPuestoForm
            puesto={editandoPuesto}
            onDone={() => setEditandoPuesto(null)}
            onCancel={() => setEditandoPuesto(null)}
          />
        )}
      </Modal>
    </div>
  );
}
