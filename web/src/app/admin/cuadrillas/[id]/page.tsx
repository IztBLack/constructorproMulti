import Link from 'next/link';
import { notFound } from 'next/navigation';
import { Badge } from '@/components/ui';
import { getCuadrilla } from '@/lib/data/cuadrillas';
import { listColaboradores, listObrasDisponibles } from '@/lib/data/equipo';
import { ESPECIALIDAD_LABEL } from '../especialidades';
import EditarCuadrillaForm from './editar-cuadrilla-form';
import GestionCuadrilla from './gestion-cuadrilla';
import DestajoCuadrillaForm from './destajo-cuadrilla-form';

export const dynamic = 'force-dynamic';

export default async function CuadrillaDetallePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const { data: cuadrilla, error } = await getCuadrilla(id);

  if (error) {
    return (
      <p className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
        No se pudo cargar la cuadrilla: {error}
      </p>
    );
  }
  if (!cuadrilla) notFound();

  const [{ data: colaboradores }, { data: obras }] = await Promise.all([
    listColaboradores(),
    listObrasDisponibles(),
  ]);

  const colaboradoresActivos = colaboradores
    .filter((c) => c.activo)
    .map((c) => ({ id: c.id, nombre: c.nombre }));

  return (
    <div className="space-y-6">
      <div>
        <Link href="/admin/cuadrillas" className="text-sm text-neutral-500 hover:underline">
          ← Cuadrillas
        </Link>
      </div>

      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-semibold text-neutral-900">{cuadrilla.nombre}</h1>
            <Badge tone={cuadrilla.activa ? 'green' : 'neutral'}>
              {cuadrilla.activa ? 'Activa' : 'Inactiva'}
            </Badge>
          </div>
          <p className="text-sm text-neutral-500">
            {ESPECIALIDAD_LABEL[cuadrilla.especialidad] ?? cuadrilla.especialidad}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <DestajoCuadrillaForm
            cuadrillaId={cuadrilla.id}
            miembros={cuadrilla.miembros}
            obras={cuadrilla.obras.length > 0 ? cuadrilla.obras : obras}
          />
          <EditarCuadrillaForm cuadrilla={cuadrilla} />
        </div>
      </header>

      <GestionCuadrilla
        cuadrilla={cuadrilla}
        colaboradores={colaboradoresActivos}
        obras={obras}
      />
    </div>
  );
}
