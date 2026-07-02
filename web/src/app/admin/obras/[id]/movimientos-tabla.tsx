'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Badge, Button, EmptyState, TableContainer, TBody, Td, Th, THead, Tr } from '@/components/ui';
import { formatCurrency, formatDate } from '@/lib/data/format';
import type { Movimiento } from '@/lib/data/types';
import { eliminarMovimientoAction } from './actions';
import MovimientoForm from './movimiento-form';

export default function MovimientosTabla({
  obraId,
  movimientos,
}: {
  obraId: string;
  movimientos: Movimiento[];
}) {
  const router = useRouter();
  const [editandoId, setEditandoId] = useState<string | null>(null);
  const [eliminandoId, setEliminandoId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function onEliminar(id: string) {
    if (!confirm('¿Eliminar este movimiento? Esta acción no se puede deshacer.')) return;
    setEliminandoId(id);
    setError(null);
    const result = await eliminarMovimientoAction(id, obraId);
    setEliminandoId(null);
    if (!result.ok) {
      setError(result.error ?? 'No se pudo eliminar el movimiento.');
      return;
    }
    router.refresh();
  }

  if (movimientos.length === 0) {
    return (
      <EmptyState
        title="Aún no hay movimientos registrados en esta obra."
        description="Usa el botón “Registrar movimiento” para capturar la primera entrada o salida."
      />
    );
  }

  return (
    <div className="space-y-3">
      {error && (
        <p className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">{error}</p>
      )}

      <TableContainer>
        <THead>
          <Th>Fecha</Th>
          <Th>Tipo</Th>
          <Th>Categoría</Th>
          <Th>Concepto</Th>
          <Th>Método</Th>
          <Th>Referencia</Th>
          <Th className="text-right">Monto</Th>
          <Th className="text-right">Acciones</Th>
        </THead>
        <TBody>
          {movimientos.map((m) =>
            editandoId === m.id ? (
              <tr key={m.id} className="border-b border-neutral-100 last:border-0">
                <td colSpan={8} className="px-4 py-4">
                  <MovimientoForm
                    obraId={obraId}
                    mode="editar"
                    movimiento={m}
                    onDone={() => setEditandoId(null)}
                    onCancel={() => setEditandoId(null)}
                  />
                </td>
              </tr>
            ) : (
              <Tr key={m.id}>
                <Td>{formatDate(m.fecha)}</Td>
                <Td>
                  <Badge tone={m.tipo === 'ENTRADA' ? 'green' : 'red'}>
                    {m.tipo === 'ENTRADA' ? 'Entrada' : 'Salida'}
                  </Badge>
                </Td>
                <Td>{m.categoria || '—'}</Td>
                <Td>{m.concepto || '—'}</Td>
                <Td>{m.metodo_pago || '—'}</Td>
                <Td>{m.referencia || '—'}</Td>
                <Td className="text-right font-medium tabular-nums text-neutral-900">
                  {m.tipo === 'SALIDA' ? '-' : ''}
                  {formatCurrency(m.monto)}
                </Td>
                <Td className="text-right">
                  <div className="flex items-center justify-end gap-2">
                    <Button
                      type="button"
                      variant="secondary"
                      size="sm"
                      onClick={() => setEditandoId(m.id)}
                    >
                      Editar
                    </Button>
                    <Button
                      type="button"
                      variant="danger"
                      size="sm"
                      disabled={eliminandoId === m.id}
                      onClick={() => onEliminar(m.id)}
                    >
                      {eliminandoId === m.id ? 'Eliminando…' : 'Eliminar'}
                    </Button>
                  </div>
                </Td>
              </Tr>
            ),
          )}
        </TBody>
      </TableContainer>
    </div>
  );
}
