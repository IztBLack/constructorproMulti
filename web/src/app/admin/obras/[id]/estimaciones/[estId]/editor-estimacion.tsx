'use client';

import { useState, useTransition } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Badge, Button, Card, Field, Input, LinkButton, Select } from '@/components/ui';
import { formatCurrency, formatDate } from '@/lib/data/format';
import { msAFechaInput } from '@/lib/data/tz';
import { validarRenglones } from '@/lib/estimaciones/calculo';
import type { FotoEstimacion } from '@/lib/estimaciones/snapshot';
import {
  ETIQUETA_ESTADO_ESTIMACION,
  LARGO_MOTIVO_RECHAZO,
  TONO_ESTADO_ESTIMACION,
  claveDe,
  type ConceptoContrato,
  type EstimacionConRenglones,
} from '@/lib/estimaciones/tipos';
import {
  agregarPartidaAction,
  eliminarEstimacionAction,
  enviarEstimacionAction,
  fijarCantidadAction,
  guardarDatosEstimacionAction,
  marcarCobradaAction,
  recalcularAction,
  registrarRespuestaAction,
} from '../actions';

const cant = (n: number) => n.toLocaleString('es-MX', { maximumFractionDigits: 4 });
const pct = (n: number) => `${n.toLocaleString('es-MX', { maximumFractionDigits: 4 })} %`;

interface Vista {
  estimacion: EstimacionConRenglones;
  foto: FotoEstimacion;
  conceptos: ConceptoContrato[];
  estimadoPrevio: Record<string, number>;
  anticipoPendiente: number;
}

