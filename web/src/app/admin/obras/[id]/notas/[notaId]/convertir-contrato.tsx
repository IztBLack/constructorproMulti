'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui';
import { convertirNotaEnContratoAction } from '@/app/admin/subcontratos/actions';

/**
 * «Convertir en contrato» (RF5.7): los conceptos de la nota pasan a ser el
 * alcance, la deducción con % la retención y los pagos anotados, pagos del
 * contrato. La nota no se toca.
 */
export function ConvertirEnContrato({ obraId, notaId }: { obraId: string; notaId: string }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pendiente, iniciar] = useTransition();

  return (
    <span className="inline-flex flex-col items-end gap-1">
      <Button
        type="button"
        variant="secondary"
        size="sm"
        disabled={pendiente}
        onClick={() => {
          if (!window.confirm('Se creará un contrato de subcontrato con los renglones de esta nota. La nota no cambia. ¿Continuar?')) return;
          setError(null);
          iniciar(async () => {
            const r = await convertirNotaEnContratoAction(obraId, notaId);
            if (!r.ok || !r.data) {
              setError(r.error ?? 'No se pudo convertir.');
              return;
            }
            // Los avisos (deducciones que no son retención, etc.) se enseñan
            // en el contrato: van en la URL solo como bandera, no el texto.
            router.push(`/admin/subcontratos/${r.data.id}${r.data.avisos.length ? '?revisar=1' : ''}`);
          });
        }}
      >
        {pendiente ? 'Convirtiendo…' : 'Convertir en contrato'}
      </Button>
      {error && (
        <span role="alert" className="text-xs text-red-600">
          {error}
        </span>
      )}
    </span>
  );
}
