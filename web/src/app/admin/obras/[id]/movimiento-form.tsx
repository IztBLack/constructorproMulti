'use client';

import { useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button, Field, Input } from '@/components/ui';
import type { Movimiento, TipoMovimiento } from '@/lib/data/types';
import { actualizarMovimientoAction, crearMovimientoAction } from './actions';

const CATEGORIAS_ENTRADA = ['anticipo', 'pago', 'otros'];
const CATEGORIAS_SALIDA = ['material', 'nómina', 'renta', 'otros'];
const METODOS_PAGO = ['EFECTIVO', 'TRANSFERENCIA', 'CHEQUE', 'OTRO'];

function toDateInputValue(ms: number): string {
  const d = new Date(ms);
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

type MovimientoFormProps =
  | {
      obraId: string;
      mode: 'crear';
      movimiento?: undefined;
      onDone?: () => void;
      onCancel?: () => void;
    }
  | {
      obraId: string;
      mode: 'editar';
      movimiento: Movimiento;
      onDone?: () => void;
      onCancel?: () => void;
    };

export default function MovimientoForm({ obraId, mode, movimiento, onDone, onCancel }: MovimientoFormProps) {
  const router = useRouter();
  const formRef = useRef<HTMLFormElement>(null);
  const [tipo, setTipo] = useState<TipoMovimiento>(movimiento?.tipo ?? 'SALIDA');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fechaDefault] = useState(() => toDateInputValue(movimiento?.fecha ?? Date.now()));

  const categorias = tipo === 'ENTRADA' ? CATEGORIAS_ENTRADA : CATEGORIAS_SALIDA;

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
          className="w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm text-neutral-900 outline-none focus:border-neutral-900"
        >
          <option value="SALIDA">Salida</option>
          <option value="ENTRADA">Entrada</option>
        </select>
      </Field>

      <Field label="Fecha *">
        <Input type="date" name="fecha" required defaultValue={fechaDefault} />
      </Field>

      <Field label="Categoría" hint="Elige una sugerida o escribe la tuya.">
        <input
          name="categoria"
          list="categorias-movimiento"
          defaultValue={movimiento?.categoria ?? ''}
          className="w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm text-neutral-900 outline-none focus:border-neutral-900"
        />
        <datalist id="categorias-movimiento">
          {categorias.map((c) => (
            <option key={c} value={c} />
          ))}
        </datalist>
      </Field>

      <Field label="Método de pago">
        <select
          name="metodo_pago"
          defaultValue={movimiento?.metodo_pago ?? 'EFECTIVO'}
          className="w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm text-neutral-900 outline-none focus:border-neutral-900"
        >
          {METODOS_PAGO.map((m) => (
            <option key={m} value={m}>
              {m}
            </option>
          ))}
        </select>
      </Field>

      <Field label="Concepto *" className="sm:col-span-2">
        <Input name="concepto" required defaultValue={movimiento?.concepto ?? ''} placeholder="Ej. Compra de cemento" />
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

      <Field label="Referencia" hint="Opcional. Folio, cheque, etc.">
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
