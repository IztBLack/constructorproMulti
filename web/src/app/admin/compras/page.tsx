import Link from 'next/link';
import {
  Badge,
  Card,
  CardHeader,
  CardTitle,
  EmptyState,
  LinkButton,
  PageHeader,
  RowLink,
  TableContainer,
  TBody,
  Td,
  Th,
  THead,
  Tr,
} from '@/components/ui';
import { formatCurrency, formatDate } from '@/lib/data/format';
import { getEmpresaUsuario } from '@/lib/data/empresa';
import { listObras } from '@/lib/data/obras';
import { hoyMxMs, medianocheMx, partesTz } from '@/lib/data/tz';
import {
  listOrdenadoDeRequisiciones,
  listOrdenes,
  listPagos,
  listProveedores,
  listRecepciones,
  listRequisiciones,
} from '@/lib/data/compras';
import {
  ETIQUETA_SITUACION,
  ordenadoPorRenglon,
  pendientePorComprar,
  saldosPorProveedor,
  totalesDe,
  type SituacionPago,
} from '@/lib/compras/calculo';
import { ETIQUETA_ESTADO_ORDEN, TONO_ESTADO_ORDEN, type Tono } from '@/lib/compras/tipos';
import { DecidirRequisiciones } from './decidir-requisiciones';
import { NuevaOrdenDirecta } from './nueva-orden-directa';
import { gestionaCompras, vePreciosDeCompras } from '@/lib/auth/roles';

export const dynamic = 'force-dynamic';

export const metadata = { title: 'Compras' };

const TONO_SITUACION: Record<SituacionPago, Tono> = {
  pagada: 'green',
  vencida: 'red',
  por_vencer: 'amber',
  al_corriente: 'neutral',
};

function diaMx(ms: number): number {
  const p = partesTz(ms);
  return medianocheMx(p.year, p.month, p.day);
}

/**
 * Mesa de compras (RF2.2–RF2.6): lo que hay que aprobar, lo que hay que
 * comprar, las órdenes abiertas y lo que se les debe a los proveedores.
 *
 * Cada rol ve lo suyo (RR2.1): el admin decide y compra; el supervisor ve cómo
 * va lo que pidió; el contador ve y paga lo que se debe. La RLS de 0038 es la
 * barrera; aquí solo se evita enseñar botones que fallarían.
 */
