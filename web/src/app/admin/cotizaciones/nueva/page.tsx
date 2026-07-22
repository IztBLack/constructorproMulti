import Link from 'next/link';
import { Card, PageHeader } from '@/components/ui';
import { listClientes } from '@/lib/data/clientes';
import { getEmpresaConfig } from '@/lib/data/empresa-config';
import { CotizacionForm } from '../cotizacion-form';

export const dynamic = 'force-dynamic';

export default async function NuevaCotizacionPage() {
  const { data: clientes } = await listClientes();
  // Tasa vigente de la empresa: es la que se congelará en esta cotización.
  const { ivaPorcentaje } = await getEmpresaConfig();

  return (
    <div className="space-y-6">
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

      <PageHeader
        title="Nueva cotización"
        description="Captura los datos generales. Podrás agregar secciones y partidas después de crearla."
      />

      <Card>
        <CotizacionForm mode="crear" clientes={clientes} ivaPct={ivaPorcentaje} />
      </Card>
    </div>
  );
}
