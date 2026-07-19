'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button, Field, Input, Modal } from '@/components/ui';
import type { CuadrillaDetalle } from '@/lib/data/cuadrillas';
import { editarCuadrilla, setActivaCuadrilla } from '../actions';
import { ESPECIALIDADES } from '../especialidades';

const SELECT_CLASS =
  'w-full cursor-pointer rounded-lg border border-neutral-300 px-3 py-2 text-sm text-neutral-900 outline-none transition focus:border-neutral-900 focus-visible:ring-2 focus-visible:ring-neutral-900/10';

export default function EditarCuadrillaForm({ cuadrilla }: { cuadrilla: CuadrillaDetalle }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    const r = await editarCuadrilla(cuadrilla.id, new FormData(e.currentTarget));
    setLoading(false);
    if (!r.ok) {
      setError(r.error ?? 'No se pudo guardar.');
      return;
    }
    setOpen(false);
    router.refresh();
  }

  async function onToggleActiva() {
    setLoading(true);
    await setActivaCuadrilla(cuadrilla.id, !cuadrilla.activa);
    setLoading(false);
    router.refresh();
  }

  return (
    <div className="flex items-center gap-2">
      <Button variant="secondary" size="sm" disabled={loading} onClick={onToggleActiva}>
        {cuadrilla.activa ? 'Marcar inactiva' : 'Marcar activa'}
      </Button>
      <Button onClick={() => setOpen(true)}>Editar</Button>

      <Modal open={open} onClose={() => !loading && setOpen(false)} title="Editar cuadrilla" size="md">
        <form onSubmit={onSubmit} className="grid gap-4">
          <Field label="Nombre *">
            <Input name="nombre" required defaultValue={cuadrilla.nombre} autoFocus />
          </Field>
          <Field label="Especialidad">
            <select name="especialidad" defaultValue={cuadrilla.especialidad} className={SELECT_CLASS}>
              {ESPECIALIDADES.map((e) => (
                <option key={e.value} value={e.value}>
                  {e.label}
                </option>
              ))}
            </select>
          </Field>
          {error && <p className="text-sm text-red-600">{error}</p>}
          <div className="flex items-center gap-3">
            <Button type="submit" disabled={loading}>
              {loading ? 'Guardando…' : 'Guardar'}
            </Button>
            <Button type="button" variant="secondary" disabled={loading} onClick={() => setOpen(false)}>
              Cancelar
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
