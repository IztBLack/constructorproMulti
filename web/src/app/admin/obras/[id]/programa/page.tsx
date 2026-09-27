import { notFound } from 'next/navigation';
import { getObra } from '@/lib/data/obras';
import { getEmpresaUsuario } from '@/lib/data/empresa';
import { listProgramaObra } from '@/lib/data/programa';
import { listPresupuestoObra } from '@/lib/data/presupuesto-obra';
import { hoyMxMs, msAFechaInput } from '@/lib/data/tz';
import { relojPeticion } from '@/lib/bitacora/periodo';
import { getModulosEmpresa } from '@/lib/data/modulos';
import { listCapturasAvance, listConceptosObra } from '@/lib/data/estimaciones';
import { ejecutadoPorConcepto } from '@/lib/estimaciones/avance';
import { avanceRealPartida } from '@/lib/programa/programa';
import ObraTabs from '../_obra-tabs';
import { ProgramaObra } from './programa-obra';
import { capturaEnObra } from '@/lib/auth/roles';

export const dynamic = 'force-dynamic';

/**
 * Programa de obra (0041): fecha de inicio y fin por partida o sección, vista
 * de barras sencilla y alerta de lo atrasado. Sin dependencias ni ruta crítica
 * (RF4.8). "Atrasada" hoy = pasó su fecha de fin sin marcarse terminada.
 *
 * PROGRAMADO VS REAL (RF4.7): con el módulo `estimaciones` prendido y avance
 * capturado, cada partida (o sección) trae su % real de `avance_partida` (0039)
 * y se compara con lo que debería llevar a la fecha: "Va atrás" avisa antes de
 * que venza. Sin avance capturado, todo sigue como antes (fechas + marca manual).
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

  // % real por partida del programa (solo si el módulo está prendido).
  const { activos } = await getModulosEmpresa();
  const avanceReal: Record<string, number | null> = {};
  if (activos.includes('estimaciones') && partidas.length > 0) {
    const [conceptos, capturas] = await Promise.all([listConceptosObra(id), listCapturasAvance(id)]);
    if (!conceptos.error && !capturas.error) {
      const ejecutado = ejecutadoPorConcepto(capturas.data);
      for (const p of partidas) {
        avanceReal[p.id] = avanceRealPartida(p, conceptos.data, ejecutado, capturas.data.length > 0);
      }
    }
  }

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
          puedeEditar={capturaEnObra(rol)}
          ahora={ahora}
          hoy={msAFechaInput(hoyMxMs())}
          avanceReal={avanceReal}
        />
      )}
    </div>
  );
}