export function EditorEstimacion({
  obraId,
  obraNombre,
  vista,
  entradas,
  esAdmin,
  puedeCobrar,
  verFacturacion,
  avisoExcedente,
  hoy,
}: {
  obraId: string;
  obraNombre: string;
  vista: Vista;
  entradas: { id: string; fecha: number; monto: number; concepto: string }[];
  esAdmin: boolean;
  puedeCobrar: boolean;
  verFacturacion: boolean;
  avisoExcedente: boolean;
  hoy: string;
}) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);
  const [pendiente, startTransition] = useTransition();
  const { estimacion: e, foto: f } = vista;
  const borrador = e.estado === 'BORRADOR';
  const editable = borrador && esAdmin;
  const base = `/admin/obras/${obraId}/estimaciones`;

  function correr(fn: () => Promise<{ ok: boolean; error?: string }>, exito?: string, despues?: () => void) {
    setError(null);
    setOk(null);
    startTransition(async () => {
      const r = await fn();
      if (!r.ok) {
        setError(r.error ?? 'No se pudo.');
        return;
      }
      if (exito) setOk(exito);
      despues?.();
      router.refresh();
    });
  }

  const previo = new Map(Object.entries(vista.estimadoPrevio));
  const problemas = borrador
    ? validarRenglones(
        e.renglones.map((r) => ({ clave: claveDe(r), concepto: r.concepto, cantidad: r.cantidad })),
        vista.conceptos,
        previo,
      )
    : [];
  const enEstimacion = new Set(e.renglones.map((r) => claveDe(r)));
  const disponibles = vista.conceptos.filter(
    (c) => !enEstimacion.has(c.clave) && c.cantidad > (previo.get(c.clave) ?? 0),
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <Link href={base} className="inline-flex min-h-11 items-center text-sm text-neutral-600 hover:underline">
            ← Estimaciones
          </Link>
          <h1 className="text-xl font-semibold text-neutral-900">
            Estimación {e.folio}
            {e.es_finiquito ? ' · finiquito' : ''}
          </h1>
          <p className="text-sm text-neutral-600">
            {obraNombre} · {formatDate(e.periodo_inicio)} al {formatDate(e.periodo_fin)}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Badge tone={TONO_ESTADO_ESTIMACION[e.estado]}>{ETIQUETA_ESTADO_ESTIMACION[e.estado]}</Badge>
          <LinkButton href={`${base}/${e.id}/pdf`} variant="secondary">
            PDF con generadores
          </LinkButton>
          {verFacturacion && (e.estado === 'AUTORIZADA' || e.estado === 'COBRADA') && (
            <LinkButton href={`/admin/facturacion/hoja/estimacion/${e.id}`} variant="secondary">
              Hoja para facturar
            </LinkButton>
          )}
        </div>
      </div>

      {avisoExcedente && borrador && (
        <p className="rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-900">
          En alguna partida se hizo más de lo contratado. Eso no entra en la estimación: cóbralo con un
          extra (pestaña Extras) y, cuando el cliente lo apruebe, se podrá estimar.
        </p>
      )}

      <div aria-live="polite">
        {error && (
          <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-800">
            {error}
          </p>
        )}
        {ok && (
          <p role="status" className="rounded-lg bg-green-50 px-3 py-2 text-sm text-green-900">
            {ok}
          </p>
        )}
      </div>

      {editable && (
        <Card padding="md">
          <h2 className="text-base font-semibold text-neutral-900">Periodo</h2>
          <form
            className="mt-3 grid gap-3 sm:grid-cols-2"
            onSubmit={(ev) => {
              ev.preventDefault();
              const fd = new FormData(ev.currentTarget);
              correr(() => guardarDatosEstimacionAction(obraId, e.id, fd), 'Guardado.');
            }}
          >
            <Field label="Desde">
              <Input type="date" name="periodo_inicio" defaultValue={msAFechaInput(e.periodo_inicio)} required />
            </Field>
            <Field label="Hasta">
              <Input type="date" name="periodo_fin" defaultValue={msAFechaInput(e.periodo_fin)} required />
            </Field>
            <label className="flex min-h-11 items-center gap-2 text-sm text-neutral-800 sm:col-span-2">
              <input type="checkbox" name="es_finiquito" defaultChecked={e.es_finiquito} className="h-5 w-5 rounded border-neutral-300" />
              Es la última (finiquito): descuenta todo lo que queda del anticipo
            </label>
            <Field label="Notas" className="sm:col-span-2">
              <Input name="notas" maxLength={2000} defaultValue={e.notas} />
            </Field>
            <div className="sm:col-span-2">
              <Button type="submit" variant="secondary" disabled={pendiente}>
                Guardar periodo
              </Button>
            </div>
          </form>
        </Card>
      )}

      <section aria-labelledby="partidas-titulo" className="space-y-2">
        <h2 id="partidas-titulo" className="text-base font-semibold text-neutral-900">
          Lo que se cobra
        </h2>
        {f.renglones.length === 0 ? (
          <p className="rounded-xl border border-dashed border-neutral-300 p-4 text-sm text-neutral-700">
            No hay partidas. {editable ? 'Agrega una abajo o anota avance y crea otra estimación.' : ''}
          </p>
        ) : (
          <ul className="space-y-2">
            {f.renglones.map((r, i) => {
              const vivo = e.renglones[i];
              return (
                <li key={vivo?.id ?? i} className="rounded-xl border border-neutral-200 bg-white p-3">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div className="min-w-0 flex-1">
                      <p className="font-medium text-neutral-900">{r.concepto}</p>
                      <p className="text-xs text-neutral-600">
                        {r.seccion ? `${r.seccion} · ` : ''}Contratado {cant(r.contratado)} {r.unidad} · antes{' '}
                        {cant(r.anterior)} · acumulado {cant(r.acumulado)}
                      </p>
                    </div>
                    <p className="text-right font-semibold tabular-nums text-neutral-900">{formatCurrency(r.importe)}</p>
                  </div>
                  {editable && vivo ? (
                    <form
                      className="mt-2 flex flex-wrap items-end gap-2"
                      onSubmit={(ev) => {
                        ev.preventDefault();
                        const v = String(new FormData(ev.currentTarget).get('cantidad') ?? '');
                        correr(() => fijarCantidadAction(obraId, e.id, vivo.id, v));
                      }}
                    >
                      <Field label={`Esta estimación (${r.unidad || 'cantidad'})`} hint={`× ${formatCurrency(r.precioUnitario)}`}>
                        <Input name="cantidad" inputMode="decimal" defaultValue={String(vivo.cantidad)} key={vivo.cantidad} className="w-36" />
                      </Field>
                      <Button type="submit" variant="secondary" disabled={pendiente}>
                        Guardar
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        disabled={pendiente}
                        onClick={() => correr(() => fijarCantidadAction(obraId, e.id, vivo.id, '0'))}
                      >
                        Quitar
                      </Button>
                    </form>
                  ) : (
                    <p className="mt-1 text-sm tabular-nums text-neutral-700">
                      {cant(r.cantidad)} {r.unidad} × {formatCurrency(r.precioUnitario)}
                    </p>
                  )}
                </li>
              );
            })}
          </ul>
        )}

        {problemas.length > 0 && (
          <ul role="alert" className="list-disc space-y-1 rounded-lg bg-red-50 py-2 pl-8 pr-3 text-sm text-red-800">
            {problemas.map((p) => (
              <li key={p.clave + p.mensaje}>{p.mensaje}</li>
            ))}
          </ul>
        )}

        {editable && disponibles.length > 0 && <AgregarPartida
          disponibles={disponibles}
          previo={previo}
          pendiente={pendiente}
          alAgregar={(clave, valor) => correr(() => agregarPartidaAction(obraId, e.id, clave, valor))}
        />}
      </section>

      <Card padding="md">
        <h2 className="text-base font-semibold text-neutral-900">Cuentas</h2>
        <dl className="mt-2 space-y-1 text-sm">
          <Fila etiqueta="Importe de lo ejecutado" valor={formatCurrency(f.importes.bruto)} />
          {f.importes.amortizacion > 0 && (
            <Fila
              etiqueta={`Amortización del anticipo (${pct(f.contrato.amortizacionPct)}${f.esFiniquito ? ', finiquito' : ''})`}
              valor={`−${formatCurrency(f.importes.amortizacion)}`}
              rojo
            />
          )}
          <Fila etiqueta="Subtotal" valor={formatCurrency(f.importes.subtotal)} />
          {f.importes.iva > 0 && <Fila etiqueta={`IVA (${pct(f.importes.ivaPct)})`} valor={formatCurrency(f.importes.iva)} />}
          <Fila etiqueta="Total" valor={formatCurrency(f.importes.total)} />
          {f.importes.fondoGarantia > 0 && (
            <Fila
              etiqueta={`Fondo de garantía (${pct(f.importes.fondoGarantiaPct)})`}
              valor={`−${formatCurrency(f.importes.fondoGarantia)}`}
              rojo
            />
          )}
          {f.importes.retenciones
            .filter((r) => r.importe > 0)
            .map((r) => (
              <Fila key={r.concepto} etiqueta={r.concepto} valor={`−${formatCurrency(r.importe)}`} rojo />
            ))}
        </dl>
        <p className="mt-3 flex items-baseline justify-between border-t border-neutral-200 pt-3">
          <span className="font-medium text-neutral-800">El cliente paga</span>
          <span className="text-2xl font-bold tabular-nums text-neutral-900">{formatCurrency(f.importes.neto)}</span>
        </p>
        {f.contrato.anticipo > 0 && (
          <p className="mt-1 text-xs text-neutral-600">
            Del anticipo de {formatCurrency(f.contrato.anticipo)} quedarán {formatCurrency(f.contrato.anticipoPorAmortizar)} por
            amortizar.
          </p>
        )}
        {editable && (
          <div className="mt-4 flex flex-wrap gap-2">
            <Button
              type="button"
              disabled={pendiente || problemas.length > 0 || e.renglones.length === 0}
              onClick={() => {
                if (
                  window.confirm(
                    `¿Enviar la estimación ${e.folio} al cliente por ${formatCurrency(f.importes.neto)}? Ya no se podrá cambiar.`,
                  )
                ) {
                  correr(() => enviarEstimacionAction(obraId, e.id), 'Enviada al cliente.');
                }
              }}
            >
              Enviar al cliente
            </Button>
            <Button type="button" variant="secondary" disabled={pendiente} onClick={() => correr(() => recalcularAction(obraId, e.id), 'Cuentas al día.')}>
              Volver a calcular
            </Button>
            <Button
              type="button"
              variant="danger"
              disabled={pendiente}
              onClick={() => {
                if (window.confirm('¿Borrar este borrador?')) {
                  startTransition(async () => {
                    const r = await eliminarEstimacionAction(obraId, e.id);
                    if (!r.ok) setError(r.error ?? 'No se pudo borrar.');
                    else router.push(base);
                  });
                }
              }}
            >
              Borrar borrador
            </Button>
          </div>
        )}
      </Card>

      <Respuesta e={e} />

      {e.estado === 'ENVIADA' && esAdmin && (
        <RespuestaOficina pendiente={pendiente} alResponder={(si, quien, motivo) =>
          correr(() => registrarRespuestaAction(obraId, e.id, si, quien, motivo), si ? 'Autorización registrada.' : 'Rechazo registrado.')
        } />
      )}

      {puedeCobrar && (e.estado === 'AUTORIZADA' || (e.estado === 'COBRADA' && !e.movimiento_id)) && (
        <Cobro
          estado={e.estado}
          neto={f.importes.neto}
          entradas={entradas}
          hoy={hoy}
          pendiente={pendiente}
          alCobrar={(fd) => correr(() => marcarCobradaAction(obraId, e.id, fd), 'Listo.')}
        />
      )}
    </div>
  );
}

