import Link from 'next/link';
import { notFound } from 'next/navigation';
import { calcularTotales, getCotizacionConDetalle } from '@/lib/data/cotizaciones';
import { listPagosByCotizacion, sumaPagos } from '@/lib/data/pagos';
import { formatCurrency } from '@/lib/data/format';
import { LinkButton } from '@/components/ui';
import { CotizacionHeader } from '../cotizacion-header';
import { SeccionesList } from '../secciones-list';
import PagosSection from './pagos-section';

export const dynamic = 'force-dynamic';

export default async function CotizacionDetallePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const { data: cotizacion, error } = await getCotizacionConDetalle(id);

  if (error) {
    return (
      <p className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
        No se pudo cargar la cotización: {error}
      </p>
    );
  }

  if (!cotizacion) notFound();

  const totales = calcularTotales(cotizacion);

  const { data: pagos } = await listPagosByCotizacion(id);
  const totalPagado = sumaPagos(pagos ?? []);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-4">
        <Link href="/admin/cotizaciones" className="text-sm text-neutral-500 hover:underline">
          ← Cotizaciones
        </Link>
        <LinkButton href={`/admin/cotizaciones/${id}/pdf`} variant="secondary" size="sm">
          Ver PDF
        </LinkButton>
      </div>

      <CotizacionHeader cotizacion={cotizacion} />

      {cotizacion.notas && (
        <section className="rounded-xl border border-neutral-200 bg-white p-5">
          <h2 className="mb-1 text-sm font-medium text-neutral-500">Notas</h2>
          <p className="text-sm text-neutral-700 whitespace-pre-wrap">{cotizacion.notas}</p>
        </section>
      )}

      <SeccionesList cotizacionId={cotizacion.id} secciones={cotizacion.secciones} />

      <section className="rounded-xl border border-neutral-200 bg-white p-5">
        <h2 className="mb-3 text-sm font-medium text-neutral-500">Resumen</h2>
        <dl className="space-y-1 text-sm">
          <div className="flex justify-between">
            <dt className="text-neutral-600">Subtotal</dt>
            <dd className="tabular-nums font-medium text-neutral-900">{formatCurrency(totales.subtotal)}</dd>
          </div>
          {cotizacion.descuento > 0 && (
            <div className="flex justify-between">
              <dt className="text-neutral-600">Descuento ({cotizacion.descuento}%)</dt>
              <dd className="tabular-nums font-medium text-red-600">-{formatCurrency(totales.descuentoMonto)}</dd>
            </div>
          )}
          {cotizacion.iva_enabled && (
            <div className="flex justify-between">
              <dt className="text-neutral-600">IVA (16%)</dt>
              <dd className="tabular-nums font-medium text-neutral-900">{formatCurrency(totales.ivaMonto)}</dd>
            </div>
          )}
          <div className="flex justify-between border-t border-neutral-200 pt-2 text-base">
            <dt className="font-semibold text-neutral-900">Total</dt>
            <dd className="tabular-nums font-semibold text-neutral-900">{formatCurrency(totales.total)}</dd>
          </div>
        </dl>
      </section>

      <PagosSection
        cotizacionId={cotizacion.id}
        totalCotizacion={totales.total}
        pagos={pagos ?? []}
        totalPagado={totalPagado}
      />
    </div>
  );
}
