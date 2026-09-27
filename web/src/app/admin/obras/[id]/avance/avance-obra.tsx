'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Button, Card, Field, Input, Select } from '@/components/ui';
import { formatDate } from '@/lib/data/format';
import type { AvanceConcepto } from '@/lib/estimaciones/avance';
import type { CapturaAvance, ConceptoContrato } from '@/lib/estimaciones/tipos';
import { borrarCapturaAction, capturarAvanceAction } from './actions';

const num = (n: number) => n.toLocaleString('es-MX', { maximumFractionDigits: 4 });

/** Barra de progreso accesible (el % también va en texto). */
export function BarraAvance({ pct, etiqueta, color = 'bg-green-600' }: { pct: number; etiqueta: string; color?: string }) {
  const v = Math.max(0, Math.min(100, pct));
  return (
    <div
      className="h-2.5 w-full overflow-hidden rounded-full bg-neutral-200"
      role="progressbar"
      aria-valuenow={v}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-label={etiqueta}
    >
      <div className={`h-full rounded-full ${color}`} style={{ width: `${v}%` }} />
    </div>
  );
}

export function AvanceObra({
  obraId,
  conceptos,
  capturas,
  pctObra,
  porConcepto,
  puedeCapturar,
  esAdmin,
  miId,
  hoy,
}: {
  obraId: string;
  conceptos: ConceptoContrato[];
  capturas: CapturaAvance[];
  pctObra: number | null;
  porConcepto: Record<string, AvanceConcepto>;
  puedeCapturar: boolean;
  esAdmin: boolean;
  miId: string | null;
  hoy: string;
}) {
  const router = useRouter();
  const [abierta, setAbierta] = useState<string | null>(null);
  const [mensaje, setMensaje] = useState<{ tipo: 'ok' | 'error'; texto: string } | null>(null);
  const [pendiente, startTransition] = useTransition();

  const nombre = new Map(conceptos.map((c) => [c.clave, c.concepto]));
  const secciones: { titulo: string; items: ConceptoContrato[] }[] = [];
  for (const c of conceptos) {
    const titulo = c.seccion ?? 'Sin sección';
    const s = secciones.find((x) => x.titulo === titulo);
    if (s) s.items.push(c);
    else secciones.push({ titulo, items: [c] });
  }

  function correr(fn: () => Promise<{ ok: boolean; error?: string; aviso?: string }>, despues?: () => void) {
    setMensaje(null);
    startTransition(async () => {
      const r = await fn();
      if (!r.ok) {
        setMensaje({ tipo: 'error', texto: r.error ?? 'No se pudo guardar.' });
        return;
      }
      setMensaje({ tipo: 'ok', texto: r.aviso ?? 'Guardado.' });
      despues?.();
      router.refresh();
    });
  }

  if (conceptos.length === 0) {
    return (
      <p className="rounded-xl border border-dashed border-neutral-300 p-6 text-center text-sm text-neutral-700">
        Esta obra todavía no tiene presupuesto por partidas. Captúralo en Detalle (o conviértela desde
        una cotización) y aquí podrás anotar lo que se hace en cada una.
      </p>
    );
  }

  return (
    <div className="space-y-6">
      <Card padding="md">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="text-base font-semibold text-neutral-900">Avance físico de la obra</h2>
          <p className="text-2xl font-bold tabular-nums text-neutral-900">
            {pctObra === null ? '—' : `${pctObra.toLocaleString('es-MX')} %`}
          </p>
        </div>
        <div className="mt-2">
          <BarraAvance pct={pctObra ?? 0} etiqueta={`Avance físico de la obra: ${pctObra ?? 0} %`} />
        </div>
        <p className="mt-2 text-xs text-neutral-600">
          Pesa cada partida por lo que vale: terminar la losa avanza más que terminar la pintura.
        </p>
      </Card>

      <div aria-live="polite">
        {mensaje && (
          <p
            role={mensaje.tipo === 'error' ? 'alert' : 'status'}
            className={`rounded-lg px-3 py-2 text-sm ${
              mensaje.tipo === 'error' ? 'bg-red-50 text-red-800' : 'bg-green-50 text-green-900'
            }`}
          >
            {mensaje.texto}
          </p>
        )}
      </div>

      {secciones.map((s) => (
        <section key={s.titulo} aria-labelledby={`sec-${s.titulo}`} className="space-y-2">
          <h2 id={`sec-${s.titulo}`} className="text-sm font-medium text-neutral-700">
            {s.titulo}
          </h2>
          <ul className="space-y-2">
            {s.items.map((c) => {
              const a = porConcepto[c.clave];
              const ejecutado = a?.ejecutado ?? 0;
              const pct = a?.pct ?? 0;
              return (
                <li key={c.clave} className="rounded-xl border border-neutral-200 bg-white p-3">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div className="min-w-0 flex-1">
                      <p className="font-medium text-neutral-900">{c.concepto || 'Partida'}</p>
                      <p className="text-sm tabular-nums text-neutral-700">
                        {num(ejecutado)} de {num(c.cantidad)} {c.unidad} · {pct.toLocaleString('es-MX')} %
                      </p>
                    </div>
                    {puedeCapturar && c.cantidad > 0 && (
                      <Button
                        type="button"
                        variant={abierta === c.clave ? 'ghost' : 'secondary'}
                        onClick={() => setAbierta(abierta === c.clave ? null : c.clave)}
                        aria-expanded={abierta === c.clave}
                      >
                        {abierta === c.clave ? 'Cerrar' : 'Anotar avance'}
                      </Button>
                    )}
                  </div>
                  <div className="mt-2">
                    <BarraAvance pct={pct} etiqueta={`${c.concepto}: ${pct} %`} />
                  </div>
                  {a && a.excedente > 0 && (
                    <p className="mt-2 text-sm text-amber-800">
                      Se hizo {num(a.excedente)} {c.unidad} más de lo contratado: cóbralo con un extra.
                    </p>
                  )}
                  {abierta === c.clave && (
                    <FormCaptura
                      concepto={c}
                      ejecutado={ejecutado}
                      hoy={hoy}
                      pendiente={pendiente}
                      alGuardar={(fd) => correr(() => capturarAvanceAction(obraId, fd), () => setAbierta(null))}
                    />
                  )}
                </li>
              );
            })}
          </ul>
        </section>
      ))}

      <section aria-labelledby="capturas-titulo" className="space-y-2">
        <h2 id="capturas-titulo" className="text-sm font-medium text-neutral-700">
          Lo último que se anotó
        </h2>
        {capturas.length === 0 ? (
          <p className="text-sm text-neutral-600">Todavía no se anota avance en esta obra.</p>
        ) : (
          <ul className="divide-y divide-neutral-100 rounded-xl border border-neutral-200 bg-white">
            {capturas.map((k) => {
              const puedeBorrar = esAdmin || (puedeCapturar && k.capturoId === miId);
              return (
                <li key={k.id} className="flex flex-wrap items-center gap-3 p-3 text-sm">
                  <div className="min-w-0 flex-1">
                    <p className="text-neutral-900">
                      <span className="font-medium tabular-nums">
                        {k.cantidad > 0 ? '+' : ''}
                        {num(k.cantidad)}
                      </span>{' '}
                      · {nombre.get(k.clave) ?? 'Partida'}
                    </p>
                    <p className="text-xs text-neutral-600">
                      {formatDate(k.fecha)}
                      {k.capturoNombre ? ` · ${k.capturoNombre}` : ''}
                      {k.nota ? ` · ${k.nota}` : ''}
                    </p>
                  </div>
                  {puedeBorrar && (
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      disabled={pendiente}
                      onClick={() => {
                        if (window.confirm('¿Borrar esta captura de avance?')) {
                          correr(() => borrarCapturaAction(obraId, k.id));
                        }
                      }}
                    >
                      Borrar
                    </Button>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </div>
  );
}

function FormCaptura({
  concepto,
  ejecutado,
  hoy,
  pendiente,
  alGuardar,
}: {
  concepto: ConceptoContrato;
  ejecutado: number;
  hoy: string;
  pendiente: boolean;
  alGuardar: (fd: FormData) => void;
}) {
  const [modo, setModo] = useState<'hoy' | 'total' | 'pct'>('hoy');
  const etiqueta =
    modo === 'hoy'
      ? `Lo que se hizo (${concepto.unidad || 'cantidad'})`
      : modo === 'total'
        ? `Llevamos en total (${concepto.unidad || 'cantidad'})`
        : 'Vamos al (%)';
  const ayuda =
    modo === 'hoy'
      ? 'Si te pasaste en una captura anterior, pon la corrección en negativo.'
      : modo === 'total'
        ? `Hoy van ${num(ejecutado)} ${concepto.unidad}. Se guarda la diferencia.`
        : `De ${num(concepto.cantidad)} ${concepto.unidad} contratados. Se guarda la diferencia.`;

  return (
    <form
      className="mt-3 grid gap-3 border-t border-neutral-100 pt-3 sm:grid-cols-2"
      onSubmit={(e) => {
        e.preventDefault();
        const fd = new FormData(e.currentTarget);
        fd.set('clave', concepto.clave);
        fd.set('modo', modo);
        alGuardar(fd);
      }}
    >
      <Field label="Cómo lo anotas" className="sm:col-span-2">
        <Select value={modo} onChange={(e) => setModo(e.target.value as typeof modo)}>
          <option value="hoy">Lo que se hizo (desde la última vez)</option>
          <option value="total">Lo que llevamos en total</option>
          <option value="pct">El porcentaje que llevamos</option>
        </Select>
      </Field>
      <Field label={etiqueta} hint={ayuda}>
        <Input
          name="valor"
          inputMode="decimal"
          required
          autoFocus
          pattern="-?[0-9]*[.,]?[0-9]*"
        />
      </Field>
      <Field label="Día">
        <Input type="date" name="fecha" defaultValue={hoy} max={hoy} required />
      </Field>
      <Field label="Cómo se midió (opcional)" hint="Ejes, medidas o dónde fue. Sirve de número generador." className="sm:col-span-2">
        <Input name="nota" maxLength={500} placeholder="Ej. eje 1-3, 12.5 × 3.2" />
      </Field>
      <div className="sm:col-span-2">
        <Button type="submit" disabled={pendiente} className="w-full sm:w-auto">
          {pendiente ? 'Guardando…' : 'Guardar avance'}
        </Button>
      </div>
    </form>
  );
}