function Fila({ etiqueta, valor, rojo }: { etiqueta: string; valor: string; rojo?: boolean }) {
  return (
    <div className="flex justify-between gap-3">
      <dt className="text-neutral-700">{etiqueta}</dt>
      <dd className={`tabular-nums ${rojo ? 'text-red-700' : 'text-neutral-900'}`}>{valor}</dd>
    </div>
  );
}

function AgregarPartida({
  disponibles,
  previo,
  pendiente,
  alAgregar,
}: {
  disponibles: ConceptoContrato[];
  previo: Map<string, number>;
  pendiente: boolean;
  alAgregar: (clave: string, valor: string) => void;
}) {
  return (
    <form
      className="grid gap-2 rounded-xl border border-dashed border-neutral-300 p-3 sm:grid-cols-[1fr_9rem_auto] sm:items-end"
      onSubmit={(ev) => {
        ev.preventDefault();
        const fd = new FormData(ev.currentTarget);
        alAgregar(String(fd.get('clave') ?? ''), String(fd.get('cantidad') ?? ''));
      }}
    >
      <Field label="Agregar una partida">
        <Select name="clave" required defaultValue="">
          <option value="" disabled>
            Elige…
          </option>
          {disponibles.map((c) => (
            <option key={c.clave} value={c.clave}>
              {c.seccion ? `${c.seccion} · ` : ''}
              {c.concepto} (quedan {cant(c.cantidad - (previo.get(c.clave) ?? 0))} {c.unidad})
            </option>
          ))}
        </Select>
      </Field>
      <Field label="Cantidad">
        <Input name="cantidad" inputMode="decimal" required />
      </Field>
      <Button type="submit" variant="secondary" disabled={pendiente}>
        Agregar
      </Button>
    </form>
  );
}

