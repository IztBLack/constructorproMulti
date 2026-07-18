import { notFound } from 'next/navigation';
import { Badge, Card, CardTitle, DataTable, EmptyState, LinkButton, PageHeader, type DataColumn } from '@/components/ui';
import { getObra } from '@/lib/data/obras';
import {
  calcularNomina,
  listAsistenciasObraRango,
  listColaboradoresActivosObra,
  listDestajosObraRango,
  listPuestosLite,
  navegarSemana,
  semanaDe,
} from '@/lib/data/nomina';
import { formatCurrency, formatDate } from '@/lib/data/format';
import ObraTabs from '../_obra-tabs';

export const dynamic = 'force-dynamic';

type ItemNomina = NonNullable<ReturnType<typeof calcularNomina>>['items'][number];

const COLUMNAS_NOMINA: DataColumn<ItemNomina>[] = [
  { key: 'colaborador', header: 'Colaborador', primary: true, cell: (i) => i.colaborador.nombre },
  { key: 'puesto', header: 'Puesto', cell: (i) => i.puestoNombre },
  {
    key: 'tipo',
    header: 'Tipo de pago',
    cell: (i) => (
      <Badge tone={i.colaborador.tipo_pago === 'DESTAJO' ? 'purple' : 'blue'}>
        {i.colaborador.tipo_pago === 'DESTAJO' ? 'Destajo' : 'Por día'}
      </Badge>
    ),
  },
  {
    key: 'dias',
    header: 'Días / Destajos',
    align: 'right',
    cell: (i) => (
      <span className="tabular-nums">
        {i.colaborador.tipo_pago === 'DESTAJO'
          ? formatCurrency(i.totalDestajos)
          : i.totalDias.toFixed(2)}
      </span>
    ),
  },
  {
    key: 'base',
    header: 'Salario base',
    align: 'right',
    cell: (i) => (
      <span className="tabular-nums">
        {i.colaborador.tipo_pago === 'DESTAJO' ? '—' : formatCurrency(i.salarioBaseCalculado)}
      </span>
    ),
  },
  {
    key: 'total',
    header: 'Total a pagar',
    align: 'right',
    cell: (i) => (
      <span className="tabular-nums font-semibold text-neutral-900">
        {formatCurrency(i.totalPagar)}
      </span>
    ),
  },
];

export default async function NominaObraPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ inicio?: string }>;
}) {
  const { id } = await params;
  const { inicio } = await searchParams;

  const { data: obra, error: obraError } = await getObra(id);
  if (obraError) {
    return (
      <p className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
        No se pudo cargar la obra: {obraError}
      </p>
    );
  }
  if (!obra) notFound();

  const ancla = inicio ? new Date(Number(inicio)) : new Date();
  const { inicioMs, finMs } = semanaDe(ancla);
  const semanaAnterior = navegarSemana(inicioMs, -1);
  const semanaSiguiente = navegarSemana(inicioMs, 1);

  const [
    { data: colaboradores, error: colabError },
    { data: asistencias, error: asisError },
    { data: destajos, error: destError },
    { data: puestos, error: puestosError },
  ] = await Promise.all([
    listColaboradoresActivosObra(id),
    listAsistenciasObraRango(id, inicioMs, finMs),
    listDestajosObraRango(id, inicioMs, finMs),
    listPuestosLite(),
  ]);

  const error = colabError ?? asisError ?? destError ?? puestosError;

  const summary = error
    ? null
    : calcularNomina({ colaboradores, asistencias, destajos, puestos });

  return (
    <div className="space-y-6">
      <ObraTabs obraId={id} />

      <PageHeader
        title="Nómina"
        description={`Consulta de nómina semanal en ${obra.nombre}. La asistencia se captura aquí, en la pestaña Asistencia; los destajos se capturan desde la app móvil.`}
      />

      <Card>
        <div className="flex flex-wrap items-center justify-between gap-4">
          <CardTitle as="h2">Semana</CardTitle>
          <div className="flex items-center gap-3">
            <LinkButton
              variant="secondary"
              size="sm"
              href={`/admin/obras/${id}/nomina?inicio=${semanaAnterior.inicioMs}`}
            >
              ← Anterior
            </LinkButton>
            <span className="text-sm font-medium text-neutral-900">
              {formatDate(inicioMs)} – {formatDate(finMs)}
            </span>
            <LinkButton
              variant="secondary"
              size="sm"
              href={`/admin/obras/${id}/nomina?inicio=${semanaSiguiente.inicioMs}`}
            >
              Siguiente →
            </LinkButton>
          </div>
        </div>
      </Card>

      {error && (
        <p className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
          No se pudo cargar la información: {error}
        </p>
      )}

      {summary && (
        <>
          <Card>
            <CardTitle>Total de nómina de la semana</CardTitle>
            <p className="tabular-nums text-3xl font-semibold text-neutral-900">{formatCurrency(summary.totalNomina)}</p>
            <div className="mt-3 flex gap-6 text-sm text-neutral-500">
              <span className="tabular-nums">Por día: {formatCurrency(summary.totalDia)}</span>
              <span className="tabular-nums">Por destajo: {formatCurrency(summary.totalDestajo)}</span>
            </div>
          </Card>

          <section className="space-y-3">
            <h2 className="text-sm font-medium text-neutral-700">Detalle por colaborador</h2>
            {summary.items.length === 0 ? (
              <EmptyState
                title="Sin colaboradores activos asignados a esta obra."
                description="Asigna colaboradores desde la sección Equipo."
              />
            ) : (
              <DataTable
                columns={COLUMNAS_NOMINA}
                rows={summary.items}
                rowKey={(item) => item.colaborador.id}
              />
            )}
          </section>
        </>
      )}
    </div>
  );
}
