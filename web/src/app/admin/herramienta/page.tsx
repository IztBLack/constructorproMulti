import Link from 'next/link';
import { Badge, EmptyState, PageHeader } from '@/components/ui';
import { getEmpresaUsuario } from '@/lib/data/empresa';
import { listObrasDisponibles } from '@/lib/data/equipo';
import { listHerramienta, listResponsables } from '@/lib/data/herramienta';
import { formatCurrency } from '@/lib/data/format';
import { hoyMxMs, msAFechaInput } from '@/lib/data/tz';
import {
  ETIQUETA_ESTADO_HERRAMIENTA,
  ETIQUETA_TIPO_HERRAMIENTA,
  estadoPrestamo,
  pesoSemaforo,
} from '@/lib/herramienta/herramienta';
import { Devolver, FormHerramienta, Prestar } from './formularios';
import { SemaforoPrestamo } from './semaforo';

export const dynamic = 'force-dynamic';

export const metadata = { title: 'Herramienta y maquinaria' };

const TONO_ESTADO = { BUENO: 'green', REPARACION: 'amber', BAJA: 'neutral' } as const;

/**
 * Inventario de herramienta y maquinaria (0043, RF7.3): qué hay, dónde está
 * cada cosa y quién la trae. Lo vencido sale arriba. Admin y supervisor
 * prestan y reciben; el contador solo consulta (ve costos).
 */
