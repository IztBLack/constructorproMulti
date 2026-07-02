'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Button, Field, Input } from '@/components/ui';
import type { Obra } from '@/lib/data/types';
import { actualizarObraAction } from './actions';

function msToInputDate(ms: number | null): string {
  const d = new Date(ms ?? Date.now());
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export default function EditarObraForm({
  obra,
  onCancelar,
}: {
  obra: Obra;
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
        <Field label="Cliente" hint="Opcional">
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
