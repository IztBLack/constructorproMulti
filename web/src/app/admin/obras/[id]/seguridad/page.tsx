import { notFound } from 'next/navigation';
import { Badge } from '@/components/ui';
import { getObra } from '@/lib/data/obras';
import { getEmpresaUsuario } from '@/lib/data/empresa';
import { listColaboradoresDeObra } from '@/lib/data/equipo';
import { listChecklistsObra, listIncidentesObra } from '@/lib/data/seguridad';
import { formatDate } from '@/lib/data/format';
import { hoyMxMs, msAFechaInput } from '@/lib/data/tz';
import { cumplimiento, nivelCumplimiento, puntosNuevos, TEXTO_NIVEL } from '@/lib/seguridad/checklist';
import { avisoPendiente, diasSinAccidente } from '@/lib/seguridad/incidentes';
import { FUENTE_NOM_031 } from '@/lib/seguridad/plantilla';
import ObraTabs from '../_obra-tabs';
import { RevisionDiaria } from './revision-diaria';
import { Incidentes } from './incidentes';
import { capturaEnObra } from '@/lib/auth/roles';

export const dynamic = 'force-dynamic';

const TONO_NIVEL = { BIEN: 'green', REVISAR: 'amber', MAL: 'red', SIN_DATOS: 'neutral' } as const;

/**
 * Seguridad de la obra (0043): revisión del día con puntos de la NOM-031,
 * historial de revisiones e incidentes. Escriben admin y supervisor; el
 * contador ve los incidentes (sin datos de salud). Los datos de la lesión solo
 * los ve el admin (D8): la RLS no se los manda a nadie más.
 */
export default async function SeguridadObraPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const hoy = hoyMxMs();
  const hoyInput = msAFechaInput(hoy);

  const [{ data: obra, error: obraError }, empresa, checklists, incidentes, colaboradores] = await Promise.all([
    getObra(id),
    getEmpresaUsuario().catch(() => null),
    listChecklistsObra(id),
    listIncidentesObra(id),
    listColaboradoresDeObra(id),
  ]);

  if (obraError) {
    return (
      <p className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
        No se pudo cargar la obra: {obraError}
      </p>
    );
  }
  if (!obra) notFound();

  const rol = empresa?.rol ?? '';
  const escribe = capturaEnObra(rol);
  const esAdmin = rol === 'admin';

  const deHoy = checklists.data.find((c) => msAFechaInput(c.fecha) === hoyInput) ?? null;
  const cumpleHoy = deHoy ? cumplimiento(deHoy.puntos) : null;
  const nivelHoy = nivelCumplimiento(cumpleHoy?.porcentaje ?? null);
  const sinAccidente = diasSinAccidente(incidentes.data, obra.fecha_inicio ?? hoy, hoy);
  const avisosPendientes = incidentes.data.filter(avisoPendiente).length;

  return (
    <div className="space-y-6">
      <ObraTabs obraId={id} />

      <div>
        <h1 className="text-xl font-semibold text-neutral-900">Seguridad en {obra.nombre}</h1>
        <p className="mt-1 max-w-2xl text-sm text-neutral-600">
          Revisión de cada mañana, incidentes y avisos pendientes. Los puntos salen de la{' '}
          <a href={FUENTE_NOM_031.url} target="_blank" rel="noopener noreferrer" className="underline">
            NOM-031-STPS-2011
          </a>{' '}
          (seguridad en obras de construcción). No sustituye el análisis de riesgos ni el plan de
          emergencias que la norma pide según el tamaño de la obra.
        </p>
      </div>

      <section aria-label="Resumen" className="grid gap-3 sm:grid-cols-3">
        <div className="rounded-xl border border-neutral-200 bg-white px-4 py-3">
          <p className="text-xs font-medium text-neutral-500">Días sin accidente</p>
          <p className="mt-1 text-2xl font-semibold tabular-nums text-neutral-900">{sinAccidente.dias}</p>
          <p className="text-xs text-neutral-500">
            {sinAccidente.ultimo !== null
              ? `Desde el accidente del ${formatDate(sinAccidente.ultimo)}`
              : 'Desde que empezó la obra'}
          </p>
        </div>
        <div className="rounded-xl border border-neutral-200 bg-white px-4 py-3">
          <p className="text-xs font-medium text-neutral-500">Revisión de hoy</p>
          <p className="mt-1 text-2xl font-semibold tabular-nums text-neutral-900">
            {cumpleHoy?.porcentaje != null ? `${cumpleHoy.porcentaje}%` : '—'}
          </p>
          <Badge tone={TONO_NIVEL[nivelHoy]}>{TEXTO_NIVEL[nivelHoy]}</Badge>
        </div>
        <div
          className={`rounded-xl border px-4 py-3 ${avisosPendientes > 0 ? 'border-amber-300 bg-amber-50' : 'border-neutral-200 bg-white'}`}
        >
          <p className="text-xs font-medium text-neutral-500">Avisos al IMSS por registrar</p>
          <p className="mt-1 text-2xl font-semibold tabular-nums text-neutral-900">{avisosPendientes}</p>
          <p className="text-xs text-neutral-600">Accidentes sin el aviso marcado como hecho</p>
        </div>
      </section>

      {checklists.error && (
        <p className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
          No se pudieron cargar las revisiones: {checklists.error}
        </p>
      )}

      {rol !== 'contador' && !checklists.error && (
        <RevisionDiaria
          obraId={id}
          hoy={hoyInput}
          escribe={escribe}
          deHoy={deHoy}
          puntosVacios={puntosNuevos()}
          historial={checklists.data.map((c) => ({
            id: c.id,
            fecha: c.fecha,
            firmo: c.firmo_nombre,
            observaciones: c.observaciones,
            porcentaje: cumplimiento(c.puntos).porcentaje,
            noCumple: c.puntos.filter((p) => p.resultado === 'NO_CUMPLE').map((p) => p.texto),
          }))}
        />
      )}

      {incidentes.error ? (
        <p className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
          No se pudieron cargar los incidentes: {incidentes.error}
        </p>
      ) : (
        <Incidentes
          obraId={id}
          hoy={hoyInput}
          escribe={escribe}
          esAdmin={esAdmin}
          incidentes={incidentes.data}
          colaboradores={colaboradores.data.map((c) => ({ id: c.id, nombre: c.nombre }))}
        />
      )}
    </div>
  );
}