export default async function HerramientaPage({
  searchParams,
}: {
  searchParams: Promise<{ obra?: string; ver?: string }>;
}) {
  const sp = await searchParams;
  const hoy = hoyMxMs();
  const hoyInput = msAFechaInput(hoy);
  const [{ data, error }, empresa, obras, responsables] = await Promise.all([
    listHerramienta(),
    getEmpresaUsuario().catch(() => null),
    listObrasDisponibles(),
    listResponsables(),
  ]);
  const rol = empresa?.rol ?? '';
  const escribe = rol === 'admin' || rol === 'supervisor';

  if (!['admin', 'supervisor', 'contador'].includes(rol)) {
    return (
      <EmptyState
        title="Solo para la oficina"
        description="El inventario de herramienta lo ven el administrador, los supervisores y el contador."
      />
    );
  }

  const conEstado = data.map((h) => ({
    h,
    prestamo: h.prestamo ? estadoPrestamo(h.prestamo, hoy) : null,
  }));
  const filtroObra = sp.obra && obras.data.some((o) => o.id === sp.obra) ? sp.obra : '';
  const verBajas = sp.ver === 'bajas';
  const visibles = conEstado
    .filter(({ h }) => (verBajas ? true : h.estado !== 'BAJA'))
    .filter(({ h }) => !filtroObra || h.prestamo?.obra_id === filtroObra)
    .sort((a, b) => {
      const pa = a.prestamo ? pesoSemaforo(a.prestamo.semaforo) : 9;
      const pb = b.prestamo ? pesoSemaforo(b.prestamo.semaforo) : 9;
      return pa - pb || a.h.nombre.localeCompare(b.h.nombre, 'es');
    });

  const fuera = conEstado.filter((x) => x.prestamo).length;
  const vencidas = conEstado.filter((x) => x.prestamo?.semaforo === 'ROJO').length;
  const reparacion = data.filter((h) => h.estado === 'REPARACION').length;
  const valor = data.filter((h) => h.estado !== 'BAJA').reduce((s, h) => s + (h.costo ?? 0), 0);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Herramienta y maquinaria"
        description="Qué tienes, en qué obra está y quién la trae."
        actions={escribe ? <FormHerramienta inicial={null} textoBoton="Nueva herramienta" /> : undefined}
      />

      {error && (
        <p className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
          No se pudo cargar el inventario: {error}
        </p>
      )}

      <section aria-label="Resumen" className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {[
          ['Prestadas', String(fuera)],
          ['Vencidas', String(vencidas)],
          ['En reparación', String(reparacion)],
          ['Valor del inventario', formatCurrency(valor)],
        ].map(([t, v]) => (
          <div key={t} className="rounded-xl border border-neutral-200 bg-white px-4 py-3">
            <p className="text-xs font-medium text-neutral-500">{t}</p>
            <p className="mt-1 text-xl font-semibold tabular-nums text-neutral-900">{v}</p>
          </div>
        ))}
      </section>

      <form method="get" className="flex flex-wrap items-end gap-3 rounded-xl border border-neutral-200 bg-white p-3">
        <label className="text-sm">
          <span className="block font-medium text-neutral-700">¿Qué hay en la obra…?</span>
          <select
            name="obra"
            defaultValue={filtroObra}
            className="mt-1 min-h-11 rounded-lg border border-neutral-300 bg-white px-3 text-sm"
          >
            <option value="">Todas</option>
            {obras.data.map((o) => (
              <option key={o.id} value={o.id}>
                {o.nombre}
              </option>
            ))}
          </select>
        </label>
        <label className="inline-flex min-h-11 items-center gap-2 text-sm text-neutral-700">
          <input type="checkbox" name="ver" value="bajas" defaultChecked={verBajas} className="h-5 w-5" />
          Incluir las dadas de baja
        </label>
        <button
          type="submit"
          className="min-h-11 rounded-lg border border-neutral-300 px-4 text-sm font-medium text-neutral-900 hover:bg-neutral-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-neutral-900"
        >
          Ver
        </button>
      </form>

      {!error && visibles.length === 0 && (
        <EmptyState
          title={data.length === 0 ? 'Todavía no hay herramienta registrada' : 'Nada con ese filtro'}
          description={
            data.length === 0
              ? 'Da de alta tu revolvedora, andamios, rotomartillos… con su número de inventario para saber siempre dónde están.'
              : 'Prueba con otra obra o quita el filtro.'
          }
        />
      )}

      {visibles.length > 0 && (
        <ul className="divide-y divide-neutral-100 rounded-xl border border-neutral-200 bg-white">
          {visibles.map(({ h, prestamo }) => (
            <li key={h.id} className="flex flex-wrap items-start justify-between gap-3 p-4">
              <div className="min-w-0 space-y-1">
                <div className="flex flex-wrap items-center gap-2">
                  <Link href={`/admin/herramienta/${h.id}`} className="font-medium text-neutral-900 underline-offset-2 hover:underline">
                    {h.nombre}
                  </Link>
                  {h.clave && <span className="text-xs text-neutral-500">#{h.clave}</span>}
                  <Badge tone={TONO_ESTADO[h.estado]}>{ETIQUETA_ESTADO_HERRAMIENTA[h.estado]}</Badge>
                </div>
                <p className="text-xs text-neutral-500">
                  {ETIQUETA_TIPO_HERRAMIENTA[h.tipo]}
                  {h.costo !== null ? ` · ${formatCurrency(h.costo)}` : ''}
                </p>
                <p className="text-sm text-neutral-800">
                  {h.prestamo
                    ? [h.prestamo.obra_nombre, h.prestamo.colaborador_nombre].filter(Boolean).join(' · ') ||
                      'Prestada'
                    : h.estado === 'BAJA'
                      ? 'Dada de baja'
                      : 'En bodega'}
                </p>
                {prestamo && <SemaforoPrestamo estado={prestamo} />}
              </div>
              {escribe && (
                <div className="flex flex-wrap gap-2">
                  {h.prestamo ? (
                    <Devolver herramienta={{ id: h.id, nombre: h.nombre }} prestamoId={h.prestamo.id} hoy={hoyInput} />
                  ) : (
                    h.estado !== 'BAJA' && (
                      <Prestar
                        herramienta={{ id: h.id, nombre: h.nombre }}
                        obras={obras.data}
                        responsables={responsables}
                        hoy={hoyInput}
                      />
                    )
                  )}
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
