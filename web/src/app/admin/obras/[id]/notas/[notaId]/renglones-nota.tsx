'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Badge, Button, Field, Input, Select } from '@/components/ui';
import type { BadgeTone } from '@/components/ui';
import { formatCurrency, formatDate } from '@/lib/data/format';
import {
  montoEfectivo,
  montoSugerido,
  PASO_ORDEN,
  type RenglonNota,
  type TipoRenglon,
} from '@/lib/data/notas-obra-calculo';
import { msAFechaInput } from '@/lib/data/tz';
import {
  actualizarRenglonAction,
  crearRenglonAction,
  eliminarRenglonAction,
  reordenarRenglonesAction,
} from '../actions';

const ETIQUETA_TIPO: Record<TipoRenglon, string> = {
  CONCEPTO: 'Concepto',
  DEDUCCION: 'Deducción',
  PAGO: 'Pago',
  TEXTO: 'Apunte',
};

const TONO_TIPO: Record<TipoRenglon, BadgeTone> = {
  CONCEPTO: 'blue',
  DEDUCCION: 'amber',
  PAGO: 'green',
  TEXTO: 'neutral',
};

/** El signo con el que el renglón entra en la cuenta, para leerlo de un vistazo. */
const SIGNO: Record<TipoRenglon, string> = {
  CONCEPTO: '',
  DEDUCCION: '−',
  PAGO: '−',
  TEXTO: '',
};

interface FormRenglon {
  tipo: TipoRenglon;
  etiqueta: string;
  monto: string;
  monto_base: string;
  porcentaje: string;
  texto: string;
  fecha: string;
}

const FORM_VACIO: FormRenglon = {
  tipo: 'CONCEPTO',
  etiqueta: '',
  monto: '',
  monto_base: '',
  porcentaje: '',
  texto: '',
  fecha: '',
};

function aForm(r: RenglonNota): FormRenglon {
  return {
    tipo: r.tipo,
    etiqueta: r.etiqueta,
    monto: r.monto === null ? '' : String(r.monto),
    monto_base: r.monto_base === null ? '' : String(r.monto_base),
    porcentaje: r.porcentaje === null ? '' : String(r.porcentaje),
    texto: r.texto,
    fecha: r.fecha === null ? '' : msAFechaInput(r.fecha),
  };
}

function aFormData(form: FormRenglon, orden: number): FormData {
  const fd = new FormData();
  fd.set('tipo', form.tipo);
  fd.set('etiqueta', form.etiqueta);
  fd.set('monto', form.monto);
  fd.set('monto_base', form.monto_base);
  fd.set('porcentaje', form.porcentaje);
  fd.set('texto', form.texto);
  fd.set('fecha', form.fecha);
  fd.set('orden', String(orden));
  return fd;
}

