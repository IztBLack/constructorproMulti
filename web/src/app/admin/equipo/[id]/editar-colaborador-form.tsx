'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button, Field, Input } from '@/components/ui';
import type { Colaborador, Puesto } from '@/lib/data/types';
import { actualizarColaborador } from '../actions';

export default function EditarColaboradorForm({
  colaborador,
  puestos,
}: {
  colaborador: Colaborador;
  puestos: Puesto[];
}) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setSuccess(false);
    const formData = new FormData(e.currentTarget);
    const result = await actualizarColaborador(colaborador.id, formData);
    setLoading(false);
    if (!result.ok) {
      setError(result.error ?? 'No se pudo actualizar el colaborador.');
      return;
    }
    setSuccess(true);
    router.refresh();
  }

  return (
    <form onSubmit={onSubmit} className="grid gap-4 sm:grid-cols-2">
      <Field label="Nombre *" className="sm:col-span-2">
        <Input name="nombre" required defaultValue={colaborador.nombre} />
      </Field>

      <Field label="Puesto">
        <select
          name="puesto_id"
          defaultValue={colaborador.puesto_id ?? ''}
          className="w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm text-neutral-900 outline-none focus:border-neutral-900"
        >
          <option value="">Sin puesto</option>
          {puestos.map((p) => (
            <option key={p.id} value={p.id}>
              {p.nombre}
            </option>
          ))}
        </select>
      </Field>

      <Field label="Tipo de pago">
        <select
          name="tipo_pago"
          defaultValue={colaborador.tipo_pago}
          className="w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm text-neutral-900 outline-none focus:border-neutral-900"
        >
          <option value="DIA">Por día</option>
          <option value="DESTAJO">Por destajo</option>
        </select>
      </Field>

      <Field label="Teléfono">
        <Input name="telefono" defaultValue={colaborador.telefono ?? ''} />
      </Field>

      <Field label="Salario personalizado (MXN/día)" hint="Vacío para usar el del puesto.">
        <Input
          type="number"
          step="0.01"
          min="0"
          name="salario_personalizado"
          defaultValue={colaborador.salario_personalizado ?? ''}
          placeholder="Usar el del puesto"
        />
      </Field>

      <div className="sm:col-span-2 border-t border-neutral-100 pt-4">
        <p className="mb-3 text-sm font-medium text-neutral-700">Contacto de emergencia</p>
        <div className="grid gap-4 sm:grid-cols-3">
          <Field label="Nombre">
            <Input name="contacto_nombre" defaultValue={colaborador.contacto_nombre ?? ''} />
          </Field>
          <Field label="Teléfono">
            <Input name="contacto_telefono" defaultValue={colaborador.contacto_telefono ?? ''} />
          </Field>
          <Field label="Parentesco">
            <Input name="contacto_parentesco" defaultValue={colaborador.contacto_parentesco ?? ''} />
          </Field>
        </div>
      </div>

      {error && <p className="text-sm text-red-600 sm:col-span-2">{error}</p>}
      {success && !error && (
        <p className="text-sm text-green-600 sm:col-span-2">Cambios guardados.</p>
      )}

      <div className="sm:col-span-2">
        <Button type="submit" disabled={loading}>
          {loading ? 'Guardando…' : 'Guardar cambios'}
        </Button>
      </div>
    </form>
  );
}
