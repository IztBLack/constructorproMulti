'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  Button,
  EmptyState,
  MultiSelectList,
  TableContainer,
  TBody,
  Td,
  Th,
  THead,
  Tr,
} from '@/components/ui';
import { formatDate } from '@/lib/data/format';
import type { ColaboradorEnObra } from '@/lib/data/equipo';
import type { Colaborador } from '@/lib/data/types';
import { asignarObraColaboradores, desvincularObraColaborador } from '../../equipo/actions';

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
  const [seleccionados, setSeleccionados] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [desvinculandoId, setDesvinculandoId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);

  const asignadosIds = new Set(asignados.map((a) => a.id));
  const noAsignados = colaboradoresDisponibles.filter((c) => !asignadosIds.has(c.id));

  const nombrePorId = new Map(colaboradoresDisponibles.map((c) => [c.id, c.nombre]));

  async function onAsignar(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (seleccionados.length === 0) {
      setError('Selecciona al menos un colaborador.');
      return;
    }
    setLoading(true);
    setError(null);
    setAviso(null);
    const result = await asignarObraColaboradores(seleccionados, obraId);
    setLoading(false);

    if (result.fallidos.length) {
      const nombres = result.fallidos
        .map((f) => nombrePorId.get(f.id) ?? f.id)
        .join(', ');
      setError(`No se pudo asignar a ${nombres}: ${result.fallidos[0].error}`);
    }

    const partes: string[] = [];
    if (result.asignados.length) partes.push(`${result.asignados.length} asignado(s).`);
    if (result.omitidos.length) partes.push(`${result.omitidos.length} ya estaban en la obra.`);
    // Asignar es un movimiento: si venían de otra obra, se les dio de baja ahí.
    // Hay que decirlo, porque cambia dónde les aparece el pase de lista.
    if (result.cerradas.length) partes.push(`Se dieron de baja de: ${result.cerradas.join(', ')}.`);
    if (partes.length) setAviso(partes.join(' '));

    setSeleccionados([]);
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
        className="space-y-3 rounded-xl border border-neutral-200 bg-white p-4"
      >
        <span className="block text-sm font-medium text-neutral-700">Asignar colaboradores</span>
        <MultiSelectList
          etiqueta="Colaboradores por asignar"
          opciones={noAsignados}
          seleccionados={seleccionados}
          onChange={setSeleccionados}
          buscarPlaceholder="Buscar colaborador…"
          vacioTexto="No hay colaboradores disponibles para asignar."
          disabled={loading}
        />
        {noAsignados.length > 0 && (
          <Button type="submit" disabled={loading || seleccionados.length === 0}>
            {loading
              ? 'Asignando…'
              : seleccionados.length > 1
                ? `Asignar ${seleccionados.length}`
                : 'Asignar'}
          </Button>
        )}
      </form>

      {error && (
        <p className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
          {error}
        </p>
      )}

      {aviso && (
        <p className="rounded-xl border border-blue-200 bg-blue-50 p-4 text-sm text-blue-800">
          {aviso}
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
