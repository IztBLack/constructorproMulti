// MOCK - reemplazar por queries reales en la fase de backend.
import { notFound } from 'next/navigation';
import Link from 'next/link';
import {
  Badge,
  Card,
  CardHeader,
  CardTitle,
  PageHeader,
  TableContainer,
  THead,
  Th,
  TBody,
  Tr,
  Td,
} from '@/components/ui';
import { formatCurrency, formatDate } from '@/lib/data/format';
import { MOCK_OBRAS, type EstadoObraCliente } from '../../_mock';

// ─── Helpers ─────────────────────────────────────────────────────────────────

const ESTADO_TONE: Record<EstadoObraCliente, 'green' | 'amber' | 'neutral'> = {
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
  const obra = MOCK_OBRAS.find((o) => o.id === id);
  if (!obra) notFound();

  const saldo = obra.presupuesto_total - obra.pagado;
  const pagadoPct = Math.round((obra.pagado / obra.presupuesto_total) * 100);
  const tone = ESTADO_TONE[obra.estado];

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
          description={obra.ubicacion}
          actions={<Badge tone={tone}>{obra.estado}</Badge>}
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
            <span className="text-xl font-bold text-neutral-900">{obra.avance_pct}%</span>
          </CardHeader>
          <div
            className="h-3 w-full overflow-hidden rounded-full bg-neutral-100"
            role="progressbar"
            aria-valuenow={obra.avance_pct}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-label={`Avance de obra: ${obra.avance_pct}%`}
          >
            <div
              className="h-full rounded-full bg-green-500 transition-all duration-700 motion-reduce:transition-none"
              style={{ width: `${obra.avance_pct}%` }}
            />
          </div>
          <p className="mt-2 text-xs text-neutral-400">
            Avance reportado por la constructora. Actualizado periódicamente.
          </p>
        </Card>
      </section>

      {/* ── Estado de cuenta ─────────────────────────────────────────────── */}
      <section aria-labelledby="estado-cuenta-heading">
        <h2 id="estado-cuenta-heading" className="mb-4 text-base font-semibold text-neutral-900">
          Estado de cuenta
        </h2>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <Card padding="md">
            <CardTitle as="h3">Presupuesto total</CardTitle>
            <p className="mt-2 text-2xl font-semibold text-neutral-900 tabular-nums">
              {formatCurrency(obra.presupuesto_total)}
            </p>
          </Card>

          <Card padding="md">
            <CardTitle as="h3">Total pagado</CardTitle>
            <p className="mt-2 text-2xl font-semibold text-green-700 tabular-nums">
              {formatCurrency(obra.pagado)}
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
      <section aria-labelledby="historial-pagos-heading">
        <h2 id="historial-pagos-heading" className="mb-4 text-base font-semibold text-neutral-900">
          Historial de pagos
        </h2>

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
            {obra.pagos.map((pago) => (
              <Tr key={pago.id}>
                <Td>{formatDate(pago.fecha)}</Td>
                <Td className="text-neutral-900 font-medium">{pago.concepto}</Td>
                <Td>{pago.metodo}</Td>
                <Td>{pago.referencia ?? <span className="text-neutral-400">—</span>}</Td>
                <Td className="text-right tabular-nums font-semibold text-neutral-900">
                  {formatCurrency(pago.monto)}
                </Td>
              </Tr>
            ))}
          </TBody>
        </TableContainer>

        {/* Tarjetas móvil */}
        <div className="space-y-3 sm:hidden">
          {obra.pagos.map((pago) => (
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

        {/* Total confirmación */}
        <div className="mt-4 flex justify-end">
          <div className="rounded-lg border border-neutral-200 bg-white px-5 py-3 text-sm">
            <div className="flex items-center gap-6">
              <span className="text-neutral-600">Total pagado</span>
              <span className="tabular-nums font-semibold text-neutral-900">
                {formatCurrency(obra.pagado)}
              </span>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
