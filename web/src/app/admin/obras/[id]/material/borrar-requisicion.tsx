'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui';
import { eliminarRequisicionAction } from '@/app/admin/compras/actions';

/** Borra una requisición por aprobar o rechazada (la RLS decide si es tuya). */
export function BorrarRequisicion({ id, obraId }: { id: string; obraId: string }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pendiente, startTransition] = useTransition();
  return (
    <div className="text-right">
      <Button
        size="sm"
        variant="ghost"
        disabled={pendiente}
        onClick={() => {
          if (!window.confirm('¿Borrar esta requisición?')) return;
          startTransition(async () => {
            const r = await eliminarRequisicionAction(id, obraId);
            if (!r.ok) setError(r.error ?? 'No se pudo borrar.');
            else router.refresh();
          });
        }}
      >
        Borrar
      </Button>
      {error && (
        <p role="alert" className="text-sm text-red-700">
          {error}
        </p>
      )}
    </div>
  );
}
