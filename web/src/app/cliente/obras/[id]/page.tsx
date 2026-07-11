import { notFound } from 'next/navigation';
import Link from 'next/link';
import {
  Badge,
  Card,
  CardHeader,
  CardTitle,
  EmptyState,
  PageHeader,
  TableContainer,
  THead,
  Th,
  TBody,
  Tr,
  Td,
} from '@/components/ui';
import { formatCurrency, formatDate } from '@/lib/data/format';
import {
  getObraCliente,
  listCotizacionesCliente,
  listPagosDeCotizacion,
  mapEstadoObra,
} from '@/lib/data/portal-cliente';
import type { EstadoObraPortal, PagoPortal } from '@/lib/data/portal-cliente';

export const dynamic = 'force-dynamic';

// ─── Helpers ─────────────────────────────────────────────────────────────────

const ESTADO_TONE: Record<EstadoObraPortal, 'green' | 'amber' | 'neutral'> = {
  'En progreso': 'green',
  Pausada: 'amber',
  Completada: 'neutral',
};

// ─── Página ──────────────────────────────────────────────────────────────────

export default async function ObraDetallePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  const obra = await getObraCliente(id);
  if (!obra) notFound();

  const estado = mapEstadoObra(obra.activa, obra.avance);
  const tone = ESTADO_TONE[estado];

  // IMPORTANTE: la relación obra→cotización todavía no existe en los datos
  // (la tabla `cotizaciones` no tiene una columna `obra_id` poblada que permita
  // filtrar cuáles pertenecen a esta obra en particular). Por eso, en lugar de
  // aparentar que este bloque es "el estado de cuenta de esta obra", lo mostramos
  // rotulado explícitamente como el estado de cuenta GLOBAL del cliente (todas sus
  // cotizaciones con la constructora), para no exhibir información incorrecta.
  // Pendiente (fuera de alcance de este cambio): agregar `obra_id` a `cotizaciones`
  // y filtrar aquí por `obra.id` cuando esa columna exista y esté poblada.
  const todasLasCotizacionesDelCliente = await listCotizacionesCliente();

  // Recopilar pagos de todas las cotizaciones del cliente (no solo de esta obra)
  const pagosPorCotizacion = await Promise.all(
    todasLasCotizacionesDelCliente.map(async ({ cotizacion }) => ({
      cotizacionId: cotizacion.id,
      cotizacionNombre: cotizacion.nombre_proyecto,
      pagos: await listPagosDeCotizacion(cotizacion.id),
    })),
  );

  const todosPagos: PagoPortal[] = pagosPorCotizacion.flatMap((pc) => pc.pagos);
  const totalCotizaciones = todasLasCotizacionesDelCliente.reduce((acc, d) => acc + d.totales.total, 0);
  const totalPagado = todosPagos.reduce((acc, p) => acc + p.monto, 0);
  const saldo = totalCotizaciones - totalPagado;
  const pagadoPct =
    totalCotizaciones > 0 ? Math.min(100, Math.round((totalPagado / totalCotizaciones) * 100)) : 0;

  return (
    <div className="space-y-8">
      {/* ── Encabezado ──────────────────────────────────────────────────── */}
      <div>
        <Link
          href="/cliente/obras"
          className="inline-flex items-center gap-1 text-sm text-neutral-500 hover:text-neutral-900 cursor-pointer transition-colors duration-150 mb-4 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-neutral-900 rounded"
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            className="h-4 w-4"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={2}
            aria-hidden="true"
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
          </svg>
          Mis obras
        </Link>

        <PageHeader
          title={obra.nombre}
          description={obra.ubicacion ?? undefined}
          actions={<Badge tone={tone}>{estado}</Badge>}
        />
        <p className="mt-2 text-sm text-neutral-500">
          Fecha de inicio: {formatDate(obra.fecha_inicio)}
        </p>
      </div>

      {/* ── Avance de obra ───────────────────────────────────────────────── */}
      <section aria-labelledby="avance-heading">
        <Card padding="md">
          <CardHeader>
            <CardTitle as="h2" id="avance-heading">
              Avance de obra
            </CardTitle>
            <span className="text-xl font-bold text-neutral-900">{obra.avance}%</span>
          </CardHeader>
          <div
            className="h-3 w-full overflow-hidden rounded-full bg-neutral-100"
            role="progressbar"
            aria-valuenow={obra.avance}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-label={`Avance de obra: ${obra.avance}%`}
          >
            <div
              className="h-full rounded-full bg-green-500 transition-all duration-700 motion-reduce:transition-none"
              style={{ width: `${obra.avance}%` }}
            />
          </div>
          <p className="mt-2 text-xs text-neutral-400">
            Avance reportado por la constructora. Actualizado periódicamente.
          </p>
        </Card>
      </section>

      {/* ── Estado de cuenta ─────────────────────────────────────────────── */}
      {/* Nota: aún no existe una relación obra→cotización en los datos, así que este
          bloque es el estado de cuenta global del cliente, no exclusivo de esta obra
          (ver comentario en la carga de datos, arriba). */}
      <section aria-labelledby="estado-cuenta-heading">
        <h2 id="estado-cuenta-heading" className="mb-1 text-base font-semibold text-neutral-900">
          Estado de cuenta (todas tus cotizaciones)
        </h2>
        <p className="mb-4 text-xs text-neutral-400">
          Este resumen incluye todas tus cotizaciones con esta constructora, no solo las de esta obra.
        </p>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <Card padding="md">
            <CardTitle as="h3">Presupuesto total</CardTitle>
            <p className="mt-2 text-2xl font-semibold text-neutral-900 tabular-nums">
              {formatCurrency(totalCotizaciones)}
            </p>
          </Card>

          <Card padding="md">
            <CardTitle as="h3">Total pagado</CardTitle>
            <p className="mt-2 text-2xl font-semibold text-green-700 tabular-nums">
              {formatCurrency(totalPagado)}
            </p>
            <p className="mt-1 text-xs text-neutral-400">{pagadoPct}% del presupuesto</p>
          </Card>

          <Card padding="md" className="ring-2 ring-amber-400 ring-offset-1">
            <CardTitle as="h3">Saldo pendiente</CardTitle>
            <p className="mt-2 text-2xl font-semibold text-amber-700 tabular-nums">
              {formatCurrency(saldo)}
            </p>
            <p className="mt-1 text-xs text-neutral-400">{100 - pagadoPct}% restante</p>
          </Card>
        </div>

        {/* Barra de pago */}
        <div className="mt-4 space-y-1">
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
              className="h-full rounded-full bg-blue-500 transition-all duration-700 motion-reduce:transition-none"
              style={{ width: `${pagadoPct}%` }}
            />
          </div>
        </div>
      </section>

      {/* ── Historial de pagos ───────────────────────────────────────────── */}
      {/* Mismo alcance que el bloque anterior: todos los pagos del cliente, no solo de esta obra. */}
      <section aria-labelledby="historial-pagos-heading">
        <h2 id="historial-pagos-heading" className="mb-1 text-base font-semibold text-neutral-900">
          Historial de pagos (todas tus cotizaciones)
        </h2>
        <p className="mb-4 text-xs text-neutral-400">
          Incluye los pagos de todas tus cotizaciones con esta constructora.
        </p>

        {todosPagos.length === 0 ? (
          <EmptyState
            title="Sin pagos registrados"
            description="Los pagos aparecen aquí una vez que tu constructora los registre."
          />
        ) : (
          <>
            {/* Tabla escritorio */}
            <TableContainer className="hidden sm:block">
              <THead>
                <Th>Fecha</Th>
                <Th>Concepto</Th>
                <Th>Método</Th>
                <Th>Referencia</Th>
                <Th className="text-right">Monto</Th>
              </THead>
              <TBody>
                {todosPagos.map((pago) => (
                  <Tr key={pago.id}>
                    <Td>{formatDate(pago.fecha)}</Td>
                    <Td className="text-neutral-900 font-medium">{pago.concepto}</Td>
                    <Td>{pago.metodo}</Td>
                    <Td>
                      {pago.referencia ?? <span className="text-neutral-400">—</span>}
                    </Td>
                    <Td className="text-right tabular-nums font-semibold text-neutral-900">
                      {formatCurrency(pago.monto)}
                    </Td>
                  </Tr>
                ))}
              </TBody>
            </TableContainer>

            {/* Tarjetas movil */}
            <div className="space-y-3 sm:hidden">
              {todosPagos.map((pago) => (
                <div
                  key={pago.id}
                  className="rounded-xl border border-neutral-200 bg-white p-4 space-y-2"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-sm font-semibold text-neutral-900">{pago.concepto}</p>
                      <p className="text-xs text-neutral-400">{formatDate(pago.fecha)}</p>
                    </div>
                    <p className="tabular-nums font-semibold text-neutral-900 shrink-0">
                      {formatCurrency(pago.monto)}
                    </p>
                  </div>
                  <div className="flex items-center gap-3 text-xs text-neutral-500">
                    <span>{pago.metodo}</span>
                    {pago.referencia && (
                      <>
                        <span aria-hidden="true">·</span>
                        <span>{pago.referencia}</span>
                      </>
                    )}
                  </div>
                </div>
              ))}
            </div>

            {/* Total confirmacion */}
            <div className="mt-4 flex justify-end">
              <div className="rounded-lg border border-neutral-200 bg-white px-5 py-3 text-sm">
                <div className="flex items-center gap-6">
                  <span className="text-neutral-600">Total pagado</span>
                  <span className="tabular-nums font-semibold text-neutral-900">
                    {formatCurrency(totalPagado)}
                  </span>
                </div>
              </div>
            </div>
          </>
        )}
      </section>
    </div>
  );
}
