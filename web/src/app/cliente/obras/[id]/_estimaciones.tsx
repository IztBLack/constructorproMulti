'use client';

import { useId, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Badge, Button, Card } from '@/components/ui';
import { formatCurrency, formatDate } from '@/lib/data/format';
import type { EstimacionPortal } from '@/lib/data/estimaciones';
import {
  ETIQUETA_ESTADO_ESTIMACION,
  LARGO_MOTIVO_RECHAZO,
  TONO_ESTADO_ESTIMACION,
} from '@/lib/estimaciones/tipos';
import { responderEstimacionAction } from './estimaciones-actions';

const cant = (n: number) => n.toLocaleString('es-MX', { maximumFractionDigits: 4 });

/**
 * Las estimaciones de la obra, vistas por el cliente. Enseña lo que se le
 * MANDÓ (la foto congelada al enviar) y, en las que esperan respuesta, los
 * botones de autorizar o rechazar. Rechazar pide el motivo.
 */
export function EstimacionesCliente({ obraId, estimaciones }: { obraId: string; estimaciones: EstimacionPortal[] }) {
  if (estimaciones.length === 0) return null;
  const pendientes = estimaciones.filter((e) => e.estado === 'ENVIADA').length;
  return (
    <section aria-labelledby="estimaciones-heading" className="space-y-3">
      <div>
        <h2 id="estimaciones-heading" className="text-base font-semibold text-neutral-900">
          Estimaciones (cobro por avance)
        </h2>
        <p className="text-sm text-neutral-600">
          Lo que se hizo en cada periodo, a los precios de tu presupuesto.{' '}
          {pendientes > 0
            ? `Tienes ${pendientes === 1 ? 'una esperando' : `${pendientes} esperando`} tu autorización.`
            : ''}
        </p>
      </div>
      <ul className="space-y-3">
        {estimaciones.map((e) => (
          <li key={e.id}>
            <TarjetaEstimacion obraId={obraId} e={e} />
          </li>
        ))}
      </ul>
    </section>
  );
}

