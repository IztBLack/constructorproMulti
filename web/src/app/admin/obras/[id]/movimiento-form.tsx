'use client';

import { useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button, Field, Input } from '@/components/ui';
import type { Movimiento, TipoMovimiento } from '@/lib/data/types';
import { msAFechaInput } from '@/lib/data/tz';
import { actualizarMovimientoAction, crearMovimientoAction } from './actions';

const CONCEPTOS_FRECUENTES = [
  'Anticipo construcción',
  'Anticipo alberca',
  'Materiales',
  'Planos',
  'Comisión',
  'Fontanero',
  'Eléctrico',
  'Acero',
  'Casetones',
  'Demolición',
];

const METODOS_PAGO = ['EFECTIVO', 'TRANSFERENCIA', 'CHEQUE', 'OTRO'];

const toDateInputValue = msAFechaInput; // 'YYYY-MM-DD' en zona México

/** Sugerencias de autocompletado (historial de la obra). Paridad móvil. */
export interface SugerenciasMovimiento {
  conceptos: string[];
  nombres: string[];
}

type MovimientoFormProps =
  | {
      obraId: string;
      mode: 'crear';
      movimiento?: undefined;
      sugerencias?: SugerenciasMovimiento;
      onDone?: () => void;
      onCancel?: () => void;
    }
  | {
      obraId: string;
      mode: 'editar';
      movimiento: Movimiento;
      sugerencias?: SugerenciasMovimiento;
      onDone?: () => void;
      onCancel?: () => void;
    };

export default function MovimientoForm({
  obraId,
  mode,
  movimiento,
  sugerencias,
  onDone,
  onCancel,
}: MovimientoFormProps) {
  // Conceptos: historial de la obra + defaults útiles (para obras sin historial).
  const conceptosDatalist = [
    ...new Set([...(sugerencias?.conceptos ?? []), ...CONCEPTOS_FRECUENTES]),
  ];
  const nombresDatalist = sugerencias?.nombres ?? [];
  const router = useRouter();
  const formRef = useRef<HTMLFormElement>(null);
  const [tipo, setTipo] = useState<TipoMovimiento>(movimiento?.tipo ?? 'SALIDA');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fechaDefault] = useState(() => toDateInputValue(movimiento?.fecha ?? Date.now()));

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    const formData = new FormData(e.currentTarget);

    const result =
      mode === 'editar'
        ? await actualizarMovimientoAction(movimiento.id, obraId, formData)
        : await crearMovimientoAction(obraId, formData);

    setLoading(false);
    if (!result.ok) {
      setError(result.error ?? 'No se pudo guardar el movimiento.');
      return;
    }

    formRef.current?.reset();
    router.refresh();
    onDone?.();
  }

  return (
    <form ref={formRef} onSubmit={onSubmit} className="grid gap-4 sm:grid-cols-2">
      <Field label="Tipo *">
        <select
          name="tipo"
          value={tipo}
          onChange={(e) => setTipo(e.target.value as TipoMovimiento)}
          className="w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm text-neutral-900 outline-none transition focus:border-neutral-900 cursor-pointer"
        >
          <option value="SALIDA">Salida</option>
          <option value="ENTRADA">Entrada</option>
        </select>
      </Field>

      <Field label="Fecha *">
        <Input type="date" name="fecha" required defaultValue={fechaDefault} />
      </Field>

      <Field label="Concepto / Categoría *" hint="Elige una sugerida o escribe la tuya.">
        <input
          name="concepto"
          list="conceptos-frecuentes"
          required
          defaultValue={movimiento?.concepto ?? ''}
          placeholder="Ej. Anticipo construcción"
          className="w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm text-neutral-900 outline-none transition placeholder:text-neutral-400 focus:border-neutral-900"
        />
        <datalist id="conceptos-frecuentes">
          {conceptosDatalist.map((c) => (
            <option key={c} value={c} />
          ))}
        </datalist>
      </Field>

      <Field label="Categoría" hint="Clasificación interna opcional.">
        <Input
          name="categoria"
          defaultValue={movimiento?.categoria ?? ''}
          placeholder="Ej. materiales"
        />
      </Field>

      <Field label="Nombre" hint="A quién se paga o de quién se recibe.">
        <input
          name="nombre"
          list="nombres-frecuentes"
          defaultValue={movimiento?.nombre ?? ''}
          placeholder="Ej. Juan García"
          className="w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm text-neutral-900 outline-none transition placeholder:text-neutral-400 focus:border-neutral-900"
        />
        <datalist id="nombres-frecuentes">
          {nombresDatalist.map((n) => (
            <option key={n} value={n} />
          ))}
        </datalist>
      </Field>

      <Field label="Canal de pago">
        <select
          name="metodo_pago"
          defaultValue={movimiento?.metodo_pago ?? 'EFECTIVO'}
          className="w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm text-neutral-900 outline-none transition focus:border-neutral-900 cursor-pointer"
        >
          {METODOS_PAGO.map((m) => (
            <option key={m} value={m}>
              {m}
            </option>
          ))}
        </select>
      </Field>

      <Field label="Monto (MXN) *">
        <Input
          type="number"
          name="monto"
          step="0.01"
          min="0.01"
          required
          defaultValue={movimiento?.monto ?? ''}
          placeholder="0.00"
        />
      </Field>

      <Field label="Observaciones" hint="Opcional. Folio, cheque, nota.">
        <Input name="referencia" defaultValue={movimiento?.referencia ?? ''} />
      </Field>

      {error && <p className="text-sm text-red-600 sm:col-span-2">{error}</p>}

      <div className="flex items-center gap-3 sm:col-span-2">
        <Button type="submit" disabled={loading}>
          {loading ? 'Guardando…' : mode === 'editar' ? 'Guardar cambios' : 'Registrar movimiento'}
        </Button>
        {onCancel && (
          <Button type="button" variant="ghost" onClick={onCancel} disabled={loading}>
            Cancelar
          </Button>
        )}
      </div>
    </form>
  );
}
