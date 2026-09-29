import Link from 'next/link';
import { EmptyState, PageHeader } from '@/components/ui';
import { formatCurrency } from '@/lib/data/format';
import { getComparativoRentabilidad } from '@/lib/data/rentabilidad';
import { ordenarComparativo, totalesComparativo } from '@/lib/rentabilidad/calculo';
import { SemaforoUtilidad, formatoMargen } from '@/components/rentabilidad/semaforo';
import { SinPermisoUtilidad } from '@/components/rentabilidad/sin-permiso-utilidad';

export const dynamic = 'force-dynamic';

export const metadata = { title: 'Utilidad por obra' };

/**
 * Comparativo de utilidad entre obras (RF1.8). Arriba lo que necesita
 * atención (rojo, luego amarillo). Solo admin y contador (D1): el candado está
 * en `getComparativoRentabilidad`.
 */
export default async function RentabilidadPage({
  searchParams,
}: {
  searchParams: Promise<{ todas?: string }>;
}) {
  const { todas } = await searchParams;
  const verTodas = todas === '1';
  const res = await getComparativoRentabilidad();

  if (!res.permitido) return <SinPermisoUtilidad />;
  if (res.error || !res.data) {
    return (
      <p className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
        No se pudo calcular la utilidad: {res.error ?? 'sin datos'}
      </p>
    );
  }

  const filas = ordenarComparativo(res.data.filas.filter((f) => verTodas || f.activa));
  const totales = totalesComparativo(filas);
  // «Utilidad hoy» (contratado − gastado) confundía: en una obra a medias es lo
  // que falta por gastar, no la ganancia (el local al 51 % salía con +$1 M y
  // proyectaba pérdida). La tabla compara lo que cada obra dejará al terminar.
  const conProyeccion = filas.filter((f) => f.r.utilidadProyectada !== null);
  const utilidadAlTerminar = conProyeccion.reduce((s, f) => s + (f.r.utilidadProyectada ?? 0), 0);
  const contratadoProyectado = conProyeccion.reduce((s, f) => s + f.r.contratado, 0);
  const margenAlTerminar =
    contratadoProyectado > 0 ? Math.round((utilidadAlTerminar / contratadoProyectado) * 1000) / 10 : null;
  const inactivas = res.data.filas.filter((f) => !f.activa).length;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Utilidad por obra"
        description={`Lo contratado contra lo gastado en cada obra. Objetivo de la empresa: ${formatoMargen(res.data.margenEmpresa)}.`}
      />

      {inactivas > 0 && (
        <p className="text-sm text-neutral-700">
          {verTodas ? (
            <Link href="/admin/rentabilidad" className="font-medium underline">
              Ver solo las obras activas
            </Link>
          ) : (
            <Link href="/admin/rentabilidad?todas=1" className="font-medium underline">
              Ver también las {inactivas} obras terminadas o pausadas
            </Link>
          )}
        </p>
      )}

      {filas.length === 0 ? (
        <EmptyState title="No hay obras para comparar" description="Da de alta una obra con su presupuesto para ver su utilidad." />
      ) : (
        <div className="overflow-x-auto rounded-xl border border-neutral-200 bg-white">
          <table className="w-full min-w-[720px] text-sm">
            <caption className="sr-only">Utilidad por obra, primero las que necesitan atención</caption>
            <thead className="bg-neutral-50 text-left text-xs uppercase tracking-wide text-neutral-600">
              <tr>
                <th scope="col" className="px-4 py-2 font-medium">Obra</th>
                <th scope="col" className="px-4 py-2 text-right font-medium">Contratado</th>
                <th scope="col" className="px-4 py-2 text-right font-medium">Gastado</th>
                <th scope="col" className="px-4 py-2 text-right font-medium">Utilidad al terminar</th>
                <th scope="col" className="px-4 py-2 text-right font-medium">Margen al terminar</th>
                <th scope="col" className="px-4 py-2 font-medium">Cómo va</th>
              </tr>
            </thead>
            <tbody>
              {filas.map((f) => (
                <tr key={f.obraId} className="border-t border-neutral-100">
                  <th scope="row" className="px-4 py-2 text-left font-medium">
                    <Link href={`/admin/obras/${f.obraId}/utilidad`} className="text-neutral-900 hover:underline">
                      {f.nombre}
                    </Link>
                    {!f.activa && <span className="ml-2 text-xs font-normal text-neutral-600">(inactiva)</span>}
                    {f.r.extras > 0 && (
                      <span className="block text-xs font-normal text-neutral-600">
                        Incluye {formatCurrency(f.r.extras)} de extras
                      </span>
                    )}
                  </th>
                  <td className="px-4 py-2 text-right tabular-nums">{formatCurrency(f.r.contratado)}</td>
                  <td className="px-4 py-2 text-right tabular-nums">{formatCurrency(f.r.costoReal)}</td>
                  <td
                    className={`px-4 py-2 text-right tabular-nums ${(f.r.utilidadProyectada ?? 0) < 0 ? 'text-red-700' : ''}`}
                  >
                    {f.r.utilidadProyectada === null ? '—' : formatCurrency(f.r.utilidadProyectada)}
                  </td>
                  <td className="px-4 py-2 text-right tabular-nums">
                    {formatoMargen(f.r.margenProyectado)}
                    <span className="block text-xs text-neutral-600">obj. {formatoMargen(f.r.margenObjetivo)}</span>
                  </td>
                  <td className="px-4 py-2">
                    <SemaforoUtilidad semaforo={f.r.semaforo} />
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="border-t-2 border-neutral-300 bg-neutral-50">
                <th scope="row" className="px-4 py-2 text-left font-semibold">Todas</th>
                <td className="px-4 py-2 text-right font-semibold tabular-nums">{formatCurrency(totales.contratado)}</td>
                <td className="px-4 py-2 text-right font-semibold tabular-nums">{formatCurrency(totales.costoReal)}</td>
                <td className="px-4 py-2 text-right font-semibold tabular-nums">
                  {conProyeccion.length === 0 ? '—' : formatCurrency(utilidadAlTerminar)}
                </td>
                <td className="px-4 py-2 text-right text-xs text-neutral-600">{formatoMargen(margenAlTerminar)}</td>
                <td />
              </tr>
            </tfoot>
          </table>
        </div>
      )}

      <p className="text-xs text-neutral-600">
        La utilidad y el margen al terminar se proyectan con el avance medido por partida, el
        avance capturado de cada obra o, si no hay, con lo cobrado. «—» = todavía no hay con qué
        proyectar. Montos sin IVA.
      </p>
    </div>
  );
}
