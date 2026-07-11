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

/** Mapa: rol BD → etiqueta en español para mostrar al usuario. */
const ROL_LABEL: Record<string, string> = {
  admin: 'Administrador',
  owner: 'Propietario',
  member: 'Miembro',
  viewer: 'Lector',
};

function rolLabel(rol: string): string {
  return ROL_LABEL[rol] ?? rol;
}

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

  // Empresa(s) y rol del usuario (RLS sólo deja ver las suyas).
  const { data: memberships } = await supabase
    .from('usuarios_empresa')
    .select('empresa_id, rol');

  // Resolver nombres de empresa para no mostrar UUIDs crudos.
  const empresaNames: Record<string, string> = {};
  if (memberships && memberships.length > 0) {
    const empresaIds = memberships.map((m) => m.empresa_id as string);
    const { data: empresas } = await supabase
      .from('empresas')
      .select('id, nombre')
      .in('id', empresaIds);
    if (empresas) {
      for (const e of empresas) {
        empresaNames[e.id as string] = e.nombre as string;
      }
    }
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

  const cards = [
    { label: 'Obras', count: obrasCount.count ?? 0, href: '/admin/obras', error: obrasCount.error },
    {
      label: 'Cotizaciones',
      count: cotizacionesCount.count ?? 0,
      href: '/admin/cotizaciones',
      error: cotizacionesCount.error,
    },
    {
      label: 'Colaboradores',
      count: colaboradoresCount.count ?? 0,
      href: '/admin/equipo',
      error: colaboradoresCount.error,
    },
  ];

  const flujo = resumenFlujo(movimientosPeriodoResult.data);
  const gasto = distribucionGasto(movimientosPeriodoResult.data);

  const obrasCnt = obrasCount.count ?? 0;
  const colaboradoresCnt = colaboradoresCount.count ?? 0;
  const mostrarPrimerosPasos = obrasCnt === 0 && colaboradoresCnt === 0;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Panel de oficina"
        eyebrow={user.email}
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
            <h2 className="text-base font-semibold text-neutral-900">Bienvenido a ConstructorPro</h2>
            <p className="mt-1 text-sm text-neutral-500">
              Completa estos tres pasos para comenzar a gestionar tus obras.
            </p>
          </div>
          <ol className="space-y-3">
            <li className="flex items-center justify-between gap-4 rounded-lg border border-neutral-200 p-3">
              <div>
                <span className="text-xs font-semibold uppercase tracking-wide text-neutral-400">Paso 1</span>
                <p className="text-sm font-medium text-neutral-900">Crea tus puestos</p>
                <p className="text-xs text-neutral-500">Define los roles de trabajo que usará tu equipo.</p>
              </div>
              <LinkButton href="/admin/puestos" variant="secondary" size="sm">
                Ir a puestos
              </LinkButton>
            </li>
            <li className="flex items-center justify-between gap-4 rounded-lg border border-neutral-200 p-3">
              <div>
                <span className="text-xs font-semibold uppercase tracking-wide text-neutral-400">Paso 2</span>
                <p className="text-sm font-medium text-neutral-900">Da de alta tu equipo</p>
                <p className="text-xs text-neutral-500">Agrega a los colaboradores que trabajarán contigo.</p>
              </div>
              <LinkButton href="/admin/equipo" variant="secondary" size="sm">
                Ir a equipo
              </LinkButton>
            </li>
            <li className="flex items-center justify-between gap-4 rounded-lg border border-neutral-200 p-3">
              <div>
                <span className="text-xs font-semibold uppercase tracking-wide text-neutral-400">Paso 3</span>
                <p className="text-sm font-medium text-neutral-900">Crea tu primera obra</p>
                <p className="text-xs text-neutral-500">Registra el proyecto y empieza a hacer seguimiento.</p>
              </div>
              <LinkButton href="/admin/obras" variant="secondary" size="sm">
                Ir a obras
              </LinkButton>
            </li>
          </ol>
        </Card>
      )}

      {/* ── Primer pliegue: KPIs + saldo por obra ────────────────────────── */}
      <section className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        {cards.map((c) => (
          <Link key={c.label} href={c.href} className="block">
            <Card className="cursor-pointer transition hover:border-neutral-400">
              <div className="text-sm font-medium text-neutral-500">{c.label}</div>
              <div className="mt-2 text-3xl font-semibold tabular-nums text-neutral-900">
                {c.error ? '—' : c.count}
              </div>
              {c.error && <p className="mt-1 text-xs text-red-600">No se pudo consultar.</p>}
            </Card>
          </Link>
        ))}
      </section>

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

      {/* ── Finanzas del periodo: selector + flujo/gasto/pipeline en bento ── */}
      <section className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <h2 className="text-sm font-medium text-neutral-700">Finanzas · {periodoLabel}</h2>
            <p className="text-xs text-neutral-400">Flujo de caja, distribución del gasto y pipeline.</p>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <div className="flex items-center gap-2">
              <Link
                href={`/admin?vista=mes&anio=${anioActual}&mes=${mesActual}`}
                className={`rounded-lg px-3 py-1.5 text-xs font-medium transition ${
                  !esAnual ? 'bg-neutral-900 text-white' : 'border border-neutral-300 text-neutral-700 hover:bg-neutral-100'
                }`}
              >
                Mes
              </Link>
              <Link
                href={`/admin?vista=anio&anio=${anioActual}`}
                className={`rounded-lg px-3 py-1.5 text-xs font-medium transition ${
                  esAnual ? 'bg-neutral-900 text-white' : 'border border-neutral-300 text-neutral-700 hover:bg-neutral-100'
                }`}
              >
                Año
              </Link>
            </div>
            <div className="flex items-center gap-2">
              <LinkButton variant="secondary" size="sm" href={hrefAnterior}>
                ← Anterior
              </LinkButton>
              <span className="text-sm font-medium text-neutral-900">{periodoLabel}</span>
              <LinkButton variant="secondary" size="sm" href={hrefSiguiente}>
                Siguiente →
              </LinkButton>
            </div>
          </div>
        </div>

        <div className="grid gap-4 lg:grid-cols-2">
          <Card>
            <CardTitle as="h3">Flujo de caja</CardTitle>
            {movimientosPeriodoResult.error ? (
              <p className="mt-2 text-sm text-red-600">No se pudo cargar: {movimientosPeriodoResult.error}</p>
            ) : (
              <div className="mt-3 grid grid-cols-3 gap-4 text-center">
                <div>
                  <p className="text-xs text-neutral-500">Ingresos</p>
                  <p className="text-xl font-semibold tabular-nums text-green-700">{formatCurrency(flujo.totalEntradas)}</p>
                </div>
                <div>
                  <p className="text-xs text-neutral-500">Egresos</p>
                  <p className="text-xl font-semibold tabular-nums text-red-600">{formatCurrency(flujo.totalSalidas)}</p>
                </div>
                <div>
                  <p className="text-xs text-neutral-500">Saldo</p>
                  <p className={`text-xl font-semibold tabular-nums ${flujo.saldo >= 0 ? 'text-green-700' : 'text-red-600'}`}>
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

          <Card className="lg:col-span-2">
            <div className="flex items-center justify-between gap-4">
              <div>
                <CardTitle as="h3">Pipeline</CardTitle>
                <p className="text-xs text-neutral-400">Cotizaciones pendientes (borrador / enviada)</p>
              </div>
              <p className="text-3xl font-semibold tabular-nums text-teal-700">
                {pipelineResult.error ? '—' : formatCurrency(pipelineResult.value)}
              </p>
            </div>
            {pipelineResult.error && (
              <p className="mt-2 text-xs text-red-600">No se pudo calcular: {pipelineResult.error}</p>
            )}
          </Card>
        </div>
      </section>

      {/* ── Pie discreto: empresa(s) y rol del usuario ──────────────────── */}
      <Card padding="sm" className="bg-neutral-50/60">
        <h2 className="mb-2 text-xs font-medium uppercase tracking-wide text-neutral-400">Tu acceso</h2>
        {memberships && memberships.length > 0 ? (
          <ul className="space-y-1 text-sm">
            {memberships.map((m) => {
              const nombreEmpresa = empresaNames[m.empresa_id as string] ?? 'Empresa';
              return (
                <li key={m.empresa_id as string} className="flex items-center gap-2">
                  <span className="font-medium text-neutral-900">{nombreEmpresa}</span>
                  <span className="rounded bg-neutral-100 px-2 py-0.5 text-xs text-neutral-600">
                    {rolLabel(m.rol as string)}
                  </span>
                </li>
              );
            })}
          </ul>
        ) : (
          <div className="flex items-center gap-3">
            <p className="text-sm text-neutral-500">Aún no tienes una empresa configurada.</p>
            <LinkButton href="/onboarding" variant="secondary" size="sm">
              Crear empresa
            </LinkButton>
          </div>
        )}
      </Card>
    </div>
  );
}
