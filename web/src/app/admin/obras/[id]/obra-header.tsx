'use client';

import { useState } from 'react';
import { Badge, Button } from '@/components/ui';
import { formatDate } from '@/lib/data/format';
import type { Obra } from '@/lib/data/types';
import EditarObraForm from './editar-obra-form';
import ObraAcciones from './obra-acciones';

export default function ObraHeader({ obra }: { obra: Obra }) {
  const [editando, setEditando] = useState(false);

  if (editando) {
    return (
      <section className="rounded-xl border border-neutral-200 bg-white p-5">
        <h2 className="mb-4 text-sm font-medium text-neutral-500">Editar obra</h2>
        <EditarObraForm obra={obra} onCancelar={() => setEditando(false)} />
      </section>
    );
  }

  return (
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
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <Button variant="secondary" size="sm" onClick={() => setEditando(true)}>
          Editar
        </Button>
        <ObraAcciones id={obra.id} activa={obra.activa} />
      </div>
    </header>
  );
}
