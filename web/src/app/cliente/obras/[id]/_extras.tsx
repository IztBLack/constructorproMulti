'use client';

import { useId, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Badge, Button, Card } from '@/components/ui';
import { formatCurrency, formatDate } from '@/lib/data/format';
import { ETIQUETA_ESTADO_EXTRA, LARGO_MOTIVO_RECHAZO, TONO_ESTADO_EXTRA } from '@/lib/cambios/extras';
import type { ExtraPortal } from '@/lib/data/cambios';
import { responderExtraAction } from './extras-actions';

/**
 * Los extras de la obra, vistos por el cliente. Enseña lo que se le MANDÓ (la
 * foto congelada al enviar), y en los que esperan su respuesta, los botones de
 * aprobar o rechazar. Rechazar pide el motivo: sin él, el contratista no sabe
 * qué corregir.
 */
export function ExtrasCliente({ obraId, extras }: { obraId: string; extras: ExtraPortal[] }) {
  if (extras.length === 0) return null;
  const pendientes = extras.filter((e) => e.estado === 'ENVIADA').length;

  return (
    <section aria-labelledby="extras-heading" className="space-y-3">
      <div>
        <h2 id="extras-heading" className="text-base font-semibold text-neutral-900">
          Extras de tu obra
        </h2>
        <p className="text-sm text-neutral-600">
          Trabajos que no estaban en el presupuesto original.{' '}
          {pendientes > 0
            ? `Tienes ${pendientes === 1 ? 'uno esperando' : `${pendientes} esperando`} tu respuesta.`
            : 'Los aprobados se suman a tu estado de cuenta.'}
        </p>
      </div>
      <ul className="space-y-3">
        {extras.map((e) => (
          <li key={e.id}>
            <TarjetaExtra obraId={obraId} extra={e} />
          </li>
        ))}
      </ul>
    </section>
  );
}

