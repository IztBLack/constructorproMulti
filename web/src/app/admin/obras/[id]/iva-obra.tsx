'use client';

import { Ayuda } from '@/components/guia/ayuda';
import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Button, Field, Input } from '@/components/ui';
import { textoTasaIva } from '@/lib/cliente/estado-cuenta-calculo';
import type { OrigenIva } from '@/lib/data/iva-obra';
import { guardarIvaObraAction } from './actions';

const DE_DONDE: Record<OrigenIva, string> = {
  contrato: 'fijado en las condiciones del contrato',
  cotizacion: 'tomado de la cotización de la que nació la obra',
  ninguno: 'no hay cotización ni contrato que lo diga',
};

/**
 * "¿Con qué IVA cobras esta obra?" dentro del estado de cuenta. Con él se
 * separa el IVA de lo cobrado. El admin lo fija o corrige (se guarda en el
 * contrato de la obra, el mismo IVA de sus estimaciones).
 */
export function IvaObra({
  obraId,
  tasaPct,
  origen,
  puedeCambiar,
}: {
  obraId: string;
  tasaPct: number;
  origen: OrigenIva;
  puedeCambiar: boolean;
}) {
  const router = useRouter();
  const [editando, setEditando] = useState(false);
  const [valor, setValor] = useState(tasaPct > 0 ? String(tasaPct) : '');
  const [error, setError] = useState<string | null>(null);
  const [pendiente, startTransition] = useTransition();

  const actual = tasaPct > 0 ? textoTasaIva(tasaPct) : 'Sin IVA';

  return (
    <div className="mt-4 rounded-lg border border-neutral-200 px-4 py-3 text-sm">
      {!editando ? (
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-neutral-700">
            <span className="font-medium text-neutral-900">IVA con que cobras esta obra: {actual}</span>{' '}
            <Ayuda clave="obra.iva" />
            <span className="text-neutral-600"> · {DE_DONDE[origen]}</span>
          </p>
          {puedeCambiar && (
            <Button type="button" variant="secondary" size="sm" onClick={() => setEditando(true)}>
              {origen === 'contrato' ? 'Cambiar' : 'Fijar'}
            </Button>
          )}
        </div>
      ) : (
        <form
          className="flex flex-wrap items-end gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            setError(null);
            startTransition(async () => {
              const r = await guardarIvaObraAction(obraId, valor);
              if (!r.ok) {
                setError(r.error ?? 'No se pudo guardar.');
                return;
              }
              setEditando(false);
              router.refresh();
            });
          }}
        >
          <Field
            label="IVA de la obra (%)"
            hint="16 normal, 8 en la frontera norte, 0 si se cobra sin IVA. Es también el IVA de sus estimaciones."
          >
            <Input
              name="iva_pct"
              inputMode="decimal"
              value={valor}
              onChange={(e) => setValor(e.target.value)}
              placeholder="16"
              className="w-28"
            />
          </Field>
          <Button type="submit" disabled={pendiente}>
            {pendiente ? 'Guardando…' : 'Guardar'}
          </Button>
          <Button type="button" variant="ghost" disabled={pendiente} onClick={() => setEditando(false)}>
            Cancelar
          </Button>
        </form>
      )}
      {error && (
        <p role="alert" className="mt-2 text-sm text-red-700">
          {error}
        </p>
      )}
    </div>
  );
}
