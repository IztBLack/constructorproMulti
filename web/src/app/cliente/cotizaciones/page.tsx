// MOCK - reemplazar por queries reales en la fase de backend.
import Link from 'next/link';
import { Badge, PageHeader } from '@/components/ui';
import { formatCurrency, formatDate } from '@/lib/data/format';
import { MOCK_COTIZACIONES, type EstadoCotizacionCliente } from '../_mock';

// ─── Helpers ─────────────────────────────────────────────────────────────────

function calcTotal(cot: (typeof MOCK_COTIZACIONES)[0]): number {
  const subtotal = cot.secciones.flatMap((s) => s.partidas).reduce((sum, p) => {
    return sum + p.cantidad * p.precio_unitario;
  }, 0);
  const descuento = subtotal * (cot.descuento / 100);
  const base = subtotal - descuento;
  const iva = cot.iva_enabled ? base * 0.16 : 0;
  return base + iva;
}

const ESTADO_TONE: Record<EstadoCotizacionCliente, 'amber' | 'green' | 'red'> = {
  Enviada: 'amber',
  Aceptada: 'green',
  Rechazada: 'red',
};

// ─── Página ──────────────────────────────────────────────────────────────────

export default function CotizacionesPage() {
  return (
    <div className="space-y-6">
      <PageHeader
        title="Mis cotizaciones"
        description="Presupuestos que tu constructora ha compartido contigo."
      />

      <div className="space-y-3">
        {MOCK_COTIZACIONES.map((cot) => {
          const total = calcTotal(cot);
          const tone = ESTADO_TONE[cot.estado];

          return (
            <Link
              key={cot.id}
              href={`/cliente/cotizaciones/${cot.id}`}
              className="flex flex-col gap-3 rounded-xl border border-neutral-200 bg-white p-5 hover:border-neutral-300 hover:shadow-sm cursor-pointer transition-all duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-neutral-900 focus-visible:ring-offset-2 sm:flex-row sm:items-center sm:justify-between"
            >
              {/* Info principal */}
              <div className="min-w-0 flex-1 space-y-1">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-sm font-semibold text-neutral-900">
                    {cot.nombre_proyecto}
                  </span>
                  <Badge tone={tone}>{cot.estado}</Badge>
                </div>
                <p className="text-xs text-neutral-400">{cot.ubicacion}</p>
                <p className="text-xs text-neutral-400">Fecha: {formatDate(cot.fecha)}</p>
              </div>

              {/* Total + flecha */}
              <div className="flex items-center justify-between gap-4 sm:flex-col sm:items-end">
                <div className="text-right">
                  <p className="text-xs text-neutral-500">Total</p>
                  <p className="text-base font-semibold text-neutral-900 tabular-nums">
                    {formatCurrency(total)}
                  </p>
                  {cot.iva_enabled && (
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
    </div>
  );
}
