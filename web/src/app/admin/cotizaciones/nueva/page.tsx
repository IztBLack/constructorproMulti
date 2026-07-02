import Link from 'next/link';
import { Card } from '@/components/ui';
import { CotizacionForm } from '../cotizacion-form';

export default function NuevaCotizacionPage() {
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
        <CotizacionForm mode="crear" />
      </Card>
    </div>
  );
}
