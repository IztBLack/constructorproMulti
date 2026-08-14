'use client';

import { useState } from 'react';
import { Button, Modal } from '@/components/ui';
import { formatCurrency } from '@/lib/data/format';
import {
  ETIQUETA_AJUSTE,
  type AjusteProyeccion,
  type DestinoAjuste,
  type RepartoAjuste,
  type TipoAjuste,
} from '@/lib/data/proyeccion-nomina';

const EXPLICACION: Record<TipoAjuste, string> = {
  DESTAJO: 'Trabajo a precio alzado que se paga ADEMÁS de los días.',
  ANTICIPO: 'Dinero que ya se entregó a cuenta de esta raya.',
  DESCUENTO: 'Préstamo, herramienta o material a descontar.',
};

interface Props {
  titulo: string;
  destino: DestinoAjuste;
  destinoId: string;
  /// Si viene, el modal EDITA ese ajuste en vez de crear uno nuevo, y ofrece
  /// quitarlo. Sin esto un ajuste entra y ya no sale: el único camino era sacar
  /// a la persona del escenario y volverla a meter, perdiendo sus días.
  existente?: AjusteProyeccion;
  onGuardar: (ajuste: AjusteProyeccion) => void;
  onQuitar?: (id: string) => void;
  onCerrar: () => void;
}

export function ModalAjuste(props: Props) {
  const { titulo, destino, destinoId, existente, onGuardar, onQuitar, onCerrar } = props;

  const [tipo, setTipo] = useState<TipoAjuste>(existente?.tipo ?? 'DESTAJO');
  const [monto, setMonto] = useState(existente ? String(existente.monto) : '');
  const [nota, setNota] = useState(existente?.nota ?? '');
  const [reparto, setReparto] = useState<RepartoAjuste>(
    existente?.reparto ?? 'PARTES_IGUALES',
  );

  const valor = Math.abs(Number(monto) || 0);
  const esCuadrilla = destino === 'CUADRILLA';

  return (
    <Modal
      open
      onClose={onCerrar}
      title={existente ? 'Editar ajuste' : 'Nuevo ajuste'}
      footer={
        <>
          {existente && onQuitar && (
            <Button
              variant="secondary"
              onClick={() => {
                onQuitar(existente.id);
                onCerrar();
              }}
            >
              Quitar
            </Button>
          )}
          <Button variant="secondary" onClick={onCerrar}>
            Cancelar
          </Button>
          <Button
            disabled={valor <= 0}
            onClick={() =>
              onGuardar({
                id: existente?.id ?? crypto.randomUUID(),
                tipo,
                destino,
                destinoId,
                monto: valor,
                nota: nota.trim(),
                reparto,
              })
            }
          >
            Guardar
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <p className="text-sm text-neutral-500">
          {esCuadrilla ? `Cuadrilla ${titulo}` : titulo}
        </p>

        <div className="flex gap-2">
          {(['DESTAJO', 'ANTICIPO', 'DESCUENTO'] as TipoAjuste[]).map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => setTipo(t)}
              aria-pressed={tipo === t}
              className={`min-h-11 flex-1 rounded-lg border px-3 text-sm ${
                tipo === t
                  ? 'border-blue-500 bg-blue-50 font-semibold text-blue-700'
                  : 'border-neutral-300 text-neutral-700 hover:border-neutral-400'
              }`}
            >
              {ETIQUETA_AJUSTE[t]}
            </button>
          ))}
        </div>
        <p className="text-xs text-neutral-500">{EXPLICACION[tipo]}</p>

        <label className="block space-y-1">
          <span className="text-sm font-medium text-neutral-700">Monto</span>
          <input
            type="number"
            value={monto}
            min={0}
            autoFocus
            onChange={(e) => setMonto(e.target.value)}
            className="w-full rounded-lg border border-neutral-300 px-3 py-2 text-right tabular-nums"
          />
          {/* El signo lo pone el TIPO, no el número: se dice en palabras para
              que nadie escriba «-500» esperando que reste dos veces. */}
          {valor > 0 && (
            <span
              className={`block text-xs font-semibold ${
                tipo === 'DESTAJO' ? 'text-green-700' : 'text-red-700'
              }`}
            >
              {tipo === 'DESTAJO'
                ? `Suma ${formatCurrency(valor)} a la raya`
                : `Baja ${formatCurrency(valor)} de la raya`}
            </span>
          )}
        </label>

        <label className="block space-y-1">
          <span className="text-sm font-medium text-neutral-700">Nota (opcional)</span>
          <input
            type="text"
            value={nota}
            onChange={(e) => setNota(e.target.value)}
            placeholder="Colado de losa, préstamo, herramienta…"
            className="w-full rounded-lg border border-neutral-300 px-3 py-2"
          />
        </label>

        {esCuadrilla && (
          <fieldset className="space-y-2">
            <legend className="text-sm font-medium text-neutral-700">¿Cómo se reparte?</legend>
            {(
              [
                [
                  'PARTES_IGUALES',
                  'En partes iguales',
                  'Entre los miembros que están en la proyección.',
                ],
                [
                  'A_LA_CUADRILLA',
                  'Como renglón de la cuadrilla',
                  'Para cuando el maestro cobra el alzado y él reparte.',
                ],
              ] as [RepartoAjuste, string, string][]
            ).map(([valorOpt, tituloOpt, ayuda]) => (
              <label key={valorOpt} className="flex gap-2 text-sm">
                <input
                  type="radio"
                  name="reparto"
                  checked={reparto === valorOpt}
                  onChange={() => setReparto(valorOpt)}
                />
                <span>
                  <span className="block text-neutral-900">{tituloOpt}</span>
                  <span className="block text-xs text-neutral-500">{ayuda}</span>
                </span>
              </label>
            ))}
          </fieldset>
        )}
      </div>
    </Modal>
  );
}
