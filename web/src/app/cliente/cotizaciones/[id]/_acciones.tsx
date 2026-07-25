'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui';
import { responderCotizacion } from './responder-actions';

interface CotizacionAccionesProps {
  cotizacionId: string;
  /** Si es true, muestra también los botones Aceptar / Rechazar */
  mostrarRespuesta?: boolean;
}

export function CotizacionAcciones({
  cotizacionId,
  mostrarRespuesta = false,
}: CotizacionAccionesProps) {
  const router = useRouter();
  const [cargando, setCargando] = useState<'aceptar' | 'rechazar' | null>(null);
  const [error, setError] = useState<string | null>(null);
  // Paso de confirmación explícita antes de ejecutar una acción vinculante.
  const [confirmando, setConfirmando] = useState<'aceptar' | 'rechazar' | null>(null);

  async function handleRespuesta(aceptar: boolean) {
    const accion = aceptar ? 'aceptar' : 'rechazar';
    setConfirmando(null);
    setCargando(accion);
    setError(null);

    const resultado = await responderCotizacion(cotizacionId, aceptar);

    if (!resultado.ok) {
      setError(resultado.error ?? 'Ocurrió un error inesperado.');
      setCargando(null);
      return;
    }

    setCargando(null);
    router.refresh();
  }

  function handleVerPdf() {
    router.push(`/cliente/cotizaciones/${cotizacionId}/pdf`);
  }

  const ocupado = cargando !== null;

  return (
    <div className="flex flex-col gap-3 w-full">
      {/* Confirmación explícita antes de aceptar o rechazar */}
      {confirmando && (
        <div
          role="alertdialog"
          aria-labelledby="confirmar-respuesta-heading"
          className="w-full rounded-xl border border-amber-200 bg-amber-50 p-4 space-y-3"
        >
          <p id="confirmar-respuesta-heading" className="text-sm font-medium text-neutral-900">
            {confirmando === 'aceptar'
              ? 'Al aceptar autorizas esta cotización tal como está: la constructora podrá iniciar o continuar el trabajo con estas condiciones.'
              : 'Al rechazar, esta cotización quedará marcada como rechazada. Si necesitas cambios, contacta a tu constructora para una nueva propuesta.'}
          </p>
          <div className="flex flex-wrap items-center gap-2">
            <Button
              variant={confirmando === 'aceptar' ? 'primary' : 'danger'}
              size="sm"
              disabled={ocupado}
              onClick={() => handleRespuesta(confirmando === 'aceptar')}
              className="cursor-pointer"
            >
              {confirmando === 'aceptar' ? 'Sí, aceptar cotización' : 'Sí, rechazar'}
            </Button>
            <Button
              variant="ghost"
              size="sm"
              disabled={ocupado}
              onClick={() => setConfirmando(null)}
              className="cursor-pointer"
            >
              Cancelar
            </Button>
          </div>
        </div>
      )}

      <div className="flex flex-col gap-3 w-full sm:flex-row sm:flex-wrap sm:items-center">
        {/* Abre el documento en PDF (vectorial): descargar o imprimir desde ahí. */}
        <Button variant="secondary" size="md" onClick={handleVerPdf} className="gap-2 cursor-pointer">
          <svg
            xmlns="http://www.w3.org/2000/svg"
            className="h-4 w-4"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={1.5}
            aria-hidden="true"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z"
            />
          </svg>
          Ver PDF
        </Button>

        {/* Aceptar / Rechazar — solo si estado es "Enviada" */}
        {mostrarRespuesta && (
          <>
            <Button
              variant="primary"
              size="md"
              onClick={() => setConfirmando('aceptar')}
              disabled={ocupado || confirmando !== null}
              className="gap-2 cursor-pointer"
              aria-busy={cargando === 'aceptar'}
            >
              {cargando === 'aceptar' ? (
                <>
                  <svg
                    className="h-4 w-4 animate-spin"
                    xmlns="http://www.w3.org/2000/svg"
                    fill="none"
                    viewBox="0 0 24 24"
                    aria-hidden="true"
                  >
                    <circle
                      className="opacity-25"
                      cx="12"
                      cy="12"
                      r="10"
                      stroke="currentColor"
                      strokeWidth="4"
                    />
                    <path
                      className="opacity-75"
                      fill="currentColor"
                      d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
                    />
                  </svg>
                  Aceptando…
                </>
              ) : (
                <>
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    className="h-4 w-4"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                    strokeWidth={2}
                    aria-hidden="true"
                  >
                    <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                  </svg>
                  Aceptar cotización
                </>
              )}
            </Button>

            <Button
              variant="danger"
              size="md"
              onClick={() => setConfirmando('rechazar')}
              disabled={ocupado || confirmando !== null}
              className="gap-2 cursor-pointer"
              aria-busy={cargando === 'rechazar'}
            >
              {cargando === 'rechazar' ? (
                <>
                  <svg
                    className="h-4 w-4 animate-spin"
                    xmlns="http://www.w3.org/2000/svg"
                    fill="none"
                    viewBox="0 0 24 24"
                    aria-hidden="true"
                  >
                    <circle
                      className="opacity-25"
                      cx="12"
                      cy="12"
                      r="10"
                      stroke="currentColor"
                      strokeWidth="4"
                    />
                    <path
                      className="opacity-75"
                      fill="currentColor"
                      d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
                    />
                  </svg>
                  Rechazando…
                </>
              ) : (
                <>
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    className="h-4 w-4"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                    strokeWidth={2}
                    aria-hidden="true"
                  >
                    <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                  </svg>
                  Rechazar
                </>
              )}
            </Button>

            {/* Mensaje de error */}
            {error && (
              <p
                role="alert"
                className="w-full text-sm text-red-600 font-medium sm:w-auto sm:self-center"
              >
                {error}
              </p>
            )}
          </>
        )}
      </div>
    </div>
  );
}
