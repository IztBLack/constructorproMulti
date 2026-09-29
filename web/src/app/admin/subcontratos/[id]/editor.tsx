'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Button, Field, Input, Select, Textarea } from '@/components/ui';
import { formatCurrency, formatDate } from '@/lib/data/format';
import { msAFechaInput } from '@/lib/data/tz';
import { ESTADOS_SUBCONTRATO, calcularPago } from '@/lib/subcontratos/calculo';
import { LARGO_MAXIMO_CLAUSULAS } from '@/lib/subcontratos/clausulas';
import type { SubcontratoCompleto, SubcontratoPago, SubcontratoRenglon } from '@/lib/data/subcontratos';
import {
  actualizarRenglonAction,
  actualizarSubcontratoAction,
  agregarRenglonAction,
  borrarSubcontratoAction,
  guardarClausulasAction,
  quitarPagoAction,
  quitarRenglonAction,
  registrarPagoAction,
} from '../actions';

type Res = { ok: boolean; error?: string; data?: { aviso?: string } | unknown };

const fechaInput = (ms: number | null | undefined) => (ms ? msAFechaInput(ms) : '');

function useAccion() {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const [pendiente, iniciar] = useTransition();
  function correr(fn: () => Promise<Res>, alTerminar?: () => void) {
    setError(null);
    setAviso(null);
    iniciar(async () => {
      const r = await fn();
      if (!r.ok) {
        setError(r.error ?? 'No se pudo guardar.');
        return;
      }
      const a = (r.data as { aviso?: string } | undefined)?.aviso;
      if (a) setAviso(a);
      alTerminar?.();
      router.refresh();
    });
  }
  return { error, aviso, pendiente, correr };
}

function Mensajes({ error, aviso }: { error: string | null; aviso?: string | null }) {
  return (
    <>
      {error && (
        <p role="alert" className="text-sm text-red-600">
          {error}
        </p>
      )}
      {aviso && (
        <p role="status" className="text-sm text-amber-800">
          {aviso}
        </p>
      )}
    </>
  );
}

// ── Datos del contrato ──────────────────────────────────────────────────────

export function DatosContrato({ c, sumaRenglones }: { c: SubcontratoCompleto; sumaRenglones: number }) {
  const { error, pendiente, correr } = useAccion();
  return (
    <form action={(fd) => correr(() => actualizarSubcontratoAction(c.id, fd))} className="grid gap-3 sm:grid-cols-2">
      <Field label="Alcance" className="sm:col-span-2" hint="Qué trabajos incluye el contrato.">
        <Textarea name="alcance" rows={3} maxLength={4000} defaultValue={c.alcance} />
      </Field>
      <Field label="Monto del contrato" hint={`Vacío = suma de los conceptos (${formatCurrency(sumaRenglones)}).`}>
        <Input name="monto" inputMode="decimal" defaultValue={c.monto ?? ''} />
      </Field>
      <Field label="Fondo de garantía (%)" hint="Se retiene de cada pago y se devuelve al terminar.">
        <Input name="retencion_pct" inputMode="decimal" defaultValue={c.retencion_pct} />
      </Field>
      <Field label="Forma de pago" className="sm:col-span-2" hint="Ej. anticipo del 30 % y el resto por avance semanal.">
        <Textarea name="forma_pago" rows={2} maxLength={1000} defaultValue={c.forma_pago} />
      </Field>
      <Field label="Inicio">
        <Input type="date" name="fecha_inicio" defaultValue={fechaInput(c.fecha_inicio)} />
      </Field>
      <Field label="Fin">
        <Input type="date" name="fecha_fin" defaultValue={fechaInput(c.fecha_fin)} />
      </Field>
      <Field label="Estado">
        <Select name="estado" defaultValue={c.estado}>
          {ESTADOS_SUBCONTRATO.map((e) => (
            <option key={e.valor} value={e.valor}>
              {e.texto}
            </option>
          ))}
        </Select>
      </Field>
      <Field label="Fecha de firma">
        <Input type="date" name="fecha_firma" defaultValue={fechaInput(c.fecha_firma)} />
      </Field>
      <Field label="Notas internas" className="sm:col-span-2" hint="No salen en el PDF.">
        <Textarea name="notas" rows={2} maxLength={2000} defaultValue={c.notas} />
      </Field>
      <div className="sm:col-span-2">
        <Button type="submit" disabled={pendiente}>
          {pendiente ? 'Guardando…' : 'Guardar datos'}
        </Button>
      </div>
      <Mensajes error={error} />
    </form>
  );
}

