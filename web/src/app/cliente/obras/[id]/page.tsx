import { notFound } from 'next/navigation';
import Link from 'next/link';
import {
  Badge,
  Card,
  CardHeader,
  CardTitle,
  EmptyState,
  LinkButton,
  PageHeader,
  TableContainer,
  THead,
  Th,
  TBody,
  Tr,
  Td,
} from '@/components/ui';
import { formatCurrency, formatDate } from '@/lib/data/format';
import { getObraCliente, getEstadoCuentaObra, mapEstadoObra } from '@/lib/data/portal-cliente';
import type { EstadoObraPortal } from '@/lib/data/portal-cliente';
import { listBitacoraObra } from '@/lib/data/bitacora';
import { BitacoraCliente } from './bitacora-cliente';
import { listExtrasObraCliente } from '@/lib/data/cambios';
import { ExtrasCliente } from './_extras';
import { getAvanceFisicoPortal, listEstimacionesCliente } from '@/lib/data/estimaciones';
import { avanceFinanciero } from '@/lib/estimaciones/avance';
import { AvanceFisicoFinanciero } from '@/components/estimaciones/avance-fisico-financiero';
import { EstimacionesCliente } from './_estimaciones';
import { getGarantiaObra, listReportesObra, postventaDisponible } from '@/lib/data/postventa';
import { estadoGarantia } from '@/lib/postventa/garantia';
import { hoyMxMs } from '@/lib/data/tz';
import { PostventaCliente } from './postventa-cliente';
import { muestraIva, textoTasaIva } from '@/lib/cliente/estado-cuenta-calculo';

export const dynamic = 'force-dynamic';

// ─── Helpers ─────────────────────────────────────────────────────────────────

const ESTADO_TONE: Record<EstadoObraPortal, 'green' | 'amber' | 'neutral'> = {
  'En progreso': 'green',
  Pausada: 'amber',
  Completada: 'neutral',
};

// ─── Página ──────────────────────────────────────────────────────────────────

