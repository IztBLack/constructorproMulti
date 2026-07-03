import Link from 'next/link';
import { Badge, EmptyState, PageHeader } from '@/components/ui';
import { formatDate } from '@/lib/data/format';
import {
  getClienteActual,
  listObrasCliente,
  listCotizacionesCliente,
  mapEstadoObra,
} from '@/lib/data/portal-cliente';
import type { EstadoObraPortal } from '@/lib/data/portal-cliente';

export const dynamic = 'force-dynamic';

// ─── Helpers ─────────────────────────────────────────────────────────────────

const ESTADO_TONE: Record<EstadoObraPortal, 'green' | 'amber' | 'neutral'> = {
  'En progreso': 'green',
  Pausada: 'amber',
  Completada: 'neutral',
};

// ─── Página ──────────────────────────────────────────────────────────────────

export default async function ObrasPage() {
  const cliente = await getClienteActual();

  if (!cliente) {
    return (
      <div className="space-y-6">
        <PageHeader
          title="Mis obras"
          description="Seguimiento de todas las obras vinculadas a tu cuenta."
        />
        <EmptyState
          title="Tu cuenta aun no esta vinculada"
          description="Pide a tu constructora el codigo de acceso para vincular tu cuenta al portal."
        />
      </div>
    );
  }

  const [obras, cotizacionesData] = await Promise.all([
    listObrasCliente(),
    listCotizacionesCliente(),
  ]);

  // Calcular pagado y presupuesto por cotizacion para el estado de cuenta de cada obra
  // La relacion obra → pagos es indirecta (obra → cotizacion → pagos), pero la
  // tabla obras tiene avance directo. Mostramos avance de obra (campo obras.avance)
  // y el estado financiero se muestra a nivel cotizacion en su propia seccion.
  //
  // Para las obras: calculamos totales globales de cotizaciones relacionadas
  // identificando cotizaciones por nombre_proyecto similar a obra.nombre (aproximacion)
  // o, si la BD tiene la relacion correcta, simplemente mostramos avance + info general.

  return (
    <div className="space-y-6">
      <PageHeader
        title="Mis obras"
        description="Seguimiento de todas las obras vinculadas a tu cuenta."
      />

      {obras.length === 0 ? (
        <EmptyState
          title="Sin obras registradas"
          description="Aqui apareceran tus obras en cuanto tu constructora las registre."
        />
      ) : (
        <div className="space-y-4">
          {obras.map((obra) => {
            const estado = mapEstadoObra(obra.activa, obra.avance);
            const tone = ESTADO_TONE[estado];

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
                      <Badge tone={tone}>{estado}</Badge>
                    </div>
                    <p className="text-xs text-neutral-400">{obra.ubicacion ?? '—'}</p>
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
                    <span className="font-medium text-neutral-900">{obra.avance}%</span>
                  </div>
                  <div
                    className="h-2 w-full overflow-hidden rounded-full bg-neutral-100"
                    role="progressbar"
                    aria-valuenow={obra.avance}
                    aria-valuemin={0}
                    aria-valuemax={100}
                    aria-label={`Avance de obra: ${obra.avance}%`}
                  >
                    <div
                      className="h-full rounded-full bg-green-500 transition-all duration-500 motion-reduce:transition-none"
                      style={{ width: `${obra.avance}%` }}
                    />
                  </div>
                </div>
              </Link>
            );
          })}
        </div>
      )}

      {/* ── Estado de cuenta global (por cotizaciones) ───────────────────── */}
      {cotizacionesData.length > 0 && (
        <div className="mt-6 rounded-xl border border-neutral-200 bg-white p-5">
          <h2 className="mb-4 text-sm font-semibold text-neutral-900">Estado de cuenta</h2>
          <div className="space-y-3">
            {cotizacionesData.map(({ cotizacion, totales }) => (
              <Link
                key={cotizacion.id}
                href={`/cliente/cotizaciones/${cotizacion.id}`}
                className="flex items-center justify-between gap-4 rounded-lg border border-neutral-100 bg-neutral-50 px-4 py-3 hover:border-neutral-200 cursor-pointer transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-neutral-900"
              >
                <div className="min-w-0">
                  <p className="text-sm font-medium text-neutral-900 truncate">
                    {cotizacion.nombre_proyecto}
                  </p>
                  <p className="text-xs text-neutral-400">{cotizacion.ubicacion ?? '—'}</p>
                </div>
                <div className="shrink-0 text-right">
                  <p className="text-xs text-neutral-500">Total</p>
                  <p className="text-sm tabular-nums font-semibold text-neutral-900">
                    {new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN' }).format(totales.total)}
                  </p>
                </div>
              </Link>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
