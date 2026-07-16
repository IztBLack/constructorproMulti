import Link from 'next/link';
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import {
  Badge,
  Card,
  CardTitle,
  EmptyState,
  LinkButton,
  PageHeader,
  TableContainer,
  TBody,
  Td,
  Th,
  THead,
  Tr,
} from '@/components/ui';
import { formatCurrency } from '@/lib/data/format';
import { nombreUsuario } from '@/lib/data/usuario';
import {
  calcularPipeline,
  distribucionGasto,
  listMovimientosEmpresaRango,
  listObrasConSaldo,
  navegarMes,
  nombreMes,
  periodoAnual,
  periodoMensual,
  resumenFlujo,
} from '@/lib/data/dashboard';

export const dynamic = 'force-dynamic';

function BarraGasto({
  label,
  valor,
  total,
  colorClass,
}: {
  label: string;
  valor: number;
  total: number;
  colorClass: string;
}) {
  const frac = total > 0 ? (valor / total) * 100 : 0;
  const pct = total > 0 ? Math.round((valor / total) * 100) : 0;
  return (
    <div className="flex items-center gap-3 py-1">
      <span className="w-20 shrink-0 text-xs text-neutral-600">{label}</span>
      <div className="h-2.5 flex-1 overflow-hidden rounded-full bg-neutral-100">
        <div className={`h-full rounded-full ${colorClass}`} style={{ width: `${frac}%` }} />
      </div>
      <span className="w-12 shrink-0 text-right text-xs tabular-nums text-neutral-500">{pct}%</span>
      <span className="w-28 shrink-0 text-right text-xs tabular-nums font-medium text-neutral-700">
        {formatCurrency(valor)}
      </span>
    </div>
  );
}

/** Tesela de KPI compacta para la fila superior. */
function StatTile({
  label,
  valor,
  href,
  tone = 'neutral',
  moneda = false,
  error,
}: {
  label: string;
  valor: number;
  href: string;
  tone?: 'neutral' | 'teal';
  moneda?: boolean;
  error?: boolean;
}) {
  const valorClass = tone === 'teal' ? 'text-teal-700' : 'text-neutral-900';
  return (
    <Link href={href} className="block">
      <div className="h-full rounded-xl border border-neutral-200 bg-white px-4 py-3 transition hover:border-neutral-400">
        <div className="text-xs font-medium text-neutral-500">{label}</div>
        <div className={`mt-1.5 text-2xl font-semibold tabular-nums ${valorClass}`}>
          {error ? '—' : moneda ? formatCurrency(valor) : valor}
        </div>
      </div>
    </Link>
  );
}

