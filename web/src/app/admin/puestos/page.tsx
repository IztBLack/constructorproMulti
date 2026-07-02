import { listPuestos } from '@/lib/data/puestos';
import NuevoPuestoForm from './nuevo-puesto-form';
import TablaPuestos from './tabla-puestos';

export const dynamic = 'force-dynamic';

export default async function PuestosPage() {
  const { data: puestos, error } = await listPuestos();

  return (
    <div className="space-y-6">
      <header className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-neutral-900">Puestos y salarios</h1>
          <p className="text-sm text-neutral-500">
            Define los puestos disponibles y su salario diario por defecto.
          </p>
        </div>
        <NuevoPuestoForm />
      </header>

      {error && (
        <p className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
          No se pudieron cargar los puestos: {error}
        </p>
      )}

      {!error && <TablaPuestos puestos={puestos} />}
    </div>
  );
}
