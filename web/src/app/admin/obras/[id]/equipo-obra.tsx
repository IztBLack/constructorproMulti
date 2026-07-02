'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button, EmptyState, TableContainer, TBody, Td, Th, THead, Tr } from '@/components/ui';
import { formatDate } from '@/lib/data/format';
import type { ColaboradorEnObra } from '@/lib/data/equipo';
import type { Colaborador } from '@/lib/data/types';
import { asignarObraColaborador, desvincularObraColaborador } from '../../equipo/actions';

export default function EquipoObra({
  obraId,
  asignados,
  colaboradoresDisponibles,
}: {
  obraId: string;
  asignados: ColaboradorEnObra[];
  colaboradoresDisponibles: Colaborador[];
}) {
  const router = useRouter();
  const [colaboradorId, setColaboradorId] = useState('');
  const [loading, setLoading] = useState(false);
  const [desvinculandoId, setDesvinculandoId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const asignadosIds = new Set(asignados.map((a) => a.id));
  const noAsignados = colaboradoresDisponibles.filter((c) => !asignadosIds.has(c.id));

  async function onAsignar(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!colaboradorId) {
      setError('Selecciona un colaborador.');
      return;
    }
    setLoading(true);
    setError(null);
    const result = await asignarObraColaborador(colaboradorId, obraId);
    setLoading(false);
    if (!result.ok) {
      setError(result.error ?? 'No se pudo asignar al colaborador.');
      return;
    }
    setColaboradorId('');
    router.refresh();
  }

  async function onDesvincular(colaboradorIdToRemove: string) {
    if (!confirm('¿Desvincular a este colaborador de la obra?')) return;
    setDesvinculandoId(colaboradorIdToRemove);
    setError(null);
    const result = await desvincularObraColaborador(colaboradorIdToRemove, obraId);
    setDesvinculandoId(null);
    if (!result.ok) {
      setError(result.error ?? 'No se pudo desvincular al colaborador.');
      return;
    }
    router.refresh();
  }

  return (
    <div className="space-y-4">
      <form
        onSubmit={onAsignar}
        className="flex flex-wrap items-end gap-3 rounded-xl border border-neutral-200 bg-white p-4"
      >
        <label className="block min-w-[220px] flex-1 space-y-1">
          <span className="text-sm font-medium text-neutral-700">Asignar colaborador</span>
          <select
            value={colaboradorId}
            onChange={(e) => setColaboradorId(e.target.value)}
            className="w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm text-neutral-900 outline-none focus:border-neutral-900"
          >
            <option value="">Selecciona un colaborador…</option>
            {noAsignados.map((c) => (
              <option key={c.id} value={c.id}>
                {c.nombre}
              </option>
            ))}
          </select>
        </label>
        <Button type="submit" disabled={loading || noAsignados.length === 0}>
          {loading ? 'Asignando…' : 'Asignar'}
        </Button>
      </form>

      {error && (
        <p className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
          {error}
        </p>
      )}

      {asignados.length === 0 ? (
        <EmptyState
          title="Sin colaboradores asignados"
          description="Esta obra no tiene colaboradores asignados en este momento."
        />
      ) : (
        <TableContainer>
          <THead>
            <Th>Colaborador</Th>
            <Th>Puesto</Th>
            <Th>Tipo de pago</Th>
            <Th>Desde</Th>
            <Th className="text-right">Acciones</Th>
          </THead>
          <TBody>
            {asignados.map((c) => (
              <Tr key={c.id}>
                <Td className="font-medium text-neutral-900">{c.nombre}</Td>
                <Td>{c.puesto_nombre ?? 'Sin puesto'}</Td>
                <Td>{c.tipo_pago === 'DESTAJO' ? 'Por destajo' : 'Por día'}</Td>
                <Td>{formatDate(c.fecha_ingreso)}</Td>
                <Td className="text-right">
                  <Button
                    type="button"
                    variant="danger"
                    size="sm"
                    disabled={desvinculandoId === c.id}
                    onClick={() => onDesvincular(c.id)}
                  >
                    {desvinculandoId === c.id ? 'Desvinculando…' : 'Desvincular'}
                  </Button>
                </Td>
              </Tr>
            ))}
          </TBody>
        </TableContainer>
      )}
    </div>
  );
}
