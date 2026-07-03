'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button, Field, Input } from '@/components/ui';
import type { CatalogoConcepto } from '@/lib/data/types';
import { actualizarConcepto } from './actions';

export default function EditarConceptoForm({
  concepto,
  onDone,
  onCancel,
}: {
  concepto: CatalogoConcepto;
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
    const result = await actualizarConcepto(concepto.id, formData);
    setLoading(false);
    if (!result.ok) {
      setError(result.error ?? 'No se pudo guardar el concepto.');
      return;
    }
    router.refresh();
    onDone?.();
  }

  return (
    <form onSubmit={onSubmit} className="grid gap-4 sm:grid-cols-2">
      <Field label="Descripción *" className="sm:col-span-2">
        <Input name="descripcion" required defaultValue={concepto.descripcion} autoFocus />
      </Field>

      <Field label="Clave">
        <Input name="clave" defaultValue={concepto.clave ?? ''} />
      </Field>

      <Field label="Categoría">
        <Input name="categoria" defaultValue={concepto.categoria ?? ''} />
      </Field>

      <Field label="Unidad">
        <Input name="unidad" defaultValue={concepto.unidad ?? ''} />
      </Field>

      <Field label="Precio unitario (MXN)">
        <Input
          type="number"
          step="0.01"
          min="0"
          name="precio_unitario_default"
          defaultValue={concepto.precio_unitario_default}
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