function Respuesta({ e }: { e: EstimacionConRenglones }) {
  if (!e.respondido_at) return null;
  const via = e.respuesta_origen === 'OFICINA' ? ' (lo registró la oficina)' : ' (en su portal)';
  if (e.estado === 'RECHAZADA') {
    return (
      <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-900">
        Rechazada{e.respondido_nombre ? ` por ${e.respondido_nombre}` : ''} el {formatDate(e.respondido_at)}
        {via}. {e.motivo_rechazo ? `Motivo: ${e.motivo_rechazo}. ` : ''}Corrige y haz otra estimación: sus
        cantidades ya quedaron libres.
      </p>
    );
  }
  return (
    <p className="rounded-lg bg-green-50 px-3 py-2 text-sm text-green-900">
      Autorizada{e.respondido_nombre ? ` por ${e.respondido_nombre}` : ''} el {formatDate(e.respondido_at)}
      {via}.{e.cobrado_at ? ` Cobrada el ${formatDate(e.cobrado_at)}.` : ''}
    </p>
  );
}

function RespuestaOficina({
  pendiente,
  alResponder,
}: {
  pendiente: boolean;
  alResponder: (autorizar: boolean, quien: string, motivo: string) => void;
}) {
  const [quien, setQuien] = useState('');
  const [motivo, setMotivo] = useState('');
  return (
    <Card padding="md">
      <h2 className="text-base font-semibold text-neutral-900">¿Te la autorizaron por fuera?</h2>
      <p className="mt-1 text-sm text-neutral-600">
        Si el cliente la firmó en papel o te contestó por WhatsApp, regístralo aquí. Queda marcado que lo
        registró la oficina.
      </p>
      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        <Field label="¿Quién la autorizó o rechazó?">
          <Input value={quien} onChange={(ev) => setQuien(ev.target.value)} maxLength={120} placeholder="Ing. Pérez (residente)" />
        </Field>
        <Field label="Motivo (si la rechazaron)">
          <Input value={motivo} onChange={(ev) => setMotivo(ev.target.value)} maxLength={LARGO_MOTIVO_RECHAZO} />
        </Field>
      </div>
      <div className="mt-3 flex flex-wrap gap-2">
        <Button type="button" disabled={pendiente || !quien.trim()} onClick={() => alResponder(true, quien, '')}>
          Registrar autorización
        </Button>
        <Button
          type="button"
          variant="secondary"
          disabled={pendiente || !quien.trim() || !motivo.trim()}
          onClick={() => alResponder(false, quien, motivo)}
        >
          Registrar rechazo
        </Button>
      </div>
    </Card>
  );
}