export default async function ComprasPage() {
  const rol = await getEmpresaUsuario()
    .then((e) => e.rol as string)
    .catch(() => '');
  // `esAdmin` = quien decide y compra: el admin o el rol compras (F6).
  const esAdmin = gestionaCompras(rol);
  const vePagos = rol === 'admin' || rol === 'contador';
  const precios = vePreciosDeCompras(rol);

  const [reqs, ordenesRes, provRes, obrasRes] = await Promise.all([
    listRequisiciones({ estados: ['PENDIENTE', 'APROBADA', 'PARCIAL'] }),
    listOrdenes(),
    listProveedores(),
    listObras(),
  ]);
  const error = reqs.error ?? ordenesRes.error ?? provRes.error;
  if (error) {
    return (
      <div className="space-y-6">
        <PageHeader title="Compras" />
        <p className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">{error}</p>
      </div>
    );
  }

  const obras = Object.fromEntries(obrasRes.data.map((o) => [o.id, o.nombre]));
  const proveedores = Object.fromEntries(provRes.data.map((p) => [p.id, p.nombre]));
  const porAprobar = reqs.data.filter((r) => r.estado === 'PENDIENTE');
  const aprobadas = reqs.data.filter((r) => r.estado === 'APROBADA' || r.estado === 'PARCIAL');

  const ordenado = ordenadoPorRenglon(
    await listOrdenadoDeRequisiciones(aprobadas.flatMap((r) => r.renglones.map((x) => x.id))),
  );
  const renglonesPorComprar = aprobadas.flatMap((r) =>
    r.renglones.filter((x) => pendientePorComprar(x.cantidad, ordenado.get(x.id) ?? 0) > 0),
  );

  const ordenes = ordenesRes.data;
  const abiertas = ordenes.filter((o) => ['BORRADOR', 'EMITIDA', 'PARCIAL'].includes(o.estado));
  const recientes = ordenes.filter((o) => ['RECIBIDA', 'CANCELADA'].includes(o.estado)).slice(0, 15);

  // Por pagar: solo quien ve pagos (admin, contador). El supervisor recibe [] por RLS.
  const emitidas = ordenes.filter((o) => ['EMITIDA', 'PARCIAL', 'RECIBIDA'].includes(o.estado));
  const [pagos, recepciones] = vePagos
    ? await Promise.all([listPagos(emitidas.map((o) => o.id)), listRecepciones(emitidas.map((o) => o.id))])
    : [[], []];
  const primera = new Map<string, number>();
  for (const r of recepciones) {
    const p = primera.get(r.orden_compra_id);
    if (p == null || r.fecha < p) primera.set(r.orden_compra_id, r.fecha);
  }
  const hoy = hoyMxMs();
  const saldos = vePagos ? saldosPorProveedor(emitidas, pagos, primera, hoy, diaMx) : [];
  const totalPorPagar = saldos.reduce((s, g) => s + g.saldo, 0);
  const totalVencido = saldos.reduce((s, g) => s + g.vencido, 0);

  return (
    <div className="space-y-8">
      <PageHeader
        title="Compras"
        description="Lo que piden en obra, lo que se compra, lo que llega y lo que se les debe a los proveedores."
        actions={
          <>
            <LinkButton href="/admin/compras/materiales" variant="secondary" size="sm">
              Materiales
            </LinkButton>
            <LinkButton href="/admin/compras/proveedores" variant="secondary" size="sm">
              Proveedores
            </LinkButton>
          </>
        }
      />

      {/* Resumen en números */}
      <dl data-guia="compras-resumen" className="grid gap-3 sm:grid-cols-4">
        <Numero etiqueta="Por aprobar" valor={String(porAprobar.length)} />
        <Numero etiqueta="Materiales por comprar" valor={String(renglonesPorComprar.length)} />
        <Numero etiqueta="Órdenes abiertas" valor={String(abiertas.length)} />
        {vePagos && (
          <Numero
            etiqueta={totalVencido > 0 ? `Por pagar (${formatCurrency(totalVencido)} vencido)` : 'Por pagar'}
            valor={formatCurrency(totalPorPagar)}
            alerta={totalVencido > 0}
          />
        )}
      </dl>

      <Card>
        <CardHeader>
          <div>
            <CardTitle as="h2">Requisiciones por aprobar</CardTitle>
            <p className="mt-1 text-sm text-neutral-600">
              Lo que piden desde la obra (pestaña Material de cada obra).
              {!esAdmin && ' Las aprueba el administrador.'}
            </p>
          </div>
        </CardHeader>
        {porAprobar.length === 0 ? (
          <p className="text-sm text-neutral-600">No hay nada por aprobar.</p>
        ) : (
          <DecidirRequisiciones requisiciones={porAprobar} obras={obras} esAdmin={esAdmin} />
        )}
      </Card>

      <Card>
        <CardHeader>
          <div>
            <CardTitle as="h2">Aprobado, por comprar</CardTitle>
            <p className="mt-1 text-sm text-neutral-600">
              {renglonesPorComprar.length === 0
                ? 'Todo lo aprobado ya está en una orden de compra.'
                : `${renglonesPorComprar.length} materiales de ${aprobadas.length} requisiciones esperan orden de compra.`}
            </p>
          </div>
          {esAdmin && renglonesPorComprar.length > 0 && (
            <LinkButton href="/admin/compras/armar" size="sm">
              Armar órdenes de compra
            </LinkButton>
          )}
        </CardHeader>
        {esAdmin && (
          <div className="border-t border-neutral-100 pt-4">
            <p className="mb-2 text-sm font-medium text-neutral-900">Compra directa (sin requisición)</p>
            <NuevaOrdenDirecta
              obras={obrasRes.data.filter((o) => o.activa).map((o) => ({ id: o.id, nombre: o.nombre }))}
              proveedores={provRes.data.map((p) => ({ id: p.id, nombre: p.nombre }))}
            />
          </div>
        )}
      </Card>

      <section aria-labelledby="ordenes-abiertas" className="space-y-3">
        <h2 id="ordenes-abiertas" className="text-base font-semibold text-neutral-900">
          Órdenes abiertas
        </h2>
        {abiertas.length === 0 ? (
          <EmptyState title="Sin órdenes abiertas" description="Las órdenes en borrador o por recibir aparecen aquí." />
        ) : (
          <TablaOrdenes ordenes={abiertas} obras={obras} proveedores={proveedores} precios={precios} />
        )}
      </section>

      {vePagos && (
        <section aria-labelledby="por-pagar" className="space-y-3">
          <h2 id="por-pagar" className="text-base font-semibold text-neutral-900">
            Por pagar a proveedores
          </h2>
          {saldos.length === 0 ? (
            <p className="text-sm text-neutral-600">No se le debe nada a ningún proveedor.</p>
          ) : (
            <TableContainer>
                <THead>
                  <Th>Proveedor · orden</Th>
                  <Th>Obra</Th>
                  <Th className="text-right">Saldo</Th>
                  <Th>Vence</Th>
                  <Th>Situación</Th>
                </THead>
                <TBody>
                  {saldos.flatMap((g) =>
                    g.ordenes.map((o, i) => (
                      <Tr key={o.id}>
                        <Td>
                          <RowLink href={`/admin/compras/ordenes/${o.id}`}>
                            <span className="sr-only">Abrir OC-{o.folio}</span>
                          </RowLink>
                          <span className={i === 0 ? 'font-medium text-neutral-900' : 'text-neutral-600'}>
                            {i === 0 ? proveedores[g.proveedorId] ?? 'Proveedor' : ''}
                          </span>{' '}
                          <span className="text-neutral-600">OC-{o.folio}</span>
                        </Td>
                        <Td>{obras[o.obraId] ?? '—'}</Td>
                        <Td className="text-right tabular-nums">{formatCurrency(o.saldo)}</Td>
                        <Td>{formatDate(o.vence)}</Td>
                        <Td>
                          <Badge tone={TONO_SITUACION[o.situacion]}>
                            {ETIQUETA_SITUACION[o.situacion]}
                            {o.situacion === 'vencida' ? ` hace ${-o.dias} d` : ''}
                            {o.situacion === 'por_vencer' ? (o.dias === 0 ? ' hoy' : ` en ${o.dias} d`) : ''}
                          </Badge>
                        </Td>
                      </Tr>
                    )),
                  )}
                </TBody>
            </TableContainer>
          )}
          <p className="text-xs text-neutral-600">
            El crédito corre desde la fecha de la factura; si no hay factura, desde la primera entrega en obra.
          </p>
        </section>
      )}

      {recientes.length > 0 && (
        <section aria-labelledby="recientes" className="space-y-3">
          <h2 id="recientes" className="text-base font-semibold text-neutral-900">
            Recibidas y canceladas (recientes)
          </h2>
          <TablaOrdenes ordenes={recientes} obras={obras} proveedores={proveedores} precios={precios} />
        </section>
      )}

      <p className="text-sm text-neutral-600">
        Para pedir material ve a la obra, pestaña{' '}
        <Link href="/admin/obras" className="font-medium text-blue-700 underline">
          Material
        </Link>
        .
      </p>
    </div>
  );
}

