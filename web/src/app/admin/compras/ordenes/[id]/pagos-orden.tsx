'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Button, Card, CardHeader, CardTitle, Field, Input, Select } from '@/components/ui';
import { formatCurrency, formatDate } from '@/lib/data/format';
import { ETIQUETA_METODO, METODOS_PAGO_PROVEEDOR, esMetodoPagoProveedor } from '@/lib/compras/tipos';
import { anularPagoAction, pagarOrdenAction } from '../../actions';

interface PagoVista {
  id: string;
  monto: number;
  fecha: number;
  metodo: string;
  referencia: string;
}

/**
 * Pagos al proveedor de esta orden (RF2.5, RF2.6). Cada pago crea SOLO el
 * movimiento de caja de la obra, con categoría de costo "Material": no hay que
 * capturarlo otra vez en la caja. Admin y contador.
 */
export function PagosOrden({
  ordenId,
  total,
  saldo,
  vence,
  situacion,
  vencida,
  diasCredito,
  pagos,
  hoy,
}: {
  ordenId: string;
  total: number;
  saldo: number;
  vence: number;
  situacion: string;
  vencida: boolean;
  diasCredito: number;
  pagos: PagoVista[];
  hoy: string;
}) {
  const router = useRouter();
  const [monto, setMonto] = useState(saldo > 0 ? saldo.toFixed(2) : '');
  const [fecha, setFecha] = useState(hoy);
  const [metodo, setMetodo] = useState<string>('TRANSFERENCIA');
  const [referencia, setReferencia] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [exito, setExito] = useState<string | null>(null);
  const [pendiente, startTransition] = useTransition();
  // Un id por intento: un doble clic devuelve el mismo pago (lo resuelve la RPC).
  const [pagoId, setPagoId] = useState(() => crypto.randomUUID());

  return (
    <Card>
      <CardHeader>
        <div>
          <CardTitle as="h2">Pagos al proveedor</CardTitle>
          <p className="mt-1 text-sm text-neutral-600">
            {diasCredito > 0 ? `${diasCredito} días de crédito` : 'De contado'} · vence el {formatDate(vence)} ·{' '}
            <span className={vencida ? 'font-medium text-red-700' : ''}>{situacion}</span>
          </p>
        </div>
      </CardHeader>

      <dl className="grid gap-3 sm:grid-cols-3">
        <div>
          <dt className="text-xs font-medium text-neutral-600">Total de la orden</dt>
          <dd className="text-lg font-semibold tabular-nums text-neutral-900">{formatCurrency(total)}</dd>
        </div>
        <div>
          <dt className="text-xs font-medium text-neutral-600">Pagado</dt>
          <dd className="text-lg font-semibold tabular-nums text-neutral-900">{formatCurrency(total - saldo)}</dd>
        </div>
        <div>
          <dt className="text-xs font-medium text-neutral-600">Se debe</dt>
          <dd className={`text-lg font-semibold tabular-nums ${saldo > 0 ? 'text-amber-800' : 'text-green-700'}`}>
            {formatCurrency(saldo)}
          </dd>
        </div>
      </dl>

      {pagos.length > 0 && (
        <ul className="mt-4 divide-y divide-neutral-100 border-t border-neutral-100 text-sm">
          {pagos.map((p) => (
            <li key={p.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
              <span className="text-neutral-800">
                {formatDate(p.fecha)} · {esMetodoPagoProveedor(p.metodo) ? ETIQUETA_METODO[p.metodo] : p.metodo}
                {p.referencia ? ` · ${p.referencia}` : ''}
              </span>
              <span className="flex items-center gap-2">
                <span className="font-medium tabular-nums">{formatCurrency(p.monto)}</span>
                <Button
                  size="sm"
                  variant="ghost"
                  disabled={pendiente}
                  onClick={() => {
                    if (!window.confirm('¿Anular este pago? También se borra su movimiento en la caja de la obra.')) return;
                    setError(null);
                    startTransition(async () => {
                      const r = await anularPagoAction(p.id, ordenId);
                      if (!r.ok) setError(r.error ?? 'No se pudo anular.');
                      else router.refresh();
                    });
                  }}
                >
                  Anular
                </Button>
              </span>
            </li>
          ))}
        </ul>
      )}

      {saldo > 0 && (
        <form
          className="mt-4 grid gap-3 border-t border-neutral-200 pt-4 sm:grid-cols-2 lg:grid-cols-[1fr_1fr_1fr_1fr_auto] lg:items-end"
          onSubmit={(e) => {
            e.preventDefault();
            setError(null);
            setExito(null);
            startTransition(async () => {
              const r = await pagarOrdenAction({ id: pagoId, ordenId, monto, fecha, metodo, referencia, notas: '' });
              if (!r.ok) {
                setError(r.error ?? 'No se pudo registrar el pago.');
                return;
              }
              setPagoId(crypto.randomUUID());
              setReferencia('');
              setMonto('');
              setExito('Pago registrado. Ya aparece en la caja de la obra como gasto de material.');
              router.refresh();
            });
          }}
        >
          <Field label="Monto">
            <Input inputMode="decimal" value={monto} onChange={(e) => setMonto(e.target.value)} required />
          </Field>
          <Field label="Fecha">
            <Input type="date" value={fecha} onChange={(e) => setFecha(e.target.value)} required />
          </Field>
          <Field label="Forma de pago">
            <Select value={metodo} onChange={(e) => setMetodo(e.target.value)}>
              {METODOS_PAGO_PROVEEDOR.map((m) => (
                <option key={m} value={m}>
                  {ETIQUETA_METODO[m]}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Referencia (opcional)">
            <Input value={referencia} maxLength={200} onChange={(e) => setReferencia(e.target.value)} />
          </Field>
          <Button type="submit" disabled={pendiente}>
            {pendiente ? 'Pagando…' : 'Registrar pago'}
          </Button>
        </form>
      )}
      {exito && (
        <p role="status" className="mt-3 text-sm text-green-700">
          {exito}
        </p>
      )}
      {error && (
        <p role="alert" className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </p>
      )}
    </Card>
  );
}
