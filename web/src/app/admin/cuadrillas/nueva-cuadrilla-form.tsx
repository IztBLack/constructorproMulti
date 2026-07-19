'use client';

import { useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button, Field, Input, Modal } from '@/components/ui';
import { crearCuadrilla } from './actions';
import { ESPECIALIDADES } from './especialidades';

const SELECT_CLASS =
  'w-full cursor-pointer rounded-lg border border-neutral-300 px-3 py-2 text-sm text-neutral-900 outline-none transition focus:border-neutral-900 focus-visible:ring-2 focus-visible:ring-neutral-900/10';

export default function NuevaCuadrillaForm() {
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
    const result = await crearCuadrilla(new FormData(e.currentTarget));
    setLoading(false);
    if (!result.ok) {
      setError(result.error ?? 'No se pudo crear la cuadrilla.');
      return;
    }
    formRef.current?.reset();
    setOpen(false);
    router.refresh();
  }

  return (
    <>
      <Button onClick={() => setOpen(true)}>+ Nueva cuadrilla</Button>

      <Modal open={open} onClose={handleClose} title="Nueva cuadrilla" size="md">
        <form ref={formRef} onSubmit={onSubmit} className="grid gap-4">
          <Field label="Nombre *">
            <Input name="nombre" required autoFocus placeholder="Ej. Fierreros" />
          </Field>

          <Field label="Especialidad">
            <select name="especialidad" defaultValue="MIXTA" className={SELECT_CLASS}>
              {ESPECIALIDADES.map((e) => (
                <option key={e.value} value={e.value}>
                  {e.label}
                </option>
              ))}
            </select>
          </Field>

          <p className="text-xs text-neutral-500">
            Después de crearla, entra a la cuadrilla para agregar miembros, marcar el cabo y
            asignarla a una obra.
          </p>

          {error && <p className="text-sm text-red-600">{error}</p>}

          <div className="flex items-center gap-3">
            <Button type="submit" disabled={loading}>
              {loading ? 'Guardando…' : 'Guardar cuadrilla'}
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
