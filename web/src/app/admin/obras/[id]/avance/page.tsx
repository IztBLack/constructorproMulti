import { notFound } from 'next/navigation';
import { getObra } from '@/lib/data/obras';
import { createClient } from '@/lib/supabase/server';
import { getEmpresaUsuario } from '@/lib/data/empresa';
import { listCapturasAvance, listConceptosObra } from '@/lib/data/estimaciones';
import { avanceFisico, ejecutadoPorConcepto } from '@/lib/estimaciones/avance';
import { hoyMxMs, msAFechaInput } from '@/lib/data/tz';
import ObraTabs from '../_obra-tabs';
import { AvanceObra } from './avance-obra';
import { capturaEnObra } from '@/lib/auth/roles';

export const dynamic = 'force-dynamic';

/**
 * AVANCE de la obra (RF3.1): lo que se hizo, partida por partida, capturado en
 * campo. Es la base de las estimaciones (se cobra lo hecho), de la utilidad
 * (proyección a término) y del programa (real vs programado).
 *
 * Capturan admin y supervisor; el contador solo mira. La barrera real es la RLS
 * de 0039.
 */
export default async function AvancePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  const [{ data: obra, error: obraError }, conceptos, capturas, yo] = await Promise.all([
    getObra(id),
    listConceptosObra(id),
    listCapturasAvance(id),
    getEmpresaUsuario().catch(() => null),
  ]);

  if (obraError) {
    return (
      <p className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
        No se pudo cargar la obra: {obraError}
      </p>
    );
  }
  if (!obra) notFound();

  const error = conceptos.error ?? capturas.error;
  const a = avanceFisico(conceptos.data, ejecutadoPorConcepto(capturas.data));
  const rol = yo?.rol ?? '';

  return (
    <div className="space-y-6">
      <ObraTabs obraId={id} />

      <div data-guia="obra-seccion">
        <h1 className="text-xl font-semibold text-neutral-900">Avance de {obra.nombre}</h1>
        <p className="mt-1 max-w-2xl text-sm text-neutral-600">
          Anota lo que se hizo en cada partida del presupuesto. Con esto sale el avance de la obra y
          lo que se le puede cobrar al cliente en la siguiente estimación.
        </p>
      </div>

      {error ? (
        <p className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
          No se pudo cargar el avance: {error}
        </p>
      ) : (
        <AvanceObra
          obraId={id}
          conceptos={conceptos.data}
          capturas={capturas.data.slice(0, 60)}
          pctObra={a.pct}
          porConcepto={Object.fromEntries(a.porConcepto)}
          puedeCapturar={capturaEnObra(rol)}
          esAdmin={rol === 'admin'}
          miId={await usuarioActual()}
          hoy={msAFechaInput(hoyMxMs())}
        />
      )}
    </div>
  );
}

async function usuarioActual(): Promise<string | null> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return user?.id ?? null;
}
