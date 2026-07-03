'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button, Field, Input } from '@/components/ui';
import type { Puesto } from '@/lib/data/types';
import { actualizarPuesto } from './actions';

export default function EditarPuestoForm({
  puesto,
  onDone,
  onCancel,
}: {
  puesto: Puesto;
  onDone?: () => void;
  onCancel?: () => void;
}) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    const formData = new FormData(e.currentTarget);
    const result = await actualizarPuesto(puesto.id, formData);
    setLoading(false);
    if (!result.ok) {
      setError(result.error ?? 'No se pudo guardar el puesto.');
      return;
    }
    router.refresh();
    onDone?.();
  }

  return (
    <form onSubmit={onSubmit} className="grid gap-4 sm:grid-cols-2">
      <Field label="Nombre *">
        <Input name="nombre" required defaultValue={puesto.nombre} autoFocus />
      </Field>

      <Field label="Salario por día (MXN)">
        <Input
          type="number"
          step="0.01"
          min="0"
          name="salario_dia_default"
          defaultValue={puesto.salario_dia_default}
        />
      </Field>

      {error && <p className="text-sm text-red-600 sm:col-span-2">{error}</p>}

      <div className="flex items-center gap-3 sm:col-span-2">
        <Button type="submit" disabled={loading}>
          {loading ? 'Guardando…' : 'Guardar cambios'}
        </Button>
        {onCancel && (
          <Button type="button" variant="secondary" onClick={onCancel} disabled={loading}>
            Cancelar
          </Button>
        )}
      </div>
    </form>
  );
}
