import Link from 'next/link';
import { notFound } from 'next/navigation';
import { calcularTotales, getCotizacionConDetalle } from '@/lib/data/cotizaciones';
import { formatCurrency } from '@/lib/data/format';
import { CotizacionHeader } from '../cotizacion-header';
import { SeccionesList } from '../secciones-list';

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

  return (
    <div className="space-y-6">
      <div>
        <Link href="/admin/cotizaciones" className="text-sm text-neutral-500 hover:underline">
          ← Cotizaciones
        </Link>
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
            <dd className="font-medium text-neutral-900">{formatCurrency(totales.subtotal)}</dd>
          </div>
          {cotizacion.descuento > 0 && (
            <div className="flex justify-between">
              <dt className="text-neutral-600">Descuento ({cotizacion.descuento}%)</dt>
              <dd className="font-medium text-red-600">-{formatCurrency(totales.descuentoMonto)}</dd>
            </div>
          )}
          {cotizacion.iva_enabled && (
            <div className="flex justify-between">
              <dt className="text-neutral-600">IVA (16%)</dt>
              <dd className="font-medium text-neutral-900">{formatCurrency(totales.ivaMonto)}</dd>
            </div>
          )}
          <div className="flex justify-between border-t border-neutral-200 pt-2 text-base">
            <dt className="font-semibold text-neutral-900">Total</dt>
            <dd className="font-semibold text-neutral-900">{formatCurrency(totales.total)}</dd>
          </div>
        </dl>
      </section>
    </div>
  );
}
