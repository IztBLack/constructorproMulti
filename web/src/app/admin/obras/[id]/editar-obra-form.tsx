'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Button, Field, Input } from '@/components/ui';
import type { Cliente, Obra } from '@/lib/data/types';
import { msAFechaInput } from '@/lib/data/tz';
import { actualizarObraAction } from './actions';

function msToInputDate(ms: number | null): string {
  return msAFechaInput(ms ?? Date.now());
}

const SELECT_CLASSES =
  'w-full cursor-pointer rounded-lg border border-neutral-300 px-3 py-2 text-sm text-neutral-900 outline-none transition focus:border-neutral-900 focus-visible:ring-2 focus-visible:ring-neutral-900/10 disabled:cursor-not-allowed disabled:opacity-50';

export default function EditarObraForm({
  obra,
  clientes,
  onCancelar,
}: {
  obra: Obra;
  clientes: Cliente[];
  onCancelar: () => void;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function handleSubmit(formData: FormData) {
    setError(null);
    startTransition(async () => {
      const result = await actualizarObraAction(obra.id, formData);
      if (!result.ok) {
        setError(result.error ?? 'No se pudo actualizar la obra.');
        return;
      }
      router.refresh();
      onCancelar();
    });
  }

  return (
    <form action={handleSubmit} className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Nombre de la obra *" className="sm:col-span-2">
          <Input name="nombre" required defaultValue={obra.nombre} disabled={pending} />
        </Field>

        <Field label="Cliente vinculado" hint="Opcional — selecciona un cliente del portal">
          <select
            name="cliente_id"
            defaultValue={obra.cliente_id ?? ''}
            disabled={pending}
            className={SELECT_CLASSES}
          >
            <option value="">Sin cliente</option>
            {clientes.map((c) => (
              <option key={c.id} value={c.id}>
                {c.nombre || c.email || c.id}
              </option>
            ))}
          </select>
        </Field>

        <Field label="Nombre de cliente (texto libre)" hint="Opcional">
          <Input name="cliente" defaultValue={obra.cliente ?? ''} disabled={pending} />
        </Field>

        <Field label="Ubicación" hint="Opcional">
          <Input name="ubicacion" defaultValue={obra.ubicacion ?? ''} disabled={pending} />
        </Field>

        <Field label="Fecha de inicio">
          <Input
            type="date"
            name="fecha_inicio"
            defaultValue={msToInputDate(obra.fecha_inicio)}
            disabled={pending}
          />
        </Field>

        <Field label="Avance (%)" hint="0 a 100">
          <Input
            type="number"
            name="avance"
            min={0}
            max={100}
            step={1}
            defaultValue={obra.avance ?? 0}
            disabled={pending}
            className="tabular-nums"
          />
        </Field>
      </div>

      {error && (
        <p className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
          {error}
        </p>
      )}

      <div className="flex items-center gap-3">
        <Button type="submit" disabled={pending}>
          {pending ? 'Guardando…' : 'Guardar cambios'}
        </Button>
        <Button type="button" variant="secondary" disabled={pending} onClick={onCancelar}>
          Cancelar
        </Button>
      </div>
    </form>
  );
}
