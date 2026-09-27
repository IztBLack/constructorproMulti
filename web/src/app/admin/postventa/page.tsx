import Link from 'next/link';
import { Badge, EmptyState, PageHeader } from '@/components/ui';
import { getEmpresaUsuario } from '@/lib/data/empresa';
import { listObrasDisponibles } from '@/lib/data/equipo';
import { listGarantias, listReportes } from '@/lib/data/postventa';
import { formatDate } from '@/lib/data/format';
import { hoyMxMs, msAFechaInput } from '@/lib/data/tz';
import {
  ETIQUETA_ESTADO_REPORTE,
  TEXTO_GARANTIA,
  TONO_ESTADO_REPORTE,
  estadoGarantia,
  reporteAbierto,
} from '@/lib/postventa/garantia';
import { FormGarantiaObra, NuevoReporteOficina } from './formularios';
import { capturaEnObra } from '@/lib/auth/roles';

export const dynamic = 'force-dynamic';

export const metadata = { title: 'Garantías' };

const TONO_GARANTIA = { SIN_DATOS: 'neutral', VIGENTE: 'green', POR_VENCER: 'amber', VENCIDA: 'red' } as const;

/**
 * Garantías (0043, RF7.2): lo que reportan los clientes después de entregar y
 * el periodo de garantía de cada obra. Admin y supervisor dan seguimiento; el
 * contador consulta; el periodo lo pone el admin.
 */
export default async function PostventaPage({
  searchParams,
}: {
  searchParams: Promise<{ vista?: string; todos?: string }>;
}) {
  const sp = await searchParams;
  const vista = sp.vista === 'obras' ? 'obras' : 'reportes';
  const verTodos = sp.todos === '1';
  const hoy = hoyMxMs();
  const [reportes, garantias, obras, empresa] = await Promise.all([
    listReportes(),
    listGarantias(),
    listObrasDisponibles(),
    getEmpresaUsuario().catch(() => null),
  ]);
  const rol = empresa?.rol ?? '';
  if (!['admin', 'supervisor', 'contador', 'residente'].includes(rol)) {
    return (
      <EmptyState
        title="Solo para la oficina"
        description="Las garantías las ven el administrador, los supervisores y el contador."
      />
    );
  }
  const gestiona = capturaEnObra(rol);
  const abiertos = reportes.data.filter((r) => reporteAbierto(r.estado));
  const lista = verTodos ? reportes.data : abiertos;

  const pestana = (v: string, t: string) => (
    <Link
      href={v === 'reportes' ? '/admin/postventa' : '/admin/postventa?vista=obras'}
      aria-current={vista === v ? 'page' : undefined}
      className={`inline-flex min-h-11 items-center rounded-t-lg border-b-2 px-4 text-sm font-medium ${
        vista === v ? 'border-neutral-900 text-neutral-900' : 'border-transparent text-neutral-500 hover:text-neutral-900'
      }`}
    >
      {t}
    </Link>
  );

  return (
    <div className="space-y-6">
      <PageHeader
        title="Garantías"
        description="Lo que te reportan tus clientes después de entregar, y cuánto le queda a cada garantía."
        actions={gestiona ? <NuevoReporteOficina obras={obras.data} /> : undefined}
      />

      <nav aria-label="Secciones de garantías" className="flex gap-1 border-b border-neutral-200">
        {pestana('reportes', `Reportes (${abiertos.length} pendientes)`)}
        {pestana('obras', 'Garantía por obra')}
      </nav>

      {vista === 'reportes' && (
        <section className="space-y-3">
          {reportes.error && (
            <p className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
              No se pudieron cargar los reportes: {reportes.error}
            </p>
          )}
          <p className="text-sm">
            <Link href={verTodos ? '/admin/postventa' : '/admin/postventa?todos=1'} className="font-medium underline">
              {verTodos ? 'Ver solo los pendientes' : `Ver también los cerrados (${reportes.data.length - abiertos.length})`}
            </Link>
          </p>
          {lista.length === 0 ? (
            <EmptyState
              title={verTodos ? 'Sin reportes' : 'Nada pendiente'}
              description="Cuando un cliente reporte un problema desde su portal, aparece aquí."
            />
          ) : (
            <ul className="divide-y divide-neutral-100 rounded-xl border border-neutral-200 bg-white">
              {lista.map((r) => {
                const g = estadoGarantia(garantias.get(r.obra_id), r.reportado_en);
                return (
                  <li key={r.id}>
                    <Link
                      href={`/admin/postventa/${r.id}`}
                      className="block space-y-1 p-4 hover:bg-neutral-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-neutral-900"
                    >
                      <div className="flex flex-wrap items-center gap-2">
                        <Badge tone={TONO_ESTADO_REPORTE[r.estado]}>{ETIQUETA_ESTADO_REPORTE[r.estado]}</Badge>
                        <span className="text-sm font-medium text-neutral-900">{r.obra_nombre ?? 'Obra'}</span>
                        {r.cliente_nombre && <span className="text-sm text-neutral-600">· {r.cliente_nombre}</span>}
                        <span className="text-xs text-neutral-500">· {formatDate(r.reportado_en)}</span>
                        {g.estado === 'VENCIDA' && <Badge tone="red">Fuera de garantía al reportar</Badge>}
                      </div>
                      <p className="line-clamp-2 text-sm text-neutral-800">
                        {r.ubicacion ? `${r.ubicacion}: ` : ''}
                        {r.descripcion}
                      </p>
                      <p className="text-xs text-neutral-500">
                        {r.origen === 'CLIENTE' ? 'Lo reportó el cliente' : 'Lo registró la oficina'}
                        {r.fotos.length > 0 ? ` · ${r.fotos.length} foto${r.fotos.length === 1 ? '' : 's'}` : ''}
                        {r.programado_para ? ` · visita el ${formatDate(r.programado_para)}` : ''}
                      </p>
                    </Link>
                  </li>
                );
              })}
            </ul>
          )}
        </section>
      )}

      {vista === 'obras' && (
        <section className="space-y-3">
          <p className="max-w-2xl text-sm text-neutral-600">
            La garantía corre desde el día en que entregaste la obra, por los meses que diga tu contrato.
            Tu cliente ve en su portal hasta cuándo está cubierto.
            {rol !== 'admin' && ' Solo el administrador la cambia.'}
          </p>
          {obras.data.length === 0 ? (
            <EmptyState title="Sin obras" description="Da de alta una obra primero." />
          ) : (
            <ul className="space-y-3">
              {obras.data.map((o) => {
                const gar = garantias.get(o.id) ?? null;
                const est = estadoGarantia(gar, hoy);
                return (
                  <li key={o.id} className="space-y-2 rounded-xl border border-neutral-200 bg-white p-4">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-medium text-neutral-900">{o.nombre}</span>
                      <Badge tone={TONO_GARANTIA[est.estado]}>{TEXTO_GARANTIA[est.estado]}</Badge>
                      {est.vence !== null && (
                        <span className="text-xs text-neutral-600">
                          {est.estado === 'VENCIDA' ? 'Venció' : 'Vence'} el {formatDate(est.vence)}
                        </span>
                      )}
                    </div>
                    <FormGarantiaObra
                      obraId={o.id}
                      entrega={gar?.entrega_fecha != null ? msAFechaInput(gar.entrega_fecha) : ''}
                      meses={gar?.meses ?? 12}
                      notas={gar?.notas ?? ''}
                      esAdmin={rol === 'admin'}
                    />
                  </li>
                );
              })}
            </ul>
          )}
        </section>
      )}
    </div>
  );
}
