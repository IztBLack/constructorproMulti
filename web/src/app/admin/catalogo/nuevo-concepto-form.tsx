'use client';

import { useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { crearConcepto } from './actions';

export default function NuevoConceptoForm() {
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
    const result = await crearConcepto(formData);
    setLoading(false);
    if (!result.ok) {
      setError(result.error ?? 'No se pudo crear el concepto.');
      return;
    }
    formRef.current?.reset();
    setOpen(false);
    router.refresh();
  }

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="rounded-lg bg-neutral-900 px-4 py-2 text-sm font-medium text-white hover:bg-neutral-800"
      >
        Nuevo concepto
      </button>
    );
  }

  return (
    <div className="rounded-xl border border-neutral-200 bg-white p-5">
      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-sm font-medium text-neutral-700">Nuevo concepto</h2>
        <button
          onClick={() => setOpen(false)}
          className="text-sm text-neutral-400 hover:text-neutral-600"
        >
          Cancelar
        </button>
      </div>
      <form ref={formRef} onSubmit={onSubmit} className="grid gap-4 sm:grid-cols-2">
        <label className="block space-y-1 sm:col-span-2">
          <span className="text-sm font-medium">Descripción *</span>
          <input
            name="descripcion"
            required
            className="w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm outline-none focus:border-neutral-900"
          />
        </label>
        <label className="block space-y-1">
          <span className="text-sm font-medium">Clave</span>
          <input
            name="clave"
            placeholder="Ej. CON-001"
            className="w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm outline-none focus:border-neutral-900"
          />
        </label>
        <label className="block space-y-1">
          <span className="text-sm font-medium">Categoría</span>
          <input
            name="categoria"
            placeholder="Ej. Cimentación"
            className="w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm outline-none focus:border-neutral-900"
          />
        </label>
        <label className="block space-y-1">
          <span className="text-sm font-medium">Unidad</span>
          <input
            name="unidad"
            placeholder="Ej. m2, pza, lote"
            className="w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm outline-none focus:border-neutral-900"
          />
        </label>
        <label className="block space-y-1">
          <span className="text-sm font-medium">Precio unitario (MXN)</span>
          <input
            type="number"
            step="0.01"
            min="0"
            name="precio_unitario_default"
            placeholder="0.00"
            className="w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm outline-none focus:border-neutral-900"
          />
        </label>

        {error && <p className="text-sm text-red-600 sm:col-span-2">{error}</p>}

        <div className="sm:col-span-2">
          <button
            type="submit"
            disabled={loading}
            className="rounded-lg bg-neutral-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
          >
            {loading ? 'Guardando…' : 'Guardar concepto'}
          </button>
        </div>
      </form>
    </div>
  );
}
