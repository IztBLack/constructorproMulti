'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Button, EmptyState, Input } from '@/components/ui';
import { formatCurrency } from '@/lib/data/format';
import type { Partida, Seccion } from '@/lib/data/types';
import { crearSeccionAction } from './actions';
import { SeccionCard } from './seccion-card';

type SeccionConPartidas = Seccion & { partidas: Partida[] };

export function SeccionesList({
  cotizacionId,
  secciones,
  aportado = {},
}: {
  cotizacionId: string;
  secciones: SeccionConPartidas[];
  /** Gasto real por partida_id (SALIDAS ligadas). Paridad móvil. */
  aportado?: Record<string, number>;
}) {
  const router = useRouter();
  const [agregando, setAgregando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function handleCrearSeccion(formData: FormData) {
    setError(null);
    startTransition(async () => {
      const result = await crearSeccionAction(cotizacionId, formData);
      if (result.error) {
        setError(result.error);
        return;
      }
      router.refresh();
      setAgregando(false);
    });
  }

  const siguienteOrden = secciones.length;
  const totalPartidas = secciones.reduce((acc, s) => acc + s.partidas.length, 0);
  // Claves de toda la cotización, para "Generar clave" sin colisión.
  const clavesExistentes = secciones
    .flatMap((s) => s.partidas.map((p) => p.clave ?? ''))
    .filter((c) => c.length > 0);
  const totalCorriente = secciones.reduce(
    (acc, s) => acc + s.partidas.reduce((sum, p) => sum + p.cantidad * p.precio_unitario, 0),
    0,
  );

  return (
    <section className="space-y-4">
      {secciones.length === 0 && !agregando && (
        <EmptyState
          title="Esta cotización no tiene secciones ni partidas todavía"
          description="Agrega una sección para empezar a capturar partidas."
        />
      )}

      {secciones.map((seccion) => (
        <SeccionCard
          key={seccion.id}
          seccion={seccion}
          cotizacionId={cotizacionId}
          aportado={aportado}
          clavesExistentes={clavesExistentes}
        />
      ))}

      {totalPartidas > 0 && (
        <div className="flex items-center justify-between rounded-xl border border-neutral-200 bg-neutral-50 px-4 py-3">
          <span className="text-sm font-medium text-neutral-600">Total corriente (sin descuento/IVA)</span>
          <span className="text-sm font-semibold tabular-nums text-neutral-900">
            {formatCurrency(totalCorriente)}
          </span>
        </div>
      )}

      {agregando ? (
        <form
          action={handleCrearSeccion}
          className="flex flex-wrap items-end gap-3 rounded-xl border border-neutral-200 bg-white p-4"
        >
          <div className="min-w-[200px] flex-1">
            <Input name="nombre" placeholder="Nombre de la sección" required disabled={pending} autoFocus />
          </div>
          <input type="hidden" name="orden" value={siguienteOrden} />
          {error && <p className="w-full text-sm text-red-600">{error}</p>}
          <Button type="submit" size="sm" disabled={pending}>
            {pending ? 'Agregando…' : 'Agregar sección'}
          </Button>
          <Button type="button" variant="ghost" size="sm" disabled={pending} onClick={() => setAgregando(false)}>
            Cancelar
          </Button>
        </form>
      ) : (
        <Button variant="secondary" onClick={() => setAgregando(true)}>
          + Agregar sección
        </Button>
      )}
    </section>
  );
}
