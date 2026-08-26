import Link from 'next/link';
import {
  contarIncompletos,
  listColaboradores,
  listObrasPorColaborador,
  listPuestos,
} from '@/lib/data/equipo';
import { listObras } from '@/lib/data/obras';
import { getUiOrden } from '@/lib/data/empresa-config';
import { leerModo } from '@/lib/data/orden-modos';
import { PageHeader } from '@/components/ui';
import NuevoColaboradorForm from './nuevo-colaborador-form';
import TablaColaboradores from './tabla-colaboradores';

export const dynamic = 'force-dynamic';

export default async function EquipoPage({
  searchParams,
}: {
  searchParams: Promise<{ incompletos?: string }>;
}) {
  const { incompletos: soloIncompletos } = await searchParams;

  const [
    { data: colaboradores, error: colError },
    { data: puestos, error: puestoError },
    { data: obrasPorColab },
    { data: obras },
    ui,
  ] = await Promise.all([
    listColaboradores(),
    listPuestos(),
    listObrasPorColaborador(),
    listObras(),
    getUiOrden(),
  ]);

  // `?incompletos=1` llega del aviso cuando hay VARIOS pendientes. Se filtra
  // sobre la lista ya traída en vez de repetir la consulta: son las mismas
  // filas, solo que recortadas.
  const pendientes = soloIncompletos === '1' ? await contarIncompletos() : null;
  const lista = pendientes
    ? colaboradores.filter((c) => pendientes.ids.includes(c.id))
    : colaboradores;
  // Solo obras activas: dar de alta a alguien en una obra archivada no tiene
  // sentido y ensuciaría el desplegable.
  const obrasActivas = obras.filter((o) => o.activa).map((o) => ({ id: o.id, nombre: o.nombre }));

  const error = colError ?? puestoError;
  // leerModo acepta todos los modos válidos (criterio + su inverso). Un ternario
  // a mano descartaba los demás y los devolvía siempre a 'nombre'.
  const modo = leerModo(ui['colaboradores']);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Equipo"
        description="Colaboradores y su esquema de pago."
        actions={<NuevoColaboradorForm puestos={puestos} obras={obrasActivas} />}
      />

      {error && (
        <p className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
          No se pudo cargar la información: {error}
        </p>
      )}

      {pendientes && (
        <p className="rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          Mostrando solo a quienes les faltan datos ({pendientes.total}).{' '}
          <Link href="/admin/equipo" className="font-semibold underline underline-offset-2">
            Ver a todo el equipo
          </Link>
        </p>
      )}

      {!error && (
        <TablaColaboradores
          colaboradores={lista}
          puestos={puestos}
          modo={modo}
          obrasPorColab={obrasPorColab}
        />
      )}
    </div>
  );
}