// ── Renglones ───────────────────────────────────────────────────────────────

function CamposRenglon({ r }: { r?: SubcontratoRenglon }) {
  return (
    <>
      <Field label="Concepto *" className="sm:col-span-2">
        <Input name="concepto" required maxLength={500} defaultValue={r?.concepto ?? ''} />
      </Field>
      <Field label="Unidad">
        <Input name="unidad" maxLength={40} defaultValue={r?.unidad ?? ''} placeholder="m², pza, lote" />
      </Field>
      <Field label="Cantidad">
        <Input name="cantidad" inputMode="decimal" defaultValue={r?.cantidad ?? ''} />
      </Field>
      <Field label="Precio unitario">
        <Input name="precio_unitario" inputMode="decimal" defaultValue={r?.precio_unitario ?? ''} />
      </Field>
      <Field label="Importe" hint="Si pones cantidad y P.U., se calcula solo.">
        <Input name="importe" inputMode="decimal" defaultValue={r?.importe ?? ''} />
      </Field>
    </>
  );
}

function FilaRenglon({ subcontratoId, r, puedeEditar }: { subcontratoId: string; r: SubcontratoRenglon; puedeEditar: boolean }) {
  const [editando, setEditando] = useState(false);
  const { error, pendiente, correr } = useAccion();
  if (editando) {
    return (
      <li className="py-3">
        <form
          action={(fd) => correr(() => actualizarRenglonAction(subcontratoId, r.id, fd), () => setEditando(false))}
          className="grid gap-2 sm:grid-cols-4"
        >
          <CamposRenglon r={r} />
          <div className="flex gap-2 sm:col-span-4">
            <Button type="submit" size="sm" disabled={pendiente}>
              Guardar
            </Button>
            <Button type="button" size="sm" variant="ghost" onClick={() => setEditando(false)}>
              Cancelar
            </Button>
          </div>
          <Mensajes error={error} />
        </form>
      </li>
    );
  }
  return (
    <li className="flex flex-wrap items-center justify-between gap-2 py-2">
      <div className="min-w-0">
        <p className="text-sm text-neutral-900">{r.concepto}</p>
        {r.cantidad !== null && r.precio_unitario !== null && (
          <p className="text-xs text-neutral-500">
            {r.cantidad} {r.unidad} × {formatCurrency(r.precio_unitario)}
          </p>
        )}
      </div>
      <div className="flex items-center gap-1">
        <span className="text-sm font-medium text-neutral-900">{formatCurrency(r.importe)}</span>
        {puedeEditar && (
          <>
            <Button type="button" size="sm" variant="ghost" onClick={() => setEditando(true)}>
              Editar
            </Button>
            <Button
              type="button"
              size="sm"
              variant="ghost"
              disabled={pendiente}
              onClick={() => {
                if (window.confirm('¿Quitar este concepto?')) correr(() => quitarRenglonAction(subcontratoId, r.id));
              }}
            >
              Quitar
            </Button>
          </>
        )}
      </div>
      <Mensajes error={error} />
    </li>
  );
}

export function Renglones({ c, puedeEditar }: { c: SubcontratoCompleto; puedeEditar: boolean }) {
  const [agregando, setAgregando] = useState(false);
  const { error, pendiente, correr } = useAccion();
  return (
    <div className="space-y-3">
      {c.renglones.length === 0 ? (
        <p className="text-sm text-neutral-500">Sin conceptos.</p>
      ) : (
        <ul className="divide-y divide-neutral-100">
          {c.renglones.map((r) => (
            <FilaRenglon key={r.id} subcontratoId={c.id} r={r} puedeEditar={puedeEditar} />
          ))}
        </ul>
      )}
      {puedeEditar &&
        (agregando ? (
          <form
            action={(fd) => correr(() => agregarRenglonAction(c.id, fd), () => setAgregando(false))}
            className="grid gap-2 rounded-lg border border-neutral-200 p-3 sm:grid-cols-4"
          >
            <CamposRenglon />
            <div className="flex gap-2 sm:col-span-4">
              <Button type="submit" size="sm" disabled={pendiente}>
                Agregar
              </Button>
              <Button type="button" size="sm" variant="ghost" onClick={() => setAgregando(false)}>
                Cancelar
              </Button>
            </div>
            <Mensajes error={error} />
          </form>
        ) : (
          <Button type="button" size="sm" variant="secondary" onClick={() => setAgregando(true)}>
            Agregar concepto
          </Button>
        ))}
    </div>
  );
}

