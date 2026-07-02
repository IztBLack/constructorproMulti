'use client';

import { useState, useTransition } from 'react';
import { Badge, Button, Card, CardTitle, PageHeader } from '@/components/ui';
import { generarCodigoVinculacion, verificarEstadoCodigo } from './actions';
import Contador from './contador';

export const dynamic = 'force-dynamic';

/** Formatea un código de 6 dígitos como "482-931". */
function formatCodigo(code: string): string {
  return `${code.slice(0, 3)}-${code.slice(3)}`;
}

interface CodigoState {
  code: string;
  expiresAt: number;
  usado: boolean;
}

export default function VincularPage() {
  const [estado, setEstado] = useState<CodigoState | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const [verificando, setVerificando] = useState(false);

  function handleGenerar() {
    setErrorMsg(null);
    startTransition(async () => {
      const result = await generarCodigoVinculacion();
      if (!result.ok) {
        setErrorMsg(result.error ?? 'No se pudo generar el código.');
        return;
      }
      setEstado({ code: result.code!, expiresAt: result.expiresAt!, usado: false });
    });
  }

  async function handleVerificar() {
    if (!estado) return;
    setVerificando(true);
    const result = await verificarEstadoCodigo(estado.code);
    setVerificando(false);
    if (result.usado) {
      setEstado((prev) => (prev ? { ...prev, usado: true } : null));
    }
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Vincular dispositivo"
        description="Genera un código para que un operario conecte su tableta o móvil a tu empresa."
      />

      {/* Tarjeta instructiva */}
      <Card>
        <CardTitle as="h2" className="mb-3 text-sm font-semibold text-neutral-700">
          ¿Cómo funciona?
        </CardTitle>
        <ol className="space-y-2 text-sm text-neutral-600">
          <li className="flex gap-3">
            <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-neutral-900 text-xs font-bold text-white">
              1
            </span>
            <span>Genera el código de 6 dígitos con el botón de abajo.</span>
          </li>
          <li className="flex gap-3">
            <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-neutral-900 text-xs font-bold text-white">
              2
            </span>
            <span>
              Dicta o escribe el código al operario. Él lo ingresa en la app móvil en la pantalla
              &ldquo;Vincular empresa&rdquo;.
            </span>
          </li>
          <li className="flex gap-3">
            <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-neutral-900 text-xs font-bold text-white">
              3
            </span>
            <span>
              La tableta queda vinculada automáticamente y comenzará a sincronizar datos.
            </span>
          </li>
        </ol>
        <p className="mt-4 text-xs text-neutral-400">
          El código es de un solo uso y expira en 10 minutos.
        </p>
      </Card>

      {/* Panel principal */}
      {!estado ? (
        /* Estado inicial: sin código activo */
        <Card className="flex flex-col items-center gap-4 py-10 text-center">
          <p className="text-sm text-neutral-500">
            Aún no hay ningún código activo. Genera uno para comenzar.
          </p>
          <Button onClick={handleGenerar} disabled={isPending} size="md">
            {isPending ? 'Generando…' : 'Generar código'}
          </Button>
          {errorMsg && (
            <p className="text-sm text-red-600">{errorMsg}</p>
          )}
        </Card>
      ) : estado.usado ? (
        /* Código canjeado */
        <Card className="flex flex-col items-center gap-4 py-10 text-center">
          <Badge tone="green" className="px-4 py-1 text-sm">
            Vinculado
          </Badge>
          <p className="text-sm text-neutral-600">
            El código fue canjeado correctamente. El dispositivo ya está vinculado a tu empresa.
          </p>
          <Button onClick={handleGenerar} disabled={isPending} variant="secondary">
            {isPending ? 'Generando…' : 'Generar otro código'}
          </Button>
          {errorMsg && <p className="text-sm text-red-600">{errorMsg}</p>}
        </Card>
      ) : (
        /* Código activo */
        <Card className="flex flex-col items-center gap-6 py-10 text-center">
          <p className="text-sm font-medium text-neutral-500">Código de vinculación</p>

          {/* Código grande */}
          <div className="rounded-2xl bg-neutral-50 px-10 py-6 ring-1 ring-neutral-200">
            <span className="font-mono text-5xl font-bold tracking-widest text-neutral-900 sm:text-6xl">
              {formatCodigo(estado.code)}
            </span>
          </div>

          <Contador expiresAt={estado.expiresAt} />

          <p className="max-w-sm text-sm text-neutral-500">
            El operario debe ingresar este código en la app móvil antes de que expire.
          </p>

          <div className="flex flex-wrap items-center justify-center gap-3">
            <Button
              onClick={handleVerificar}
              disabled={verificando || isPending}
              variant="secondary"
              size="sm"
            >
              {verificando ? 'Verificando…' : 'Verificar estado'}
            </Button>
            <Button onClick={handleGenerar} disabled={isPending} size="sm">
              {isPending ? 'Generando…' : 'Generar nuevo código'}
            </Button>
          </div>

          {errorMsg && <p className="text-sm text-red-600">{errorMsg}</p>}
        </Card>
      )}
    </div>
  );
}
