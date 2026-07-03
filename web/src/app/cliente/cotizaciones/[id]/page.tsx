import { notFound } from 'next/navigation';
import Link from 'next/link';
import {
  Badge,
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
  getCotizacionClienteConDetalle,
  listPagosDeCotizacion,
  calcularTotales,
} from '@/lib/data/portal-cliente';
import type { EstadoCotizacionPortal } from '@/lib/data/portal-cliente';
import { CotizacionAcciones } from './_acciones';

export const dynamic = 'force-dynamic';

// ─── Helpers ─────────────────────────────────────────────────────────────────

const ESTADO_TONE: Record<EstadoCotizacionPortal, 'amber' | 'green' | 'red'> = {
  Enviada: 'amber',
  Aceptada: 'green',
  Rechazada: 'red',
};

// ─── Página ──────────────────────────────────────────────────────────────────

export default async function CotizacionDetallePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  const [cot, pagos] = await Promise.all([
    getCotizacionClienteConDetalle(id),
    listPagosDeCotizacion(id),
  ]);

  if (!cot) notFound();

  const { subtotal, descuentoMonto, ivaMonto, total } = calcularTotales(cot);
  const tone = ESTADO_TONE[cot.estado];
  const totalPagado = pagos.reduce((acc, p) => acc + p.monto, 0);
  const saldoRestante = total - totalPagado;

  return (
    <div className="space-y-8">
      {/* ── Encabezado ──────────────────────────────────────────────────── */}
      <div>
        <Link
          href="/cliente/cotizaciones"
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
          Mis cotizaciones
        </Link>

        <PageHeader
          title={cot.nombre_proyecto}
          description={cot.ubicacion ?? undefined}
          actions={<Badge tone={tone}>{cot.estado}</Badge>}
        />
        <p className="mt-2 text-sm text-neutral-500">Fecha: {formatDate(cot.fecha)}</p>
      </div>

      {/* ── Partidas por seccion ─────────────────────────────────────────── */}
      <section aria-labelledby="partidas-heading">
        <h2 id="partidas-heading" className="sr-only">
          Partidas del presupuesto
        </h2>

        {cot.secciones.length === 0 ? (
          <EmptyState
            title="Sin partidas"
            description="Esta cotizacion aun no tiene partidas registradas."
          />
        ) : (
          <div className="space-y-6">
            {cot.secciones.map((seccion) => {
              const secSubtotal = seccion.partidas.reduce(
                (sum, p) => sum + p.cantidad * p.precio_unitario,
                0,
              );
              return (
                <div key={seccion.id}>
                  <div className="mb-3 flex items-center justify-between">
                    <h3 className="text-sm font-semibold text-neutral-800">{seccion.nombre}</h3>
                    <span className="text-sm tabular-nums text-neutral-600">
                      {formatCurrency(secSubtotal)}
                    </span>
                  </div>

                  {/* Tabla escritorio */}
                  <TableContainer className="hidden sm:block">
                    <THead>
                      <Th>Concepto</Th>
                      <Th>Unidad</Th>
                      <Th className="text-right">Cant.</Th>
                      <Th className="text-right">P. Unit.</Th>
                      <Th className="text-right">Importe</Th>
                    </THead>
                    <TBody>
                      {seccion.partidas.map((p) => (
                        <Tr key={p.id}>
                          <Td className="text-neutral-900">{p.descripcion}</Td>
                          <Td>{p.unidad ?? '—'}</Td>
                          <Td className="text-right tabular-nums">{p.cantidad}</Td>
                          <Td className="text-right tabular-nums">
                            {formatCurrency(p.precio_unitario)}
                          </Td>
                          <Td className="text-right tabular-nums font-medium text-neutral-900">
                            {formatCurrency(p.cantidad * p.precio_unitario)}
                          </Td>
                        </Tr>
                      ))}
                    </TBody>
                  </TableContainer>

                  {/* Tarjetas movil */}
                  <div className="space-y-2 sm:hidden">
                    {seccion.partidas.map((p) => (
                      <div
                        key={p.id}
                        className="rounded-lg border border-neutral-200 bg-white p-4 space-y-1"
                      >
                        <p className="text-sm font-medium text-neutral-900">{p.descripcion}</p>
                        <div className="flex items-center justify-between text-xs text-neutral-500">
                          <span>
                            {p.cantidad} {p.unidad ?? ''} {p.unidad ? '×' : ''}{' '}
                            {formatCurrency(p.precio_unitario)}
                          </span>
                          <span className="tabular-nums font-semibold text-neutral-900">
                            {formatCurrency(p.cantidad * p.precio_unitario)}
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>

      {/* ── Totales ──────────────────────────────────────────────────────── */}
      <section aria-labelledby="totales-heading">
        <h2 id="totales-heading" className="sr-only">
          Totales
        </h2>
        <div className="flex justify-end">
          <div className="w-full rounded-xl border border-neutral-200 bg-white p-5 sm:max-w-sm">
            <div className="space-y-2 text-sm">
              <div className="flex justify-between gap-4">
                <span className="text-neutral-600">Subtotal</span>
                <span className="tabular-nums text-neutral-900">{formatCurrency(subtotal)}</span>
              </div>
              {cot.descuento > 0 && (
                <div className="flex justify-between gap-4">
                  <span className="text-neutral-600">Descuento ({cot.descuento}%)</span>
                  <span className="tabular-nums text-green-700">
                    -{formatCurrency(descuentoMonto)}
                  </span>
                </div>
              )}
              {cot.iva_enabled && (
                <div className="flex justify-between gap-4">
                  <span className="text-neutral-600">IVA (16%)</span>
                  <span className="tabular-nums text-neutral-900">{formatCurrency(ivaMonto)}</span>
                </div>
              )}
              <div className="border-t border-neutral-200 pt-2 flex justify-between gap-4">
                <span className="font-semibold text-neutral-900">Total</span>
                <span className="tabular-nums font-semibold text-neutral-900 text-base">
                  {formatCurrency(total)}
                </span>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ── Estado de pago ───────────────────────────────────────────────── */}
      {pagos.length > 0 && (
        <section aria-labelledby="estado-pago-heading">
          <h2 id="estado-pago-heading" className="mb-4 text-base font-semibold text-neutral-900">
            Estado de pago
          </h2>

          {/* Tabla escritorio */}
          <TableContainer className="hidden sm:block">
            <THead>
              <Th>Fecha</Th>
              <Th>Concepto</Th>
              <Th>Metodo</Th>
              <Th>Referencia</Th>
              <Th className="text-right">Monto</Th>
            </THead>
            <TBody>
              {pagos.map((pago) => (
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
            {pagos.map((pago) => (
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

          {/* Resumen pagado vs saldo */}
          <div className="mt-4 flex justify-end">
            <div className="w-full rounded-xl border border-neutral-200 bg-white p-5 sm:max-w-sm">
              <div className="space-y-2 text-sm">
                <div className="flex justify-between gap-4">
                  <span className="text-neutral-600">Total pagado</span>
                  <span className="tabular-nums font-medium text-green-700">
                    {formatCurrency(totalPagado)}
                  </span>
                </div>
                <div className="border-t border-neutral-200 pt-2 flex justify-between gap-4">
                  <span className="font-semibold text-neutral-900">Saldo restante</span>
                  <span className="tabular-nums font-semibold text-amber-700 text-base">
                    {formatCurrency(saldoRestante)}
                  </span>
                </div>
              </div>
            </div>
          </div>
        </section>
      )}

      {/* ── Notas ────────────────────────────────────────────────────────── */}
      {cot.notas && (
        <section aria-labelledby="notas-heading">
          <h2 id="notas-heading" className="mb-2 text-sm font-semibold text-neutral-800">
            Notas
          </h2>
          <div className="rounded-xl border border-neutral-200 bg-neutral-50 p-4">
            <p className="text-sm text-neutral-600">{cot.notas}</p>
          </div>
        </section>
      )}

      {/* ── Acciones ─────────────────────────────────────────────────────── */}
      <section aria-labelledby="acciones-heading">
        <h2 id="acciones-heading" className="sr-only">
          Acciones
        </h2>
        <div className="flex flex-wrap items-center gap-3">
          <CotizacionAcciones
            cotizacionId={cot.id}
            mostrarRespuesta={cot.estado === 'Enviada'}
          />
        </div>
      </section>
    </div>
  );
}
