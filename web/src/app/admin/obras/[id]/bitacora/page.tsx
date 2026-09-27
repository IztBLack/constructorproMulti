import { notFound } from 'next/navigation';
import { EmptyState, LinkButton } from '@/components/ui';
import { getObra } from '@/lib/data/obras';
import { getEmpresaUsuario } from '@/lib/data/empresa';
import { listBitacoraObra, personalDelDia } from '@/lib/data/bitacora';
import { hoyMxMs, msAFechaInput } from '@/lib/data/tz';
import { periodoBitacora, relojPeticion } from '@/lib/bitacora/periodo';
import { createClient } from '@/lib/supabase/server';
import ObraTabs from '../_obra-tabs';
import { NuevaEntrada } from './nueva-entrada';
import { TimelineBitacora } from './timeline-bitacora';

export const dynamic = 'force-dynamic';

/**
 * Bitácora de la obra (0041): lo que pasó cada día, con fotos, clima y quién
 * estuvo. Escriben admin y supervisor; el contador solo mira. Las entradas se
 * cierran a las 24 h (lo decide la base) y después solo admiten aclaraciones.
 */
export default async function BitacoraObraPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ desde?: string | string[]; hasta?: string | string[] }>;
}) {
  const [{ id }, sp] = await Promise.all([params, searchParams]);
  const periodo = periodoBitacora(sp);
  const hoyMs = hoyMxMs();
  const hoy = msAFechaInput(hoyMs);
  const ahora = relojPeticion();

  const supabase = await createClient();
  const [{ data: obra, error: obraError }, { data: entradas, error }, empresa, { data: auth }] =
    await Promise.all([
      getObra(id),
      listBitacoraObra(id, { desde: periodo.desde, hasta: periodo.hasta }),
      getEmpresaUsuario().catch(() => null),
      supabase.auth.getUser(),
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
  const escribe = ['admin', 'supervisor'].includes(rol);
  // La sugerencia solo se pide a quien va a escribir: un error aquí no rompe la página.
  const sugeridosHoy = escribe ? (await personalDelDia(id, hoyMs)).nombres : [];
  const qs = new URLSearchParams({ desde: periodo.desdeInput, hasta: periodo.hastaInput }).toString();

  return (
    <div className="space-y-6">
      <ObraTabs obraId={id} />

      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-neutral-900">Bitácora de {obra.nombre}</h1>
          <p className="mt-1 max-w-2xl text-sm text-neutral-600">
            Lo que pasa cada día en la obra, con fotos. Cada entrada se cierra 24 horas después de
            registrarse: así sirve de evidencia. Lo marcado para el cliente aparece en su portal.
          </p>
        </div>
        {escribe && <NuevaEntrada obraId={id} hoy={hoy} sugeridosHoy={sugeridosHoy} />}
      </div>

      <form method="get" className="flex flex-wrap items-end gap-3 rounded-xl border border-neutral-200 bg-white p-3">
        <label className="space-y-1 text-sm">
          <span className="block font-medium text-neutral-700">Desde</span>
          <input
            type="date"
            name="desde"
            defaultValue={periodo.desdeInput}
            className="min-h-11 rounded-lg border border-neutral-300 bg-white px-3 text-sm text-neutral-900"
          />
        </label>
        <label className="space-y-1 text-sm">
          <span className="block font-medium text-neutral-700">Hasta</span>
          <input
            type="date"
            name="hasta"
            defaultValue={periodo.hastaInput}
            className="min-h-11 rounded-lg border border-neutral-300 bg-white px-3 text-sm text-neutral-900"
          />
        </label>
        <button
          type="submit"
          className="min-h-11 rounded-lg border border-neutral-300 px-4 text-sm font-medium text-neutral-900 hover:bg-neutral-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-neutral-900"
        >
          Ver periodo
        </button>
        <LinkButton href={`/admin/obras/${id}/bitacora/pdf?${qs}`} variant="secondary" className="ml-auto">
          PDF del periodo
        </LinkButton>
      </form>

      {error && (
        <p className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
          No se pudo cargar la bitácora: {error}
        </p>
      )}

      {!error && entradas.length === 0 && (
        <EmptyState
          title="Sin entradas en este periodo"
          description={
            escribe
              ? 'Anota lo que pasó hoy: avance, incidencias, instrucciones o visitas, con fotos.'
              : 'Todavía no hay nada anotado en estas fechas.'
          }
        />
      )}

      {!error && entradas.length > 0 && (
        <TimelineBitacora
          obraId={id}
          entradas={entradas}
          usuario={{ id: auth.user?.id ?? '', rol }}
          ahora={ahora}
          hoy={hoy}
        />
      )}
    </div>
  );
}
