// MOCK - reemplazar por queries reales en la fase de backend.
import { notFound } from 'next/navigation';
import Link from 'next/link';
import { Badge, PageHeader, TableContainer, THead, Th, TBody, Tr, Td } from '@/components/ui';
import { formatCurrency, formatDate } from '@/lib/data/format';
import { MOCK_COTIZACIONES, type EstadoCotizacionCliente } from '../../_mock';
import { CotizacionAcciones } from './_acciones';

// ─── Helpers ─────────────────────────────────────────────────────────────────

function calcSubtotal(cot: (typeof MOCK_COTIZACIONES)[0]): number {
  return cot.secciones.flatMap((s) => s.partidas).reduce((sum, p) => {
    return sum + p.cantidad * p.precio_unitario;
  }, 0);
}

const ESTADO_TONE: Record<EstadoCotizacionCliente, 'amber' | 'green' | 'red'> = {
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
  const cot = MOCK_COTIZACIONES.find((c) => c.id === id);
  if (!cot) notFound();

  const subtotal = calcSubtotal(cot);
  const descuentoMonto = subtotal * (cot.descuento / 100);
  const base = subtotal - descuentoMonto;
  const ivaMonto = cot.iva_enabled ? base * 0.16 : 0;
  const total = base + ivaMonto;
  const tone = ESTADO_TONE[cot.estado];

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
          description={cot.ubicacion}
          actions={<Badge tone={tone}>{cot.estado}</Badge>}
        />
        <p className="mt-2 text-sm text-neutral-500">Fecha: {formatDate(cot.fecha)}</p>
      </div>

      {/* ── Partidas por sección ─────────────────────────────────────────── */}
      <section aria-labelledby="partidas-heading">
        <h2 id="partidas-heading" className="sr-only">
          Partidas del presupuesto
        </h2>
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
                        <Td>{p.unidad}</Td>
                        <Td className="text-right tabular-nums">{p.cantidad}</Td>
                        <Td className="text-right tabular-nums">{formatCurrency(p.precio_unitario)}</Td>
                        <Td className="text-right tabular-nums font-medium text-neutral-900">
                          {formatCurrency(p.cantidad * p.precio_unitario)}
                        </Td>
                      </Tr>
                    ))}
                  </TBody>
                </TableContainer>

                {/* Tarjetas móvil */}
                <div className="space-y-2 sm:hidden">
                  {seccion.partidas.map((p) => (
                    <div
                      key={p.id}
                      className="rounded-lg border border-neutral-200 bg-white p-4 space-y-1"
                    >
                      <p className="text-sm font-medium text-neutral-900">{p.descripcion}</p>
                      <div className="flex items-center justify-between text-xs text-neutral-500">
                        <span>
                          {p.cantidad} {p.unidad} × {formatCurrency(p.precio_unitario)}
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
