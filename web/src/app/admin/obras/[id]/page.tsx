import Link from 'next/link';
import { notFound } from 'next/navigation';
import { Card, CardTitle } from '@/components/ui';
import { calcularSaldo, getObra, listMovimientosByObra } from '@/lib/data/obras';
import { listColaboradores, listColaboradoresDeObra } from '@/lib/data/equipo';
import { listClientes } from '@/lib/data/clientes';
import { formatCurrency } from '@/lib/data/format';
import ObraHeader from './obra-header';
import RegistrarMovimiento from './registrar-movimiento';
import MovimientosTabla from './movimientos-tabla';
import EquipoObra from './equipo-obra';

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

  const { data: movimientos, error: movError } = await listMovimientosByObra(id);
  const saldo = calcularSaldo(movimientos);

  const [
    { data: equipoAsignado, error: equipoError },
    { data: colaboradores, error: colaboradoresError },
    { data: clientes },
  ] = await Promise.all([listColaboradoresDeObra(id), listColaboradores(), listClientes()]);

  return (
    <div className="space-y-6">
      <div>
        <Link href="/admin/obras" className="text-sm text-neutral-500 hover:underline">
          ← Obras
        </Link>
      </div>

      <ObraHeader obra={obra} clientes={clientes} />

      <div className="flex flex-wrap items-center gap-3">
        <Link
          href={`/admin/obras/${id}/asistencia`}
          className="rounded-lg border border-neutral-300 bg-white px-4 py-2 text-sm font-medium text-neutral-700 transition hover:bg-neutral-100"
        >
          Asistencia
        </Link>
        <Link
          href={`/admin/obras/${id}/nomina`}
          className="rounded-lg border border-neutral-300 bg-white px-4 py-2 text-sm font-medium text-neutral-700 transition hover:bg-neutral-100"
        >
          Nómina
        </Link>
      </div>

      <Card>
        <CardTitle>Saldo de caja</CardTitle>
        <p
          className={`text-3xl font-semibold ${saldo >= 0 ? 'text-neutral-900' : 'text-red-600'}`}
        >
          {formatCurrency(saldo)}
        </p>
      </Card>

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
