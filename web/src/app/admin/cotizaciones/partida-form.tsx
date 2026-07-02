'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Button, Input } from '@/components/ui';
import type { Partida } from '@/lib/data/types';
import { actualizarPartidaAction, crearPartidaAction } from './actions';

type Props =
  | { mode: 'crear'; seccionId: string; cotizacionId: string; siguienteOrden: number; onListo: () => void }
  | { mode: 'editar'; partida: Partida; cotizacionId: string; onListo: () => void };

export function PartidaForm(props: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const partida = props.mode === 'editar' ? props.partida : null;

  function handleSubmit(formData: FormData) {
    setError(null);
    startTransition(async () => {
      const result =
        props.mode === 'crear'
          ? await crearPartidaAction(props.seccionId, props.cotizacionId, formData)
          : await actualizarPartidaAction(props.partida.id, props.cotizacionId, formData);

      if (result.error) {
        setError(result.error);
        return;
      }

      router.refresh();
      props.onListo();
    });
  }

  return (
    <form action={handleSubmit} className="space-y-3 rounded-lg border border-neutral-200 bg-neutral-50 p-4">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-6">
        <Input
          name="clave"
          placeholder="Clave"
          defaultValue={partida?.clave ?? ''}
          disabled={pending}
          className="sm:col-span-1"
        />
        <Input
          name="descripcion"
          placeholder="Descripción"
          required
          defaultValue={partida?.descripcion ?? ''}
          disabled={pending}
          className="col-span-2 sm:col-span-2"
        />
        <Input
          name="unidad"
          placeholder="Unidad"
          defaultValue={partida?.unidad ?? ''}
          disabled={pending}
        />
        <Input
          type="number"
          name="cantidad"
          placeholder="Cantidad"
          step="0.01"
          min={0}
          required
          defaultValue={partida?.cantidad ?? 1}
          disabled={pending}
        />
        <Input
          type="number"
          name="precio_unitario"
          placeholder="Precio unitario"
          step="0.01"
          min={0}
          required
          defaultValue={partida?.precio_unitario ?? 0}
          disabled={pending}
        />
      </div>

      <input
        type="hidden"
        name="orden"
        value={props.mode === 'crear' ? props.siguienteOrden : partida!.orden}
      />

      {error && <p className="text-xs text-red-600">{error}</p>}

      <div className="flex items-center gap-2">
        <Button type="submit" size="sm" disabled={pending}>
          {pending ? 'Guardando…' : props.mode === 'crear' ? 'Agregar partida' : 'Guardar'}
        </Button>
        <Button type="button" variant="ghost" size="sm" disabled={pending} onClick={props.onListo}>
          Cancelar
        </Button>
      </div>
    </form>
  );
}
