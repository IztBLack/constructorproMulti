import { notFound } from 'next/navigation';
import { getObra } from '@/lib/data/obras';
import { getEmpresaUsuario } from '@/lib/data/empresa';
import { listProgramaObra } from '@/lib/data/programa';
import { listPresupuestoObra } from '@/lib/data/presupuesto-obra';
import { hoyMxMs, msAFechaInput } from '@/lib/data/tz';
import { relojPeticion } from '@/lib/bitacora/periodo';
import ObraTabs from '../_obra-tabs';
import { ProgramaObra } from './programa-obra';

export const dynamic = 'force-dynamic';

/**
 * Programa de obra (0041): fecha de inicio y fin por partida o sección, vista
 * de barras sencilla y alerta de lo atrasado. Sin dependencias ni ruta crítica
 * (RF4.8). "Atrasada" hoy = pasó su fecha de fin sin marcarse terminada.
 *
 * TODO(F3 · 0039 avance_partida): conectar "programado vs real" (RF4.7): el %
 * real por partida (ligado por `presupuesto_id`) contra `avanceProgramado()` de
 * `@/lib/programa/programa`, para avisar antes de que venza.
 */
export default async function ProgramaObraPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const ahora = relojPeticion();

  const [{ data: obra, error: obraError }, { data: partidas, error }, { data: presupuesto }, rol] =
    await Promise.all([
      getObra(id),
      listProgramaObra(id),
      listPresupuestoObra(id),
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

  return (
    <div className="space-y-6">
      <ObraTabs obraId={id} />

      <div>
        <h1 className="text-xl font-semibold text-neutral-900">Programa de {obra.nombre}</h1>
        <p className="mt-1 max-w-2xl text-sm text-neutral-600">
          Cuándo empieza y cuándo termina cada partida. Lo que pasa de su fecha sin marcarse
          como terminado sale como atrasado.
        </p>
      </div>

      {error ? (
        <p className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
          No se pudo cargar el programa: {error}
        </p>
      ) : (
        <ProgramaObra
          obraId={id}
          partidas={partidas}
          presupuesto={presupuesto.map((p) => ({ id: p.id, concepto: p.concepto, seccion: p.seccion ?? null }))}
          puedeEditar={['admin', 'supervisor'].includes(rol)}
          ahora={ahora}
          hoy={msAFechaInput(hoyMxMs())}
        />
      )}
    </div>
  );
}
