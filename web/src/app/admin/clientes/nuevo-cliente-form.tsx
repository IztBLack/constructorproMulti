'use client';

import { useRef, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Button, Field, Input, Modal } from '@/components/ui';
import { crearClienteAction } from './actions';

export default function NuevoClienteForm() {
  const router = useRouter();
  const formRef = useRef<HTMLFormElement>(null);
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function handleClose() {
    if (pending) return;
    setOpen(false);
    setError(null);
  }

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    const formData = new FormData(e.currentTarget);
    startTransition(async () => {
      const result = await crearClienteAction(formData);
      if (!result.ok) {
        setError(result.error ?? 'No se pudo crear el cliente.');
        return;
      }
      formRef.current?.reset();
      setOpen(false);
      if (result.id) router.push(`/admin/clientes/${result.id}`);
      else router.refresh();
    });
  }

  return (
    <>
      <Button onClick={() => setOpen(true)}>+ Nuevo cliente</Button>

      <Modal open={open} onClose={handleClose} title="Nuevo cliente" size="md">
        <form ref={formRef} onSubmit={handleSubmit} className="space-y-4">
          <Field label="Nombre *">
            <Input name="nombre" required autoFocus disabled={pending} />
          </Field>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Correo" hint="Para su acceso al portal">
              <Input name="email" type="email" disabled={pending} />
            </Field>
            <Field label="Teléfono">
              <Input name="telefono" type="tel" disabled={pending} />
            </Field>
          </div>

          {error && <p className="text-sm text-red-600">{error}</p>}

          <div className="flex items-center gap-3">
            <Button type="submit" disabled={pending}>
              {pending ? 'Guardando…' : 'Guardar cliente'}
            </Button>
            <Button type="button" variant="secondary" disabled={pending} onClick={handleClose}>
              Cancelar
            </Button>
          </div>
        </form>
      </Modal>
    </>
  );
}