function numeroONull(v: string): number | null {
  const s = v.trim();
  if (s === '') return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

/**
 * Los renglones de una nota. Cada uno se guarda solo, como las partidas del
 * presupuesto: una nota se captura a ratos y guardar todo de golpe obliga a
 * terminarla de una sentada.
 */
export default function RenglonesNota({
  obraId,
  notaId,
  renglones,
  puedeEditar,
}: {
  obraId: string;
  notaId: string;
  renglones: RenglonNota[];
  puedeEditar: boolean;
}) {
  const router = useRouter();
  const [editandoId, setEditandoId] = useState<string | null>(null);
  const [agregando, setAgregando] = useState(false);
  const [form, setForm] = useState<FormRenglon>(FORM_VACIO);
  const [ocupado, setOcupado] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function cancelar() {
    setEditandoId(null);
    setAgregando(false);
    setForm(FORM_VACIO);
    setError(null);
  }

  function editar(r: RenglonNota) {
    setEditandoId(r.id);
    setAgregando(false);
    setForm(aForm(r));
    setError(null);
  }

  function agregar() {
    setAgregando(true);
    setEditandoId(null);
    setForm(FORM_VACIO);
    setError(null);
  }

  async function guardarNuevo() {
    setOcupado(true);
    setError(null);
    const orden = (renglones.length + 1) * PASO_ORDEN;
    const r = await crearRenglonAction(obraId, notaId, aFormData(form, orden));
    setOcupado(false);
    if (!r.ok) {
      setError(r.error ?? 'No se pudo agregar el renglón.');
      return;
    }
    // Se deja el formulario abierto y vacío: los renglones se capturan en
    // ráfaga, uno tras otro, copiando una nota de papel.
    setForm(FORM_VACIO);
    router.refresh();
  }

  async function guardarEdicion(r: RenglonNota) {
    setOcupado(true);
    setError(null);
    const res = await actualizarRenglonAction(obraId, notaId, r.id, aFormData(form, r.orden));
    setOcupado(false);
    if (!res.ok) {
      setError(res.error ?? 'No se pudo guardar el renglón.');
      return;
    }
    cancelar();
    router.refresh();
  }

  async function eliminar(r: RenglonNota) {
    if (!confirm(`¿Quitar "${r.etiqueta}" de la nota?`)) return;
    setOcupado(true);
    setError(null);
    const res = await eliminarRenglonAction(obraId, notaId, r.id);
    setOcupado(false);
    if (!res.ok) {
      setError(res.error ?? 'No se pudo eliminar el renglón.');
      return;
    }
    router.refresh();
  }

  async function mover(indice: number, direccion: -1 | 1) {
    const destino = indice + direccion;
    if (destino < 0 || destino >= renglones.length) return;

    const ids = renglones.map((r) => r.id);
    [ids[indice], ids[destino]] = [ids[destino], ids[indice]];

    setOcupado(true);
    setError(null);
    const res = await reordenarRenglonesAction(obraId, notaId, ids);
    setOcupado(false);
    if (!res.ok) {
      setError(res.error ?? 'No se pudo reordenar.');
      return;
    }
    router.refresh();
  }

  return (
    <div className="space-y-3">
      {error && (
        <p role="alert" className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </p>
      )}

      <ul className="divide-y divide-neutral-200 rounded-xl border border-neutral-200 bg-white">
        {renglones.length === 0 && !agregando && (
          <li className="px-4 py-8 text-center text-sm text-neutral-500">
            La nota está vacía. Agrega el primer trabajo acordado.
          </li>
        )}

        {renglones.map((r, i) =>
          editandoId === r.id ? (
            <li key={r.id} className="bg-neutral-50 px-4 py-4">
              <FormularioRenglon
                form={form}
                onChange={setForm}
                ocupado={ocupado}
                onGuardar={() => guardarEdicion(r)}
                onCancelar={cancelar}
                textoBoton="Guardar"
              />
            </li>
          ) : (
            <li key={r.id} className="flex items-start gap-3 px-4 py-3">
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <Badge tone={TONO_TIPO[r.tipo]}>{ETIQUETA_TIPO[r.tipo]}</Badge>
                  <span className="font-medium text-neutral-900">{r.etiqueta}</span>
                  {r.fecha !== null && (
                    <span className="text-xs text-neutral-500">{formatDate(r.fecha)}</span>
                  )}
                </div>
                {r.texto && <p className="mt-1 text-sm text-neutral-600">{r.texto}</p>}
                {r.monto_base !== null && (
                  <p className="mt-1 text-xs text-neutral-500">
                    {formatCurrency(r.monto_base)}
                    {r.porcentaje !== null && ` − ${r.porcentaje}%`}
                    {' = '}
                    {formatCurrency(montoEfectivo(r))}
                    {r.monto !== null &&
                      montoSugerido(r.tipo, r.monto_base, r.porcentaje) !== r.monto &&
                      ' (fijado a mano)'}
                  </p>
                )}
              </div>

              <div className="shrink-0 text-right">
                {r.tipo !== 'TEXTO' && (
                  <p className="font-semibold tabular-nums text-neutral-900">
                    {SIGNO[r.tipo]}
                    {formatCurrency(montoEfectivo(r))}
                  </p>
                )}

                {puedeEditar && (
                  <div className="mt-1 flex items-center justify-end gap-1">
                    <button
                      type="button"
                      aria-label={`Subir ${r.etiqueta}`}
                      disabled={ocupado || i === 0}
                      onClick={() => mover(i, -1)}
                      className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-neutral-500 transition hover:bg-neutral-100 disabled:opacity-30"
                    >
                      ↑
                    </button>
                    <button
                      type="button"
                      aria-label={`Bajar ${r.etiqueta}`}
                      disabled={ocupado || i === renglones.length - 1}
                      onClick={() => mover(i, 1)}
                      className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-neutral-500 transition hover:bg-neutral-100 disabled:opacity-30"
                    >
                      ↓
                    </button>
                    <Button type="button" variant="ghost" size="sm" onClick={() => editar(r)}>
                      Editar
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      disabled={ocupado}
                      onClick={() => eliminar(r)}
                      className="text-red-600 hover:bg-red-50"
                    >
                      Quitar
                    </Button>
                  </div>
                )}
              </div>
            </li>
          ),
        )}

        {agregando && (
          <li className="bg-neutral-50 px-4 py-4">
            <FormularioRenglon
              form={form}
              onChange={setForm}
              ocupado={ocupado}
              onGuardar={guardarNuevo}
              onCancelar={cancelar}
              textoBoton="Agregar"
            />
          </li>
        )}
      </ul>

      {puedeEditar && !agregando && !editandoId && (
        <Button type="button" variant="secondary" size="sm" onClick={agregar}>
          + Agregar renglón
        </Button>
      )}
    </div>
  );
}

// ── Formulario de un renglón ────────────────────────────────────────────────

function FormularioRenglon({
  form,
  onChange,
  ocupado,
  onGuardar,
  onCancelar,
  textoBoton,
}: {
  form: FormRenglon;
  onChange: (f: FormRenglon) => void;
  ocupado: boolean;
  onGuardar: () => void;
  onCancelar: () => void;
  textoBoton: string;
}) {
  function set<K extends keyof FormRenglon>(campo: K, valor: FormRenglon[K]) {
    onChange({ ...form, [campo]: valor });
  }

  const esTexto = form.tipo === 'TEXTO';
  const sugerido = montoSugerido(form.tipo, numeroONull(form.monto_base), numeroONull(form.porcentaje));

  return (
    <div className="space-y-3">
      <div className="grid gap-3 sm:grid-cols-[10rem_1fr_9rem]">
        <Field label="Tipo">
          <Select value={form.tipo} onChange={(e) => set('tipo', e.target.value as TipoRenglon)}>
            <option value="CONCEPTO">Concepto (suma)</option>
            <option value="DEDUCCION">Deducción (resta)</option>
            <option value="PAGO">Pago o proyección</option>
            <option value="TEXTO">Apunte sin monto</option>
          </Select>
        </Field>

        <Field label="Concepto *">
          <Input
            value={form.etiqueta}
            onChange={(e) => set('etiqueta', e.target.value)}
            placeholder={esTexto ? 'Ej. LIQUIDADO' : 'Ej. BASE DE TINACOS'}
            required
          />
        </Field>

        <Field label="Fecha">
          <Input type="date" value={form.fecha} onChange={(e) => set('fecha', e.target.value)} />
        </Field>
      </div>

      {esTexto ? (
        <Field label="Apunte" hint="El texto que va del lado derecho, como en la nota de papel.">
          <Input
            value={form.texto}
            onChange={(e) => set('texto', e.target.value)}
            placeholder="Ej. BASES DE TINACOS, PRETIL Y RECORTE DE PUERTAS"
          />
        </Field>
      ) : (
        <>
          <div className="grid gap-3 sm:grid-cols-3">
            <Field label="Bruto" hint="Opcional, si quieres enseñar la cuenta completa.">
              <Input
                type="number"
                step="0.01"
                value={form.monto_base}
                onChange={(e) => set('monto_base', e.target.value)}
                placeholder="62000"
              />
            </Field>

            <Field label="Retención %" hint="Opcional.">
              <Input
                type="number"
                step="0.01"
                value={form.porcentaje}
                onChange={(e) => set('porcentaje', e.target.value)}
                placeholder="4"
              />
            </Field>

            <Field
              label="Importe"
              hint={
                sugerido !== null
                  ? `Vacío = ${formatCurrency(sugerido)} (el sugerido).`
                  : 'El monto de este renglón.'
              }
            >
              <Input
                type="number"
                step="0.01"
                value={form.monto}
                onChange={(e) => set('monto', e.target.value)}
                placeholder={sugerido !== null ? String(sugerido) : '0.00'}
              />
            </Field>
          </div>

          <Field label="Aclaración" hint="Opcional. Aparece debajo del concepto.">
            <Input
              value={form.texto}
              onChange={(e) => set('texto', e.target.value)}
              placeholder="Ej. incluye material"
            />
          </Field>
        </>
      )}

      <div className="flex items-center gap-2">
        <Button
          type="button"
          size="sm"
          disabled={ocupado || !form.etiqueta.trim()}
          onClick={onGuardar}
        >
          {ocupado ? 'Guardando…' : textoBoton}
        </Button>
        <Button type="button" variant="ghost" size="sm" disabled={ocupado} onClick={onCancelar}>
          Cerrar
        </Button>
      </div>
    </div>
  );
}
