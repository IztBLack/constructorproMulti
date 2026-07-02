'use client';

import { useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button, Field, Input } from '@/components/ui';
import { crearObra } from './actions';

export default function NuevaObraForm() {
  const router = useRouter();
  const formRef = useRef<HTMLFormElement>(null);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    const formData = new FormData(e.currentTarget);
    const result = await crearObra(formData);
    setLoading(false);
    if (!result.ok) {
      setError(result.error ?? 'No se pudo crear la obra.');
      return;
    }
    formRef.current?.reset();
    setOpen(false);
    router.refresh();
  }

  if (!open) {
    return (
      <Button onClick={() => setOpen(true)}>
        + Nueva obra
      </Button>
    );
  }

  return (
    <div className="rounded-xl border border-neutral-200 bg-white p-5">
      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-sm font-medium text-neutral-700">Nueva obra</h2>
        <Button variant="ghost" size="sm" onClick={() => setOpen(false)}>
          Cancelar
        </Button>
      </div>
      <form ref={formRef} onSubmit={onSubmit} className="grid gap-4 sm:grid-cols-2">
        <Field label="Nombre *" className="sm:col-span-2">
          <Input name="nombre" required disabled={loading} />
        </Field>
        <Field label="Cliente">
          <Input name="cliente" disabled={loading} />
        </Field>
        <Field label="Ubicación">
          <Input name="ubicacion" disabled={loading} />
        </Field>
        <Field label="Fecha de inicio">
          <Input type="date" name="fecha_inicio" disabled={loading} />
        </Field>

        {error && <p className="text-sm text-red-600 sm:col-span-2">{error}</p>}

        <div className="sm:col-span-2">
          <Button type="submit" disabled={loading}>
            {loading ? 'Guardando…' : 'Guardar obra'}
          </Button>
        </div>
      </form>
    </div>
  );
}
