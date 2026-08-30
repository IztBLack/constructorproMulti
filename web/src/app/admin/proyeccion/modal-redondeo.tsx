'use client';

import { useState } from 'react';
import { Button, Modal } from '@/components/ui';
import { formatCurrency } from '@/lib/data/format';
import {
  AYUDA_CAMPO,
  CAMPOS_REDONDEO,
  ETIQUETA_CAMPO,
  ETIQUETA_MODO,
  alternarCampo,
  diferencia,
  vistaRedondeada,
} from '@/lib/data/redondeo';
import type {
  ModoRedondeo,
  ProyeccionResultado,
  RedondeoConfig,
} from '@/lib/data/proyeccion-nomina';
import { APAGADO, FOCO } from './estilos';

interface Props {
  config: RedondeoConfig;
  /// El resultado SIN redondear, para poder enseñar qué le hace la
  /// configuración que se está tocando antes de aceptarla.
  resultado: ProyeccionResultado;
  soloLectura: boolean;
  onGuardar: (config: RedondeoConfig) => void;
  onCerrar: () => void;
}

const PASOS = [1, 10, 50, 100, 500, 1000];
const MODOS: ModoRedondeo[] = ['CERCANO', 'ARRIBA', 'ABAJO'];

/// Configurar el redondeo, enseñando lo que le hace al total ANTES de cerrar.
///
/// Un ajuste de presentación que mueve una cifra de dinero tiene que decir
/// cuánto la mueve. Sin la vista previa, el usuario prende el redondeo, cierra,
/// y descubre que el total cambió $180 sin saber si eso está bien.
///
/// Espeja `redondeo_sheet.dart` del móvil.
export function ModalRedondeo(props: Props) {
  const { resultado, soloLectura } = props;
  const [config, setConfig] = useState<RedondeoConfig>(props.config);

  const vistaPrevia = vistaRedondeada(resultado, config);
  const movimiento = diferencia(vistaPrevia.total);

  const editar = (cambio: Partial<RedondeoConfig>) => {
    if (soloLectura) return;
    setConfig((c) => ({ ...c, ...cambio }));
  };

  return (
    <Modal
      open
      onClose={props.onCerrar}
      title="Redondeo"
      size="md"
      footer={
        <>
          <Button variant="secondary" onClick={props.onCerrar}>
            Cancelar
          </Button>
          <Button disabled={soloLectura} onClick={() => props.onGuardar(config)}>
            Aplicar
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <p className="text-sm text-neutral-500">
          El redondeo es de <strong>presentación</strong>: no cambia nada de lo
          capturado y el número exacto sigue debajo de cada cifra redondeada.
        </p>

        {/* ── Interruptor maestro ──────────────────────────────────────── */}
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={config.activo}
            disabled={soloLectura}
            onChange={(e) =>
              editar({
                activo: e.target.checked,
                // Prender sin ámbitos no redondearía nada y se vería como un
                // bug. Se arranca con lo que casi siempre se quiere.
                campos: config.campos.length === 0 ? ['RAYA', 'TOTAL'] : config.campos,
              })
            }
            className={FOCO}
          />
          <span className="font-medium">Redondear las cifras</span>
        </label>

        <fieldset disabled={!config.activo || soloLectura} className="space-y-4">
          {/* ── Paso ───────────────────────────────────────────────────── */}
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-neutral-500">
              Múltiplo
            </p>
            <div className="mt-1.5 flex flex-wrap gap-1.5">
              {PASOS.map((p) => (
                <button
                  key={p}
                  type="button"
                  onClick={() => editar({ paso: p })}
                  className={`min-h-9 rounded-lg border px-3 text-sm tabular-nums ${FOCO} ${APAGADO} ${
                    config.paso === p
                      ? 'border-neutral-900 bg-neutral-900 text-white'
                      : 'border-neutral-300 dark:border-neutral-700'
                  }`}
                >
                  ${p}
                </button>
              ))}
            </div>
          </div>

          {/* ── Dirección ──────────────────────────────────────────────── */}
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-neutral-500">
              Dirección
            </p>
            <div className="mt-1.5 flex flex-wrap gap-1.5">
              {MODOS.map((m) => (
                <button
                  key={m}
                  type="button"
                  onClick={() => editar({ modo: m })}
                  className={`min-h-9 rounded-lg border px-3 text-sm ${FOCO} ${APAGADO} ${
                    config.modo === m
                      ? 'border-neutral-900 bg-neutral-900 text-white'
                      : 'border-neutral-300 dark:border-neutral-700'
                  }`}
                >
                  {ETIQUETA_MODO[m]}
                </button>
              ))}
            </div>
          </div>

          {/* ── Qué cifras ─────────────────────────────────────────────── */}
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-neutral-500">
              Qué cifras
            </p>
            <ul className="mt-1.5 space-y-2">
              {CAMPOS_REDONDEO.map((campo) => (
                <li key={campo}>
                  <label className="flex items-start gap-2 text-sm">
                    <input
                      type="checkbox"
                      checked={config.campos.includes(campo)}
                      onChange={() => !soloLectura && setConfig(alternarCampo(config, campo))}
                      className={`mt-0.5 ${FOCO}`}
                    />
                    <span>
                      {ETIQUETA_CAMPO[campo]}
                      <span className="block text-xs text-neutral-500">
                        {AYUDA_CAMPO[campo]}
                      </span>
                    </span>
                  </label>
                </li>
              ))}
            </ul>
          </div>
        </fieldset>

        {/* ── Qué le hace al total ─────────────────────────────────────── */}
        <div className="rounded-lg border border-neutral-200 bg-neutral-50 p-3 text-sm dark:border-neutral-800 dark:bg-neutral-900">
          <p className="text-xs font-semibold uppercase tracking-wide text-neutral-500">
            Con esto, el total de la semana
          </p>
          <p className="mt-1 flex flex-wrap items-baseline gap-2">
            <span className="text-xl font-bold tabular-nums">
              {formatCurrency(vistaPrevia.total.mostrado)}
            </span>
            {Math.abs(movimiento) >= 0.005 && (
              <span
                className={`text-sm font-semibold tabular-nums ${
                  movimiento > 0 ? 'text-green-700' : 'text-red-700'
                }`}
              >
                {movimiento > 0 ? '+' : '−'}
                {formatCurrency(Math.abs(movimiento))} que lo exacto
              </span>
            )}
          </p>
          <p className="mt-0.5 text-xs text-neutral-500">
            Exacto: {formatCurrency(vistaPrevia.total.exacto)}
          </p>
          {!vistaPrevia.totalCuadra && (
            <p className="mt-2 text-xs text-amber-700">
              Ojo: con esta combinación el total no es exactamente la suma de los
              renglones que se enseñan.
            </p>
          )}
        </div>
      </div>
    </Modal>
  );
}
