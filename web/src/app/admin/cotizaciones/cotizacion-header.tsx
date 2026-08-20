'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Badge, Button, Field, Input, Modal, PageHeader, Select } from '@/components/ui';
import type { BadgeTone } from '@/components/ui';
import { formatCurrency, formatDate } from '@/lib/data/format';
import type { Cliente, Cotizacion, EstadoCotizacion } from '@/lib/data/types';
import { tituloCotizacion } from '@/lib/cotizacion/titulo';
import { CotizacionForm } from './cotizacion-form';
import {
  ajustarPreciosCotizacionAction,
  ajustarPrecioFinalCotizacionAction,
  cambiarEstadoCotizacionAction,
  convertirCotizacionEnObraAction,
  duplicarCotizacionAction,
  eliminarCotizacionAction,
  enviarCotizacionAction,
  vincularCotizacionAObraAction,
} from './actions';

export interface ObraLite {
  id: string;
  nombre: string;
}

const ESTADO_LABEL: Record<EstadoCotizacion, string> = {
  BORRADOR: 'Borrador',
  ENVIADA: 'Enviada',
  ACEPTADA: 'Aceptada',
  RECHAZADA: 'Rechazada',
  CONVERTIDA: 'Convertida',
};

const ESTADO_TONE: Record<EstadoCotizacion, BadgeTone> = {
  BORRADOR: 'neutral',
  ENVIADA: 'blue',
  ACEPTADA: 'green',
  RECHAZADA: 'red',
  CONVERTIDA: 'purple',
};

