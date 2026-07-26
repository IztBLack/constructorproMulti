import { listCatalogoConceptos } from '@/lib/data/catalogo';
import { PageHeader } from '@/components/ui';
import NuevoConceptoForm from './nuevo-concepto-form';
import CargarOficialBoton from './cargar-oficial-boton';
import TablaConceptos from './tabla-conceptos';

export const dynamic = 'force-dynamic';

export default async function CatalogoPage() {
  const { data: conceptos, error } = await listCatalogoConceptos();

  return (
    <div className="space-y-6">
      <PageHeader
        title="Catálogo de conceptos"
        description="Conceptos reutilizables para cotizaciones, con su precio unitario por defecto."
        actions={
          <div className="flex flex-wrap items-start gap-3">
            <CargarOficialBoton />
            <NuevoConceptoForm />
          </div>
        }
      />

      {error && (
        <p className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
          No se pudo cargar el catálogo: {error}
        </p>
      )}

      {!error && <TablaConceptos conceptos={conceptos} />}
    </div>
  );
}
