'use client';

import { useState } from 'react';
import { Field, Input } from '@/components/ui';
import type { PeriodoPago } from '@/lib/data/types';
import {
  DIAS_SEMANA_OPCIONES,
  PERIODO_PAGO_LABEL,
  SUELDO_PERIODO_LABEL,
  salarioDiarioDesdePeriodo,
} from '@/lib/data/salario';
import { formatCurrency } from '@/lib/data/format';

const selectClass =
  'w-full cursor-pointer rounded-lg border border-neutral-300 px-3 py-2 text-sm text-neutral-900 outline-none transition focus:border-neutral-900 focus-visible:ring-2 focus-visible:ring-neutral-900/10';

/// Bloque de captura del sueldo del colaborador. El usuario elige el esquema
/// (semanal/quincenal/mensual), los días trabajados/semana y el monto; el
/// salario diario se calcula en vivo y se muestra como referencia (no editable).
export default function SueldoFields({
  defaultPeriodo = 'MENSUAL',
  defaultDiasSemana = 6,
  defaultMonto = '',
}: {
  defaultPeriodo?: PeriodoPago;
  defaultDiasSemana?: number;
  defaultMonto?: string | number | null;
}) {
  const [periodo, setPeriodo] = useState<PeriodoPago>(defaultPeriodo);
  const [diasSemana, setDiasSemana] = useState<number>(defaultDiasSemana);
  const [monto, setMonto] = useState<string>(
    defaultMonto == null || defaultMonto === '' ? '' : String(defaultMonto),
  );

  const montoNum = monto.trim() ? Number(monto) : null;
  const diario = salarioDiarioDesdePeriodo(montoNum, periodo, diasSemana);

  return (
    <div className="grid gap-4 rounded-xl border border-neutral-100 bg-neutral-50/60 p-4 sm:col-span-2 sm:grid-cols-2">
      <p className="text-sm font-medium text-neutral-700 sm:col-span-2">Sueldo</p>

      <Field label="Esquema de pago">
        <select
          name="periodo_pago"
          value={periodo}
          onChange={(e) => setPeriodo(e.target.value as PeriodoPago)}
          className={selectClass}
        >
          {(Object.keys(PERIODO_PAGO_LABEL) as PeriodoPago[]).map((p) => (
            <option key={p} value={p}>
              {PERIODO_PAGO_LABEL[p]}
            </option>
          ))}
        </select>
      </Field>

      <Field label="Días de trabajo por semana">
        <select
          name="dias_semana"
          value={diasSemana}
          onChange={(e) => setDiasSemana(Number(e.target.value))}
          className={selectClass}
        >
          {DIAS_SEMANA_OPCIONES.map((d) => (
            <option key={d} value={d}>
              {d} días
            </option>
          ))}
        </select>
      </Field>

      <Field label={`${SUELDO_PERIODO_LABEL[periodo]} (MXN)`} hint="Vacío para usar el salario del puesto.">
        <Input
          type="number"
          step="0.01"
          min="0"
          name="salario_periodo"
          value={monto}
          onChange={(e) => setMonto(e.target.value)}
          placeholder="0.00"
        />
      </Field>

      <Field label="Salario diario (calculado)" hint="No editable. Es el valor que usa la nómina.">
        <div className="w-full rounded-lg border border-neutral-200 bg-neutral-100 px-3 py-2 text-sm font-medium tabular-nums text-neutral-700">
          {diario != null ? `${formatCurrency(diario)} / día` : '—'}
        </div>
      </Field>
    </div>
  );
}
