import { listCatalogoConceptos } from '@/lib/data/catalogo';
import NuevoConceptoForm from './nuevo-concepto-form';
import TablaConceptos from './tabla-conceptos';

export const dynamic = 'force-dynamic';

export default async function CatalogoPage() {
  const { data: conceptos, error } = await listCatalogoConceptos();

  return (
    <div className="space-y-6">
      <header className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-neutral-900">Catálogo de conceptos</h1>
          <p className="text-sm text-neutral-500">
            Conceptos reutilizables para cotizaciones, con su precio unitario por defecto.
          </p>
        </div>
        <NuevoConceptoForm />
      </header>

      {error && (
        <p className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
          No se pudo cargar el catálogo: {error}
        </p>
      )}

      {!error && <TablaConceptos conceptos={conceptos} />}
    </div>
  );
}
