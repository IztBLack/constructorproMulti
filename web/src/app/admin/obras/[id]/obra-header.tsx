'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Badge, Button, Modal } from '@/components/ui';
import { formatDate } from '@/lib/data/format';
import type { Cliente, Obra } from '@/lib/data/types';
import EditarObraForm from './editar-obra-form';
import ObraAcciones from './obra-acciones';

export default function ObraHeader({
  obra,
  clientes,
  obras = [],
}: {
  obra: Obra;
  clientes: Cliente[];
  /** Todas las obras, para el cambio rápido entre obras (paridad móvil). */
  obras?: { id: string; nombre: string }[];
}) {
  const router = useRouter();
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
          {obras.length > 1 && (
            <select
              aria-label="Cambiar de obra"
              value={obra.id}
              onChange={(e) => {
                if (e.target.value !== obra.id) router.push(`/admin/obras/${e.target.value}`);
              }}
              className="max-w-[200px] cursor-pointer rounded-lg border border-neutral-300 bg-white px-3 py-1.5 text-sm text-neutral-900 outline-none transition focus:border-neutral-900"
            >
              {obras.map((o) => (
                <option key={o.id} value={o.id}>
                  {o.nombre}
                </option>
              ))}
            </select>
          )}
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
