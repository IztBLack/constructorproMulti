'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Button, Field, Input } from '@/components/ui';
import type { Cliente } from '@/lib/data/types';
import { actualizarClienteAction, eliminarClienteAction } from '../actions';

export default function EditarClienteForm({ cliente }: { cliente: Cliente }) {
  const router = useRouter();
  const [editando, setEditando] = useState(false);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    const formData = new FormData(e.currentTarget);
    startTransition(async () => {
      const result = await actualizarClienteAction(cliente.id, formData);
      if (!result.ok) {
        setError(result.error ?? 'No se pudo actualizar el cliente.');
        return;
      }
      setEditando(false);
      router.refresh();
    });
  }

  function handleEliminar() {
    if (!confirm(`¿Eliminar a ${cliente.nombre}? Sus obras y cotizaciones quedarán sin cliente asignado.`)) return;
    setError(null);
    startTransition(async () => {
      const result = await eliminarClienteAction(cliente.id);
      if (!result.ok) {
        setError(result.error ?? 'No se pudo eliminar el cliente.');
        return;
      }
      router.push('/admin/clientes');
      router.refresh();
    });
  }

  if (!editando) {
    return (
      <div className="flex flex-wrap items-center gap-3">
        <Button variant="secondary" size="sm" onClick={() => setEditando(true)}>
          Editar
        </Button>
        <Button variant="danger" size="sm" onClick={handleEliminar} disabled={pending}>
          Eliminar
        </Button>
        {error && <span className="text-sm text-red-600">{error}</span>}
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4 rounded-xl border border-neutral-200 bg-white p-5">
      <h2 className="text-sm font-medium text-neutral-500">Editar cliente</h2>
      <Field label="Nombre *">
        <Input name="nombre" required defaultValue={cliente.nombre} disabled={pending} />
      </Field>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Correo">
          <Input name="email" type="email" defaultValue={cliente.email} disabled={pending} />
        </Field>
        <Field label="Teléfono">
          <Input name="telefono" type="tel" defaultValue={cliente.telefono} disabled={pending} />
        </Field>
      </div>

      {error && <p className="text-sm text-red-600">{error}</p>}

      <div className="flex items-center gap-3">
        <Button type="submit" disabled={pending}>
          {pending ? 'Guardando…' : 'Guardar cambios'}
        </Button>
        <Button type="button" variant="secondary" disabled={pending} onClick={() => setEditando(false)}>
          Cancelar
        </Button>
      </div>
    </form>
  );
}
