'use client';

import { useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button, Field, Input, Modal } from '@/components/ui';
import { crearObra } from './actions';

interface NuevaObraFormProps {
  /** Si se provee (junto con onOpenChange), el modal se vuelve controlado por el
   * padre y no se renderiza el botón disparador propio. Permite abrir el mismo
   * modal desde otro punto de la página (ej. el estado vacío del buscador). */
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
}

export default function NuevaObraForm({ open: openProp, onOpenChange }: NuevaObraFormProps = {}) {
  const router = useRouter();
  const formRef = useRef<HTMLFormElement>(null);
  const [openState, setOpenState] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const controlado = openProp !== undefined;
  const open = controlado ? openProp : openState;

  function setOpen(value: boolean) {
    if (controlado) onOpenChange?.(value);
    else setOpenState(value);
  }

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

  return (
    <>
      {!controlado && <Button onClick={() => setOpen(true)}>+ Nueva obra</Button>}

      <Modal open={open} onClose={handleClose} title="Nueva obra" size="md">
        <form ref={formRef} onSubmit={onSubmit} className="grid gap-4 sm:grid-cols-2">
          <Field label="Nombre *" className="sm:col-span-2">
            <Input name="nombre" required disabled={loading} autoFocus />
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

          <div className="flex items-center gap-3 sm:col-span-2">
            <Button type="submit" disabled={loading}>
              {loading ? 'Guardando…' : 'Guardar obra'}
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