function TarjetaEstimacion({ obraId, e }: { obraId: string; e: EstimacionPortal }) {
  const router = useRouter();
  const motivoId = useId();
  const [modo, setModo] = useState<'autorizar' | 'rechazar' | null>(null);
  const [motivo, setMotivo] = useState('');
  const [ocupado, setOcupado] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const f = e.foto;
  const i = f.importes;

  async function responder(si: boolean) {
    setOcupado(true);
    setError(null);
    const r = await responderEstimacionAction(obraId, e.id, si, motivo);
    setOcupado(false);
    if (!r.ok) {
      setError(r.error ?? 'No se pudo registrar tu respuesta.');
      return;
    }
    setModo(null);
    router.refresh();
  }

  return (
    <Card>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs font-medium text-neutral-600">Estimación {e.folio}</p>
          <h3 className="font-semibold text-neutral-900">
            {formatDate(f.periodoInicio)} al {formatDate(f.periodoFin)}
            {f.esFiniquito ? ' · finiquito' : ''}
          </h3>
        </div>
        <Badge tone={TONO_ESTADO_ESTIMACION[e.estado]}>{ETIQUETA_ESTADO_ESTIMACION[e.estado]}</Badge>
      </div>

      <div className="mt-3 overflow-x-auto">
        <table className="w-full text-sm">
          <caption className="sr-only">Partidas de la estimación {e.folio}</caption>
          <thead className="text-left text-xs uppercase tracking-wide text-neutral-600">
            <tr>
              <th scope="col" className="py-1 pr-3 font-medium">Partida</th>
              <th scope="col" className="py-1 pr-3 text-right font-medium">Este periodo</th>
              <th scope="col" className="py-1 text-right font-medium">Importe</th>
            </tr>
          </thead>
          <tbody>
            {f.renglones.map((r, k) => (
              <tr key={k} className="border-t border-neutral-100">
                <td className="py-1.5 pr-3 text-neutral-900">
                  {r.concepto}
                  <span className="block text-xs text-neutral-600">
                    Acumulado {cant(r.acumulado)} de {cant(r.contratado)} {r.unidad}
                  </span>
                </td>
                <td className="py-1.5 pr-3 text-right tabular-nums text-neutral-700">
                  {cant(r.cantidad)} {r.unidad}
                </td>
                <td className="py-1.5 text-right tabular-nums">{formatCurrency(r.importe)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <dl className="mt-3 space-y-1 border-t border-neutral-200 pt-3 text-sm">
        <Fila etiqueta="Importe de lo hecho" valor={formatCurrency(i.bruto)} />
        {i.amortizacion > 0 && <Fila etiqueta="Menos lo que se descuenta de tu anticipo" valor={`−${formatCurrency(i.amortizacion)}`} />}
        {i.iva > 0 && <Fila etiqueta={`IVA (${i.ivaPct} %)`} valor={formatCurrency(i.iva)} />}
        {i.fondoGarantia > 0 && (
          <Fila etiqueta="Fondo de garantía que retienes (se regresa al final)" valor={`−${formatCurrency(i.fondoGarantia)}`} />
        )}
        {i.retenciones
          .filter((r) => r.importe > 0)
          .map((r) => (
            <Fila key={r.concepto} etiqueta={r.concepto} valor={`−${formatCurrency(r.importe)}`} />
          ))}
      </dl>
      <p className="mt-2 flex items-baseline justify-between text-sm">
        <span className="font-medium text-neutral-700">A pagar</span>
        <span className="text-lg font-bold tabular-nums text-neutral-900">{formatCurrency(i.neto)}</span>
      </p>

      {(e.estado === 'AUTORIZADA' || e.estado === 'COBRADA') && (
        <p className="mt-3 text-sm text-green-800">
          {e.respuestaOrigen === 'OFICINA' ? 'Autorizada (la registró tu constructora)' : 'La autorizaste'}
          {e.respondidoEl ? ` el ${formatDate(e.respondidoEl)}` : ''}.
          {e.estado === 'COBRADA' ? ' Ya quedó pagada.' : ''}
        </p>
      )}
      {e.estado === 'RECHAZADA' && (
        <p className="mt-3 text-sm text-red-800">
          Rechazada{e.respondidoEl ? ` el ${formatDate(e.respondidoEl)}` : ''}.
          {e.motivoRechazo ? ` Motivo: ${e.motivoRechazo}` : ''}
        </p>
      )}

      {e.estado === 'ENVIADA' && (
        <div className="mt-4 space-y-3">
          {modo === 'autorizar' && (
            <div role="alertdialog" aria-labelledby={`${motivoId}-ok`} className="space-y-3 rounded-xl border border-amber-200 bg-amber-50 p-3">
              <p id={`${motivoId}-ok`} className="text-sm font-medium text-neutral-900">
                Al autorizarla reconoces estos trabajos y te comprometes a pagar {formatCurrency(i.neto)}.
              </p>
              <div className="flex flex-wrap gap-2">
                <Button disabled={ocupado} onClick={() => responder(true)}>
                  {ocupado ? 'Autorizando…' : 'Sí, autorizar'}
                </Button>
                <Button variant="ghost" disabled={ocupado} onClick={() => setModo(null)}>
                  Cancelar
                </Button>
              </div>
            </div>
          )}
          {modo === 'rechazar' && (
            <div className="space-y-3 rounded-xl border border-neutral-200 bg-neutral-50 p-3">
              <label htmlFor={motivoId} className="block text-sm font-medium text-neutral-900">
                ¿Por qué la rechazas? *
              </label>
              <textarea
                id={motivoId}
                value={motivo}
                onChange={(ev) => setMotivo(ev.target.value)}
                rows={3}
                maxLength={LARGO_MOTIVO_RECHAZO}
                required
                className="w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm text-neutral-900 outline-none focus:border-neutral-900"
              />
              <div className="flex flex-wrap gap-2">
                <Button variant="danger" disabled={ocupado || !motivo.trim()} onClick={() => responder(false)}>
                  {ocupado ? 'Enviando…' : 'Rechazar estimación'}
                </Button>
                <Button variant="ghost" disabled={ocupado} onClick={() => setModo(null)}>
                  Cancelar
                </Button>
              </div>
            </div>
          )}
          {modo === null && (
            <div className="flex flex-wrap gap-2">
              <Button onClick={() => setModo('autorizar')}>Autorizar</Button>
              <Button variant="secondary" onClick={() => setModo('rechazar')}>
                Rechazar
              </Button>
            </div>
          )}
          {error && (
            <p role="alert" className="text-sm text-red-700">
              {error}
            </p>
          )}
        </div>
      )}
    </Card>
  );
}

function Fila({ etiqueta, valor }: { etiqueta: string; valor: string }) {
  return (
    <div className="flex justify-between gap-3">
      <dt className="text-neutral-700">{etiqueta}</dt>
      <dd className="tabular-nums text-neutral-900">{valor}</dd>
    </div>
  );
}
