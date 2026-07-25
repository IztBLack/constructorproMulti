'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Button, Input } from '@/components/ui';
import { formatCurrency } from '@/lib/data/format';
import type { Destajo } from '@/lib/data/types';
import { crearDestajoAction, eliminarDestajoAction } from './actions';

interface Worker {
  id: string;
  nombre: string;
}

/**
 * Captura/borrado de destajos INDIVIDUALES por colaborador de destajo, para la
 * semana mostrada (paridad móvil). El `fecha` de cada destajo es el inicio de la
 * semana, para que sume en esta nómina.
 */
export function DestajosSemana({
  obraId,
  inicioMs,
  workers,
  destajos,
}: {
  obraId: string;
  inicioMs: number;
  workers: Worker[];
  destajos: Destajo[];
}) {
  if (workers.length === 0) return null;

  return (
    <section className="space-y-3">
      <h2 className="text-sm font-medium text-neutral-700">
        Destajos por colaborador (esta semana)
      </h2>
      <div className="space-y-3">
        {workers.map((w) => (
          <DestajoColaborador
            key={w.id}
            obraId={obraId}
            inicioMs={inicioMs}
            worker={w}
            destajos={destajos.filter((d) => d.colaborador_id === w.id)}
          />
        ))}
      </div>
    </section>
  );
}

function DestajoColaborador({
  obraId,
  inicioMs,
  worker,
  destajos,
}: {
  obraId: string;
  inicioMs: number;
  worker: Worker;
  destajos: Destajo[];
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [concepto, setConcepto] = useState('');
  const [monto, setMonto] = useState('');
  const [error, setError] = useState<string | null>(null);

  const total = destajos.reduce((s, d) => s + d.monto, 0);

  function agregar() {
    setError(null);
    const m = Number.parseFloat(monto.replace(',', '.'));
    startTransition(async () => {
      const r = await crearDestajoAction(obraId, worker.id, inicioMs, concepto, m || 0);
      if (r.error) {
        setError(r.error);
        return;
      }
      setConcepto('');
      setMonto('');
      router.refresh();
    });
  }

  function borrar(id: string) {
    setError(null);
    startTransition(async () => {
      const r = await eliminarDestajoAction(id, obraId);
      if (r.error) {
        setError(r.error);
        return;
      }
      router.refresh();
    });
  }

  return (
    <div className="rounded-xl border border-neutral-200 bg-white p-4">
      <div className="mb-2 flex items-center justify-between">
        <span className="text-sm font-semibold text-neutral-800">{worker.nombre}</span>
        <span className="text-sm tabular-nums text-neutral-600">{formatCurrency(total)}</span>
      </div>

      {destajos.length > 0 && (
        <ul className="mb-3 space-y-1">
          {destajos.map((d) => (
            <li key={d.id} className="flex items-center justify-between gap-3 text-sm">
              <span className="text-neutral-700">{d.concepto || 'Destajo'}</span>
              <span className="flex items-center gap-3">
                <span className="tabular-nums text-neutral-600">{formatCurrency(d.monto)}</span>
                <button
                  type="button"
                  onClick={() => borrar(d.id)}
                  disabled={pending}
                  className="text-xs text-red-600 hover:underline disabled:opacity-50"
                >
                  Quitar
                </button>
              </span>
            </li>
          ))}
        </ul>
      )}

      <div className="flex flex-wrap items-end gap-2">
        <Input
          placeholder="Concepto del destajo"
          value={concepto}
          onChange={(e) => setConcepto(e.target.value)}
          disabled={pending}
          className="min-w-[160px] flex-1"
        />
        <Input
          type="number"
          step="0.01"
          min={0}
          placeholder="Monto"
          value={monto}
          onChange={(e) => setMonto(e.target.value)}
          disabled={pending}
          className="w-28"
        />
        <Button size="sm" disabled={pending || !concepto.trim() || !monto} onClick={agregar}>
          {pending ? '…' : 'Agregar'}
        </Button>
      </div>
      {error && <p className="mt-2 text-xs text-red-600">{error}</p>}
    </div>
  );
}
