'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Button, Field, Input } from '@/components/ui';
import type { Cotizacion, EstadoCotizacion } from '@/lib/data/types';
import { crearCotizacionAction, actualizarCotizacionAction } from './actions';

const ESTADOS: EstadoCotizacion[] = ['BORRADOR', 'ENVIADA', 'ACEPTADA', 'RECHAZADA', 'CONVERTIDA'];

const ESTADO_LABEL: Record<EstadoCotizacion, string> = {
  BORRADOR: 'Borrador',
  ENVIADA: 'Enviada',
  ACEPTADA: 'Aceptada',
  RECHAZADA: 'Rechazada',
  CONVERTIDA: 'Convertida',
};

function msToInputDate(ms: number): string {
  const d = new Date(ms);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

type Props =
  | { mode: 'crear' }
  | { mode: 'editar'; cotizacion: Cotizacion; onCancelar?: () => void };

export function CotizacionForm(props: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [fechaDefault] = useState(() => Date.now());

  const cotizacion = props.mode === 'editar' ? props.cotizacion : null;

  function handleSubmit(formData: FormData) {
    setError(null);
    startTransition(async () => {
      if (props.mode === 'crear') {
        const result = await crearCotizacionAction(formData);
        if (result.error) {
          setError(result.error);
          return;
        }
        if (result.id) router.push(`/admin/cotizaciones/${result.id}`);
        return;
      }

      const result = await actualizarCotizacionAction(props.cotizacion.id, formData);
      if (result.error) {
        setError(result.error);
        return;
      }
      router.refresh();
      props.onCancelar?.();
    });
  }

  return (
    <form action={handleSubmit} className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Cliente">
          <Input name="cliente" required defaultValue={cotizacion?.cliente ?? ''} disabled={pending} />
        </Field>
        <Field label="Nombre del proyecto">
          <Input
            name="nombre_proyecto"
            required
            defaultValue={cotizacion?.nombre_proyecto ?? ''}
            disabled={pending}
          />
        </Field>
        <Field label="Ubicación" hint="Opcional">
          <Input name="ubicacion" defaultValue={cotizacion?.ubicacion ?? ''} disabled={pending} />
        </Field>
        <Field label="Fecha">
          <Input
            type="date"
            name="fecha"
            required
            defaultValue={msToInputDate(cotizacion?.fecha ?? fechaDefault)}
            disabled={pending}
          />
        </Field>
        <Field label="Estado">
          <select
            name="estado"
            defaultValue={cotizacion?.estado ?? 'BORRADOR'}
            disabled={pending}
            className="w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm text-neutral-900 outline-none transition focus:border-neutral-900 focus-visible:ring-2 focus-visible:ring-neutral-900/10"
          >
            {ESTADOS.map((e) => (
              <option key={e} value={e}>
                {ESTADO_LABEL[e]}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Descuento (%)" hint="0 a 100">
          <Input
            type="number"
            name="descuento"
            min={0}
            max={100}
            step="0.01"
            defaultValue={cotizacion?.descuento ?? 0}
            disabled={pending}
          />
        </Field>
      </div>

      <label className="flex items-center gap-2 text-sm text-neutral-700">
        <input
          type="checkbox"
          name="iva_enabled"
          defaultChecked={cotizacion?.iva_enabled ?? false}
          disabled={pending}
          className="h-4 w-4 rounded border-neutral-300 text-neutral-900 focus:ring-neutral-900"
        />
        Aplicar IVA (16%)
      </label>

      <Field label="Notas" hint="Opcional">
        <textarea
          name="notas"
          rows={3}
          defaultValue={cotizacion?.notas ?? ''}
          disabled={pending}
          className="w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm text-neutral-900 outline-none transition placeholder:text-neutral-400 focus:border-neutral-900 focus-visible:ring-2 focus-visible:ring-neutral-900/10"
        />
      </Field>

      {error && (
        <p className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</p>
      )}

      <div className="flex items-center gap-3">
        <Button type="submit" disabled={pending}>
          {pending ? 'Guardando…' : props.mode === 'crear' ? 'Crear cotización' : 'Guardar cambios'}
        </Button>
        {props.mode === 'editar' && (
          <Button type="button" variant="secondary" disabled={pending} onClick={props.onCancelar}>
            Cancelar
          </Button>
        )}
      </div>
    </form>
  );
}
