// MOCK - reemplazar por queries reales en la fase de backend.
import Link from 'next/link';
import { Card, CardTitle, LinkButton, Badge } from '@/components/ui';
import { formatCurrency, formatDate } from '@/lib/data/format';
import { MOCK_CLIENTE, MOCK_OBRAS, MOCK_COTIZACIONES } from './_mock';

export default function ClienteResumenPage() {
  const cliente = MOCK_CLIENTE;

  // Totales globales
  const totalPresupuestado = MOCK_OBRAS.reduce((sum, o) => sum + o.presupuesto_total, 0);
  const totalPagado = MOCK_OBRAS.reduce((sum, o) => sum + o.pagado, 0);
  const totalSaldo = totalPresupuestado - totalPagado;

  // Cotizaciones pendientes de respuesta
  const cotizacionesPendientes = MOCK_COTIZACIONES.filter((c) => c.estado === 'Enviada');

  return (
    <div className="space-y-8">
      {/* ── Saludo ───────────────────────────────────────────────────────── */}
      <header className="space-y-1">
        <p className="text-sm text-neutral-500">Bienvenido de nuevo</p>
        <h1 className="text-2xl font-semibold text-neutral-900">{cliente.nombre}</h1>
        <p className="text-sm text-neutral-500">
          Aquí puedes revisar el avance de tus obras, tus cotizaciones y tu estado de cuenta.
        </p>
      </header>

      {/* ── Resumen financiero ───────────────────────────────────────────── */}
      <section aria-labelledby="resumen-financiero">
        <h2 id="resumen-financiero" className="sr-only">
          Resumen financiero
        </h2>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <Card padding="md">
            <CardTitle as="h3">Total presupuestado</CardTitle>
            <p className="mt-2 text-2xl font-semibold text-neutral-900 tabular-nums">
              {formatCurrency(totalPresupuestado)}
            </p>
          </Card>
          <Card padding="md">
            <CardTitle as="h3">Total pagado</CardTitle>
            <p className="mt-2 text-2xl font-semibold text-green-700 tabular-nums">
              {formatCurrency(totalPagado)}
            </p>
          </Card>
          <Card padding="md" className="ring-2 ring-amber-400 ring-offset-1">
            <CardTitle as="h3">Saldo pendiente</CardTitle>
            <p className="mt-2 text-2xl font-semibold text-amber-700 tabular-nums">
              {formatCurrency(totalSaldo)}
            </p>
          </Card>
        </div>
      </section>

      {/* ── Mis obras ───────────────────────────────────────────────────── */}
      <section aria-labelledby="mis-obras-heading">
        <div className="flex items-center justify-between mb-4">
          <h2 id="mis-obras-heading" className="text-base font-semibold text-neutral-900">
            Mis obras
          </h2>
          <LinkButton href="/cliente/obras" variant="secondary" size="sm">
            Ver todas
          </LinkButton>
        </div>

        <div className="space-y-3">
          {MOCK_OBRAS.map((obra) => {
            const saldo = obra.presupuesto_total - obra.pagado;
            return (
              <Link
                key={obra.id}
                href={`/cliente/obras/${obra.id}`}
                className="block rounded-xl border border-neutral-200 bg-white p-5 hover:border-neutral-300 hover:shadow-sm cursor-pointer transition-all duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-neutral-900 focus-visible:ring-offset-2"
              >
                <div className="flex items-start justify-between gap-4">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <h3 className="text-sm font-semibold text-neutral-900 truncate">
                        {obra.nombre}
                      </h3>
                      <ObraEstadoBadge estado={obra.estado} />
                    </div>
                    <p className="mt-0.5 text-xs text-neutral-400">{obra.ubicacion}</p>
                  </div>
                  <div className="shrink-0 text-right">
                    <p className="text-xs text-neutral-500">Saldo</p>
                    <p className="text-sm font-semibold text-amber-700 tabular-nums">
                      {formatCurrency(saldo)}
                    </p>
                  </div>
                </div>

                {/* Barra de avance */}
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

                <div className="mt-2 flex items-center justify-between text-xs text-neutral-400">
                  <span>Inicio: {formatDate(obra.fecha_inicio)}</span>
                  <span className="text-neutral-500">
                    Pagado: <span className="tabular-nums font-medium text-neutral-700">{formatCurrency(obra.pagado)}</span>
                    {' / '}
                    <span className="tabular-nums">{formatCurrency(obra.presupuesto_total)}</span>
                  </span>
                </div>
              </Link>
            );
          })}
        </div>
      </section>

      {/* ── Cotizaciones pendientes ──────────────────────────────────────── */}
      {cotizacionesPendientes.length > 0 && (
        <section aria-labelledby="cotizaciones-pendientes-heading">
          <div className="flex items-center justify-between mb-4">
            <h2 id="cotizaciones-pendientes-heading" className="text-base font-semibold text-neutral-900">
              Cotizaciones por revisar
            </h2>
            <LinkButton href="/cliente/cotizaciones" variant="secondary" size="sm">
              Ver todas
            </LinkButton>
          </div>

          <div className="space-y-3">
            {cotizacionesPendientes.map((cot) => (
              <Link
                key={cot.id}
                href={`/cliente/cotizaciones/${cot.id}`}
                className="block rounded-xl border border-amber-200 bg-amber-50 p-5 hover:border-amber-300 hover:shadow-sm cursor-pointer transition-all duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-neutral-900 focus-visible:ring-offset-2"
              >
                <div className="flex items-start justify-between gap-4">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <h3 className="text-sm font-semibold text-neutral-900 truncate">
                        {cot.nombre_proyecto}
                      </h3>
                      <Badge tone="amber">Pendiente de respuesta</Badge>
                    </div>
                    <p className="mt-0.5 text-xs text-neutral-500">
                      Enviada el {formatDate(cot.fecha)}
                    </p>
                  </div>
                  <div className="shrink-0">
                    {/* Flecha derecha */}
                    <svg
                      xmlns="http://www.w3.org/2000/svg"
                      className="h-4 w-4 text-neutral-400"
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                      strokeWidth={2}
                      aria-hidden="true"
                    >
                      <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                    </svg>
                  </div>
                </div>
              </Link>
            ))}
          </div>
        </section>
      )}

      {/* ── Accesos rápidos ──────────────────────────────────────────────── */}
      <section aria-labelledby="accesos-rapidos-heading">
        <h2 id="accesos-rapidos-heading" className="sr-only">
          Accesos rápidos
        </h2>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Link
            href="/cliente/cotizaciones"
            className="flex items-center gap-4 rounded-xl border border-neutral-200 bg-white p-5 hover:border-neutral-300 hover:shadow-sm cursor-pointer transition-all duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-neutral-900 focus-visible:ring-offset-2"
          >
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-blue-50">
              <svg
                xmlns="http://www.w3.org/2000/svg"
                className="h-5 w-5 text-blue-600"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={1.5}
                aria-hidden="true"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
                />
              </svg>
            </div>
            <div>
              <p className="text-sm font-semibold text-neutral-900">Mis cotizaciones</p>
              <p className="text-xs text-neutral-500">
                {MOCK_COTIZACIONES.length} cotizacion{MOCK_COTIZACIONES.length !== 1 ? 'es' : ''}
              </p>
            </div>
          </Link>

          <Link
            href="/cliente/obras"
            className="flex items-center gap-4 rounded-xl border border-neutral-200 bg-white p-5 hover:border-neutral-300 hover:shadow-sm cursor-pointer transition-all duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-neutral-900 focus-visible:ring-offset-2"
          >
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-green-50">
              <svg
                xmlns="http://www.w3.org/2000/svg"
                className="h-5 w-5 text-green-600"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={1.5}
                aria-hidden="true"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4"
                />
              </svg>
            </div>
            <div>
              <p className="text-sm font-semibold text-neutral-900">Mis obras</p>
              <p className="text-xs text-neutral-500">
                {MOCK_OBRAS.length} obra{MOCK_OBRAS.length !== 1 ? 's' : ''} activa{MOCK_OBRAS.length !== 1 ? 's' : ''}
              </p>
            </div>
          </Link>
        </div>
      </section>
    </div>
  );
}

// ─── Subcomponente ────────────────────────────────────────────────────────────

function ObraEstadoBadge({ estado }: { estado: string }) {
  const map: Record<string, 'green' | 'amber' | 'neutral'> = {
    'En progreso': 'green',
    'Pausada': 'amber',
    'Completada': 'neutral',
  };
  const tone = map[estado] ?? 'neutral';
  return <Badge tone={tone}>{estado}</Badge>;
}
