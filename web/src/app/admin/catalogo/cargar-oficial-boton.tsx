'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui';
import { cargarCatalogoOficial } from './actions';

/** Carga el catálogo oficial (semilla), agregando solo lo que falta. Paridad móvil. */
export default function CargarOficialBoton() {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [aviso, setAviso] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  function handle() {
    setAviso(null);
    setError(null);
    startTransition(async () => {
      const r = await cargarCatalogoOficial();
      if (!r.ok) {
        setError(r.error ?? 'No se pudo cargar el catálogo.');
        return;
      }
      setAviso(
        r.agregados === 0
          ? 'El catálogo oficial ya estaba cargado.'
          : `${r.agregados} conceptos oficiales agregados.`,
      );
      router.refresh();
    });
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <Button variant="secondary" onClick={handle} disabled={pending}>
        {pending ? 'Cargando…' : 'Cargar catálogo oficial'}
      </Button>
      {aviso && <span className="text-xs text-green-700">{aviso}</span>}
      {error && <span className="text-xs text-red-600">{error}</span>}
    </div>
  );
}