function Numero({ etiqueta, valor, alerta = false }: { etiqueta: string; valor: string; alerta?: boolean }) {
  return (
    <div className="rounded-xl border border-neutral-200 bg-white px-4 py-3">
      <dt className="text-xs font-medium text-neutral-600">{etiqueta}</dt>
      <dd className={`mt-1 text-2xl font-semibold tabular-nums ${alerta ? 'text-red-700' : 'text-neutral-900'}`}>
        {valor}
      </dd>
    </div>
  );
}

function TablaOrdenes({
  ordenes,
  obras,
  proveedores,
  precios,
}: {
  ordenes: Awaited<ReturnType<typeof listOrdenes>>['data'];
  obras: Record<string, string>;
  proveedores: Record<string, string>;
  /** Almacén no ve importes (F6-9). */
  precios: boolean;
}) {
  return (
    <TableContainer>
        <THead>
          <Th>Folio</Th>
          <Th>Proveedor</Th>
          <Th>Obra</Th>
          <Th>Estado</Th>
          {precios && <Th className="text-right">Total</Th>}
        </THead>
        <TBody>
          {ordenes.map((o) => (
            <Tr key={o.id}>
              <Td>
                <RowLink href={`/admin/compras/ordenes/${o.id}`}>
                  <span className="sr-only">Abrir orden OC-{o.folio}</span>
                </RowLink>
                <span className="font-medium text-neutral-900">OC-{o.folio}</span>
              </Td>
              <Td>{proveedores[o.proveedor_id] ?? '—'}</Td>
              <Td>{obras[o.obra_id] ?? '—'}</Td>
              <Td>
                <Badge tone={TONO_ESTADO_ORDEN[o.estado]}>{ETIQUETA_ESTADO_ORDEN[o.estado]}</Badge>
              </Td>
              {precios && <Td className="text-right tabular-nums">{formatCurrency(totalesDe(o).total)}</Td>}
            </Tr>
          ))}
        </TBody>
    </TableContainer>
  );
}
