'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import type { CuadrillaResumen } from '@/lib/data/cuadrillas';
import type { OrdenModo } from '@/lib/data/orden-modos';
import { Badge, Button, EmptyState, TableContainer, TBody, Td, Th, THead, Tr } from '@/components/ui';
import OrdenModoToggle from '@/components/orden-modo-toggle';
import { usarArrastreOrden } from '@/components/usar-arrastre-orden';
import { ordenarPorModo } from '@/lib/data/ordenar';
import { ESPECIALIDAD_LABEL } from './especialidades';
import { eliminarCuadrilla } from './actions';

const RUTA = '/admin/cuadrillas';

export default function TablaCuadrillas({
  cuadrillas,
  modo,
}: {
  cuadrillas: CuadrillaResumen[];
  modo: OrdenModo;
}) {
  const router = useRouter();
  const [loadingId, setLoadingId] = useState<string | null>(null);

  // El servidor entrega por (orden, nombre); aquí se aplica el modo elegido.
  const items = ordenarPorModo(cuadrillas, modo, {
    nombre: (c) => c.nombre,
    creado: (c) => c.created_at,
    modificado: (c) => c.updated_at,
  });

  const { activo: arrastrable, guardando, propsFila } = usarArrastreOrden({
    items,
    idDe: (c) => c.id,
    tabla: 'cuadrillas',
    modo,
    revalidate: RUTA,
  });

  async function onEliminar(id: string, nombre: string) {
    if (!confirm(`¿Eliminar la cuadrilla "${nombre}"? Se quitarán sus miembros y asignaciones.`)) return;
    setLoadingId(id);
    const r = await eliminarCuadrilla(id);
    setLoadingId(null);
    if (!r.ok) {
      alert(r.error ?? 'No se pudo eliminar.');
      return;
    }
    router.refresh();
  }

  if (cuadrillas.length === 0) {
    return (
      <EmptyState
        title="Aún no hay cuadrillas registradas."
        description="Crea la primera con el botón Nueva cuadrilla."
      />
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-end gap-2">
        {arrastrable && (
          <span className="text-xs text-neutral-500">
            {guardando ? 'Guardando orden…' : 'Arrastra las filas para reordenar'}
          </span>
        )}
        <OrdenModoToggle listKey="cuadrillas" modo={modo} revalidate={RUTA} />
      </div>

      <TableContainer>
        <THead>
          {arrastrable && <Th className="w-10" aria-label="Reordenar" />}
          <Th>Nombre</Th>
          <Th>Especialidad</Th>
          <Th>Cabo</Th>
          <Th>Miembros</Th>
          <Th>Obras asignadas</Th>
          <Th>Estado</Th>
          <Th />
        </THead>
        <TBody>
          {items.map((c, i) => (
            <Tr key={c.id} {...propsFila(i)}>
              {arrastrable && (
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
                <Link href={`/admin/cuadrillas/${c.id}`} className="hover:underline">
                  {c.nombre}
                </Link>
              </Td>
              <Td>{ESPECIALIDAD_LABEL[c.especialidad] ?? c.especialidad}</Td>
              <Td>{c.cabo_nombre ?? '—'}</Td>
              <Td>
                {c.miembros.length === 0 ? (
                  '—'
                ) : (
                  <span>
                    <span className="tabular-nums font-medium">{c.miembros.length}</span>
                    <span className="text-neutral-500"> · {c.miembros.join(', ')}</span>
                  </span>
                )}
              </Td>
              <Td>{c.obras.length === 0 ? '—' : c.obras.join(', ')}</Td>
              <Td>
                <Badge tone={c.activa ? 'green' : 'neutral'}>{c.activa ? 'Activa' : 'Inactiva'}</Badge>
              </Td>
              <Td className="text-right">
                <div className="flex items-center justify-end gap-2">
                  <Link href={`/admin/cuadrillas/${c.id}`}>
                    <Button variant="secondary" size="sm">
                      Gestionar
                    </Button>
                  </Link>
                  <Button
                    variant="secondary"
                    size="sm"
                    disabled={loadingId === c.id}
                    onClick={() => onEliminar(c.id, c.nombre)}
                  >
                    {loadingId === c.id ? 'Eliminando…' : 'Eliminar'}
                  </Button>
                </div>
              </Td>
            </Tr>
          ))}
        </TBody>
      </TableContainer>
    </div>
  );
}
