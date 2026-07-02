'use client';

import { useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import type { Puesto } from '@/lib/data/types';
import { Button, Field, Input } from '@/components/ui';
import { crearColaborador } from './actions';

export default function NuevoColaboradorForm({ puestos }: { puestos: Puesto[] }) {
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
    const result = await crearColaborador(formData);
    setLoading(false);
    if (!result.ok) {
      setError(result.error ?? 'No se pudo crear el colaborador.');
      return;
    }
    formRef.current?.reset();
    setOpen(false);
    router.refresh();
  }

  if (!open) {
    return (
      <Button onClick={() => setOpen(true)}>
        + Nuevo colaborador
      </Button>
    );
  }

  return (
    <div className="rounded-xl border border-neutral-200 bg-white p-5">
      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-sm font-medium text-neutral-700">Nuevo colaborador</h2>
        <button
          type="button"
          onClick={() => setOpen(false)}
          className="cursor-pointer text-sm text-neutral-400 transition hover:text-neutral-600"
        >
          Cancelar
        </button>
      </div>
      <form ref={formRef} onSubmit={onSubmit} className="grid gap-4 sm:grid-cols-2">
        <Field label="Nombre *" className="sm:col-span-2">
          <Input name="nombre" required />
        </Field>

        <Field
          label="Puesto"
          hint={
            puestos.length === 0
              ? undefined
              : undefined
          }
        >
          <select
            name="puesto_id"
            className="w-full cursor-pointer rounded-lg border border-neutral-300 px-3 py-2 text-sm text-neutral-900 outline-none transition focus:border-neutral-900 focus-visible:ring-2 focus-visible:ring-neutral-900/10"
          >
            <option value="">Sin puesto</option>
            {puestos.map((p) => (
              <option key={p.id} value={p.id}>
                {p.nombre}
              </option>
            ))}
          </select>
          {puestos.length === 0 && (
            <span className="block text-xs text-neutral-400">
              Aun no tienes puestos.{' '}
              <Link href="/admin/puestos" className="underline hover:text-neutral-700">
                Crealos en Puestos
              </Link>{' '}
              para asignar salarios.
            </span>
          )}
        </Field>

        <Field label="Tipo de pago">
          <select
            name="tipo_pago"
            className="w-full cursor-pointer rounded-lg border border-neutral-300 px-3 py-2 text-sm text-neutral-900 outline-none transition focus:border-neutral-900 focus-visible:ring-2 focus-visible:ring-neutral-900/10"
          >
            <option value="DIA">Por día</option>
            <option value="DESTAJO">Por destajo</option>
          </select>
        </Field>

        <Field label="Teléfono">
          <Input name="telefono" type="tel" />
        </Field>

        <Field label="Salario personalizado (MXN/día)">
          <Input
            type="number"
            step="0.01"
            min="0"
            name="salario_personalizado"
            placeholder="Usar el del puesto"
          />
        </Field>

        {error && <p className="text-sm text-red-600 sm:col-span-2">{error}</p>}

        <div className="sm:col-span-2">
          <Button type="submit" disabled={loading}>
            {loading ? 'Guardando…' : 'Guardar colaborador'}
          </Button>
        </div>
      </form>
    </div>
  );
}
