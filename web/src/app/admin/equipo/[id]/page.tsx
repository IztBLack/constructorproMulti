import Link from 'next/link';
import { notFound } from 'next/navigation';
import { Badge } from '@/components/ui';
import {
  getColaborador,
  listAsignacionesColaborador,
  listObrasDisponibles,
  listPuestos,
} from '@/lib/data/equipo';
import { formatCurrency } from '@/lib/data/format';
import { PERIODO_PAGO_LABEL, SUELDO_PERIODO_LABEL } from '@/lib/data/salario';
import EditarColaboradorForm from './editar-colaborador-form';
import AsignacionesObra from './asignaciones-obra';

export const dynamic = 'force-dynamic';

export default async function ColaboradorDetallePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const { data: colaborador, error: colaboradorError } = await getColaborador(id);

  if (colaboradorError) {
    return (
      <p className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
        No se pudo cargar el colaborador: {colaboradorError}
      </p>
    );
  }

  if (!colaborador) notFound();

  const [{ data: puestos, error: puestosError }, { data: obras, error: obrasError }, {
    data: asignaciones,
    error: asignacionesError,
  }] = await Promise.all([
    listPuestos(),
    listObrasDisponibles(),
    listAsignacionesColaborador(id),
  ]);

  return (
    <div className="space-y-6">
      <div>
        <Link href="/admin/equipo" className="text-sm text-neutral-500 hover:underline">
          ← Equipo
        </Link>
      </div>

      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-semibold text-neutral-900">{colaborador.nombre}</h1>
            <Badge tone={colaborador.activo ? 'green' : 'neutral'}>
              {colaborador.activo ? 'Activo' : 'Inactivo'}
            </Badge>
          </div>
          <p className="text-sm text-neutral-500">
            {colaborador.tipo_pago === 'DESTAJO' ? 'Por destajo' : 'Por día'}
          </p>
        </div>
        {!puestosError && (
          <EditarColaboradorForm colaborador={colaborador} puestos={puestos} />
        )}
      </header>

      {puestosError && (
        <p className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
          No se pudieron cargar los puestos: {puestosError}
        </p>
      )}

      {(() => {
        const puestoDefault =
          puestos.find((p) => p.id === colaborador.puesto_id)?.salario_dia_default ?? null;
        const salarioDiario = colaborador.salario_personalizado ?? puestoDefault;
        return (
          <section className="grid gap-4 rounded-xl border border-neutral-100 bg-neutral-50/60 p-4 sm:grid-cols-3">
            <div>
              <p className="text-xs text-neutral-500">Esquema de pago</p>
              <p className="text-sm font-medium text-neutral-800">
                {PERIODO_PAGO_LABEL[colaborador.periodo_pago]} · {colaborador.dias_semana} días/sem
              </p>
            </div>
            <div>
              <p className="text-xs text-neutral-500">
                {SUELDO_PERIODO_LABEL[colaborador.periodo_pago]}
              </p>
              <p className="text-sm font-medium tabular-nums text-neutral-800">
                {colaborador.salario_periodo != null
                  ? formatCurrency(colaborador.salario_periodo)
                  : 'Usa el del puesto'}
              </p>
            </div>
            <div>
              <p className="text-xs text-neutral-500">Salario diario (calculado)</p>
              <p className="text-sm font-medium tabular-nums text-neutral-800">
                {salarioDiario != null ? `${formatCurrency(salarioDiario)} / día` : '—'}
              </p>
            </div>
          </section>
        );
      })()}

      <section className="space-y-3">
        <h2 className="text-sm font-medium text-neutral-700">Obras asignadas</h2>

        {obrasError && (
          <p className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
            No se pudieron cargar las obras: {obrasError}
          </p>
        )}

        {asignacionesError && (
          <p className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
            No se pudieron cargar las asignaciones: {asignacionesError}
          </p>
        )}

        {!obrasError && !asignacionesError && (
          <AsignacionesObra colaboradorId={id} obras={obras} asignaciones={asignaciones} />
        )}
      </section>
    </div>
  );
}