export function CotizacionHeader({
  cotizacion,
  clientes,
  obras = [],
  totalActual = 0,
  cambiosPendientes = false,
}: {
  cotizacion: Cotizacion;
  clientes: Cliente[];
  /** Obras activas de la empresa, para "Vincular a obra". */
  obras?: ObraLite[];
  /** Total actual (con descuento + IVA), para el ajuste "a precio final". */
  totalActual?: number;
  /** True si la cotización está ACEPTADA y hubo ediciones que el cliente aún no aprueba. */
  cambiosPendientes?: boolean;
}) {
  const router = useRouter();
  const [editando, setEditando] = useState(false);
  const [confirmandoBorrado, setConfirmandoBorrado] = useState(false);
  const [errorBorrado, setErrorBorrado] = useState<string | null>(null);
  const [pendingBorrado, startTransitionBorrado] = useTransition();

  const [errorEstado, setErrorEstado] = useState<string | null>(null);
  const [pendingEstado, startTransitionEstado] = useTransition();

  // Acciones "paridad móvil": duplicar, vincular a obra, ajuste global de precios.
  const [pendingExtra, startTransitionExtra] = useTransition();
  const [vinculando, setVinculando] = useState(false);
  const [obraSel, setObraSel] = useState('');
  const [ajustando, setAjustando] = useState(false);
  const [modoAjuste, setModoAjuste] = useState<'pct' | 'final'>('pct');
  const [pctAjuste, setPctAjuste] = useState('');
  const [precioFinal, setPrecioFinal] = useState('');
  const [avisoExtra, setAvisoExtra] = useState<string | null>(null);

  const estado = cotizacion.estado;

  function handleDuplicar() {
    setErrorEstado(null);
    startTransitionExtra(async () => {
      const result = await duplicarCotizacionAction(cotizacion.id);
      if (result.error) {
        setErrorEstado(result.error);
        return;
      }
      if (result.id) router.push(`/admin/cotizaciones/${result.id}`);
    });
  }

  function handleVincular() {
    setErrorEstado(null);
    setAvisoExtra(null);
    startTransitionExtra(async () => {
      const result = await vincularCotizacionAObraAction(cotizacion.id, obraSel);
      if (result.error) {
        setErrorEstado(result.error);
        return;
      }
      setVinculando(false);
      router.refresh();
    });
  }

  function handleAjustar() {
    setErrorEstado(null);
    setAvisoExtra(null);
    startTransitionExtra(async () => {
      const result =
        modoAjuste === 'final'
          ? await ajustarPrecioFinalCotizacionAction(
              cotizacion.id,
              // Se quitan separadores de miles y espacios (ej. "150,000.00").
              Number.parseFloat(precioFinal.replace(/[,\s]/g, '')),
            )
          : await ajustarPreciosCotizacionAction(
              cotizacion.id,
              Number.parseFloat(pctAjuste.replace(',', '.')),
            );
      if (result.error) {
        setErrorEstado(result.error);
        return;
      }
      setAjustando(false);
      setPctAjuste('');
      setPrecioFinal('');
      setAvisoExtra(`Precios ajustados en ${result.n} partida(s).`);
      router.refresh();
    });
  }

  const puedeVincular = !cotizacion.obra_id && estado !== 'CONVERTIDA';

  function handleEliminar() {
    setErrorBorrado(null);
    startTransitionBorrado(async () => {
      const result = await eliminarCotizacionAction(cotizacion.id);
      if (result.error) {
        setErrorBorrado(result.error);
        return;
      }
      router.push('/admin/cotizaciones');
    });
  }

  function handleEnviar() {
    setErrorEstado(null);
    startTransitionEstado(async () => {
      const result = await enviarCotizacionAction(cotizacion.id);
      if (result.error) {
        setErrorEstado(result.error);
        return;
      }
      router.refresh();
    });
  }

  function handleTransicion(nuevo: EstadoCotizacion) {
    setErrorEstado(null);
    startTransitionEstado(async () => {
      const result = await cambiarEstadoCotizacionAction(cotizacion.id, nuevo);
      if (result.error) {
        setErrorEstado(result.error);
        return;
      }
      router.refresh();
    });
  }

  function handleConvertir() {
    setErrorEstado(null);
    startTransitionEstado(async () => {
      const result = await convertirCotizacionEnObraAction(cotizacion.id);
      if (result.error) {
        setErrorEstado(result.error);
        return;
      }
      if (result.obraId) {
        router.push(`/admin/obras/${result.obraId}`);
        return;
      }
      router.refresh();
    });
  }

  return (
    <>
      <PageHeader
        title={tituloCotizacion(cotizacion)}
        eyebrow={
          [cotizacion.cliente ? `Cliente: ${cotizacion.cliente}` : '', cotizacion.ubicacion ?? '']
            .filter(Boolean)
            .join(' · ') || undefined
        }
        description={`Fecha: ${formatDate(cotizacion.fecha)}`}
        actions={
          <>
            <Badge tone={ESTADO_TONE[estado]}>{ESTADO_LABEL[estado]}</Badge>

            {/* Acciones de estado (máquina de estados guiada) */}
            {estado === 'BORRADOR' && (
              <Button variant="primary" size="sm" disabled={pendingEstado} onClick={handleEnviar}>
                {pendingEstado ? 'Enviando…' : 'Enviar al cliente'}
              </Button>
            )}
            {estado === 'ENVIADA' && (
              <>
                <Button variant="primary" size="sm" disabled={pendingEstado} onClick={() => handleTransicion('ACEPTADA')}>
                  Marcar aceptada
                </Button>
                <Button variant="danger" size="sm" disabled={pendingEstado} onClick={() => handleTransicion('RECHAZADA')}>
                  Marcar rechazada
                </Button>
                <Button variant="secondary" size="sm" disabled={pendingEstado} onClick={() => handleTransicion('BORRADOR')}>
                  Revertir a borrador
                </Button>
              </>
            )}
            {estado === 'ACEPTADA' && (
              <Button variant="primary" size="sm" disabled={pendingEstado} onClick={handleConvertir}>
                Convertir en obra
              </Button>
            )}
            {(estado === 'ACEPTADA' || estado === 'RECHAZADA') && (
              <Button variant="secondary" size="sm" disabled={pendingEstado} onClick={() => handleTransicion('BORRADOR')}>
                Reabrir (borrador)
              </Button>
            )}

            <Button variant="secondary" size="sm" onClick={() => setEditando(true)}>
              Editar
            </Button>
            <Button variant="secondary" size="sm" disabled={pendingExtra} onClick={handleDuplicar}>
              {pendingExtra ? 'Duplicando…' : 'Duplicar'}
            </Button>
            {puedeVincular && (
              <Button
                variant="secondary"
                size="sm"
                disabled={pendingExtra}
                onClick={() => {
                  setObraSel('');
                  setVinculando(true);
                }}
              >
                Vincular a obra
              </Button>
            )}
            <Button
              variant="secondary"
              size="sm"
              disabled={pendingExtra}
              onClick={() => {
                setPctAjuste('');
                setAjustando(true);
              }}
            >
              Ajustar precios
            </Button>
            {confirmandoBorrado ? (
              <div className="flex items-center gap-2">
                <span className="text-sm text-neutral-600">¿Eliminar cotización?</span>
                <Button
                  variant="danger"
                  size="sm"
                  disabled={pendingBorrado}
                  onClick={handleEliminar}
                >
                  {pendingBorrado ? 'Eliminando…' : 'Sí, eliminar'}
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  disabled={pendingBorrado}
                  onClick={() => setConfirmandoBorrado(false)}
                >
                  Cancelar
                </Button>
              </div>
            ) : (
              <Button variant="danger" size="sm" onClick={() => setConfirmandoBorrado(true)}>
                Eliminar
              </Button>
            )}
          </>
        }
      />

      {errorEstado && (
        <p className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
          {errorEstado}
        </p>
      )}

      {avisoExtra && (
        <p className="rounded-lg border border-green-200 bg-green-50 p-3 text-sm text-green-800">
          {avisoExtra}
        </p>
      )}

      {/* Indicador: el cliente aceptó, pero hay ediciones que aún no aprueba. */}
      {cambiosPendientes && (
        <p className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
          El cliente aceptó esta cotización, pero has hecho cambios que{' '}
          <strong>aún no ha aprobado</strong>. Los verá en su portal con la opción de aprobarlos.
        </p>
      )}

      {errorBorrado && (
        <p className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
          {errorBorrado}
        </p>
      )}

      <Modal open={editando} onClose={() => setEditando(false)} title="Editar cotización" size="lg">
        <CotizacionForm
          mode="editar"
          cotizacion={cotizacion}
          clientes={clientes}
          onCancelar={() => setEditando(false)}
        />
      </Modal>

      <Modal open={vinculando} onClose={() => setVinculando(false)} title="Vincular a una obra" size="sm">
        <div className="space-y-4">
          <p className="text-sm text-neutral-600">
            Liga esta cotización a una obra que ya existe (no crea una nueva ni copia el
            presupuesto).
          </p>
          {obras.length === 0 ? (
            <p className="text-sm text-neutral-500">No hay obras activas para vincular.</p>
          ) : (
            <Field label="Obra">
              <Select
                value={obraSel}
                onChange={(e) => setObraSel(e.target.value)}
                disabled={pendingExtra}
              >
                <option value="">Elige una obra…</option>
                {obras.map((o) => (
                  <option key={o.id} value={o.id}>
                    {o.nombre}
                  </option>
                ))}
              </Select>
            </Field>
          )}
          <div className="flex items-center gap-3">
            <Button disabled={pendingExtra || !obraSel} onClick={handleVincular}>
              {pendingExtra ? 'Vinculando…' : 'Vincular'}
            </Button>
            <Button variant="secondary" disabled={pendingExtra} onClick={() => setVinculando(false)}>
              Cancelar
            </Button>
          </div>
        </div>
      </Modal>

      <Modal open={ajustando} onClose={() => setAjustando(false)} title="Ajustar precios" size="sm">
        <div className="space-y-4">
          {/* Selector de modo: por porcentaje (como antes) o fijando el total. */}
          <div className="flex rounded-lg border border-neutral-300 p-1 text-sm">
            <button
              type="button"
              onClick={() => setModoAjuste('pct')}
              className={`flex-1 rounded-md px-3 py-1.5 font-medium transition-colors ${
                modoAjuste === 'pct'
                  ? 'bg-neutral-900 text-white'
                  : 'text-neutral-600 hover:bg-neutral-100'
              }`}
            >
              Por porcentaje
            </button>
            <button
              type="button"
              onClick={() => setModoAjuste('final')}
              className={`flex-1 rounded-md px-3 py-1.5 font-medium transition-colors ${
                modoAjuste === 'final'
                  ? 'bg-neutral-900 text-white'
                  : 'text-neutral-600 hover:bg-neutral-100'
              }`}
            >
              Precio final
            </button>
          </div>

          {modoAjuste === 'pct' ? (
            <>
              <p className="text-sm text-neutral-600">
                Sube o baja el precio de <strong>todas</strong> las partidas por un porcentaje. No
                cambia las cantidades.
              </p>
              <Field label="Porcentaje" hint="Ej: 10 = +10%, -5 = −5%.">
                <Input
                  type="text"
                  inputMode="decimal"
                  value={pctAjuste}
                  onChange={(e) => setPctAjuste(e.target.value)}
                  placeholder="10"
                  disabled={pendingExtra}
                  autoFocus
                />
              </Field>
            </>
          ) : (
            <>
              <p className="text-sm text-neutral-600">
                Escribe el <strong>total que quieres cobrar</strong>. El sistema ajusta los precios
                de todas las partidas en la misma proporción para llegar exacto a ese monto.
              </p>
              <Field
                label="Precio final (ya con IVA y descuento)"
                hint={`Total actual: ${formatCurrency(totalActual)}`}
              >
                <Input
                  type="text"
                  inputMode="decimal"
                  value={precioFinal}
                  onChange={(e) => setPrecioFinal(e.target.value)}
                  placeholder={String(Math.round(totalActual))}
                  disabled={pendingExtra}
                  autoFocus
                />
              </Field>
            </>
          )}

          <div className="flex items-center gap-3">
            <Button
              disabled={
                pendingExtra ||
                (modoAjuste === 'pct' ? pctAjuste.trim() === '' : precioFinal.trim() === '')
              }
              onClick={handleAjustar}
            >
              {pendingExtra ? 'Aplicando…' : 'Aplicar'}
            </Button>
            <Button variant="secondary" disabled={pendingExtra} onClick={() => setAjustando(false)}>
              Cancelar
            </Button>
          </div>
        </div>
      </Modal>
    </>
  );
}
