import Link from 'next/link';
import { Badge, EmptyState, PageHeader } from '@/components/ui';
import { formatCurrency, formatDate } from '@/lib/data/format';
import {
  getClienteActual,
  listObrasCliente,
  getEstadoCuentaObra,
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
          title="Tu cuenta aún no está vinculada"
          description="Pide a tu constructora el código de acceso para vincular tu cuenta al portal."
        />
      </div>
    );
  }

  const obras = await listObrasCliente();

  // Estado de cuenta REAL por obra (COSTO TOTAL vs RECIBIDO). Se calcula en
  // paralelo para cada obra; la RLS garantiza que solo se leen datos del cliente
  // y nunca las SALIDA de caja.
  const obrasConEstado = await Promise.all(
    obras.map(async (obra) => ({
      obra,
      estadoCuenta: await getEstadoCuentaObra(obra.id),
    })),
  );

  return (
    <div className="space-y-6">
      <PageHeader
        title="Mis obras"
        description="Seguimiento de todas las obras vinculadas a tu cuenta."
      />

      {obras.length === 0 ? (
        <EmptyState
          title="Sin obras registradas"
          description="Aquí aparecerán tus obras en cuanto tu constructora las registre."
        />
      ) : (
        <div className="space-y-4">
          {obrasConEstado.map(({ obra, estadoCuenta }) => {
            const estado = mapEstadoObra(obra.activa, obra.avance);
            const tone = ESTADO_TONE[estado];
            const tieneEstadoCuenta =
              estadoCuenta.costoTotal > 0 || estadoCuenta.entradas.length > 0;

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

                {/* Resumen financiero por obra */}
                {tieneEstadoCuenta && (
                  <div className="mt-4 grid grid-cols-3 gap-3 border-t border-neutral-100 pt-3 text-xs">
                    <div>
                      <p className="text-neutral-400">Costo total</p>
                      <p className="mt-0.5 tabular-nums font-semibold text-neutral-900">
                        {formatCurrency(estadoCuenta.costoTotal)}
                      </p>
                    </div>
                    <div>
                      <p className="text-neutral-400">Pagado</p>
                      <p className="mt-0.5 tabular-nums font-semibold text-green-700">
                        {formatCurrency(estadoCuenta.recibido)}
                      </p>
                    </div>
                    <div>
                      <p className="text-neutral-400">Pendiente</p>
                      <p className="mt-0.5 tabular-nums font-semibold text-amber-700">
                        {formatCurrency(estadoCuenta.pendiente)}
                      </p>
                    </div>
                  </div>
                )}
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
