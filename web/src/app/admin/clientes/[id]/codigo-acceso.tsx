'use client';

import { useState, useTransition } from 'react';
import { Badge, Button } from '@/components/ui';
import Contador from '../../vincular/contador';
import { generarCodigoAccesoClienteAction } from '../actions';

function formatCodigo(code: string): string {
  // Parte a la mitad para leer/dictar mejor (p.ej. 8 dígitos → "1234-5678").
  const mid = Math.ceil(code.length / 2);
  return `${code.slice(0, mid)}-${code.slice(mid)}`;
}

export default function CodigoAcceso({
  clienteId,
  vinculado,
}: {
  clienteId: string;
  vinculado: boolean;
}) {
  const [pending, startTransition] = useTransition();
  const [codigo, setCodigo] = useState<{ code: string; expiresAt: number } | null>(null);
  const [error, setError] = useState<string | null>(null);

  function generar() {
    setError(null);
    startTransition(async () => {
      const result = await generarCodigoAccesoClienteAction(clienteId);
      if (!result.ok || !result.code || !result.expiresAt) {
        setError(result.error ?? 'No se pudo generar el código.');
        return;
      }
      setCodigo({ code: result.code, expiresAt: result.expiresAt });
    });
  }

  if (vinculado) {
    return (
      <div className="flex items-center gap-3">
        <Badge tone="green">Vinculado</Badge>
        <p className="text-sm text-neutral-500">
          El cliente ya tiene acceso al portal con su cuenta.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {!codigo ? (
        <div className="flex flex-wrap items-center gap-3">
          <Button onClick={generar} disabled={pending}>
            {pending ? 'Generando…' : 'Generar código de acceso'}
          </Button>
          <p className="text-sm text-neutral-500">
            Un código de 6 dígitos, válido 10 minutos, para que el cliente entre al portal.
          </p>
        </div>
      ) : (
        <div className="rounded-xl border border-neutral-200 bg-neutral-50 p-5">
          <p className="text-sm font-medium text-neutral-500">Código de acceso</p>
          <p className="my-2 font-mono text-4xl font-bold tracking-widest text-neutral-900">
            {formatCodigo(codigo.code)}
          </p>
          <Contador expiresAt={codigo.expiresAt} />
          <p className="mt-3 max-w-md text-sm text-neutral-500">
            El cliente crea su cuenta en el portal e ingresa este código antes de que expire para
            vincularse. Puedes generar otro si expira.
          </p>
          <div className="mt-3">
            <Button variant="secondary" size="sm" onClick={generar} disabled={pending}>
              {pending ? 'Generando…' : 'Generar otro'}
            </Button>
          </div>
        </div>
      )}

      {error && <p className="text-sm text-red-600">{error}</p>}
    </div>
  );
}
