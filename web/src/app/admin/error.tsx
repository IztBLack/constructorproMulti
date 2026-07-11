'use client';

import { useEffect } from 'react';
import { Button, Card } from '@/components/ui';

/**
 * Error boundary del segmento /admin. Envuelve loading/page/layouts hijos
 * (no envuelve el propio layout de /admin). Debe ser Client Component.
 */
export default function AdminError({
  error,
  unstable_retry,
}: {
  error: Error & { digest?: string };
  // Next 16.2: para fallos de carga de datos usar unstable_retry (re-fetch),
  // no reset (que re-renderiza sin volver a pedir datos y re-erroraría).
  unstable_retry: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <div className="flex min-h-[50vh] items-center justify-center py-10">
      <Card className="max-w-md text-center" padding="lg">
        <div
          className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-red-50 text-red-600"
          aria-hidden="true"
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            width="24"
            height="24"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M12 9v4" />
            <path d="M12 17h.01" />
            <path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0Z" />
          </svg>
        </div>
        <h2 className="text-base font-semibold text-neutral-900">Algo salió mal</h2>
        <p className="mt-1 text-sm text-neutral-500">
          No pudimos cargar esta sección del panel. Puedes intentarlo de nuevo; si el problema
          persiste, contacta a soporte.
        </p>
        {error.digest && (
          <p className="mt-2 text-xs text-neutral-400">Referencia: {error.digest}</p>
        )}
        <Button className="mt-5" onClick={() => unstable_retry()}>
          Reintentar
        </Button>
      </Card>
    </div>
  );
}
