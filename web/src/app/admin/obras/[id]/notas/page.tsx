import { notFound } from 'next/navigation';
import { getObra } from '@/lib/data/obras';
import { listNotasObra } from '@/lib/data/notas-obra';
import { listColaboradores } from '@/lib/data/equipo';
import { getEmpresaUsuario } from '@/lib/data/empresa';
import ObraTabs from '../_obra-tabs';
import NotasLista from './notas-lista';

export const dynamic = 'force-dynamic';

/**
 * Notas de obra: los tratos de palabra con socios que no están en el sistema
 * (migración 0031). Una nota por socio dentro de la obra.
 *
 * Escriben admin y supervisor; el contador solo mira. La barrera real son las
 * policies de 0031 — `puedeEditar` solo evita enseñar botones que fallarían.
 */
export default async function NotasObraPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  const [{ data: obra, error: obraError }, { data: notas, error }, { data: colaboradores }, rol] =
    await Promise.all([
      getObra(id),
      listNotasObra(id),
      listColaboradores(),
      getEmpresaUsuario()
        .then((e) => e.rol)
        .catch(() => ''),
    ]);

  if (obraError) {
    return (
      <p className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
        No se pudo cargar la obra: {obraError}
      </p>
    );
  }
  if (!obra) notFound();

  const puedeEditar = ['admin', 'supervisor'].includes(rol);

  return (
    <div className="space-y-6">
      <ObraTabs obraId={id} />

      <div>
        <h1 className="text-xl font-semibold text-neutral-900">Notas de {obra.nombre}</h1>
        <p className="mt-1 text-sm text-neutral-600">
          Cuentas de los tratos con socios de esta obra. Cada nota se puede mandar en PDF
          a quien no tiene acceso al sistema.
        </p>
      </div>

      {error && (
        <p className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
          No se pudieron cargar las notas: {error}
        </p>
      )}

      {!error && (
        <NotasLista
          obraId={id}
          notas={notas}
          colaboradores={colaboradores.map((c) => ({ id: c.id, nombre: c.nombre }))}
          puedeEditar={puedeEditar}
        />
      )}
    </div>
  );
}
