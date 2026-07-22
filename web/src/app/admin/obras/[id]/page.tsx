import { notFound } from 'next/navigation';
import { getObra, listMovimientosByObra } from '@/lib/data/obras';
import { listPresupuestoObra } from '@/lib/data/presupuesto-obra';
import { listColaboradores, listColaboradoresDeObra } from '@/lib/data/equipo';
import { listClientes } from '@/lib/data/clientes';
import { getEmpresaUsuario } from '@/lib/data/empresa';
import { getNotaCaja } from '@/lib/data/caja-nota';
import ObraHeader from './obra-header';
import { NotaCaja } from './nota-caja';
import RegistrarMovimiento from './registrar-movimiento';
import MovimientosTabla from './movimientos-tabla';
import EquipoObra from './equipo-obra';
import EstadoCuenta from './estado-cuenta';
import PresupuestoObra from './presupuesto-obra';
import ObraTabs from './_obra-tabs';

export const dynamic = 'force-dynamic';

export default async function ObraDetallePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const { data: obra, error: obraError } = await getObra(id);

  if (obraError) {
    return (
      <p className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
        No se pudo cargar la obra: {obraError}
      </p>
    );
  }

  if (!obra) notFound();

  const [
    { data: movimientos, error: movError },
    { data: partidas, error: presupuestoError },
    { data: equipoAsignado, error: equipoError },
    { data: colaboradores, error: colaboradoresError },
    { data: clientes },
    notaCaja,
  ] = await Promise.all([
    listMovimientosByObra(id),
    listPresupuestoObra(id),
    listColaboradoresDeObra(id),
    listColaboradores(),
    listClientes(),
    getNotaCaja(id),
  ]);

  // Quién puede editar la nota de caja. Si falla la consulta de rol, se asume
  // que no (mejor solo lectura que romper la página).
  const rol = await getEmpresaUsuario().then((e) => e.rol).catch(() => '');
  const puedeEditarNota = ['admin', 'supervisor', 'contador'].includes(rol);

  return (
    <div className="space-y-6">
      <ObraTabs obraId={id} />

      <ObraHeader obra={obra} clientes={clientes} />

      {/* ── Sección financiera ──────────────────────────────────────────── */}

      {/* 1. Estado de cuenta: encabezado (COSTO TOTAL / RECIBIDO / PENDIENTE) + resúmenes */}
      {presupuestoError ? (
        <p className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
          No se pudo cargar el presupuesto: {presupuestoError}
        </p>
      ) : (
        <EstadoCuenta obraId={id} partidas={partidas} movimientos={movimientos ?? []} />
      )}

      {/* Nota de conciliación (el apunte al pie del Excel de la contadora). */}
      <NotaCaja obraId={id} notaInicial={notaCaja} puedeEditar={puedeEditarNota} />

      {/* 2. Presupuesto por partidas (editable) */}
      {!presupuestoError && (
        <PresupuestoObra obraId={id} partidas={partidas} />
      )}

      {/* 3. Equipo de la obra */}
      <section className="space-y-3">
        <h2 className="text-sm font-medium text-neutral-700">Equipo de la obra</h2>

        {equipoError && (
          <p className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
            No se pudo cargar el equipo: {equipoError}
          </p>
        )}

        {colaboradoresError && (
          <p className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
            No se pudieron cargar los colaboradores: {colaboradoresError}
          </p>
        )}

        {!equipoError && !colaboradoresError && (
          <EquipoObra
            obraId={id}
            asignados={equipoAsignado}
            colaboradoresDisponibles={colaboradores}
          />
        )}
      </section>

      {/* 4. Movimientos */}
      <section className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-sm font-medium text-neutral-700">Movimientos</h2>
          <RegistrarMovimiento obraId={id} />
        </div>

        {movError && (
          <p className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
            No se pudieron cargar los movimientos: {movError}
          </p>
        )}

        {!movError && <MovimientosTabla obraId={id} movimientos={movimientos} />}
      </section>
    </div>
  );
}
