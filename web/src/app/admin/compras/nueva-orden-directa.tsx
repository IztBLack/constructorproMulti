'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Button, Field, Select } from '@/components/ui';
import { crearOrdenDirectaAction } from './actions';

/**
 * Compra directa (sin requisición): se elige obra y proveedor, nace un
 * borrador vacío y se llena en su pantalla. Para cuando el admin compra sin
 * que nadie en obra lo haya pedido por la app.
 */
export function NuevaOrdenDirecta({
  obras,
  proveedores,
}: {
  obras: { id: string; nombre: string }[];
  proveedores: { id: string; nombre: string }[];
}) {
  const router = useRouter();
  const [obra, setObra] = useState('');
  const [prov, setProv] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [pendiente, startTransition] = useTransition();

  if (proveedores.length === 0) {
    return (
      <p className="text-sm text-neutral-600">
        Primero da de alta a tus proveedores en{' '}
        <a className="font-medium text-blue-700 underline" href="/admin/compras/proveedores">
          Proveedores
        </a>
        .
      </p>
    );
  }

  return (
    <form
      className="grid gap-3 sm:grid-cols-[1fr_1fr_auto] sm:items-end"
      onSubmit={(e) => {
        e.preventDefault();
        setError(null);
        startTransition(async () => {
          const r = await crearOrdenDirectaAction(obra, prov);
          if (!r.ok || !r.id) {
            setError(r.error ?? 'No se pudo crear la orden.');
            return;
          }
          router.push(`/admin/compras/ordenes/${r.id}`);
        });
      }}
    >
      <Field label="Obra">
        <Select value={obra} onChange={(e) => setObra(e.target.value)} required>
          <option value="">Elige la obra…</option>
          {obras.map((o) => (
            <option key={o.id} value={o.id}>
              {o.nombre}
            </option>
          ))}
        </Select>
      </Field>
      <Field label="Proveedor">
        <Select value={prov} onChange={(e) => setProv(e.target.value)} required>
          <option value="">Elige el proveedor…</option>
          {proveedores.map((p) => (
            <option key={p.id} value={p.id}>
              {p.nombre}
            </option>
          ))}
        </Select>
      </Field>
      <Button type="submit" disabled={pendiente || !obra || !prov}>
        {pendiente ? 'Creando…' : 'Nueva orden'}
      </Button>
      {error && (
        <p role="alert" className="text-sm text-red-700 sm:col-span-3">
          {error}
        </p>
      )}
    </form>
  );
}
