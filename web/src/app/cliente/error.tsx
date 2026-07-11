'use client';

import { useEffect } from 'react';
import { Button } from '@/components/ui';

/// Error boundary del portal cliente. Debe ser Client Component.
/// `unstable_retry` re-intenta el segmento sin recargar toda la app (ver
/// node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/error.md).
export default function ClienteError({
  error,
  unstable_retry,
}: {
  error: Error & { digest?: string };
  unstable_retry: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <div className="flex min-h-[50vh] items-center justify-center px-4">
      <div className="w-full max-w-sm space-y-4 text-center">
        <div className="space-y-1">
          <h1 className="text-lg font-semibold text-neutral-900">Ocurrió un error</h1>
          <p className="text-sm text-neutral-500">
            No pudimos cargar esta información. Intenta de nuevo en unos segundos.
          </p>
        </div>
        <Button onClick={() => unstable_retry()}>Reintentar</Button>
      </div>
    </div>
  );
}
