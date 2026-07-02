// MOCK - reemplazar por queries reales en la fase de backend.
import Link from 'next/link';
import { Badge, PageHeader } from '@/components/ui';
import { formatCurrency, formatDate } from '@/lib/data/format';
import { MOCK_OBRAS, type EstadoObraCliente } from '../_mock';

const ESTADO_TONE: Record<EstadoObraCliente, 'green' | 'amber' | 'neutral'> = {
  'En progreso': 'green',
  Pausada: 'amber',
  Completada: 'neutral',
};

export default function ObrasPage() {
  return (
    <div className="space-y-6">
      <PageHeader
        title="Mis obras"
        description="Seguimiento de todas las obras vinculadas a tu cuenta."
      />

      <div className="space-y-4">
        {MOCK_OBRAS.map((obra) => {
          const saldo = obra.presupuesto_total - obra.pagado;
          const tone = ESTADO_TONE[obra.estado];
          const pagadoPct = Math.round((obra.pagado / obra.presupuesto_total) * 100);

          return (
            <Link
              key={obra.id}
              href={`/cliente/obras/${obra.id}`}
              className="block rounded-xl border border-neutral-200 bg-white p-5 hover:border-neutral-300 hover:shadow-sm cursor-pointer transition-all duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-neutral-900 focus-visible:ring-offset-2"
            >
              {/* Cabecera */}
              <div className="flex items-start justify-between gap-4">
                <div className="min-w-0 flex-1 space-y-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <h2 className="text-sm font-semibold text-neutral-900">{obra.nombre}</h2>
                    <Badge tone={tone}>{obra.estado}</Badge>
                  </div>
                  <p className="text-xs text-neutral-400">{obra.ubicacion}</p>
                  <p className="text-xs text-neutral-400">
                    Inicio: {formatDate(obra.fecha_inicio)}
                  </p>
                </div>
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  className="h-4 w-4 shrink-0 text-neutral-400 mt-1"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  strokeWidth={2}
                  aria-hidden="true"
                >
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                </svg>
              </div>

              {/* Barra avance de obra */}
              <div className="mt-4 space-y-1">
                <div className="flex items-center justify-between text-xs text-neutral-500">
                  <span>Avance de obra</span>
                  <span className="font-medium text-neutral-900">{obra.avance_pct}%</span>
                </div>
                <div
                  className="h-2 w-full overflow-hidden rounded-full bg-neutral-100"
                  role="progressbar"
                  aria-valuenow={obra.avance_pct}
                  aria-valuemin={0}
                  aria-valuemax={100}
                  aria-label={`Avance de obra: ${obra.avance_pct}%`}
                >
                  <div
                    className="h-full rounded-full bg-green-500 transition-all duration-500 motion-reduce:transition-none"
                    style={{ width: `${obra.avance_pct}%` }}
                  />
                </div>
              </div>

              {/* Barra pago */}
              <div className="mt-3 space-y-1">
                <div className="flex items-center justify-between text-xs text-neutral-500">
                  <span>Avance de pago</span>
                  <span className="font-medium text-neutral-900">{pagadoPct}%</span>
                </div>
                <div
                  className="h-2 w-full overflow-hidden rounded-full bg-neutral-100"
                  role="progressbar"
                  aria-valuenow={pagadoPct}
                  aria-valuemin={0}
                  aria-valuemax={100}
                  aria-label={`Avance de pago: ${pagadoPct}%`}
                >
                  <div
                    className="h-full rounded-full bg-blue-500 transition-all duration-500 motion-reduce:transition-none"
                    style={{ width: `${pagadoPct}%` }}
                  />
                </div>
              </div>

              {/* Resumen financiero */}
              <div className="mt-4 grid grid-cols-3 gap-2 rounded-lg bg-neutral-50 p-3 text-center text-xs">
                <div>
                  <p className="text-neutral-500">Presupuesto</p>
                  <p className="mt-0.5 tabular-nums font-semibold text-neutral-900">
                    {formatCurrency(obra.presupuesto_total)}
                  </p>
                </div>
                <div>
                  <p className="text-neutral-500">Pagado</p>
                  <p className="mt-0.5 tabular-nums font-semibold text-green-700">
                    {formatCurrency(obra.pagado)}
                  </p>
                </div>
                <div>
                  <p className="text-neutral-500">Saldo</p>
                  <p className="mt-0.5 tabular-nums font-semibold text-amber-700">
                    {formatCurrency(saldo)}
                  </p>
                </div>
              </div>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
