'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Button, Field, Input, Select, Textarea } from '@/components/ui';
import { crearSubcontratoAction } from './actions';

/**
 * Alta directa de un contrato (sin nota). Si el subcontratista no existe en
 * el padrón, se da de alta con ese nombre (su expediente se llena después en
 * «IMSS y papeles»).
 */
export function NuevoContrato({
  obras,
  obraInicial,
}: {
  obras: { id: string; nombre: string }[];
  obraInicial?: string;
}) {
  const router = useRouter();
  const [abierto, setAbierto] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pendiente, iniciar] = useTransition();

  if (!abierto) {
    return (
      <Button type="button" variant="secondary" onClick={() => setAbierto(true)}>
        Nuevo contrato
      </Button>
    );
  }

  return (
    <form
      action={(fd) => {
        setError(null);
        iniciar(async () => {
          const r = await crearSubcontratoAction(fd);
          if (!r.ok || !r.data) {
            setError(r.error ?? 'No se pudo crear.');
            return;
          }
          router.push(`/admin/subcontratos/${r.data.id}`);
        });
      }}
      className="grid gap-3 rounded-xl border border-neutral-200 bg-white p-4 sm:grid-cols-2"
    >
      <Field label="Obra *">
        <Select name="obra_id" required defaultValue={obraInicial ?? ''}>
          <option value="" disabled>
            Elige la obra
          </option>
          {obras.map((o) => (
            <option key={o.id} value={o.id}>
              {o.nombre}
            </option>
          ))}
        </Select>
      </Field>
      <Field label="Subcontratista *" hint="Si ya está en tu padrón se usa el mismo; si no, se da de alta.">
        <Input name="subcontratista" required maxLength={200} />
      </Field>
      <Field label="Alcance" className="sm:col-span-2" hint="Qué trabajos va a hacer. Los conceptos con importe se agregan después.">
        <Textarea name="alcance" rows={3} maxLength={4000} />
      </Field>
      {error && (
        <p role="alert" className="text-sm text-red-600 sm:col-span-2">
          {error}
        </p>
      )}
      <div className="flex flex-wrap gap-2 sm:col-span-2">
        <Button type="submit" disabled={pendiente}>
          {pendiente ? 'Creando…' : 'Crear contrato'}
        </Button>
        <Button type="button" variant="ghost" onClick={() => setAbierto(false)}>
          Cancelar
        </Button>
      </div>
    </form>
  );
}
