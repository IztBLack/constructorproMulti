import Link from 'next/link';
import { notFound } from 'next/navigation';
import { Card, CardTitle, EmptyState, LinkButton, PageHeader } from '@/components/ui';
import { getObra } from '@/lib/data/obras';
import { listColaboradoresActivosObra, listAsistenciasObraRango, navegarSemana, semanaDe } from '@/lib/data/nomina';
import { formatDate } from '@/lib/data/format';
import CuadriculaAsistencia, { type DiaSemana } from './cuadricula-asistencia';

export const dynamic = 'force-dynamic';

const DIA_ABBR = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'];

export default async function AsistenciaObraPage({
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

  const [{ data: colaboradores, error: colabError }, { data: asistencias, error: asisError }] =
    await Promise.all([
      listColaboradoresActivosObra(id),
      listAsistenciasObraRango(id, inicioMs, finMs),
    ]);

  const error = colabError ?? asisError;

  // Los 7 días de la semana (lunes→domingo). `ms` = medianoche local de cada
  // día y es la clave canónica para leer/escribir asistencias (igual que el
  // móvil, que normaliza la fecha al inicio del día en hora local).
  const inicioSemana = new Date(inicioMs);
  const diasDate = Array.from({ length: 7 }, (_, i) => {
    return new Date(inicioSemana.getFullYear(), inicioSemana.getMonth(), inicioSemana.getDate() + i);
  });
  const dias: DiaSemana[] = diasDate.map((d, i) => ({
    ms: d.getTime(),
    abbr: DIA_ABBR[i],
    dia: d.getDate(),
    mes: d.getMonth() + 1,
  }));

  // Asistencias existentes → fracción por celda. Se asocia cada registro al día
  // de la semana por fecha de calendario (robusto si el ms guardado no es
  // exactamente medianoche), pero la clave usa el `ms` canónico del día.
  const fraccionesIniciales: Record<string, number> = {};
  for (const a of asistencias) {
    const ad = new Date(a.fecha);
    const idx = diasDate.findIndex(
      (d) =>
        d.getFullYear() === ad.getFullYear() &&
        d.getMonth() === ad.getMonth() &&
        d.getDate() === ad.getDate(),
    );
    if (idx >= 0) {
      const key = `${a.colaborador_id}|${dias[idx].ms}`;
      fraccionesIniciales[key] = (fraccionesIniciales[key] ?? 0) + a.fraccion;
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <Link href={`/admin/obras/${id}`} className="text-sm text-neutral-500 hover:underline">
          ← {obra.nombre}
        </Link>
      </div>

      <PageHeader
        title="Asistencia"
        description={`Pase de lista semanal en ${obra.nombre}. Toca una celda para marcar la asistencia del día.`}
      />

      <Card>
        <div className="flex flex-wrap items-center justify-between gap-4">
          <CardTitle as="h2">Semana</CardTitle>
          <div className="flex items-center gap-3">
            <LinkButton
              variant="secondary"
              size="sm"
              href={`/admin/obras/${id}/asistencia?inicio=${semanaAnterior.inicioMs}`}
            >
              ← Anterior
            </LinkButton>
            <span className="text-sm font-medium text-neutral-900">
              {formatDate(inicioMs)} – {formatDate(finMs)}
            </span>
            <LinkButton
              variant="secondary"
              size="sm"
              href={`/admin/obras/${id}/asistencia?inicio=${semanaSiguiente.inicioMs}`}
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

      {!error && colaboradores.length === 0 && (
        <EmptyState
          title="Sin colaboradores activos asignados a esta obra."
          description="Asigna colaboradores desde la sección Equipo."
        />
      )}

      {!error && colaboradores.length > 0 && (
        <section className="space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-medium text-neutral-700">Cuadrícula semanal</h2>
            <p className="text-xs text-neutral-400">
              Clic para cambiar: · sin registro → ½ medio → ¾ → 1 completa
            </p>
          </div>

          <CuadriculaAsistencia
            obraId={id}
            colaboradores={colaboradores}
            dias={dias}
            fraccionesIniciales={fraccionesIniciales}
          />
        </section>
      )}
    </div>
  );
}
