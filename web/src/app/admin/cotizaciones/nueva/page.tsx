import Link from 'next/link';
import { Card } from '@/components/ui';
import { listClientes } from '@/lib/data/clientes';
import { CotizacionForm } from '../cotizacion-form';

export const dynamic = 'force-dynamic';

export default async function NuevaCotizacionPage() {
  const { data: clientes } = await listClientes();

  return (
    <div className="space-y-6">
      <div>
        <Link href="/admin/cotizaciones" className="text-sm text-neutral-500 hover:underline">
          ← Cotizaciones
        </Link>
      </div>

      <header>
        <h1 className="text-2xl font-semibold text-neutral-900">Nueva cotización</h1>
        <p className="text-sm text-neutral-500">
          Captura los datos generales. Podrás agregar secciones y partidas después de crearla.
        </p>
      </header>

      <Card>
        <CotizacionForm mode="crear" clientes={clientes} />
      </Card>
    </div>
  );
}
