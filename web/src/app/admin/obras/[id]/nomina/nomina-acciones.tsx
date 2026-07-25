'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui';
import { formatCurrency } from '@/lib/data/format';
import { registrarNominaEnCajaAction } from './actions';

/** Botón que registra la nómina de la semana como salida de caja (paridad móvil). */
export function RegistrarNominaCaja({
  obraId,
  inicioMs,
  finMs,
  total,
}: {
  obraId: string;
  inicioMs: number;
  finMs: number;
  total: number;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [confirmando, setConfirmando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [ok, setOk] = useState(false);

  function handle() {
    setError(null);
    startTransition(async () => {
      const r = await registrarNominaEnCajaAction(obraId, inicioMs, finMs, total);
      setConfirmando(false);
      if (r.error) {
        setError(r.error);
        return;
      }
      setOk(true);
      router.refresh();
    });
  }

  if (total <= 0) return null;

  return (
    <div className="space-y-2">
      {ok ? (
        <p className="rounded-lg border border-green-200 bg-green-50 p-3 text-sm text-green-800">
          Nómina registrada en la caja de la obra.
        </p>
      ) : confirmando ? (
        <div className="flex flex-wrap items-center gap-3 rounded-lg border border-amber-200 bg-amber-50 p-3">
          <span className="text-sm text-neutral-800">
            ¿Registrar {formatCurrency(total)} como salida en la caja de la obra?
          </span>
          <Button size="sm" disabled={pending} onClick={handle}>
            {pending ? 'Registrando…' : 'Sí, registrar'}
          </Button>
          <Button variant="ghost" size="sm" disabled={pending} onClick={() => setConfirmando(false)}>
            Cancelar
          </Button>
        </div>
      ) : (
        <Button variant="secondary" onClick={() => setConfirmando(true)}>
          Registrar nómina en caja
        </Button>
      )}
      {error && <p className="text-sm text-red-600">{error}</p>}
    </div>
  );
}
