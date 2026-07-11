import Link from 'next/link';
import { Badge, EmptyState, PageHeader } from '@/components/ui';
import { formatCurrency, formatDate } from '@/lib/data/format';
import { getClienteActual, listCotizacionesCliente } from '@/lib/data/portal-cliente';
import type { EstadoCotizacionPortal } from '@/lib/data/portal-cliente';

export const dynamic = 'force-dynamic';

// ─── Helpers ─────────────────────────────────────────────────────────────────

const ESTADO_TONE: Record<EstadoCotizacionPortal, 'amber' | 'green' | 'red'> = {
  Enviada: 'amber',
  Aceptada: 'green',
  Rechazada: 'red',
};

// ─── Página ──────────────────────────────────────────────────────────────────

export default async function CotizacionesPage() {
  const cliente = await getClienteActual();

  if (!cliente) {
    return (
      <div className="space-y-6">
        <PageHeader
          title="Mis cotizaciones"
          description="Presupuestos que tu constructora ha compartido contigo."
        />
        <EmptyState
          title="Tu cuenta aún no está vinculada"
          description="Pide a tu constructora el código de acceso para vincular tu cuenta al portal."
        />
      </div>
    );
  }

  const cotizacionesData = await listCotizacionesCliente();

  return (
    <div className="space-y-6">
      <PageHeader
        title="Mis cotizaciones"
        description="Presupuestos que tu constructora ha compartido contigo."
      />

      {cotizacionesData.length === 0 ? (
        <EmptyState
          title="Sin cotizaciones"
          description="Aquí aparecerán los presupuestos que tu constructora te comparta."
        />
      ) : (
        <div className="space-y-3">
          {cotizacionesData.map(({ cotizacion, totales }) => {
            const tone = ESTADO_TONE[cotizacion.estado];

            return (
              <Link
                key={cotizacion.id}
                href={`/cliente/cotizaciones/${cotizacion.id}`}
                className="flex flex-col gap-3 rounded-xl border border-neutral-200 bg-white p-5 hover:border-neutral-300 hover:shadow-sm cursor-pointer transition-all duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-neutral-900 focus-visible:ring-offset-2 sm:flex-row sm:items-center sm:justify-between"
              >
                {/* Info principal */}
                <div className="min-w-0 flex-1 space-y-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-sm font-semibold text-neutral-900">
                      {cotizacion.nombre_proyecto}
                    </span>
                    <Badge tone={tone}>{cotizacion.estado}</Badge>
                  </div>
                  <p className="text-xs text-neutral-400">{cotizacion.ubicacion ?? '—'}</p>
                  <p className="text-xs text-neutral-400">
                    Fecha: {formatDate(cotizacion.fecha)}
                  </p>
                </div>

                {/* Total + flecha */}
                <div className="flex items-center justify-between gap-4 sm:flex-col sm:items-end">
                  <div className="text-right">
                    <p className="text-xs text-neutral-500">Total</p>
                    <p className="text-base font-semibold text-neutral-900 tabular-nums">
                      {formatCurrency(totales.total)}
                    </p>
                    {cotizacion.iva_enabled && (
                      <p className="text-xs text-neutral-400">IVA incluido</p>
                    )}
                  </div>
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    className="h-4 w-4 shrink-0 text-neutral-400"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                    strokeWidth={2}
                    aria-hidden="true"
                  >
                    <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                  </svg>
                </div>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
