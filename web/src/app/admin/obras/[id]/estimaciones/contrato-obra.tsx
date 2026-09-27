'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Button, Card, Field, Input, Select } from '@/components/ui';
import { formatCurrency, formatDate } from '@/lib/data/format';
import type { ContratoCompleto } from '@/lib/data/estimaciones';
import { agregarRetencionAction, guardarContratoAction, quitarRetencionAction } from './actions';

const pct = (n: number) => `${n.toLocaleString('es-MX', { maximumFractionDigits: 4 })} %`;

/**
 * El contrato de la obra: anticipo, amortización, fondo de garantía, IVA y las
 * retenciones que se aplican a CADA estimación. Lo edita el admin; los demás lo
 * leen.
 */
export function ContratoObraCard({
  obraId,
  contrato: { contrato: c, retenciones, existe },
  contratado,
  entradas,
  esAdmin,
}: {
  obraId: string;
  contrato: ContratoCompleto;
  contratado: number;
  entradas: { id: string; fecha: number; monto: number; concepto: string }[];
  esAdmin: boolean;
}) {
  const router = useRouter();
  const [editando, setEditando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pendiente, startTransition] = useTransition();
  const [modoAnticipo, setModoAnticipo] = useState<'monto' | 'pct'>('monto');

  function correr(fn: () => Promise<{ ok: boolean; error?: string }>, despues?: () => void) {
    setError(null);
    startTransition(async () => {
      const r = await fn();
      if (!r.ok) {
        setError(r.error ?? 'No se pudo guardar.');
        return;
      }
      despues?.();
      router.refresh();
    });
  }

  const anticipoPct = contratado > 0 ? Math.round((c.anticipo / contratado) * 10_000) / 100 : 0;

  return (
    <Card padding="md">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h2 className="text-base font-semibold text-neutral-900">Condiciones del contrato</h2>
          <p className="text-sm text-neutral-600">Se aplican a cada estimación de esta obra.</p>
        </div>
        {esAdmin && !editando && (
          <Button type="button" variant="secondary" onClick={() => setEditando(true)}>
            {existe ? 'Cambiar' : 'Capturar'}
          </Button>
        )}
      </div>

      {!editando ? (
        <dl className="mt-3 grid gap-3 text-sm sm:grid-cols-2 lg:grid-cols-4">
          <Dato etiqueta="Anticipo" valor={c.anticipo > 0 ? `${formatCurrency(c.anticipo)} (${pct(anticipoPct)})` : 'Sin anticipo'} />
          <Dato etiqueta="Se amortiza en cada estimación" valor={pct(c.amortizacionPct)} />
          <Dato etiqueta="Fondo de garantía" valor={pct(c.fondoGarantiaPct)} />
          <Dato etiqueta="IVA" valor={c.ivaPct > 0 ? pct(c.ivaPct) : 'Sin IVA'} />
        </dl>
      ) : (
        <form
          className="mt-3 grid gap-3 sm:grid-cols-2"
          onSubmit={(e) => {
            e.preventDefault();
            const fd = new FormData(e.currentTarget);
            fd.set('anticipo_modo', modoAnticipo);
            correr(() => guardarContratoAction(obraId, fd), () => setEditando(false));
          }}
        >
          <Field label="El anticipo se captura en">
            <Select value={modoAnticipo} onChange={(e) => setModoAnticipo(e.target.value as 'monto' | 'pct')}>
              <option value="monto">Pesos</option>
              <option value="pct">% del presupuesto ({formatCurrency(contratado)})</option>
            </Select>
          </Field>
          <Field label={modoAnticipo === 'monto' ? 'Anticipo ($)' : 'Anticipo (%)'}>
            <Input
              name="anticipo"
              inputMode="decimal"
              defaultValue={modoAnticipo === 'monto' ? String(c.anticipo || '') : String(anticipoPct || '')}
              key={modoAnticipo}
            />
          </Field>
          <Field
            label="Amortización en cada estimación (%)"
            hint="Lo normal es el mismo % del anticipo: con 30 % de anticipo, se descuenta 30 % de cada estimación."
          >
            <Input name="amortizacion_pct" inputMode="decimal" defaultValue={String(c.amortizacionPct || '')} />
          </Field>
          <Field label="Fondo de garantía (%)" hint="Lo típico es 5 %. Se regresa al cerrar la obra.">
            <Input name="fondo_garantia_pct" inputMode="decimal" defaultValue={String(c.fondoGarantiaPct || '')} />
          </Field>
          <Field label="IVA de las estimaciones (%)" hint="0 si el presupuesto se cobra sin IVA.">
            <Input name="iva_pct" inputMode="decimal" defaultValue={String(c.ivaPct || '')} />
          </Field>
          <Field label="¿Con qué entrada te pagaron el anticipo? (opcional)" hint="Sirve para relacionar su factura.">
            <Select name="anticipo_movimiento_id" defaultValue={c.anticipoMovimientoId ?? ''}>
              <option value="">No lo sé / no está en caja</option>
              {entradas.map((m) => (
                <option key={m.id} value={m.id}>
                  {formatDate(m.fecha)} · {m.concepto} · {formatCurrency(m.monto)}
                </option>
              ))}
            </Select>
          </Field>
          <div className="flex flex-wrap gap-2 sm:col-span-2">
            <Button type="submit" disabled={pendiente}>
              {pendiente ? 'Guardando…' : 'Guardar condiciones'}
            </Button>
            <Button type="button" variant="ghost" onClick={() => setEditando(false)} disabled={pendiente}>
              Cancelar
            </Button>
          </div>
        </form>
      )}

      <div className="mt-4 border-t border-neutral-100 pt-3">
        <h3 className="text-sm font-medium text-neutral-800">Otras retenciones</h3>
        {retenciones.length === 0 ? (
          <p className="mt-1 text-sm text-neutral-600">
            Ninguna. En obra pública se retiene el 5 al millar (0.5 %) de cada estimación.
          </p>
        ) : (
          <ul className="mt-1 divide-y divide-neutral-100">
            {retenciones.map((r) => (
              <li key={r.id} className="flex flex-wrap items-center justify-between gap-2 py-2 text-sm">
                <span className="text-neutral-900">
                  {r.concepto} · {r.tipo === 'PORCENTAJE' ? pct(r.valor) : `${formatCurrency(r.valor)} por estimación`}
                </span>
                {esAdmin && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    disabled={pendiente}
                    onClick={() => {
                      if (window.confirm(`¿Quitar «${r.concepto}»? Las estimaciones ya enviadas no cambian.`)) {
                        correr(() => quitarRetencionAction(obraId, r.id));
                      }
                    }}
                  >
                    Quitar
                  </Button>
                )}
              </li>
            ))}
          </ul>
        )}
        {esAdmin && (
          <form
            className="mt-2 grid gap-2 sm:grid-cols-[1fr_10rem_8rem_auto] sm:items-end"
            onSubmit={(e) => {
              e.preventDefault();
              const form = e.currentTarget;
              correr(() => agregarRetencionAction(obraId, new FormData(form)), () => form.reset());
            }}
          >
            <Field label="Retención">
              <Input name="concepto" maxLength={120} placeholder="5 al millar" required />
            </Field>
            <Field label="Tipo">
              <Select name="tipo" defaultValue="PORCENTAJE">
                <option value="PORCENTAJE">% del importe</option>
                <option value="MONTO">Monto fijo</option>
              </Select>
            </Field>
            <Field label="Valor">
              <Input name="valor" inputMode="decimal" placeholder="0.5" required />
            </Field>
            <Button type="submit" variant="secondary" disabled={pendiente}>
              Agregar
            </Button>
          </form>
        )}
      </div>

      {error && (
        <p role="alert" className="mt-3 text-sm text-red-700">
          {error}
        </p>
      )}
    </Card>
  );
}

function Dato({ etiqueta, valor }: { etiqueta: string; valor: string }) {
  return (
    <div>
      <dt className="text-xs text-neutral-600">{etiqueta}</dt>
      <dd className="font-medium tabular-nums text-neutral-900">{valor}</dd>
    </div>
  );
}
