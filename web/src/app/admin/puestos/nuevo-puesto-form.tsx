'use client';

import { useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button, Field, Input, Modal } from '@/components/ui';
import { crearPuesto } from './actions';

export default function NuevoPuestoForm() {
  const router = useRouter();
  const formRef = useRef<HTMLFormElement>(null);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function handleClose() {
    if (loading) return;
    setOpen(false);
    setError(null);
  }

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    const formData = new FormData(e.currentTarget);
    const result = await crearPuesto(formData);
    setLoading(false);
    if (!result.ok) {
      setError(result.error ?? 'No se pudo crear el puesto.');
      return;
    }
    formRef.current?.reset();
    setOpen(false);
    router.refresh();
  }

  return (
    <>
      <Button onClick={() => setOpen(true)}>Nuevo puesto</Button>

      <Modal open={open} onClose={handleClose} title="Nuevo puesto" size="sm">
        <form ref={formRef} onSubmit={onSubmit} className="grid gap-4 sm:grid-cols-2">
          <Field label="Nombre *" className="sm:col-span-2">
            <Input name="nombre" required autoFocus disabled={loading} />
          </Field>
          <Field label="Salario por día (MXN)" className="sm:col-span-2">
            <Input
              type="number"
              step="0.01"
              min="0"
              name="salario_dia_default"
              placeholder="0.00"
              disabled={loading}
            />
          </Field>

          {error && <p className="text-sm text-red-600 sm:col-span-2">{error}</p>}

          <div className="flex items-center gap-3 sm:col-span-2">
            <Button type="submit" disabled={loading}>
              {loading ? 'Guardando…' : 'Guardar puesto'}
            </Button>
            <Button type="button" variant="secondary" disabled={loading} onClick={handleClose}>
              Cancelar
            </Button>
          </div>
        </form>
      </Modal>
    </>
  );
}
