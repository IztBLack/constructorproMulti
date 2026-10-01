import Link from 'next/link';
import {
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
  buttonClassName,
} from '@/components/ui';
import { EnlaceHoja, EstadoFiscalBadge } from '@/components/fiscal/estado-fiscal';
import { getAccesoFiscal, getEmpresaFiscal, listCobros } from '@/lib/data/fiscal';
import { formatCurrency, formatDate } from '@/lib/data/format';
import { hoyMxMs } from '@/lib/data/tz';
import { limiteComplemento } from '@/lib/fiscal/calculo';
import { LEYENDA_NO_ES_FACTURA } from '@/lib/fiscal/catalogos';
import { folioPpdDelAbono } from '@/lib/fiscal/hoja';
import { periodoDeMes } from '@/lib/fiscal/periodo';
import { estadoDe, type Cobro } from '@/lib/fiscal/tipos';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Facturación' };

const ORIGEN: Record<Cobro['origen'], string> = { pago: 'Cotización', movimiento: 'Obra', estimacion: 'Estimación' };

/**
 * Facturación (RF1b.4–6): lo pendiente por facturar, los complementos de pago
 * que faltan y el paquete del mes para el contador. La app NO factura: organiza.
 */
export default async function FacturacionPage({
  searchParams,
}: {
  searchParams: Promise<{ mes?: string }>;
}) {
  const { mes } = await searchParams;
  const acceso = await getAccesoFiscal();

  if (!acceso.puede) {
    return (
      <div className="space-y-6">
        <PageHeader title="Facturación" />
        <EmptyState
          title="Solo el administrador y el contador ven los datos para facturar"
          description="Son datos fiscales de la empresa y de sus clientes. Si los necesitas, pídeselos al administrador."
        />
      </div>
    );
  }

  const periodo = periodoDeMes(mes, hoyMxMs());
  const [{ data: cobros, error }, emisor] = await Promise.all([listCobros(), getEmpresaFiscal()]);

  // Otros cobros del MISMO documento: para saber si un cobro es abono a una PPD.
  const porDocumento = new Map<string, Cobro[]>();
  for (const c of cobros) {
    const k = `${c.origen}:${c.documentoId}`;
    porDocumento.set(k, [...(porDocumento.get(k) ?? []), c]);
  }
  const otros = (c: Cobro) => (porDocumento.get(`${c.origen}:${c.documentoId}`) ?? []).filter((o) => o.id !== c.id);

  const porFacturar: Cobro[] = [];
  const complementos: { cobro: Cobro; folio: string }[] = [];
  const facturadosMes: Cobro[] = [];
  for (const c of cobros) {
    const estado = estadoDe(c);
    if (estado === 'no_requiere') continue;
    const folioPpd = folioPpdDelAbono(c, otros(c));
    const esPpd = estado === 'facturado' && c.fiscal?.metodo_pago === 'PPD';
    if ((folioPpd || esPpd) && !c.fiscal?.complemento_uuid) {
      complementos.push({ cobro: c, folio: folioPpd ?? c.fiscal?.uuid ?? '' });
    }
    if (estado === 'por_facturar' && !folioPpd) porFacturar.push(c);
    if (estado === 'facturado' && c.fecha >= periodo.desde && c.fecha < periodo.hasta) facturadosMes.push(c);
  }
  const totalPorFacturar = porFacturar.reduce((s, c) => s + c.monto, 0);
  const emisorCompleto = !!(emisor?.rfc && emisor.razon_social && emisor.regimen && emisor.cp_fiscal);

  return (
    <div className="space-y-8">
      <PageHeader
        title="Facturación"
        description="Lo que falta facturar y el paquete del mes para tu contador. La app no factura ni se conecta al SAT: te deja todo listo para copiar."
      />

      {!emisorCompleto && (
        <p className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
          Te faltan tus datos fiscales (RFC, razón social, régimen o código postal).{' '}
          <Link href="/admin/ajustes#fiscal" className="font-medium underline">
            Captúralos en Ajustes
          </Link>{' '}
          para que salgan en cada hoja.
        </p>
      )}

      {error && (
        <p className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
          No se pudieron cargar los cobros: {error}
        </p>
      )}

      {/* ── Paquete para el contador ─────────────────────────────────────── */}
      <Card data-guia="facturacion-paquete">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <CardTitle as="h2" className="text-base font-semibold text-neutral-900">
              Paquete para el contador
            </CardTitle>
            <p className="mt-1 max-w-xl text-sm text-neutral-600">
              Un Excel con 6 hojas —por facturar, complementos de pago, facturado, gastos por obra,
              raya y un resumen de IVA <strong>estimado, que no es declaración</strong>— y las facturas
              (XML y PDF) del mes, todo en un ZIP.
            </p>
          </div>
          <form method="get" className="flex flex-wrap items-end gap-2">
            <label className="block space-y-1">
              <span className="text-sm font-medium text-neutral-700">Mes</span>
              <input
                type="month"
                name="mes"
                defaultValue={periodo.clave}
                className="block min-h-11 rounded-lg border border-neutral-300 bg-white px-3 text-sm text-neutral-900"
              />
            </label>
            <button type="submit" className={buttonClassName('secondary')}>
              Cambiar mes
            </button>
          </form>
        </div>
        <div className="mt-4 flex flex-wrap gap-2">
          <a href={`/admin/facturacion/paquete?mes=${periodo.clave}`} className={buttonClassName('primary')}>
            Descargar paquete de {periodo.nombre} (ZIP)
          </a>
          <a
            href={`/admin/facturacion/paquete?mes=${periodo.clave}&formato=xlsx`}
            className={buttonClassName('secondary')}
          >
            Solo el Excel
          </a>
        </div>
      </Card>

      {/* ── Por facturar ─────────────────────────────────────────────────── */}
      <section className="space-y-3" aria-labelledby="por-facturar">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 id="por-facturar" className="text-base font-semibold text-neutral-900">
            Por facturar ({porFacturar.length})
          </h2>
          {porFacturar.length > 0 && (
            <p className="text-sm text-neutral-600">
              Cobrado sin factura: <span className="font-semibold tabular-nums">{formatCurrency(totalPorFacturar)}</span>
            </p>
          )}
        </div>
        <p className="text-sm text-neutral-600">
          Aparecen los pagos de tus cotizaciones y las entradas de caja de tus obras. Si registraste el
          mismo cobro en los dos lados, marca uno como «No requiere factura».
        </p>
        {porFacturar.length === 0 ? (
          <EmptyState title="Nada pendiente" description="Todos tus cobros ya tienen factura o no la necesitan." />
        ) : (
          <TablaCobros cobros={porFacturar} />
        )}
      </section>

      {/* ── Complementos ─────────────────────────────────────────────────── */}
      <section className="space-y-3" aria-labelledby="complementos">
        <h2 id="complementos" className="text-base font-semibold text-neutral-900">
          Complementos de pago pendientes ({complementos.length})
        </h2>
        <p className="text-sm text-neutral-600">
          Abonos a facturas en parcialidades (PPD). Cada uno lleva su complemento de pago, a más tardar
          el día 5 del mes siguiente al pago.
        </p>
        {complementos.length === 0 ? (
          <EmptyState title="Sin complementos pendientes" />
        ) : (
          <TableContainer>
            <THead>
              <Th>Pago</Th>
              <Th>Cliente</Th>
              <Th>Factura</Th>
              <Th>Hacer a más tardar</Th>
              <Th className="text-right">Monto</Th>
              <Th className="text-right">
                <span className="sr-only">Acciones</span>
              </Th>
            </THead>
            <TBody>
              {complementos.map(({ cobro: c, folio }) => (
                <Tr key={`${c.origen}-${c.id}`}>
                  <Td>{formatDate(c.fecha)}</Td>
                  <Td>{c.clienteNombre || '—'}</Td>
                  <Td className="font-mono text-xs">{folio || '—'}</Td>
                  <Td>{limiteComplemento(c.fecha)}</Td>
                  <Td className="text-right tabular-nums">{formatCurrency(c.monto)}</Td>
                  <Td className="text-right">
                    <EnlaceHoja origen={c.origen} id={c.id} texto="Hoja del complemento" />
                  </Td>
                </Tr>
              ))}
            </TBody>
          </TableContainer>
        )}
      </section>

      {/* ── Facturado del mes ────────────────────────────────────────────── */}
      <section className="space-y-3" aria-labelledby="facturado">
        <h2 id="facturado" className="text-base font-semibold text-neutral-900">
          Facturado en {periodo.nombre} ({facturadosMes.length})
        </h2>
        {facturadosMes.length === 0 ? (
          <EmptyState title="Sin cobros facturados en este mes" />
        ) : (
          <TablaCobros cobros={facturadosMes} conFolio />
        )}
      </section>

      <p className="text-xs text-neutral-500">{LEYENDA_NO_ES_FACTURA}</p>
      <div>
        <LinkButton href="/admin/ajustes#fiscal" variant="ghost">
          Mis datos fiscales
        </LinkButton>
      </div>
    </div>
  );
}