function TarjetaExtra({ obraId, extra }: { obraId: string; extra: ExtraPortal }) {
  const router = useRouter();
  const motivoId = useId();
  const [modo, setModo] = useState<'aprobar' | 'rechazar' | null>(null);
  const [motivo, setMotivo] = useState('');
  const [ocupado, setOcupado] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function responder(aprobar: boolean) {
    setOcupado(true);
    setError(null);
    const r = await responderExtraAction(obraId, extra.id, aprobar, motivo);
    setOcupado(false);
    if (!r.ok) {
      setError(r.error ?? 'No se pudo registrar tu respuesta.');
      return;
    }
    setModo(null);
    router.refresh();
  }

  const f = extra.foto;

  return (
    <Card>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs font-medium text-neutral-600">Extra {extra.folio}</p>
          <h3 className="font-semibold text-neutral-900">{f.titulo || 'Trabajo adicional'}</h3>
          {extra.enviadoEl && <p className="text-xs text-neutral-600">Enviado el {formatDate(extra.enviadoEl)}</p>}
        </div>
        <Badge tone={TONO_ESTADO_EXTRA[extra.estado]}>{ETIQUETA_ESTADO_EXTRA[extra.estado]}</Badge>
      </div>

      {f.motivo && <p className="mt-2 whitespace-pre-line text-sm text-neutral-700">{f.motivo}</p>}

      {f.renglones.length > 0 && (
        <div className="mt-3 overflow-x-auto">
          <table className="w-full text-sm">
            <caption className="sr-only">Conceptos del extra {extra.folio}</caption>
            <thead className="text-left text-xs uppercase tracking-wide text-neutral-600">
              <tr>
                <th scope="col" className="py-1 pr-3 font-medium">Concepto</th>
                <th scope="col" className="py-1 pr-3 text-right font-medium">Cantidad</th>
                <th scope="col" className="py-1 text-right font-medium">Importe</th>
              </tr>
            </thead>
            <tbody>
              {f.renglones.map((r, i) => (
                <tr key={i} className="border-t border-neutral-100">
                  <td className="py-1.5 pr-3 text-neutral-900">{r.concepto}</td>
                  <td className="py-1.5 pr-3 text-right tabular-nums text-neutral-700">
                    {r.cantidad.toLocaleString('es-MX')} {r.unidad}
                  </td>
                  <td className="py-1.5 text-right tabular-nums">{formatCurrency(r.importe)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <p className="mt-3 flex items-baseline justify-between border-t border-neutral-200 pt-3 text-sm">
        <span className="font-medium text-neutral-700">Total (sin IVA)</span>
        <span className="text-lg font-bold tabular-nums text-neutral-900">{formatCurrency(extra.total)}</span>
      </p>

      {extra.fotoUrl && (
        // eslint-disable-next-line @next/next/no-img-element -- URL firmada de Storage que vence en 1 h.
        <img src={extra.fotoUrl} alt={`Foto del extra ${extra.folio}`} className="mt-3 max-h-72 rounded-lg border border-neutral-200 object-contain" />
      )}

      {extra.estado === 'APROBADA' && (
        <p className="mt-3 text-sm text-green-800">
          Lo aprobaste{extra.respondidoEl ? ` el ${formatDate(extra.respondidoEl)}` : ''}. Ya está sumado a tu estado de cuenta.
        </p>
      )}
      {extra.estado === 'RECHAZADA' && (
        <p className="mt-3 text-sm text-red-800">
          Lo rechazaste{extra.respondidoEl ? ` el ${formatDate(extra.respondidoEl)}` : ''}.
          {extra.motivoRechazo ? ` Motivo: ${extra.motivoRechazo}` : ''}
        </p>
      )}

      {extra.estado === 'ENVIADA' && (
        <div className="mt-4 space-y-3">
          {modo === 'aprobar' && (
            <div role="alertdialog" aria-labelledby={`${motivoId}-ap`} className="space-y-3 rounded-xl border border-amber-200 bg-amber-50 p-3">
              <p id={`${motivoId}-ap`} className="text-sm font-medium text-neutral-900">
                Al aprobarlo autorizas este trabajo por {formatCurrency(extra.total)}, y se suma a lo que
                debes de la obra.
              </p>
              <div className="flex flex-wrap gap-2">
                <Button size="sm" disabled={ocupado} onClick={() => responder(true)}>
                  {ocupado ? 'Aprobando…' : 'Sí, aprobar'}
                </Button>
                <Button size="sm" variant="ghost" disabled={ocupado} onClick={() => setModo(null)}>
                  Cancelar
                </Button>
              </div>
            </div>
          )}

          {modo === 'rechazar' && (
            <div className="space-y-3 rounded-xl border border-neutral-200 bg-neutral-50 p-3">
              <label htmlFor={motivoId} className="block text-sm font-medium text-neutral-900">
                ¿Por qué lo rechazas? *
              </label>
              <textarea
                id={motivoId}
                value={motivo}
                onChange={(ev) => setMotivo(ev.target.value)}
                rows={3}
                maxLength={LARGO_MOTIVO_RECHAZO}
                required
                aria-describedby={`${motivoId}-ayuda`}
                className="w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm text-neutral-900 outline-none focus:border-neutral-900"
              />
              <p id={`${motivoId}-ayuda`} className="text-xs text-neutral-600">
                Tu constructora lo verá para corregirlo o platicarlo contigo.
              </p>
              <div className="flex flex-wrap gap-2">
                <Button size="sm" variant="danger" disabled={ocupado || !motivo.trim()} onClick={() => responder(false)}>
                  {ocupado ? 'Enviando…' : 'Rechazar extra'}
                </Button>
                <Button size="sm" variant="ghost" disabled={ocupado} onClick={() => setModo(null)}>
                  Cancelar
                </Button>
              </div>
            </div>
          )}

          {modo === null && (
            <div className="flex flex-wrap gap-2">
              <Button onClick={() => setModo('aprobar')}>Aprobar</Button>
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
