import { listCotizaciones } from '@/lib/data/cotizaciones';
import { LinkButton, PageHeader } from '@/components/ui';
import FiltroEstadoCotizaciones from './filtro-estado';

export const dynamic = 'force-dynamic';

export default async function CotizacionesPage() {
  const { data: cotizaciones, error } = await listCotizaciones();

  return (
    <div className="space-y-6">
      <PageHeader
        title="Cotizaciones"
        description="Revisa el estado de tus cotizaciones por cliente y proyecto."
        actions={<LinkButton href="/admin/cotizaciones/nueva">+ Nueva cotización</LinkButton>}
      />

      {error && (
        <p className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
          No se pudieron cargar las cotizaciones: {error}
        </p>
      )}

      {!error && <FiltroEstadoCotizaciones cotizaciones={cotizaciones} />}
    </div>
  );
}
