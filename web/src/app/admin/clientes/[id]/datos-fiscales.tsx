'use client';

import { Badge, Card, CardTitle } from '@/components/ui';
import { FormularioDatosFiscales } from '@/components/fiscal/formulario-datos-fiscales';
import { guardarClienteFiscalAction } from '@/app/admin/facturacion/actions';
import { formatDate } from '@/lib/data/format';
import type { ClienteFiscal } from '@/lib/fiscal/tipos';

/**
 * Datos para factura del cliente (RD1b.2), en su ficha. Solo admin y contador
 * con el módulo `fiscal` prendido. Si el cliente los confirmó desde su portal se
 * dice aquí: es la mejor defensa contra una factura rechazada por un dato mal
 * copiado (RF1b.1).
 */
export function DatosFiscalesCliente({
  clienteId,
  datos,
  conPortal,
}: {
  clienteId: string;
  datos: ClienteFiscal | null;
  conPortal: boolean;
}) {
  const accion = guardarClienteFiscalAction.bind(null, clienteId);
  return (
    <Card>
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div>
          <CardTitle as="h2" className="text-sm font-semibold text-neutral-700">
            Datos para factura
          </CardTitle>
          <p className="mt-1 text-sm text-neutral-600">
            Tal cual vienen en la constancia de situación fiscal de tu cliente.
            {conPortal && ' Él mismo los puede llenar o confirmar desde su portal.'}
          </p>
        </div>
        {datos?.fiscales_confirmados_at ? (
          <Badge tone="green">Confirmados por el cliente el {formatDate(datos.fiscales_confirmados_at)}</Badge>
        ) : (
          <Badge tone="amber">Sin confirmar por el cliente</Badge>
        )}
      </div>
      {datos?.constancia_path && (
        <p className="mb-4 text-sm">
          <a
            href={`/admin/facturacion/archivo?ruta=${encodeURIComponent(datos.constancia_path)}`}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex min-h-11 items-center font-medium text-blue-700 underline"
          >
            Ver su constancia de situación fiscal
          </a>
        </p>
      )}
      <FormularioDatosFiscales valores={datos} accion={accion} conReceptor textoBoton="Guardar datos para factura" />
    </Card>
  );
}
