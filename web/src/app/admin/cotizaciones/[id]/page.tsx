import Link from 'next/link';
import { notFound } from 'next/navigation';
import {
  aportadoPorCotizacion,
  calcularTotales,
  getCotizacionConDetalle,
} from '@/lib/data/cotizaciones';
import { listObras } from '@/lib/data/obras';
import { hayCambiosSinAprobar } from '@/lib/data/cotizacion-diff';
import { listPagosByCotizacion, sumaPagos } from '@/lib/data/pagos';
import { listArchivosCotizacion } from '@/lib/data/archivos';
import { listClientes } from '@/lib/data/clientes';
import { formatCurrency } from '@/lib/data/format';
import { LinkButton } from '@/components/ui';
import { CotizacionHeader } from '../cotizacion-header';
import { SeccionesList } from '../secciones-list';
import PagosSection from './pagos-section';
import ArchivosSection from './archivos-section';

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

  const [{ data: pagos }, { data: clientes }, { data: archivos }, { data: obras }, aportado] =
    await Promise.all([
      listPagosByCotizacion(id),
      listClientes(),
      listArchivosCotizacion(id),
      listObras(),
      aportadoPorCotizacion(id),
    ]);
  const totalPagado = sumaPagos(pagos ?? []);

  // Obras activas para "Vincular a obra" (paridad móvil).
  const obrasActivas = (obras ?? [])
    .filter((o) => o.activa)
    .map((o) => ({ id: o.id, nombre: o.nombre }));

  // Aviso al admin: la cotización está aceptada pero hubo ediciones que el
  // cliente aún no aprueba (compara la foto aprobada contra el estado actual).
  const cambiosPendientes =
    cotizacion.estado === 'ACEPTADA' &&
    hayCambiosSinAprobar(cotizacion.aprobado_snapshot_json, cotizacion);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-4">
        <Link
          href="/admin/cotizaciones"
          className="inline-flex items-center gap-1 text-sm text-neutral-500 hover:text-neutral-900 cursor-pointer transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-neutral-900 rounded"
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
          Cotizaciones
        </Link>
        <LinkButton href={`/admin/cotizaciones/${id}/pdf`} variant="secondary" size="sm">
          Ver PDF
        </LinkButton>
      </div>

      <CotizacionHeader
        cotizacion={cotizacion}
        clientes={clientes}
        obras={obrasActivas}
        totalActual={totales.total}
        cambiosPendientes={cambiosPendientes}
      />

      {cotizacion.notas && (
        <section className="rounded-xl border border-neutral-200 bg-white p-5">
          <h2 className="mb-1 text-sm font-medium text-neutral-500">Notas</h2>
          <p className="text-sm text-neutral-700 whitespace-pre-wrap">{cotizacion.notas}</p>
        </section>
      )}

      <SeccionesList
        cotizacionId={cotizacion.id}
        secciones={cotizacion.secciones}
        aportado={aportado}
      />

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
              <dt className="text-neutral-600">IVA ({totales.ivaPct}%)</dt>
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

      <ArchivosSection cotizacionId={cotizacion.id} archivos={archivos ?? []} />
    </div>
  );
}
