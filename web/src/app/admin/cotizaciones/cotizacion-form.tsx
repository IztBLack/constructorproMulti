'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Button, Field, Input } from '@/components/ui';
import { IVA_POR_DEFECTO, type Cliente, type Cotizacion } from '@/lib/data/types';
import { msAFechaInput } from '@/lib/data/tz';
import { crearCotizacionAction, actualizarCotizacionAction } from './actions';

const SELECT_CLASSES =
  'w-full cursor-pointer rounded-lg border border-neutral-300 px-3 py-2 text-sm text-neutral-900 outline-none transition focus:border-neutral-900 focus-visible:ring-2 focus-visible:ring-neutral-900/10 disabled:cursor-not-allowed disabled:opacity-50';

function msToInputDate(ms: number): string {
  return msAFechaInput(ms);
}

type Props =
  /** `ivaPct` al crear = tasa vigente de la empresa; se congelará en la cotización. */
  | { mode: 'crear'; clientes: Cliente[]; ivaPct: number }
  | { mode: 'editar'; cotizacion: Cotizacion; clientes: Cliente[]; onCancelar?: () => void };

export function CotizacionForm(props: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [fechaDefault] = useState(() => Date.now());

  const cotizacion = props.mode === 'editar' ? props.cotizacion : null;
  const clientes = props.clientes;

  // Al EDITAR se muestra la tasa congelada de esa cotización, no la vigente de
  // la empresa: editar una cotización no le cambia el IVA con el que nació.
  const ivaPct =
    props.mode === 'crear' ? props.ivaPct : (props.cotizacion.iva_porcentaje ?? IVA_POR_DEFECTO);

  // Cliente unificado: si se elige un cliente del portal, se autocompleta el nombre
  // (solo lectura); si no, el nombre se captura a mano en texto libre.
  const [clienteId, setClienteId] = useState(cotizacion?.cliente_id ?? '');
  const clienteVinculado = clientes.find((c) => c.id === clienteId) ?? null;

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
        <Field
          label="Cliente"
          hint="Elige un cliente registrado en el portal, o deja «Cliente sin vincular» para capturar el nombre a mano"
        >
          <select
            name="cliente_id"
            value={clienteId}
            onChange={(e) => setClienteId(e.target.value)}
            disabled={pending}
            className={SELECT_CLASSES}
          >
            <option value="">Cliente sin vincular (texto libre)</option>
            {clientes.map((c) => (
              <option key={c.id} value={c.id}>
                {c.nombre || c.email || c.id}
              </option>
            ))}
          </select>
        </Field>

        {clienteVinculado ? (
          <Field label="Nombre del cliente" hint="Autocompletado del cliente vinculado al portal">
            <Input
              name="cliente"
              value={clienteVinculado.nombre || clienteVinculado.email || ''}
              readOnly
              disabled={pending}
              className="bg-neutral-50 text-neutral-500"
            />
          </Field>
        ) : (
          <Field label="Cliente (texto libre)" hint="Opcional">
            <Input name="cliente" defaultValue={cotizacion?.cliente ?? ''} disabled={pending} />
          </Field>
        )}

        <Field label="Nombre del proyecto" hint="Opcional">
          <Input
            name="nombre_proyecto"
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
          defaultChecked={cotizacion?.iva_enabled ?? true}
          disabled={pending}
          className="h-4 w-4 rounded border-neutral-300 text-neutral-900 focus:ring-neutral-900"
        />
        Aplicar IVA ({ivaPct}%)
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