function TablaCobros({ cobros, conFolio = false }: { cobros: Cobro[]; conFolio?: boolean }) {
  return (
    <TableContainer>
      <THead>
        <Th>Fecha</Th>
        <Th>De</Th>
        <Th>Cliente</Th>
        <Th>Concepto</Th>
        {conFolio && <Th>Folio fiscal</Th>}
        <Th>Estado</Th>
        <Th className="text-right">Monto</Th>
        <Th className="text-right">
          <span className="sr-only">Acciones</span>
        </Th>
      </THead>
      <TBody>
        {cobros.map((c) => (
          <Tr key={`${c.origen}-${c.id}`}>
            <Td>{formatDate(c.fecha)}</Td>
            <Td>
              <span className="text-neutral-500">{ORIGEN[c.origen]}:</span> {c.documentoNombre}
            </Td>
            <Td>{c.clienteNombre || '—'}</Td>
            <Td>{c.concepto || '—'}</Td>
            {conFolio && <Td className="font-mono text-xs">{c.fiscal?.uuid ?? '—'}</Td>}
            <Td>
              <EstadoFiscalBadge estado={estadoDe(c)} />
            </Td>
            <Td className="text-right tabular-nums">{formatCurrency(c.monto)}</Td>
            <Td className="text-right">
              <EnlaceHoja origen={c.origen} id={c.id} texto={conFolio ? 'Ver' : 'Hoja para facturar'} />
            </Td>
          </Tr>
        ))}
      </TBody>
    </TableContainer>
  );
}
