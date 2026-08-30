'use client';

import { formatCurrency } from '@/lib/data/format';
import {
  DIAS_SEMANA_OPCIONES,
  PERIODO_PAGO_LABEL,
  SUELDO_PERIODO_LABEL,
  salarioDiarioDesdePeriodo,
} from '@/lib/data/salario';
import type { PeriodoPago } from '@/lib/data/types';
import type { SueldoProyectado } from '@/lib/data/proyeccion-nomina';
import { APAGADO, FOCO } from './estilos';

interface Props {
  valor: SueldoProyectado;
  onCambiar: (sueldo: SueldoProyectado) => void;
  deshabilitado?: boolean;
  /// Etiqueta del bloque; en la hoja masiva no es «Sueldo» sino «Sueldo del
  /// grupo», y decirlo evita creer que se está tocando el de una persona.
  titulo?: string;
}

const PERIODOS: PeriodoPago[] = ['SEMANAL', 'QUINCENAL', 'MENSUAL'];

/// Un solo control para capturar el sueldo: esquema, días/semana, monto, y el
/// diario calculado al lado, **no editable**.
///
/// La fórmula NO se reimplementa aquí: es `salarioDiarioDesdePeriodo`, la única
/// del proyecto, la misma que usa el catálogo y la misma que el móvil. El diario
/// se enseña como referencia porque es lo que consume el cálculo, y verlo evita
/// la pregunta «¿de dónde salió ese número?».
///
/// Vive suelto y no dentro de la ficha porque lo usan tres sitios —la ficha de
/// la persona, la de la plaza y el sueldo en bloque de la hoja masiva— y
/// copiarlo tres veces garantizaría que los tres se comporten distinto con el
/// tiempo. Espeja `sueldo_editor.dart` del móvil.
export function EditorSueldo({ valor, onCambiar, deshabilitado, titulo }: Props) {
  const diario = salarioDiarioDesdePeriodo(valor.monto, valor.periodo, valor.diasSemana);

  return (
    <fieldset disabled={deshabilitado} className="space-y-2">
      {titulo && (
        <legend className="text-xs font-semibold uppercase tracking-wider text-neutral-500">
          {titulo}
        </legend>
      )}

      <div className="flex flex-wrap gap-1.5">
        {PERIODOS.map((p) => (
          <button
            key={p}
            type="button"
            onClick={() => onCambiar({ ...valor, periodo: p })}
            className={`min-h-9 rounded-lg border px-3 text-sm ${FOCO} ${APAGADO} ${
              valor.periodo === p
                ? 'border-neutral-900 bg-neutral-900 text-white'
                : 'border-neutral-300 dark:border-neutral-700'
            }`}
          >
            {PERIODO_PAGO_LABEL[p]}
          </button>
        ))}
      </div>

      <div className="flex flex-wrap items-end gap-3">
        <label className="text-sm">
          <span className="block text-xs text-neutral-500">
            {SUELDO_PERIODO_LABEL[valor.periodo]}
          </span>
          <input
            type="number"
            min={0}
            step={100}
            value={valor.monto || ''}
            onChange={(e) =>
              onCambiar({ ...valor, monto: Math.abs(Number(e.target.value) || 0) })
            }
            className={`mt-1 w-36 rounded-lg border border-neutral-300 px-3 py-2 text-right tabular-nums dark:border-neutral-700 dark:bg-neutral-900 ${FOCO}`}
            aria-label={SUELDO_PERIODO_LABEL[valor.periodo]}
          />
        </label>

        <label className="text-sm">
          <span className="block text-xs text-neutral-500">Días por semana</span>
          <select
            value={valor.diasSemana}
            onChange={(e) =>
              onCambiar({ ...valor, diasSemana: Number(e.target.value) })
            }
            className={`mt-1 min-h-11 rounded-lg border border-neutral-300 px-2 dark:border-neutral-700 dark:bg-neutral-900 ${FOCO}`}
            aria-label="Días trabajados por semana"
          >
            {DIAS_SEMANA_OPCIONES.map((d) => (
              <option key={d} value={d}>
                {d}
              </option>
            ))}
          </select>
        </label>

        <p className="pb-2 text-sm">
          <span className="block text-xs text-neutral-500">Por día</span>
          <span className="tabular-nums font-semibold">
            {diario === null ? '—' : formatCurrency(diario)}
          </span>
        </p>
      </div>

      <p className="text-xs text-neutral-500">
        El diario se calcula solo; es el que consume el cálculo de la raya.
      </p>
    </fieldset>
  );
}
