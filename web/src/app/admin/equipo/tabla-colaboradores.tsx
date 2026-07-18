'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import type { Colaborador, Puesto } from '@/lib/data/types';
import { Badge, Button, DataTable, EmptyState, type DataColumn } from '@/components/ui';
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

  // Columnas definidas dentro del componente porque las celdas usan estado
  // (loadingId) y helpers de este scope (puestoNombre, onToggleActivo). No se
  // pasa `href` de fila: el nombre es un <Link> propio y así el botón de acción
  // sigue siendo clicable (un enlace estirado lo taparía).
  const columnas: DataColumn<Colaborador>[] = [
    {
      key: 'nombre',
      header: 'Nombre',
      primary: true,
      cell: (c) => (
        <Link href={`/admin/equipo/${c.id}`} className="hover:underline">
          {c.nombre}
        </Link>
      ),
    },
    { key: 'puesto', header: 'Puesto', cell: (c) => puestoNombre(c.puesto_id) },
    {
      key: 'tipo',
      header: 'Tipo de pago',
      cell: (c) => TIPO_PAGO_LABEL[c.tipo_pago] ?? c.tipo_pago,
    },
    {
      key: 'salario',
      header: 'Salario/día',
      align: 'right',
      cell: (c) => {
        const salario = c.salario_personalizado ?? salarioPuesto(c.puesto_id);
        return (
          <span className="tabular-nums">
            {salario !== null ? formatCurrency(salario) : '—'}
          </span>
        );
      },
    },
    { key: 'telefono', header: 'Teléfono', cell: (c) => c.telefono || '—' },
    {
      key: 'estado',
      header: 'Estado',
      cell: (c) => (
        <Badge tone={c.activo ? 'green' : 'neutral'}>{c.activo ? 'Activo' : 'Inactivo'}</Badge>
      ),
    },
    {
      key: 'acciones',
      header: 'Acciones',
      align: 'right',
      cell: (c) => {
        const isLoading = loadingId === c.id;
        return (
          <Button
            variant="secondary"
            size="sm"
            disabled={isLoading}
            onClick={() => onToggleActivo(c.id, c.activo)}
          >
            {isLoading
              ? c.activo
                ? 'Desactivando…'
                : 'Activando…'
              : c.activo
                ? 'Desactivar'
                : 'Activar'}
          </Button>
        );
      },
    },
  ];

  return <DataTable columns={columnas} rows={colaboradores} rowKey={(c) => c.id} />;
}