// ── Pagos ───────────────────────────────────────────────────────────────────

function FilaPago({ subcontratoId, p, puedeEditar }: { subcontratoId: string; p: SubcontratoPago; puedeEditar: boolean }) {
  const { error, aviso, pendiente, correr } = useAccion();
  return (
    <li className="flex flex-wrap items-center justify-between gap-2 py-2">
      <div>
        <p className="text-sm text-neutral-900">
          {formatDate(p.fecha)} · {formatCurrency(p.monto)}
          {p.retencion > 0 && <span className="text-neutral-500"> − {formatCurrency(p.retencion)} retenido</span>}
        </p>
        <p className="text-xs text-neutral-500">
          Salió {formatCurrency(p.monto - p.retencion)}
          {p.metodo_pago && ` · ${p.metodo_pago.toLowerCase()}`}
          {p.referencia && ` · ${p.referencia}`}
          {p.movimiento_id ? ' · registrado en caja' : ''}
        </p>
      </div>
      {puedeEditar && (
        <Button
          type="button"
          size="sm"
          variant="ghost"
          disabled={pendiente}
          onClick={() => {
            if (window.confirm('¿Quitar este pago del contrato?')) correr(() => quitarPagoAction(subcontratoId, p.id));
          }}
        >
          Quitar
        </Button>
      )}
      <Mensajes error={error} aviso={aviso} />
    </li>
  );
}

export function Pagos({
  c,
  puedeEditar,
  conCaja,
  hoy,
}: {
  c: SubcontratoCompleto;
  puedeEditar: boolean;
  conCaja: boolean;
  hoy: string;
}) {
  const [monto, setMonto] = useState('');
  const [retencion, setRetencion] = useState('');
  const { error, aviso, pendiente, correr } = useAccion();
  const bruto = Number(monto.replace(/[$,\s]/g, '')) || 0;
  const sugerido = calcularPago(bruto, c.retencion_pct);
  const fijada = retencion.trim() === '' ? null : Number(retencion.replace(/[$,\s]/g, ''));
  const calculo = calcularPago(bruto, c.retencion_pct, fijada !== null && Number.isFinite(fijada) ? fijada : null);

  return (
    <div className="space-y-3">
      {c.pagos.length === 0 ? (
        <p className="text-sm text-neutral-500">Sin pagos todavía.</p>
      ) : (
        <ul className="divide-y divide-neutral-100">
          {c.pagos.map((p) => (
            <FilaPago key={p.id} subcontratoId={c.id} p={p} puedeEditar={puedeEditar} />
          ))}
        </ul>
      )}
      {puedeEditar && c.estado !== 'CANCELADO' && (
        <form
          action={(fd) =>
            correr(
              () => registrarPagoAction(c.id, fd),
              () => {
                setMonto('');
                setRetencion('');
              },
            )
          }
          className="grid gap-3 rounded-lg border border-neutral-200 p-3 sm:grid-cols-3"
        >
          <Field label="Fecha">
            <Input type="date" name="fecha" defaultValue={hoy} required />
          </Field>
          <Field label="Monto a abonar *" hint="Lo que se abona al contrato, antes de retener.">
            <Input name="monto" inputMode="decimal" required value={monto} onChange={(e) => setMonto(e.target.value)} />
          </Field>
          <Field
            label={`Retención (${c.retencion_pct} %)`}
            hint={bruto > 0 ? `Sugerida: ${formatCurrency(sugerido.retencion)}. Vacío = la sugerida.` : 'Vacío = la sugerida.'}
          >
            <Input name="retencion" inputMode="decimal" value={retencion} onChange={(e) => setRetencion(e.target.value)} />
          </Field>
          <Field label="Forma de pago">
            <Select name="metodo_pago" defaultValue="TRANSFERENCIA">
              <option value="TRANSFERENCIA">Transferencia</option>
              <option value="EFECTIVO">Efectivo</option>
              <option value="CHEQUE">Cheque</option>
              <option value="OTRO">Otro</option>
            </Select>
          </Field>
          <Field label="Referencia">
            <Input name="referencia" maxLength={200} />
          </Field>
          <Field label="Notas">
            <Input name="notas" maxLength={1000} />
          </Field>
          <p className="text-sm text-neutral-700 sm:col-span-3" aria-live="polite">
            Sale de caja: <strong>{formatCurrency(calculo.neto)}</strong>
            {calculo.retencion > 0 && ` (se retienen ${formatCurrency(calculo.retencion)} de fondo de garantía)`}
          </p>
          {conCaja && (
            <label className="flex min-h-11 items-center gap-2 text-sm text-neutral-700 sm:col-span-3">
              <input type="checkbox" name="crear_salida" defaultChecked className="h-5 w-5" />
              Registrar la salida en la caja de la obra
            </label>
          )}
          <div className="sm:col-span-3">
            <Button type="submit" disabled={pendiente}>
              {pendiente ? 'Guardando…' : 'Registrar pago'}
            </Button>
          </div>
          <Mensajes error={error} aviso={aviso} />
        </form>
      )}
      {!puedeEditar && <Mensajes error={error} aviso={aviso} />}
    </div>
  );
}

