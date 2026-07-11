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
        description="Usa el botón &quot;Registrar movimiento&quot; para capturar la primera entrada o salida."
      />
    );
  }

  const totalEntradas = movimientos
    .filter((m) => m.tipo === 'ENTRADA')
    .reduce((acc, m) => acc + m.monto, 0);
  const totalSalidas = movimientos
    .filter((m) => m.tipo === 'SALIDA')
    .reduce((acc, m) => acc + m.monto, 0);
  const saldo = totalEntradas - totalSalidas;

  return (
    <div className="space-y-3">
      {error && (
        <p className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">{error}</p>
      )}

      <p className="text-xs text-neutral-400">
        {movimientos.length} {movimientos.length === 1 ? 'movimiento' : 'movimientos'}
      </p>

      <TableContainer>
        <THead>
          <Th>Fecha</Th>
          <Th>Concepto</Th>
          <Th>Nombre</Th>
          <Th>Canal</Th>
          <Th>Tipo</Th>
          <Th>Observaciones</Th>
          <Th className="text-right">Cantidad</Th>
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
                <Td className="whitespace-nowrap">{formatDate(m.fecha)}</Td>
                <Td className="max-w-[180px] truncate" title={m.concepto || undefined}>
                  {m.concepto || '—'}
                </Td>
                <Td>{m.nombre || '—'}</Td>
                <Td>{m.metodo_pago || '—'}</Td>
                <Td>
                  <Badge tone={m.tipo === 'ENTRADA' ? 'green' : 'red'}>
                    {m.tipo === 'ENTRADA' ? 'Entrada' : 'Salida'}
                  </Badge>
                </Td>
                <Td
                  className="max-w-[160px] truncate text-neutral-400"
                  title={m.referencia || undefined}
                >
                  {m.referencia || '—'}
                </Td>
                <Td
                  className={`text-right font-semibold tabular-nums ${
                    m.tipo === 'ENTRADA' ? 'text-green-700' : 'text-red-600'
                  }`}
                >
                  {m.tipo === 'SALIDA' ? '-' : '+'}
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
        <tfoot>
          <tr className="border-t-2 border-neutral-300 bg-neutral-50">
            <td colSpan={6} className="px-4 py-3 text-right text-sm font-semibold text-neutral-700">
              Totales
            </td>
            <td className="px-4 py-3 text-right">
              <div className="space-y-0.5 text-right">
                <p className="text-xs tabular-nums text-green-700">+{formatCurrency(totalEntradas)}</p>
                <p className="text-xs tabular-nums text-red-600">-{formatCurrency(totalSalidas)}</p>
                <p
                  className={`text-sm font-bold tabular-nums ${
                    saldo >= 0 ? 'text-green-700' : 'text-red-600'
                  }`}
                >
                  {formatCurrency(saldo)}
                </p>
              </div>
            </td>
            <td className="px-4 py-3" />
          </tr>
        </tfoot>
      </TableContainer>
    </div>
  );
}
