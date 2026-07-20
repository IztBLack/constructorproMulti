import { notFound } from 'next/navigation';
import { Card, CardTitle, EmptyState, LinkButton, PageHeader } from '@/components/ui';
import { getObra } from '@/lib/data/obras';
import { listColaboradoresActivosObra, listAsistenciasObraRango, navegarSemana, semanaDe } from '@/lib/data/nomina';
import { getEmpresaUsuario } from '@/lib/data/empresa';
import { partesTz, medianocheMx, sumarDiasCalendario, hoyMxMs } from '@/lib/data/tz';
import { formatDate } from '@/lib/data/format';
import VistaAsistencia from './vista-asistencia';
import type { DiaSemana } from './tipos';
import ObraTabs from '../_obra-tabs';

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

  const [
    { data: colaboradores, error: colabError },
    { data: asistencias, error: asisError },
    empresa,
  ] = await Promise.all([
    listColaboradoresActivosObra(id, inicioMs),
    listAsistenciasObraRango(id, inicioMs, finMs),
    // La captura offline escribe directo a Supabase desde el navegador y sella
    // `empresa_id` en cada marca, así que la empresa debe resolverse aquí (en el
    // servidor) y viajar a la vista. Sin ella no se puede capturar: la cola
    // descarta marcas cuya empresa no coincide con la sesión, y encolar con un
    // valor vacío las perdería en silencio.
    getEmpresaUsuario().catch(() => null),
  ]);

  const error =
    colabError ?? asisError ?? (empresa ? null : 'No se pudo determinar la empresa del usuario.');

  // Los 7 días de la semana (lunes→domingo). `ms` = medianoche de México de
  // cada día (clave canónica para leer/escribir asistencias, igual que el móvil
  // que normaliza al inicio del día en hora de México). Independiente de la zona
  // del servidor.
  const pLunes = partesTz(inicioMs);
  const diasCal = Array.from({ length: 7 }, (_, i) =>
    sumarDiasCalendario(pLunes.year, pLunes.month, pLunes.day, i),
  );
  const dias: DiaSemana[] = diasCal.map((c, i) => ({
    ms: medianocheMx(c.y, c.m0, c.d),
    abbr: DIA_ABBR[i],
    dia: c.d,
    mes: c.m0 + 1,
  }));

  // La vista por día se abre en hoy cuando la semana mostrada lo contiene.
  const hoyMs = hoyMxMs();

  // Asistencias existentes → fracción por celda. Se asocia cada registro al día
  // por su fecha de calendario en México (robusto si el ms guardado no es
  // exactamente medianoche), con la clave = `ms` canónico del día.
  const fraccionesIniciales: Record<string, number> = {};
  for (const a of asistencias) {
    const pa = partesTz(a.fecha);
    const idx = diasCal.findIndex(
      (c) => c.y === pa.year && c.m0 === pa.month && c.d === pa.day,
    );
    if (idx >= 0) {
      const key = `${a.colaborador_id}|${dias[idx].ms}`;
      fraccionesIniciales[key] = (fraccionesIniciales[key] ?? 0) + a.fraccion;
    }
  }

  return (
    <div className="space-y-6">
      <ObraTabs obraId={id} />

      <PageHeader
        title="Asistencia"
        description={`Pase de lista en ${obra.nombre}. En el teléfono se captura día por día; en pantalla grande, la semana completa.`}
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

      {/* Se renderiza también cuando la carga falló (si hay empresa): la vista
          intenta rehidratarse desde la copia local de la semana, para poder
          seguir pasando lista sin señal. */}
      {empresa && (colaboradores.length > 0 || Boolean(colabError ?? asisError)) && (
        <VistaAsistencia
          obraId={id}
          empresaId={empresa.empresaId}
          colaboradores={colaboradores}
          dias={dias}
          fraccionesIniciales={fraccionesIniciales}
          hoyMs={hoyMs}
          inicioSemanaMs={inicioMs}
          huboErrorDeCarga={Boolean(colabError ?? asisError)}
        />
      )}
    </div>
  );
}
