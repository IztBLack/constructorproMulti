import { notFound } from 'next/navigation';
import Link from 'next/link';
import { Card, CardTitle } from '@/components/ui';
import { formatCurrency } from '@/lib/data/format';
import { getRentabilidadObra } from '@/lib/data/rentabilidad';
import { CATEGORIAS_COSTO, ETIQUETA_CATEGORIA, SIN_CLASIFICAR, type RenglonCosto } from '@/lib/rentabilidad/categorias';
import { SemaforoUtilidad, formatoMargen } from '@/components/rentabilidad/semaforo';
import { SinPermisoUtilidad } from '@/components/rentabilidad/sin-permiso-utilidad';
import { FormMargen } from '@/components/rentabilidad/form-margen';
import ObraTabs from '../_obra-tabs';

export const dynamic = 'force-dynamic';

const RENGLONES: RenglonCosto[] = [...CATEGORIAS_COSTO, SIN_CLASIFICAR];

/**
 * Utilidad de UNA obra (RF1.6, RF1.7). Solo admin y contador (D1): el candado
 * está en `getRentabilidadObra`, que ni calcula para otro rol.
 */
export default async function UtilidadObraPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const res = await getRentabilidadObra(id);

  if (!res.permitido) {
    return (
      <div className="space-y-6">
        <ObraTabs obraId={id} />
        <SinPermisoUtilidad />
      </div>
    );
  }
  if (res.error) {
    return (
      <div className="space-y-6">
        <ObraTabs obraId={id} />
        <p className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
          No se pudo calcular la utilidad: {res.error}
        </p>
      </div>
    );
  }
  if (!res.data) notFound();

  const { obra, r, margenObra, margenEmpresa, puedeFijarMargen } = res.data;
  const perdida = r.utilidad < 0;

  return (
    <div className="space-y-6">
      <ObraTabs obraId={id} />

      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-neutral-900">Utilidad de {obra.nombre}</h1>
          <p className="mt-1 text-sm text-neutral-600">
            Lo contratado contra lo que llevas gastado. Solo lo ven el administrador y el contador.
          </p>
        </div>
        <SemaforoUtilidad semaforo={r.semaforo} />
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <Dato
          etiqueta="Contratado"
          valor={formatCurrency(r.contratado)}
          detalle={`Presupuesto ${formatCurrency(r.presupuesto)} + extras aprobados ${formatCurrency(r.extras)}`}
        />
        <Dato etiqueta="Gastado hasta hoy" valor={formatCurrency(r.costoReal)} detalle={`Cobrado: ${formatCurrency(r.cobrado)}`} />
        <Dato
          etiqueta="Utilidad hasta hoy"
          valor={formatCurrency(r.utilidad)}
          detalle={`Margen: ${formatoMargen(r.margen)}`}
          tono={perdida ? 'rojo' : 'normal'}
        />
      </div>

      <Card>
        <CardTitle as="h2">Cómo va a terminar</CardTitle>
        {r.costoProyectado === null ? (
          <p className="mt-2 text-sm text-neutral-700">
            Todavía no hay con qué proyectar: captura el avance por partida (pestaña Avance), el de la obra (Detalle → Editar) o
            registra lo que te ha pagado el cliente. Al arrancar una obra el margen siempre sale alto
            porque aún no se gasta, por eso no se pinta de verde.
          </p>
        ) : (
          <div className="mt-3 space-y-2 text-sm">
            <p className="text-neutral-700">
              {r.fuenteAvance === 'partidas'
                ? `Con el avance medido por partida en la pestaña Avance (${r.avanceUsado} %).`
                : r.fuenteAvance === 'obra'
                  ? `Con el avance capturado de la obra (${r.avanceUsado} %).`
                  : `Sin avance capturado, se toma lo cobrado como avance (${r.avanceUsado} % de lo contratado).`}
            </p>
            <dl className="grid gap-3 sm:grid-cols-3">
              <DatoChico etiqueta="Costo al terminar" valor={formatCurrency(r.costoProyectado)} />
              <DatoChico etiqueta="Utilidad al terminar" valor={formatCurrency(r.utilidadProyectada ?? 0)} />
              <DatoChico
                etiqueta="Margen al terminar"
                valor={`${formatoMargen(r.margenProyectado)} (objetivo ${formatoMargen(r.margenObjetivo)})`}
              />
            </dl>
            {r.comprometidoNotas > 0 && (
              <p className="text-neutral-600">
                Incluye {formatCurrency(r.comprometidoNotas)} que todavía se les deben a socios según las
                notas abiertas.
              </p>
            )}
            {r.comprometidoCompras > 0 && (
              <p className="text-neutral-600">
                Incluye {formatCurrency(r.comprometidoCompras)} de material comprado que todavía se les debe
                a proveedores (órdenes de compra sin pagar).
              </p>
            )}
          </div>
        )}
      </Card>

      <Card padding="none">
        <div className="px-5 pb-3 pt-4">
          <CardTitle as="h2">En qué se ha ido el dinero</CardTitle>
          <p className="text-sm text-neutral-600">
            Salidas de caja por categoría, más la raya y los pagos a socios que todavía no se ven en caja.
          </p>
        </div>
        <div className="overflow-x-auto border-t border-neutral-200">
          <table className="w-full text-sm">
            <thead className="bg-neutral-50 text-left text-xs uppercase tracking-wide text-neutral-600">
              <tr>
                <th scope="col" className="px-4 py-2 font-medium">Categoría</th>
                <th scope="col" className="px-4 py-2 text-right font-medium">Importe</th>
                <th scope="col" className="px-4 py-2 text-right font-medium">Del costo</th>
              </tr>
            </thead>
            <tbody>
              {RENGLONES.filter((c) => r.costoPorCategoria[c] !== 0 || c !== SIN_CLASIFICAR).map((c) => (
                <tr key={c} className="border-t border-neutral-100">
                  <th scope="row" className="px-4 py-2 text-left font-normal text-neutral-900">
                    {ETIQUETA_CATEGORIA[c]}
                    {c === 'MANO_OBRA' && r.rayaSinCaja > 0 && (
                      <span className="block text-xs text-neutral-600">
                        Incluye {formatCurrency(r.rayaSinCaja)} de raya calculada que no se ha pasado a caja.
                      </span>
                    )}
                    {c === 'SUBCONTRATO' && r.sociosSinCaja > 0 && (
                      <span className="block text-xs text-neutral-600">
                        Incluye {formatCurrency(r.sociosSinCaja)} pagados según las notas que no se ven en caja.
                      </span>
                    )}
                  </th>
                  <td className="px-4 py-2 text-right tabular-nums">{formatCurrency(r.costoPorCategoria[c])}</td>
                  <td className="px-4 py-2 text-right tabular-nums text-neutral-700">
                    {r.costoReal > 0 ? `${Math.round((r.costoPorCategoria[c] / r.costoReal) * 100)} %` : '—'}
                  </td>
                </tr>
              ))}
              <tr className="border-t-2 border-neutral-300 bg-neutral-50">
                <th scope="row" className="px-4 py-2 text-left font-semibold text-neutral-900">Total</th>
                <td className="px-4 py-2 text-right font-bold tabular-nums">{formatCurrency(r.costoReal)}</td>
                <td />
              </tr>
            </tbody>
          </table>
        </div>
        {r.costoPorCategoria[SIN_CLASIFICAR] > 0 && (
          <p className="border-t border-neutral-200 px-5 py-3 text-sm text-amber-800">
            Hay {formatCurrency(r.costoPorCategoria[SIN_CLASIFICAR])} en salidas sin clasificar. Clasifícalas
            en los{' '}
            <Link href={`/admin/obras/${id}`} className="font-medium underline">
              movimientos de la obra
            </Link>{' '}
            para saber en qué se va el dinero.
          </p>
        )}
      </Card>

      <Card>
        <CardTitle as="h2">Margen objetivo</CardTitle>
        <p className="mt-1 text-sm text-neutral-600">
          {margenObra === null
            ? `Esta obra usa el de la empresa: ${formatoMargen(margenEmpresa)}.`
            : `Esta obra tiene su propio objetivo: ${formatoMargen(margenObra)}.`}
        </p>
        {puedeFijarMargen && (
          <div className="mt-3 max-w-sm">
            <FormMargen obraId={id} actual={margenObra} margenEmpresa={margenEmpresa} />
          </div>
        )}
      </Card>

      <p className="text-xs text-neutral-600">
        Cómo se calcula: la raya pasada a caja (categoría NOMINA) y la calculada por asistencia no se
        suman dos veces; tampoco lo pagado a socios en notas y las salidas de subcontrato. Montos sin IVA.
      </p>
    </div>
  );
}

function Dato({
  etiqueta,
  valor,
  detalle,
  tono = 'normal',
}: {
  etiqueta: string;
  valor: string;
  detalle?: string;
  tono?: 'normal' | 'rojo';
}) {
  return (
    <div className="rounded-xl border border-neutral-200 bg-white px-4 py-3">
      <p className="text-xs font-medium text-neutral-600">{etiqueta}</p>
      <p className={`mt-1 text-2xl font-semibold tabular-nums ${tono === 'rojo' ? 'text-red-700' : 'text-neutral-900'}`}>
        {valor}
      </p>
      {detalle && <p className="mt-1 text-xs text-neutral-600">{detalle}</p>}
    </div>
  );
}

function DatoChico({ etiqueta, valor }: { etiqueta: string; valor: string }) {
  return (
    <div>
      <dt className="text-xs font-medium text-neutral-600">{etiqueta}</dt>
      <dd className="font-semibold tabular-nums text-neutral-900">{valor}</dd>
    </div>
  );
}
