'use client';
// MOCK - sin lógica real. Los onClick son placeholders hasta conectar el backend.

import { Button } from '@/components/ui';

interface CotizacionAccionesProps {
  cotizacionId: string;
  /** Si es true, muestra también los botones Aceptar / Rechazar */
  mostrarRespuesta?: boolean;
}

export function CotizacionAcciones({
  cotizacionId,
  mostrarRespuesta = false,
}: CotizacionAccionesProps) {
  function handleAceptar() {
    // TODO (backend): llamar a la API para aceptar la cotización con id `cotizacionId`
    alert(`[MOCK] Aceptar cotización ${cotizacionId} — pendiente de conectar backend.`);
  }

  function handleRechazar() {
    // TODO (backend): llamar a la API para rechazar la cotización con id `cotizacionId`
    alert(`[MOCK] Rechazar cotización ${cotizacionId} — pendiente de conectar backend.`);
  }

  function handleImprimir() {
    window.print();
  }

  return (
    <>
      {/* Descargar / imprimir */}
      <Button variant="secondary" size="md" onClick={handleImprimir} className="gap-2">
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
        Descargar PDF
      </Button>

      {/* Aceptar / Rechazar — solo si estado es "Enviada" */}
      {mostrarRespuesta && (
        <>
          <Button variant="primary" size="md" onClick={handleAceptar} className="gap-2">
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
          </Button>
          <Button variant="danger" size="md" onClick={handleRechazar} className="gap-2">
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
          </Button>
        </>
      )}
    </>
  );
}
