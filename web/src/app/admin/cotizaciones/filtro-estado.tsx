'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import type { Cotizacion, EstadoCotizacion } from '@/lib/data/types';
import type { OrdenModo } from '@/lib/data/orden-modos';
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
import OrdenModoToggle from '@/components/orden-modo-toggle';
import { usarArrastreOrden } from '@/components/usar-arrastre-orden';
import { ordenarPorModo } from '@/lib/data/ordenar';
import { esModoPersonalizado } from '@/lib/data/orden-modos';
import type { BadgeTone } from '@/components/ui';

const RUTA = '/admin/cotizaciones';

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

export default function FiltroEstadoCotizaciones({
  cotizaciones,
  modo,
}: {
  cotizaciones: Cotizacion[];
  modo: OrdenModo;
}) {
  const [estado, setEstado] = useState<EstadoCotizacion | 'TODOS'>('TODOS');

  const personalizado = esModoPersonalizado(modo);

  const filtradasBase = useMemo(
    () => (estado === 'TODOS' ? cotizaciones : cotizaciones.filter((c) => c.estado === estado)),
    [cotizaciones, estado],
  );
  const filtradas = ordenarPorModo(filtradasBase, modo, {
    nombre: (c) => c.nombre_proyecto,
    creado: (c) => c.created_at,
    modificado: (c) => c.updated_at,
  });

  // Mover solo sobre la lista completa (sin filtro de estado).
  const puedeMover = personalizado && estado === 'TODOS';

  const { guardando, propsFila } = usarArrastreOrden({
    items: filtradas,
    idDe: (c) => c.id,
    tabla: 'cotizaciones',
    modo,
    revalidate: RUTA,
  });

  const sinResultados = filtradas.length === 0;
  const sinCotizaciones = cotizaciones.length === 0;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
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
        <div className="flex items-center gap-2">
          <span className="text-sm text-neutral-500">Orden:</span>
          <OrdenModoToggle listKey="cotizaciones" modo={modo} revalidate={RUTA} />
        </div>
      </div>
      {personalizado && estado !== 'TODOS' && (
        <p className="text-xs text-neutral-500">Quita el filtro de estado para reordenar.</p>
      )}
      {puedeMover && (
        <p className="text-xs text-neutral-500">
          {guardando ? 'Guardando orden…' : 'Arrastra las filas para reordenar.'}
        </p>
      )}

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
            {puedeMover && <Th className="w-10" aria-label="Reordenar" />}
            <Th>Cliente</Th>
            <Th>Proyecto</Th>
            <Th>Fecha</Th>
            <Th>Estado</Th>
          </THead>
          <TBody>
            {filtradas.map((c, i) => (
              <Tr
                key={c.id}
                className={puedeMover ? undefined : 'cursor-pointer'}
                {...(puedeMover ? propsFila(i) : {})}
              >
                {puedeMover && (
                  <Td className="text-neutral-400">
                    <span
                      aria-hidden
                      title="Arrastra la fila para reordenar"
                      className="cursor-grab select-none text-lg leading-none active:cursor-grabbing"
                    >
                      ⠿
                    </span>
                  </Td>
                )}
                <Td className="font-medium text-neutral-900">
                  {puedeMover ? (
                    c.cliente
                  ) : (
                    <>
                      <RowLink href={`/admin/cotizaciones/${c.id}`}>
                        Ver cotización {c.nombre_proyecto}
                      </RowLink>
                      {c.cliente}
                    </>
                  )}
                </Td>
                <Td>
                  {puedeMover ? (
                    <Link href={`/admin/cotizaciones/${c.id}`} className="hover:underline">
                      {c.nombre_proyecto}
                    </Link>
                  ) : (
                    c.nombre_proyecto
                  )}
                </Td>
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
