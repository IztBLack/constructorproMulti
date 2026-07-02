'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Badge, Button, EmptyState, TableContainer, TBody, Td, Th, THead, Tr } from '@/components/ui';
import { formatDate } from '@/lib/data/format';
import type { AsignacionObraColaborador, ObraResumen } from '@/lib/data/types';
import { asignarObraColaborador, desvincularObraColaborador } from '../actions';

export default function AsignacionesObra({
  colaboradorId,
  obras,
  asignaciones,
}: {
  colaboradorId: string;
  obras: ObraResumen[];
  asignaciones: AsignacionObraColaborador[];
}) {
  const router = useRouter();
  const [obraId, setObraId] = useState('');
  const [loading, setLoading] = useState(false);
  const [desvinculandoId, setDesvinculandoId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const activas = asignaciones.filter((a) => a.fecha_salida === null);
  const historicas = asignaciones.filter((a) => a.fecha_salida !== null);

  const obrasNoAsignadas = obras.filter(
    (o) => !activas.some((a) => a.obra_id === o.id),
  );

  async function onAsignar(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!obraId) {
      setError('Selecciona una obra.');
      return;
    }
    setLoading(true);
    setError(null);
    const result = await asignarObraColaborador(colaboradorId, obraId);
    setLoading(false);
    if (!result.ok) {
      setError(result.error ?? 'No se pudo asignar la obra.');
      return;
    }
    setObraId('');
    router.refresh();
  }

  async function onDesvincular(obraIdToRemove: string) {
    if (!confirm('¿Desvincular al colaborador de esta obra?')) return;
    setDesvinculandoId(obraIdToRemove);
    setError(null);
    const result = await desvincularObraColaborador(colaboradorId, obraIdToRemove);
    setDesvinculandoId(null);
    if (!result.ok) {
      setError(result.error ?? 'No se pudo desvincular al colaborador.');
      return;
    }
    router.refresh();
  }

  return (
    <div className="space-y-4">
      <form onSubmit={onAsignar} className="flex flex-wrap items-end gap-3 rounded-xl border border-neutral-200 bg-white p-4">
        <label className="block min-w-[220px] flex-1 space-y-1">
          <span className="text-sm font-medium text-neutral-700">Asignar a obra</span>
          <select
            value={obraId}
            onChange={(e) => setObraId(e.target.value)}
            className="w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm text-neutral-900 outline-none focus:border-neutral-900"
          >
            <option value="">Selecciona una obra…</option>
            {obrasNoAsignadas.map((o) => (
              <option key={o.id} value={o.id}>
                {o.nombre}
              </option>
            ))}
          </select>
        </label>
        <Button type="submit" disabled={loading || obrasNoAsignadas.length === 0}>
          {loading ? 'Asignando…' : 'Asignar'}
        </Button>
      </form>

      {error && (
        <p className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">{error}</p>
      )}

      {activas.length === 0 ? (
        <EmptyState
          title="Sin asignaciones activas"
          description="Este colaborador no está asignado a ninguna obra en este momento."
        />
      ) : (
        <TableContainer>
          <THead>
            <Th>Obra</Th>
            <Th>Desde</Th>
            <Th className="text-right">Acciones</Th>
          </THead>
          <TBody>
            {activas.map((a) => (
              <Tr key={a.obra_id}>
                <Td className="font-medium text-neutral-900">{a.obra_nombre}</Td>
                <Td>{formatDate(a.fecha_ingreso)}</Td>
                <Td className="text-right">
                  <Button
                    type="button"
                    variant="danger"
                    size="sm"
                    disabled={desvinculandoId === a.obra_id}
                    onClick={() => onDesvincular(a.obra_id)}
                  >
                    {desvinculandoId === a.obra_id ? 'Desvinculando…' : 'Desvincular'}
                  </Button>
                </Td>
              </Tr>
            ))}
          </TBody>
        </TableContainer>
      )}

      {historicas.length > 0 && (
        <div className="space-y-2">
          <h3 className="text-xs font-medium uppercase tracking-wide text-neutral-400">
            Historial de asignaciones
          </h3>
          <TableContainer>
            <THead>
              <Th>Obra</Th>
              <Th>Desde</Th>
              <Th>Hasta</Th>
              <Th className="text-right">Estado</Th>
            </THead>
            <TBody>
              {historicas.map((a) => (
                <Tr key={`${a.obra_id}-${a.fecha_ingreso}`}>
                  <Td>{a.obra_nombre}</Td>
                  <Td>{formatDate(a.fecha_ingreso)}</Td>
                  <Td>{formatDate(a.fecha_salida)}</Td>
                  <Td className="text-right">
                    <Badge tone="neutral">Finalizada</Badge>
                  </Td>
                </Tr>
              ))}
            </TBody>
          </TableContainer>
        </div>
      )}
    </div>
  );
}