function Cobro({
  estado,
  neto,
  entradas,
  hoy,
  pendiente,
  alCobrar,
}: {
  estado: string;
  neto: number;
  entradas: { id: string; fecha: number; monto: number; concepto: string }[];
  hoy: string;
  pendiente: boolean;
  alCobrar: (fd: FormData) => void;
}) {
  const [modo, setModo] = useState<'registrar' | 'ligar' | 'nada'>(estado === 'COBRADA' ? 'ligar' : 'registrar');
  return (
    <Card padding="md">
      <h2 className="text-base font-semibold text-neutral-900">
        {estado === 'COBRADA' ? 'Ligar el pago a la caja' : 'Ya te pagaron'}
      </h2>
      <form
        className="mt-3 grid gap-3 sm:grid-cols-2"
        onSubmit={(ev) => {
          ev.preventDefault();
          const fd = new FormData(ev.currentTarget);
          fd.set('modo', modo);
          alCobrar(fd);
        }}
      >
        <Field label="¿Cómo lo anotas en caja?" className="sm:col-span-2">
          <Select value={modo} onChange={(ev) => setModo(ev.target.value as typeof modo)}>
            {estado !== 'COBRADA' && <option value="registrar">Registrar la entrada ahora por {formatCurrency(neto)}</option>}
            <option value="ligar">Ya está en caja: elegir la entrada</option>
            {estado !== 'COBRADA' && <option value="nada">Solo marcarla cobrada</option>}
          </Select>
        </Field>
        {modo === 'registrar' && (
          <>
            <Field label="Día del pago">
              <Input type="date" name="fecha" defaultValue={hoy} max={hoy} required />
            </Field>
            <Field label="Forma de pago">
              <Select name="metodo_pago" defaultValue="TRANSFERENCIA">
                <option value="TRANSFERENCIA">Transferencia</option>
                <option value="EFECTIVO">Efectivo</option>
                <option value="CHEQUE">Cheque</option>
              </Select>
            </Field>
            <Field label="Referencia (opcional)" className="sm:col-span-2">
              <Input name="referencia" maxLength={120} />
            </Field>
          </>
        )}
        {modo === 'ligar' && (
          <Field label="Entrada de caja" className="sm:col-span-2">
            <Select name="movimiento_id" required defaultValue="">
              <option value="" disabled>
                Elige…
              </option>
              {entradas.map((m) => (
                <option key={m.id} value={m.id}>
                  {formatDate(m.fecha)} · {m.concepto} · {formatCurrency(m.monto)}
                </option>
              ))}
            </Select>
          </Field>
        )}
        <div className="sm:col-span-2">
          <Button type="submit" disabled={pendiente}>
            {estado === 'COBRADA' ? 'Ligar entrada' : 'Marcar cobrada'}
          </Button>
        </div>
      </form>
    </Card>
  );
}