export default async function ObraDetallePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  const obra = await getObraCliente(id);
  if (!obra) notFound();

  const estado = mapEstadoObra(obra.activa, obra.avance);
  const tone = ESTADO_TONE[estado];

  // Estado de cuenta REAL de ESTA obra: COSTO TOTAL (presupuesto) vs RECIBIDO
  // (movimientos tipo='ENTRADA'). Las SALIDA (pagos internos) nunca se exponen.
  const [
    estadoCuenta,
    extras,
    bitacora,
    fisico,
    estimaciones,
    postventaActiva,
    garantiaObra,
    reportes,
  ] = await Promise.all([
    getEstadoCuentaObra(obra.id),
    listExtrasObraCliente(obra.id),
    // Bitácora publicada (0041). La RLS entrega SOLO lo marcado para el
    // cliente; si falla o no hay nada, la sección simplemente no aparece.
    listBitacoraObra(obra.id),
    // Avance por partida y estimaciones (0039). Como los extras (F1-11), se
    // muestran aunque el módulo esté apagado: el cliente no puede leer los
    // módulos y lo que ya se le mandó es suyo. Si 0039 no está, no aparecen.
    getAvanceFisicoPortal(obra.id),
    listEstimacionesCliente(obra.id),
    // Garantías (0043): el botón de reportar solo si su contratista usa el
    // módulo; lo ya reportado y el periodo se ven siempre (RLS: solo lo suyo).
    postventaDisponible(obra.id),
    getGarantiaObra(obra.id),
    listReportesObra(obra.id),
  ]);

  const { costoTotal, recibido, recibidoSinIva, ivaCobrado, tasaIva, pendiente, pagadoPct, entradas, presupuesto, totalExtras } =
    estadoCuenta;
  // La obra se cobra con IVA: el costo total no lo lleva, así que lo pagado
  // se compara SIN IVA y el IVA se enseña aparte.
  const conIva = muestraIva(estadoCuenta);

  const porCobrarEst = estimaciones
    .filter((e) => e.estado === 'AUTORIZADA')
    .reduce((s, e) => s + e.foto.importes.neto, 0);
  const fondoRetenido = estimaciones
    .filter((e) => e.estado !== 'RECHAZADA')
    .reduce((s, e) => s + e.foto.importes.fondoGarantia, 0);

  const tieneEstadoCuenta = costoTotal > 0 || entradas.length > 0;

  return (
    <div className="space-y-8">
      {/* ── Encabezado ──────────────────────────────────────────────────── */}
      <div>
        <Link
          href="/cliente/obras"
          className="inline-flex items-center gap-1 text-sm text-neutral-500 hover:text-neutral-900 cursor-pointer transition-colors duration-150 mb-4 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-neutral-900 rounded"
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            className="h-4 w-4"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={2}
            aria-hidden="true"
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
          </svg>
          Mis obras
        </Link>

        <PageHeader
          title={obra.nombre}
          description={obra.ubicacion ?? undefined}
          actions={<Badge tone={tone}>{estado}</Badge>}
        />
        <p className="mt-2 text-sm text-neutral-500">
          Fecha de inicio: {formatDate(obra.fecha_inicio)}
        </p>
      </div>

      {/* ── Avance: hecho (medido por partida) vs pagado (RF3.7) ─────────── */}
      {fisico && (
        <AvanceFisicoFinanciero
          paraCliente
          fisico={fisico.pct}
          financiero={avanceFinanciero(recibidoSinIva, costoTotal)}
          sinIva={conIva}
          porCobrar={Math.round(porCobrarEst * 100) / 100}
          fondoRetenido={Math.round(fondoRetenido * 100) / 100}
        />
      )}

      {/* ── Avance de obra (el que captura la constructora a mano) ─────────── */}
      {!fisico && (
      <section aria-labelledby="avance-heading">
        <Card padding="md">
          <CardHeader>
            <CardTitle as="h2" id="avance-heading">
              Avance de obra
            </CardTitle>
            <span className="text-xl font-bold text-neutral-900">{obra.avance}%</span>
          </CardHeader>
          <div
            className="h-3 w-full overflow-hidden rounded-full bg-neutral-100"
            role="progressbar"
            aria-valuenow={obra.avance}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-label={`Avance de obra: ${obra.avance}%`}
          >
            <div
              className="h-full rounded-full bg-green-500 transition-all duration-700 motion-reduce:transition-none"
              style={{ width: `${obra.avance}%` }}
            />
          </div>
          <p className="mt-2 text-xs text-neutral-400">
            Avance reportado por la constructora. Actualizado periódicamente.
          </p>
        </Card>
      </section>
      )}

      {/* ── Estimaciones (0039): lo que se le mandó a autorizar ──────────── */}
      <EstimacionesCliente obraId={obra.id} estimaciones={estimaciones} />

      {/* ── Extras (0036): lo que se le mandó a aprobar ──────────────────── */}
      <ExtrasCliente obraId={obra.id} extras={extras} />

      {/* ── Estado de cuenta de la obra ─────────────────────────────────── */}
      <section aria-labelledby="estado-cuenta-heading">
        <div className="mb-4 flex items-center justify-between gap-4">
          <h2 id="estado-cuenta-heading" className="text-base font-semibold text-neutral-900">
            Estado de cuenta de esta obra
          </h2>
          {tieneEstadoCuenta && (
            <LinkButton
              href={`/cliente/obras/${obra.id}/estado-cuenta`}
              variant="secondary"
              size="sm"
            >
              Descargar PDF
            </LinkButton>
          )}
        </div>

        {!tieneEstadoCuenta ? (
          <EmptyState
            title="Aún no hay movimientos"
            description="El presupuesto y los pagos de esta obra aparecerán aquí en cuanto tu constructora los registre."
          />
        ) : (
          <>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              <div className="rounded-xl border border-neutral-200 bg-white px-4 py-3">
                <div className="text-xs font-medium text-neutral-500">
                  {conIva ? 'Costo total (sin IVA)' : 'Costo total'}
                </div>
                <p className="mt-1.5 text-2xl font-semibold text-neutral-900 tabular-nums">
                  {formatCurrency(costoTotal)}
                </p>
              </div>

              <div className="rounded-xl border border-neutral-200 bg-white px-4 py-3">
                <div className="text-xs font-medium text-neutral-500">
                  {conIva ? 'Pagado (sin IVA)' : 'Pagado'}
                </div>
                <p className="mt-1.5 text-2xl font-semibold text-green-700 tabular-nums">
                  {formatCurrency(conIva ? recibidoSinIva : recibido)}
                </p>
                <p className="mt-1 text-xs text-neutral-500">{pagadoPct}% del costo</p>
              </div>

              <div className="rounded-xl border border-amber-300 bg-amber-50 px-4 py-3">
                <div className="text-xs font-medium text-amber-800">
                  {conIva ? 'Saldo pendiente (sin IVA)' : 'Saldo pendiente'}
                </div>
                <p className="mt-1.5 text-2xl font-semibold text-amber-700 tabular-nums">
                  {formatCurrency(pendiente)}
                </p>
                <p className="mt-1 text-xs text-amber-700/80">{100 - pagadoPct}% restante</p>
              </div>
            </div>

            {/* Lo que pagó con IVA, desglosado: base + IVA = lo que salió de su
                bolsa. Sin la nota interna del SAT (esa es de la constructora). */}
            {conIva && (
              <dl className="mt-3 flex flex-wrap gap-x-6 gap-y-1 text-sm text-neutral-700">
                <div>
                  <dt className="inline">IVA pagado{tasaIva > 0 ? ` (${textoTasaIva(tasaIva)})` : ''}: </dt>
                  <dd className="inline font-medium tabular-nums text-neutral-900">{formatCurrency(ivaCobrado)}</dd>
                </div>
                <div>
                  <dt className="inline">Total pagado con IVA: </dt>
                  <dd className="inline font-medium tabular-nums text-neutral-900">{formatCurrency(recibido)}</dd>
                </div>
              </dl>
            )}

            {/* Los extras aprobados van como línea aparte (RF1.4): el cliente ve
                qué era el trato original y qué se agregó después. */}
            {totalExtras > 0 && (
              <dl className="mt-3 flex flex-wrap gap-x-6 gap-y-1 text-sm text-neutral-700">
                <div>
                  <dt className="inline">Presupuesto: </dt>
                  <dd className="inline font-medium tabular-nums text-neutral-900">{formatCurrency(presupuesto)}</dd>
                </div>
                <div>
                  <dt className="inline">Extras aprobados: </dt>
                  <dd className="inline font-medium tabular-nums text-neutral-900">{formatCurrency(totalExtras)}</dd>
                </div>
              </dl>
            )}

            {/* Barra de avance de pago */}
            <div className="mt-4 space-y-1">
              <div className="flex items-center justify-between text-xs text-neutral-500">
                <span>Avance de pago</span>
                <span className="font-medium text-neutral-900">{pagadoPct}%</span>
              </div>
              <div
                className="h-2 w-full overflow-hidden rounded-full bg-neutral-100"
                role="progressbar"
                aria-valuenow={pagadoPct}
                aria-valuemin={0}
                aria-valuemax={100}
                aria-label={`Avance de pago: ${pagadoPct}%`}
              >
                <div
                  className="h-full rounded-full bg-blue-500 transition-all duration-700 motion-reduce:transition-none"
                  style={{ width: `${pagadoPct}%` }}
                />
              </div>
            </div>
          </>
        )}
      </section>

      {/* ── Bitácora publicada ──────────────────────────────────────────── */}
      <BitacoraCliente entradas={bitacora.data} />

      {/* ── Garantía y reportes (0043) ──────────────────────────────────── */}
      <PostventaCliente
        obraId={obra.id}
        disponible={postventaActiva}
        garantia={estadoGarantia(garantiaObra, hoyMxMs())}
        reportes={reportes.data}
      />

      {/* ── Historial de pagos (ENTRADAS de esta obra) ──────────────────── */}
      {entradas.length > 0 && (
        <section aria-labelledby="historial-pagos-heading">
          <h2
            id="historial-pagos-heading"
            className="mb-4 text-base font-semibold text-neutral-900"
          >
            Historial de pagos
          </h2>

          {/* Tabla escritorio */}
          <TableContainer className="hidden sm:block">
            <THead>
              <Th>Fecha</Th>
              <Th>Concepto</Th>
              <Th>Método</Th>
              <Th>Referencia</Th>
              <Th className="text-right">Monto</Th>
            </THead>
            <TBody>
              {entradas.map((pago) => (
                <Tr key={pago.id}>
                  <Td>{formatDate(pago.fecha)}</Td>
                  <Td className="text-neutral-900 font-medium">
                    {pago.concepto?.trim() || pago.categoria?.trim() || 'Pago'}
                  </Td>
                  <Td>{pago.metodo_pago?.trim() || '—'}</Td>
                  <Td>
                    {pago.referencia?.trim() ? (
                      pago.referencia
                    ) : (
                      <span className="text-neutral-400">—</span>
                    )}
                  </Td>
                  <Td className="text-right tabular-nums font-semibold text-neutral-900">
                    {formatCurrency(pago.monto)}
                  </Td>
                </Tr>
              ))}
            </TBody>
          </TableContainer>

          {/* Tarjetas móvil */}
          <div className="space-y-3 sm:hidden">
            {entradas.map((pago) => (
              <div
                key={pago.id}
                className="rounded-xl border border-neutral-200 bg-white p-4 space-y-2"
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-sm font-semibold text-neutral-900">
                      {pago.concepto?.trim() || pago.categoria?.trim() || 'Pago'}
                    </p>
                    <p className="text-xs text-neutral-400">{formatDate(pago.fecha)}</p>
                  </div>
                  <p className="tabular-nums font-semibold text-neutral-900 shrink-0">
                    {formatCurrency(pago.monto)}
                  </p>
                </div>
                <div className="flex items-center gap-3 text-xs text-neutral-500">
                  <span>{pago.metodo_pago?.trim() || '—'}</span>
                  {pago.referencia?.trim() && (
                    <>
                      <span aria-hidden="true">·</span>
                      <span>{pago.referencia}</span>
                    </>
                  )}
                </div>
              </div>
            ))}
          </div>

          {/* Total confirmación */}
          <div className="mt-4 flex justify-end">
            <div className="rounded-lg border border-neutral-200 bg-white px-5 py-3 text-sm">
              <div className="flex items-center gap-6">
                <span className="text-neutral-600">{conIva ? 'Total pagado (con IVA)' : 'Total pagado'}</span>
                <span className="tabular-nums font-semibold text-neutral-900">
                  {formatCurrency(recibido)}
                </span>
              </div>
            </div>
          </div>
        </section>
      )}
    </div>
  );
}