// ── Cláusulas ───────────────────────────────────────────────────────────────

export function Clausulas({
  c,
  resueltas,
  base,
  puedeEditar,
}: {
  c: SubcontratoCompleto;
  resueltas: string;
  base: string;
  puedeEditar: boolean;
}) {
  const [texto, setTexto] = useState(resueltas);
  const { error, pendiente, correr } = useAccion();
  const propias = c.clausulas !== null;

  if (!puedeEditar) return <p className="whitespace-pre-line text-sm text-neutral-700">{resueltas}</p>;

  return (
    <div className="space-y-2">
      <p className="text-xs text-neutral-500">
        {propias
          ? 'Este contrato tiene cláusulas propias.'
          : 'Son las cláusulas base de la app, armadas con los datos del contrato. Si las editas, se guardan tal cual.'}
      </p>
      <Field label="Cláusulas" hint={`${texto.length} / ${LARGO_MAXIMO_CLAUSULAS} caracteres`}>
        <Textarea rows={14} maxLength={LARGO_MAXIMO_CLAUSULAS} value={texto} onChange={(e) => setTexto(e.target.value)} />
      </Field>
      <div className="flex flex-wrap gap-2">
        <Button type="button" disabled={pendiente || texto.trim() === ''} onClick={() => correr(() => guardarClausulasAction(c.id, texto))}>
          {pendiente ? 'Guardando…' : 'Guardar cláusulas'}
        </Button>
        {propias && (
          <Button
            type="button"
            variant="ghost"
            disabled={pendiente}
            onClick={() => {
              if (window.confirm('¿Volver a las cláusulas base? Se pierde lo que escribiste.')) {
                correr(() => guardarClausulasAction(c.id, null), () => setTexto(base));
              }
            }}
          >
            Volver a las cláusulas base
          </Button>
        )}
      </div>
      <Mensajes error={error} />
    </div>
  );
}

export function BorrarContrato({ id }: { id: string }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pendiente, iniciar] = useTransition();
  return (
    <div className="space-y-1">
      <Button
        type="button"
        variant="danger"
        size="sm"
        disabled={pendiente}
        onClick={() => {
          if (!window.confirm('¿Borrar este contrato? Sus pagos dejan de verse aquí; las salidas en caja se quedan.')) return;
          iniciar(async () => {
            const r = await borrarSubcontratoAction(id);
            if (!r.ok) {
              setError(r.error ?? 'No se pudo borrar.');
              return;
            }
            router.push('/admin/subcontratos');
          });
        }}
      >
        Borrar contrato
      </Button>
      {error && (
        <p role="alert" className="text-sm text-red-600">
          {error}
        </p>
      )}
    </div>
  );
}
