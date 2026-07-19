import { listCuadrillas } from '@/lib/data/cuadrillas';
import { PageHeader } from '@/components/ui';
import TablaCuadrillas from './tabla-cuadrillas';
import NuevaCuadrillaForm from './nueva-cuadrilla-form';

export const dynamic = 'force-dynamic';

export default async function CuadrillasPage() {
  const { data: cuadrillas, error } = await listCuadrillas();

  return (
    <div className="space-y-6">
      <PageHeader
        title="Cuadrillas"
        description="Equipos de colaboradores por especialidad, con su cabo y obras asignadas."
        actions={<NuevaCuadrillaForm />}
      />

      {error && (
        <p className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
          No se pudo cargar la información: {error}
        </p>
      )}

      {!error && <TablaCuadrillas cuadrillas={cuadrillas} />}
    </div>
  );
}
