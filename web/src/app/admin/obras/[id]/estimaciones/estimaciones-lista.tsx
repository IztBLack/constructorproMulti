'use client';

import { useState, useTransition } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Badge, Button, Card, Field, Input } from '@/components/ui';
import { formatCurrency, formatDate } from '@/lib/data/format';
import type { Acumulados } from '@/lib/estimaciones/calculo';
import {
  ETIQUETA_ESTADO_ESTIMACION,
  TONO_ESTADO_ESTIMACION,
  type EstimacionConRenglones,
} from '@/lib/estimaciones/tipos';
import { crearEstimacionAction } from './actions';

export function EstimacionesLista({
  obraId,
  estimaciones,
  acumulados: ac,
  contratado,
  esAdmin,
  hayPresupuesto,
  sugerenciaInicio,
  hoy,
}: {
  obraId: string;
  estimaciones: EstimacionConRenglones[];
  acumulados: Acumulados;
  contratado: number;
  esAdmin: boolean;
  hayPresupuesto: boolean;
  sugerenciaInicio: string;
  hoy: string;
}) {
  const router = useRouter();
  const [creando, setCreando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pendiente, startTransition] = useTransition();
  const hayBorrador = estimaciones.some((e) => e.estado === 'BORRADOR');

  return (
    <div className="space-y-6">
      <section aria-labelledby="acum-titulo" data-guia="estimaciones-acumulados" className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <h2 id="acum-titulo" className="sr-only">
          Acumulados de la obra
        </h2>
        <Resumen etiqueta="Estimado" valor={formatCurrency(ac.estimado)} nota={contratado > 0 ? `de ${formatCurrency(contratado)} del presupuesto` : undefined} />
        <Resumen etiqueta="Anticipo por amortizar" valor={formatCurrency(ac.anticipoPendiente)} nota={`Amortizado: ${formatCurrency(ac.amortizado)}`} />
        <Resumen etiqueta="Autorizado por cobrar" valor={formatCurrency(ac.porCobrar)} destacado={ac.porCobrar > 0} />
        <Resumen etiqueta="Fondo de garantía retenido" valor={formatCurrency(ac.fondoRetenido)} nota="Se regresa al cerrar la obra" />
      </section>

      {esAdmin && (
        <div className="space-y-3">
          {!creando ? (
            <Button
              type="button"
              data-guia="estimaciones-nueva"
              onClick={() => setCreando(true)}
              disabled={!hayPresupuesto || hayBorrador}
              title={
                hayBorrador
                  ? 'Ya hay una estimación en borrador: termínala o bórrala primero.'
                  : !hayPresupuesto
                    ? 'La obra necesita presupuesto por partidas.'
                    : undefined
              }
            >
              Nueva estimación
            </Button>
          ) : (
            <Card padding="md">
              <h2 className="text-base font-semibold text-neutral-900">Nueva estimación</h2>
              <p className="mt-1 text-sm text-neutral-600">
                Se propone lo que se hizo (según el avance capturado hasta el fin del periodo) y todavía
                no se ha cobrado. Después puedes ajustar cada cantidad.
              </p>
              <form
                className="mt-3 grid gap-3 sm:grid-cols-2"
                onSubmit={(e) => {
                  e.preventDefault();
                  const fd = new FormData(e.currentTarget);
                  setError(null);
                  startTransition(async () => {
                    const r = await crearEstimacionAction(obraId, fd);
                    if (!r.ok || !r.id) {
                      setError(r.error ?? 'No se pudo crear.');
                      return;
                    }
                    router.push(`/admin/obras/${obraId}/estimaciones/${r.id}${r.avisos?.length ? '?excedente=1' : ''}`);
                  });
                }}
              >
                <Field label="Desde">
                  <Input type="date" name="periodo_inicio" defaultValue={sugerenciaInicio > hoy ? hoy : sugerenciaInicio} required />
                </Field>
                <Field label="Hasta">
                  <Input type="date" name="periodo_fin" defaultValue={hoy} required />
                </Field>
                <label className="flex min-h-11 items-center gap-2 text-sm text-neutral-800 sm:col-span-2">
                  <input type="checkbox" name="es_finiquito" className="h-5 w-5 rounded border-neutral-300" />
                  Es la última (finiquito): descuenta todo lo que queda del anticipo
                </label>
                <Field label="Notas (opcional)" className="sm:col-span-2">
                  <Input name="notas" maxLength={2000} />
                </Field>
                <div className="flex flex-wrap gap-2 sm:col-span-2">
                  <Button type="submit" disabled={pendiente}>
                    {pendiente ? 'Calculando…' : 'Crear con lo hecho'}
                  </Button>
                  <Button type="button" variant="ghost" onClick={() => setCreando(false)} disabled={pendiente}>
                    Cancelar
                  </Button>
                </div>
              </form>
            </Card>
          )}
          {error && (
            <p role="alert" className="text-sm text-red-700">
              {error}
            </p>
          )}
        </div>
      )}

      {estimaciones.length === 0 ? (
        <p className="rounded-xl border border-dashed border-neutral-300 p-6 text-center text-sm text-neutral-700">
          Todavía no hay estimaciones.{' '}
          {hayPresupuesto
            ? 'Anota el avance en la pestaña Avance y aquí se propone qué cobrar.'
            : 'Primero la obra necesita su presupuesto por partidas.'}
        </p>
      ) : (
        <ul className="space-y-2">
          {estimaciones.map((e) => (
            <li key={e.id}>
              <Link
                href={`/admin/obras/${obraId}/estimaciones/${e.id}`}
                className="flex flex-wrap items-center gap-3 rounded-xl border border-neutral-200 bg-white p-4 transition hover:border-neutral-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-neutral-900"
              >
                <div className="min-w-0 flex-1">
                  <p className="font-semibold text-neutral-900">
                    Estimación {e.folio}
                    {e.es_finiquito ? ' · finiquito' : ''}
                  </p>
                  <p className="text-sm text-neutral-600">
                    {formatDate(e.periodo_inicio)} al {formatDate(e.periodo_fin)} · {e.renglones.length} partida
                    {e.renglones.length === 1 ? '' : 's'}
                  </p>
                </div>
                <div className="text-right">
                  <p className="text-xs text-neutral-600">A pagar</p>
                  <p className="font-semibold tabular-nums text-neutral-900">{formatCurrency(e.neto)}</p>
                </div>
                <Badge tone={TONO_ESTADO_ESTIMACION[e.estado]}>{ETIQUETA_ESTADO_ESTIMACION[e.estado]}</Badge>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function Resumen({
  etiqueta,
  valor,
  nota,
  destacado,
}: {
  etiqueta: string;
  valor: string;
  nota?: string;
  destacado?: boolean;
}) {
  return (
    <div
      className={`rounded-xl border px-4 py-3 ${destacado ? 'border-amber-300 bg-amber-50' : 'border-neutral-200 bg-white'}`}
    >
      <p className="text-xs font-medium text-neutral-600">{etiqueta}</p>
      <p className="mt-1 text-xl font-semibold tabular-nums text-neutral-900">{valor}</p>
      {nota && <p className="mt-0.5 text-xs text-neutral-600">{nota}</p>}
    </div>
  );
}