export default async function AdminPage({
  searchParams,
}: {
  searchParams: Promise<{ anio?: string; mes?: string; vista?: string }>;
}) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const { anio, mes, vista } = await searchParams;
  const hoy = new Date();
  const anioActual = anio ? Number(anio) : hoy.getFullYear();
  const mesActual = mes ? Number(mes) : hoy.getMonth() + 1;
  const esAnual = vista === 'anio';

  let periodo: { inicioMs: number; finMs: number };
  let periodoLabel: string;
  let hrefAnterior: string;
  let hrefSiguiente: string;

  if (esAnual) {
    periodo = periodoAnual(anioActual);
    periodoLabel = `${anioActual}`;
    hrefAnterior = `/admin?vista=anio&anio=${anioActual - 1}`;
    hrefSiguiente = `/admin?vista=anio&anio=${anioActual + 1}`;
  } else {
    periodo = periodoMensual(anioActual, mesActual);
    periodoLabel = `${nombreMes(mesActual)} ${anioActual}`;
    const anterior = navegarMes(anioActual, mesActual, -1);
    const siguiente = navegarMes(anioActual, mesActual, 1);
    hrefAnterior = `/admin?vista=mes&anio=${anterior.anio}&mes=${anterior.mes}`;
    hrefSiguiente = `/admin?vista=mes&anio=${siguiente.anio}&mes=${siguiente.mes}`;
  }

  // Nombre de la empresa del usuario (para saludo/branding dinámico).
  const { data: membership } = await supabase
    .from('usuarios_empresa')
    .select('empresa_id')
    .eq('user_id', user.id)
    .limit(1)
    .maybeSingle();
  let nombreEmpresa = 'tu empresa';
  if (membership?.empresa_id) {
    const { data: emp } = await supabase
      .from('empresas')
      .select('nombre')
      .eq('id', membership.empresa_id as string)
      .maybeSingle();
    if (emp?.nombre) nombreEmpresa = emp.nombre as string;
  }

  const [
    obrasCount,
    cotizacionesCount,
    colaboradoresCount,
    pipelineResult,
    movimientosPeriodoResult,
    obrasConSaldoResult,
  ] = await Promise.all([
    supabase.from('obras').select('id', { count: 'exact', head: true }).is('deleted_at', null),
    supabase.from('cotizaciones').select('id', { count: 'exact', head: true }).is('deleted_at', null),
    supabase.from('colaboradores').select('id', { count: 'exact', head: true }).is('deleted_at', null),
    calcularPipeline(),
    listMovimientosEmpresaRango(periodo.inicioMs, periodo.finMs),
    listObrasConSaldo(),
  ]);

  const flujo = resumenFlujo(movimientosPeriodoResult.data);
  const gasto = distribucionGasto(movimientosPeriodoResult.data);

  const obrasCnt = obrasCount.count ?? 0;
  const colaboradoresCnt = colaboradoresCount.count ?? 0;
  const mostrarPrimerosPasos = obrasCnt === 0 && colaboradoresCnt === 0;

  return (
    <div className="space-y-8">
      <PageHeader
        title="Panel de oficina"
        eyebrow={nombreUsuario(user)}
        actions={
          <>
            <LinkButton href="/admin/obras" variant="secondary" size="sm">
              + Nueva obra
            </LinkButton>
            <LinkButton href="/admin/cotizaciones/nueva" size="sm">
              + Nueva cotización
            </LinkButton>
          </>
        }
      />

      {/* Primeros pasos: solo si la empresa está vacía */}
      {mostrarPrimerosPasos && (
        <Card>
          <div className="mb-4">
            <h2 className="text-base font-semibold text-neutral-900">Bienvenido a {nombreEmpresa}</h2>
            <p className="mt-1 text-sm text-neutral-500">
              Completa estos tres pasos para comenzar a gestionar tus obras.
            </p>
          </div>
          <ol className="grid gap-3 sm:grid-cols-3">
            {[
              { paso: '1', titulo: 'Crea tus puestos', desc: 'Define los roles de trabajo de tu equipo.', href: '/admin/puestos' },
              { paso: '2', titulo: 'Da de alta tu equipo', desc: 'Agrega a los colaboradores.', href: '/admin/equipo' },
              { paso: '3', titulo: 'Crea tu primera obra', desc: 'Registra el proyecto y da seguimiento.', href: '/admin/obras' },
            ].map((p) => (
              <li key={p.paso} className="rounded-lg border border-neutral-200 p-3">
                <span className="text-xs font-semibold uppercase tracking-wide text-neutral-400">Paso {p.paso}</span>
                <p className="mt-0.5 text-sm font-medium text-neutral-900">{p.titulo}</p>
                <p className="text-xs text-neutral-500">{p.desc}</p>
                <LinkButton href={p.href} variant="secondary" size="sm" className="mt-2">
                  Empezar
                </LinkButton>
              </li>
            ))}
          </ol>
        </Card>
      )}

      {/* ── Fila de indicadores (KPIs + pipeline, compacto) ────────────────── */}
      <section className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatTile label="Obras" valor={obrasCnt} href="/admin/obras" error={!!obrasCount.error} />
        <StatTile
          label="Cotizaciones"
          valor={cotizacionesCount.count ?? 0}
          href="/admin/cotizaciones"
          error={!!cotizacionesCount.error}
        />
        <StatTile
          label="Colaboradores"
          valor={colaboradoresCnt}
          href="/admin/equipo"
          error={!!colaboradoresCount.error}
        />
        <StatTile
          label="Pipeline"
          valor={pipelineResult.value}
          href="/admin/cotizaciones"
          tone="teal"
          moneda
          error={!!pipelineResult.error}
        />
      </section>

      {/* ── Saldo por obra (operativo) ─────────────────────────────────────── */}
      <section className="space-y-3">
        <h2 className="text-sm font-medium text-neutral-700">Saldo por obra</h2>
        {obrasConSaldoResult.error ? (
          <p className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
            No se pudo cargar el saldo por obra: {obrasConSaldoResult.error}
          </p>
        ) : obrasConSaldoResult.data.length === 0 ? (
          <EmptyState
            title="Sin obras activas."
            description="Da de alta una obra para ver su saldo aquí."
            action={
              <LinkButton href="/admin/obras" variant="secondary" size="sm">
                Ir a obras
              </LinkButton>
            }
          />
        ) : (
          <TableContainer>
            <THead>
              <Th>Obra</Th>
              <Th>Cliente</Th>
              <Th className="text-right">Equipo activo</Th>
              <Th className="text-right">Saldo</Th>
            </THead>
            <TBody>
              {obrasConSaldoResult.data.map(({ obra, saldo, equipoActivo }) => (
                <Tr key={obra.id}>
                  <Td className="font-medium text-neutral-900">
                    <Link href={`/admin/obras/${obra.id}`} className="hover:underline">
                      {obra.nombre}
                    </Link>
                  </Td>
                  <Td>
                    {obra.cliente || '—'}
                    {!obra.activa && (
                      <Badge tone="neutral" className="ml-2">
                        Inactiva
                      </Badge>
                    )}
                  </Td>
                  <Td className="text-right tabular-nums">{equipoActivo}</Td>
                  <Td className={`text-right tabular-nums font-semibold ${saldo >= 0 ? 'text-green-700' : 'text-red-600'}`}>
                    {formatCurrency(saldo)}
                  </Td>
                </Tr>
              ))}
            </TBody>
          </TableContainer>
        )}
      </section>

      {/* ── Finanzas del periodo: selector + flujo/gasto ───────────────────── */}
      <section className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-sm font-medium text-neutral-700">Finanzas · {periodoLabel}</h2>
          <div className="flex flex-wrap items-center gap-2">
            <div className="flex items-center gap-1 rounded-lg border border-neutral-200 p-0.5">
              <Link
                href={`/admin?vista=mes&anio=${anioActual}&mes=${mesActual}`}
                className={`rounded-md px-2.5 py-1 text-xs font-medium transition ${
                  !esAnual ? 'bg-neutral-900 text-white' : 'text-neutral-600 hover:bg-neutral-100'
                }`}
              >
                Mes
              </Link>
              <Link
                href={`/admin?vista=anio&anio=${anioActual}`}
                className={`rounded-md px-2.5 py-1 text-xs font-medium transition ${
                  esAnual ? 'bg-neutral-900 text-white' : 'text-neutral-600 hover:bg-neutral-100'
                }`}
              >
                Año
              </Link>
            </div>
            <LinkButton variant="secondary" size="sm" href={hrefAnterior}>
              ←
            </LinkButton>
            <LinkButton variant="secondary" size="sm" href={hrefSiguiente}>
              →
            </LinkButton>
          </div>
        </div>

        <div className="grid gap-3 lg:grid-cols-2">
          <Card>
            <CardTitle as="h3">Flujo de caja</CardTitle>
            {movimientosPeriodoResult.error ? (
              <p className="mt-2 text-sm text-red-600">No se pudo cargar: {movimientosPeriodoResult.error}</p>
            ) : (
              <div className="mt-3 grid grid-cols-3 gap-4 text-center">
                <div>
                  <p className="text-xs text-neutral-500">Ingresos</p>
                  <p className="text-lg font-semibold tabular-nums text-green-700">{formatCurrency(flujo.totalEntradas)}</p>
                </div>
                <div>
                  <p className="text-xs text-neutral-500">Egresos</p>
                  <p className="text-lg font-semibold tabular-nums text-red-600">{formatCurrency(flujo.totalSalidas)}</p>
                </div>
                <div>
                  <p className="text-xs text-neutral-500">Saldo</p>
                  <p className={`text-lg font-semibold tabular-nums ${flujo.saldo >= 0 ? 'text-green-700' : 'text-red-600'}`}>
                    {formatCurrency(flujo.saldo)}
                  </p>
                </div>
              </div>
            )}
          </Card>

          <Card>
            <CardTitle as="h3">Distribución del gasto</CardTitle>
            {movimientosPeriodoResult.error ? (
              <p className="mt-2 text-sm text-red-600">No se pudo cargar el gasto del periodo.</p>
            ) : gasto.total === 0 ? (
              <p className="mt-3 text-sm text-neutral-400">Sin salidas registradas en este periodo.</p>
            ) : (
              <div className="mt-3 space-y-1">
                <BarraGasto label="Nómina" valor={gasto.nomina} total={gasto.total} colorClass="bg-indigo-500" />
                <BarraGasto label="Material" valor={gasto.material} total={gasto.total} colorClass="bg-orange-500" />
                <BarraGasto label="Otros" valor={gasto.otros} total={gasto.total} colorClass="bg-neutral-400" />
              </div>
            )}
          </Card>
        </div>
      </section>
    </div>
  );
}
