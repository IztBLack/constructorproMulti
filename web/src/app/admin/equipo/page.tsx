import { listColaboradores, listPuestos } from '@/lib/data/equipo';
import NuevoColaboradorForm from './nuevo-colaborador-form';
import TablaColaboradores from './tabla-colaboradores';

export const dynamic = 'force-dynamic';

export default async function EquipoPage() {
  const [{ data: colaboradores, error: colError }, { data: puestos, error: puestoError }] =
    await Promise.all([listColaboradores(), listPuestos()]);

  const error = colError ?? puestoError;

  return (
    <div className="space-y-6">
      <header className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-neutral-900">Equipo</h1>
          <p className="text-sm text-neutral-500">Colaboradores y su esquema de pago.</p>
        </div>
        <NuevoColaboradorForm puestos={puestos} />
      </header>

      {error && (
        <p className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
          No se pudo cargar la información: {error}
        </p>
      )}

      {!error && <TablaColaboradores colaboradores={colaboradores} puestos={puestos} />}
    </div>
  );
}
