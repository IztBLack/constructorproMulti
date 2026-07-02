'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Button, Input } from '@/components/ui';
import type { Partida, Seccion } from '@/lib/data/types';
import { crearSeccionAction } from './actions';
import { SeccionCard } from './seccion-card';

type SeccionConPartidas = Seccion & { partidas: Partida[] };

export function SeccionesList({
  cotizacionId,
  secciones,
}: {
  cotizacionId: string;
  secciones: SeccionConPartidas[];
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

  return (
    <section className="space-y-4">
      {secciones.length === 0 && !agregando && (
        <p className="rounded-xl border border-dashed border-neutral-300 p-8 text-center text-sm text-neutral-400">
          Esta cotización no tiene secciones ni partidas todavía.
        </p>
      )}

      {secciones.map((seccion) => (
        <SeccionCard key={seccion.id} seccion={seccion} cotizacionId={cotizacionId} />
      ))}

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
