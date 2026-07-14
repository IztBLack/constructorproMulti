'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui';
import { aprobarCambios } from './responder-actions';

/// Botón para que el cliente apruebe los cambios que el contratista hizo después
/// de su aceptación. Con paso de confirmación explícita (acción vinculante).
export function AprobarCambios({ cotizacionId }: { cotizacionId: string }) {
  const router = useRouter();
  const [confirmando, setConfirmando] = useState(false);
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleAprobar() {
    setConfirmando(false);
    setCargando(true);
    setError(null);

    const resultado = await aprobarCambios(cotizacionId);

    if (!resultado.ok) {
      setError(resultado.error ?? 'Ocurrió un error inesperado.');
      setCargando(false);
      return;
    }

    setCargando(false);
    router.refresh();
  }

  return (
    <div className="space-y-3">
      {confirmando ? (
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-sm text-neutral-700">
            ¿Apruebas la cotización con estos cambios?
          </span>
          <Button variant="primary" size="sm" disabled={cargando} onClick={handleAprobar} className="cursor-pointer">
            Sí, aprobar cambios
          </Button>
          <Button variant="ghost" size="sm" disabled={cargando} onClick={() => setConfirmando(false)} className="cursor-pointer">
            Cancelar
          </Button>
        </div>
      ) : (
        <Button
          variant="primary"
          size="md"
          disabled={cargando}
          onClick={() => setConfirmando(true)}
          className="cursor-pointer"
        >
          {cargando ? 'Aprobando…' : 'Aprobar cambios'}
        </Button>
      )}

      {error && (
        <p role="alert" className="text-sm font-medium text-red-600">
          {error}
        </p>
      )}
    </div>
  );
}
