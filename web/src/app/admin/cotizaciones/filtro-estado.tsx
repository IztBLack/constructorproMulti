'use client';

import { useMemo, useState } from 'react';
import type { Cotizacion, EstadoCotizacion } from '@/lib/data/types';
import { formatDate } from '@/lib/data/format';
import {
  Badge,
  EmptyState,
  LinkButton,
  RowLink,
  TableContainer,
  THead,
  Th,
  TBody,
  Tr,
  Td,
} from '@/components/ui';
import type { BadgeTone } from '@/components/ui';

const ESTADOS: EstadoCotizacion[] = ['BORRADOR', 'ENVIADA', 'ACEPTADA', 'RECHAZADA', 'CONVERTIDA'];

const ESTADO_LABEL: Record<EstadoCotizacion, string> = {
  BORRADOR: 'Borrador',
  ENVIADA: 'Enviada',
  ACEPTADA: 'Aceptada',
  RECHAZADA: 'Rechazada',
  CONVERTIDA: 'Convertida',
};

const ESTADO_TONE: Record<EstadoCotizacion, BadgeTone> = {
  BORRADOR: 'neutral',
  ENVIADA: 'blue',
  ACEPTADA: 'green',
  RECHAZADA: 'red',
  CONVERTIDA: 'purple',
};

export default function FiltroEstadoCotizaciones({ cotizaciones }: { cotizaciones: Cotizacion[] }) {
  const [estado, setEstado] = useState<EstadoCotizacion | 'TODOS'>('TODOS');

  const filtradas = useMemo(
    () => (estado === 'TODOS' ? cotizaciones : cotizaciones.filter((c) => c.estado === estado)),
    [cotizaciones, estado],
  );

  const sinResultados = filtradas.length === 0;
  const sinCotizaciones = cotizaciones.length === 0;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          aria-pressed={estado === 'TODOS'}
          onClick={() => setEstado('TODOS')}
          className={`inline-flex min-h-11 cursor-pointer items-center rounded-full px-4 text-sm font-medium ${
            estado === 'TODOS' ? 'bg-neutral-900 text-white' : 'bg-neutral-100 text-neutral-600 hover:bg-neutral-200'
          }`}
        >
          Todos
        </button>
        {ESTADOS.map((e) => (
          <button
            key={e}
            type="button"
            aria-pressed={estado === e}
            onClick={() => setEstado(e)}
            className={`inline-flex min-h-11 cursor-pointer items-center rounded-full px-4 text-sm font-medium ${
              estado === e ? 'bg-neutral-900 text-white' : 'bg-neutral-100 text-neutral-600 hover:bg-neutral-200'
            }`}
          >
            {ESTADO_LABEL[e]}
          </button>
        ))}
      </div>

      {sinResultados ? (
        <EmptyState
          title={sinCotizaciones ? 'Aún no hay cotizaciones registradas.' : 'Sin cotizaciones para este estado.'}
          description={
            sinCotizaciones
              ? 'Crea la primera cotización usando el botón de arriba.'
              : 'Selecciona otro estado o crea una nueva cotización.'
          }
          action={
            sinCotizaciones ? (
              <LinkButton href="/admin/cotizaciones/nueva">+ Nueva cotización</LinkButton>
            ) : undefined
          }
        />
      ) : (
        <TableContainer>
          <THead>
            <Th>Cliente</Th>
            <Th>Proyecto</Th>
            <Th>Fecha</Th>
            <Th>Estado</Th>
          </THead>
          <TBody>
            {filtradas.map((c) => (
              <Tr key={c.id} className="cursor-pointer">
                <Td className="font-medium text-neutral-900">
                  <RowLink href={`/admin/cotizaciones/${c.id}`}>
                    Ver cotización {c.nombre_proyecto}
                  </RowLink>
                  {c.cliente}
                </Td>
                <Td>{c.nombre_proyecto}</Td>
                <Td>{formatDate(c.fecha)}</Td>
                <Td>
                  <Badge tone={ESTADO_TONE[c.estado]}>{ESTADO_LABEL[c.estado]}</Badge>
                </Td>
              </Tr>
            ))}
          </TBody>
        </TableContainer>
      )}
    </div>
  );
}
