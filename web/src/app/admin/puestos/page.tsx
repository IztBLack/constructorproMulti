import { listPuestos } from '@/lib/data/puestos';
import { PageHeader } from '@/components/ui';
import NuevoPuestoForm from './nuevo-puesto-form';
import TablaPuestos from './tabla-puestos';

export const dynamic = 'force-dynamic';

export default async function PuestosPage() {
  const { data: puestos, error } = await listPuestos();

  return (
    <div className="space-y-6">
      <PageHeader
        title="Puestos y salarios"
        description="Define los puestos disponibles y su salario diario por defecto."
        actions={<NuevoPuestoForm />}
      />

      {error && (
        <p className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
          No se pudieron cargar los puestos: {error}
        </p>
      )}

      {!error && <TablaPuestos puestos={puestos} />}
    </div>
  );
}
