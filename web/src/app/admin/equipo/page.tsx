import {
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

export default async function EquipoPage() {
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

      {!error && (
        <TablaColaboradores
          colaboradores={colaboradores}
          puestos={puestos}
          modo={modo}
          obrasPorColab={obrasPorColab}
        />
      )}
    </div>
  );
}
