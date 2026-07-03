'use client';

import { useState } from 'react';
import { Badge, Button, Modal } from '@/components/ui';
import { formatDate } from '@/lib/data/format';
import type { Cliente, Obra } from '@/lib/data/types';
import EditarObraForm from './editar-obra-form';
import ObraAcciones from './obra-acciones';

export default function ObraHeader({
  obra,
  clientes,
}: {
  obra: Obra;
  clientes: Cliente[];
}) {
  const [editando, setEditando] = useState(false);

  return (
    <>
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-semibold text-neutral-900">{obra.nombre}</h1>
            <Badge tone={obra.activa ? 'green' : 'neutral'}>
              {obra.activa ? 'Activa' : 'Inactiva'}
            </Badge>
          </div>
          <p className="text-sm text-neutral-500">
            {obra.cliente || 'Sin cliente'} · {obra.ubicacion || 'Sin ubicación'}
          </p>
          <p className="text-sm text-neutral-500">Inicio: {formatDate(obra.fecha_inicio)}</p>
          {typeof obra.avance === 'number' && (
            <p className="text-sm text-neutral-500">Avance: {obra.avance}%</p>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <Button variant="secondary" size="sm" onClick={() => setEditando(true)}>
            Editar
          </Button>
          <ObraAcciones id={obra.id} activa={obra.activa} />
        </div>
      </header>

      <Modal open={editando} onClose={() => setEditando(false)} title="Editar obra" size="lg">
        <EditarObraForm
          obra={obra}
          clientes={clientes}
          onCancelar={() => setEditando(false)}
        />
      </Modal>
    </>
  );
}
