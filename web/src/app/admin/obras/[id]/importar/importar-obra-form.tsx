'use client';

import { useRef, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Badge, Button, Card, CardTitle, TBody, Td, Th, THead } from '@/components/ui';
import { formatCurrency, formatDate } from '@/lib/data/format';
import {
  previsualizarImportacionObra,
  confirmarImportacionObra,
  type PreviewImportacionObra,
  type PartidaImportadaPreview,
  type ResolucionPartida,
  type ResultadoImportacionObra,
} from './actions';

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Clave estable para identificar una fila de presupuesto en el estado de resoluciones. */
function partidaKey(p: PartidaImportadaPreview): string {
  return p.partidaId ?? p.concepto;
}

/** Calcula el costo total resultante del presupuesto dadas las resoluciones elegidas. */
function calcularCostoResultante(
  presupuesto: PartidaImportadaPreview[],
  resoluciones: Record<string, 'portal' | 'archivo'>,
): number {
  let total = 0;
  for (const p of presupuesto) {
    if (p.estado === 'conflicto') {
      const usarArchivo = (resoluciones[partidaKey(p)] ?? 'portal') === 'archivo';
      const cantidad = usarArchivo ? p.cantidad : (p.cantidadPortal ?? p.cantidad);
      const precio = usarArchivo ? p.precioUnitario : (p.precioUnitarioPortal ?? p.precioUnitario);
      total += cantidad * precio;
    } else {
      total += p.cantidad * p.precioUnitario;
    }
  }
  return total;
}

// ── Componente principal ──────────────────────────────────────────────────────

export default function ImportarObraForm({ obraId }: { obraId: string }) {
  const router = useRouter();
  const fileRef = useRef<HTMLInputElement>(null);

  const [isPending, startTransition] = useTransition();
  const [errorGlobal, setErrorGlobal] = useState<string | null>(null);
  const [preview, setPreview] = useState<PreviewImportacionObra | null>(null);
  const [importarTodo, setImportarTodo] = useState(false);
  const [actualizarPresupuesto, setActualizarPresupuesto] = useState(false);
  const [resoluciones, setResoluciones] = useState<Record<string, 'portal' | 'archivo'>>({});
  const [resultado, setResultado] = useState<ResultadoImportacionObra | null>(null);

  // ── Paso 1: previsualizar ─────────────────────────────────────────────────
  function handlePrevisualizar(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setErrorGlobal(null);
    setPreview(null);
    setResultado(null);
    setImportarTodo(false);
    setActualizarPresupuesto(false);
    setResoluciones({});

    const form = e.currentTarget;
    const formData = new FormData(form);

    startTransition(async () => {
      const result = await previsualizarImportacionObra(obraId, formData);
      if (!result.ok) {
        setErrorGlobal(result.error ?? 'Error al procesar el archivo.');
        return;
      }
      setPreview(result.data!);
    });
  }

  // ── Paso 2: confirmar importación ─────────────────────────────────────────
  function handleConfirmar() {
    if (!preview) return;
    setErrorGlobal(null);

    const presupuestoInput: ResolucionPartida[] = preview.presupuesto.map((p) => ({
      concepto: p.concepto,
      estado: p.estado,
      unidad: p.unidad,
      cantidad: p.cantidad,
      precioUnitario: p.precioUnitario,
      partidaId: p.partidaId,
      resolucion: p.estado === 'conflicto' ? (resoluciones[partidaKey(p)] ?? 'portal') : undefined,
    }));

    startTransition(async () => {
      const result = await confirmarImportacionObra({
        obraId: preview.obraId,
        movimientos: preview.movimientos,
        importarTodo,
        actualizarPresupuesto,
        presupuesto: presupuestoInput,
      });

      if (!result.ok) {
        setErrorGlobal(result.error ?? 'Error al importar los movimientos.');
        return;
      }

      setResultado(result.data!);
    });
  }

  // ── Reiniciar ─────────────────────────────────────────────────────────────
  function handleReiniciar() {
    setPreview(null);
    setErrorGlobal(null);
    setImportarTodo(false);
    setActualizarPresupuesto(false);
    setResoluciones({});
    setResultado(null);
    if (fileRef.current) fileRef.current.value = '';
  }

  // ── Render: éxito ─────────────────────────────────────────────────────────
  if (resultado) {
    return (
      <Card>
        <div className="space-y-4">
          <CardTitle as="h2" className="text-base font-semibold text-neutral-800">
            Importación completada
          </CardTitle>
          <p className="text-sm text-neutral-600">
            Se agregaron{' '}
            <span className="font-semibold text-neutral-900">
              {resultado.movimientosInsertados}
            </span>{' '}
            movimiento(s) a la obra.
            {(resultado.partidasCreadas > 0 || resultado.partidasActualizadas > 0) && (
              <>
                {' '}
                Presupuesto: {resultado.partidasCreadas} partida(s) nueva(s),{' '}
                {resultado.partidasActualizadas} actualizada(s).
              </>
            )}
          </p>
          <div className="flex flex-wrap gap-3">
            <Button type="button" onClick={() => router.push(`/admin/obras/${obraId}`)}>
              Ver estado de cuenta
            </Button>
            <Button type="button" variant="secondary" onClick={handleReiniciar}>
              Importar otro archivo
            </Button>
          </div>
        </div>
      </Card>
    );
  }

  const costoResultante = preview
    ? calcularCostoResultante(preview.presupuesto, resoluciones)
    : 0;
  const hasCambiosPresupuesto = preview
    ? preview.presupuesto.some((p) => p.estado !== 'soloPortal')
    : false;
  const numAImportar = preview
    ? importarTodo
      ? preview.counts.enArchivo
      : preview.counts.nuevos
    : 0;

  return (
    <div className="space-y-6">
      {/* ── Paso 1: subir archivo ─────────────────────────────────────────── */}
      <Card>
        <CardTitle as="h2" className="mb-4 text-base font-semibold text-neutral-800">
          Seleccionar archivo
        </CardTitle>
        <form onSubmit={handlePrevisualizar} className="space-y-4">
          <label className="block space-y-1">
            <span className="text-sm font-medium text-neutral-700">Archivo (.xlsx o .csv)</span>
            <input
              ref={fileRef}
              type="file"
              name="archivo"
              accept=".xlsx,.csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,text/csv"
              required
              disabled={isPending}
              className="w-full cursor-pointer rounded-lg border border-neutral-300 px-3 py-2 text-sm text-neutral-900 outline-none transition file:mr-3 file:cursor-pointer file:rounded-md file:border-0 file:bg-neutral-100 file:px-3 file:py-1.5 file:text-sm file:font-medium file:text-neutral-700 file:transition hover:file:bg-neutral-200 focus:border-neutral-900 focus-visible:ring-2 focus-visible:ring-neutral-900/10 disabled:cursor-not-allowed disabled:opacity-50"
            />
            <span className="block text-xs text-neutral-400">
              Tamaño máximo: 10 MB. El estado de cuenta de la obra se usa para no duplicar
              movimientos ya registrados.
            </span>
          </label>

          {errorGlobal && !preview && (
            <p className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
              {errorGlobal}
            </p>
          )}

          <div className="flex gap-3">
            <Button type="submit" disabled={isPending}>
              {isPending && !preview ? 'Analizando...' : 'Analizar archivo'}
            </Button>
            <Button
              type="button"
              variant="secondary"
              onClick={() => router.push(`/admin/obras/${obraId}`)}
            >
              Cancelar
            </Button>
          </div>
        </form>
      </Card>

      {/* ── Paso 2: preview + confirmación ───────────────────────────────── */}
      {preview && (
        <Card>
          <CardTitle as="h2" className="mb-4 text-base font-semibold text-neutral-800">
            Vista previa de la importación
          </CardTitle>

          <div className="space-y-5">
            {/* Resumen de movimientos */}
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-4">
              <SummaryBox label="En el archivo" value={String(preview.counts.enArchivo)} />
              <SummaryBox
                label="Nuevos"
                value={String(preview.counts.nuevos)}
                valueClass="text-green-700"
              />
              <SummaryBox
                label="Duplicados"
                value={String(preview.counts.duplicados)}
                valueClass="text-amber-700"
              />
              <SummaryBox
                label="Suma a recibir"
                value={formatCurrency(preview.sumaRecibirNuevos)}
                valueClass="text-green-700"
              />
            </div>

            {/* Qué hacer con los duplicados */}
            {preview.counts.duplicados > 0 && (
              <div className="space-y-2">
                <p className="text-sm font-medium text-neutral-700">
                  ¿Qué hago con los duplicados?
                </p>
                <div className="space-y-1.5">
                  <label className="flex cursor-pointer items-center gap-2 text-sm text-neutral-700">
                    <input
                      type="radio"
                      name="duplicados"
                      checked={!importarTodo}
                      onChange={() => setImportarTodo(false)}
                      disabled={isPending}
                      className="h-4 w-4 border-neutral-300 text-neutral-900 focus:ring-neutral-900"
                    />
                    Omitir duplicados (recomendado)
                  </label>
                  <label className="flex cursor-pointer items-center gap-2 text-sm text-neutral-700">
                    <input
                      type="radio"
                      name="duplicados"
                      checked={importarTodo}
                      onChange={() => setImportarTodo(true)}
                      disabled={isPending}
                      className="h-4 w-4 border-neutral-300 text-neutral-900 focus:ring-neutral-900"
                    />
                    Importar todo ({preview.counts.enArchivo})
                  </label>
                </div>
              </div>
            )}

            {/* Tabla de movimientos */}
            <div className="space-y-2">
              <p className="text-sm font-medium text-neutral-700">Movimientos del archivo</p>
              <div className="max-h-[420px] overflow-auto rounded-xl border border-neutral-200 bg-white">
                <table className="w-full text-sm">
                  <THead>
                    <Th>Fecha</Th>
                    <Th>Concepto / Categoría</Th>
                    <Th>Beneficiario</Th>
                    <Th>Tipo</Th>
                    <Th className="text-right">Monto</Th>
                    <Th>Estado</Th>
                  </THead>
                  <TBody>
                    {preview.movimientos.map((m, i) => (
                      <tr
                        key={i}
                        className="border-b border-neutral-100 last:border-0 hover:bg-neutral-50"
                      >
                        <Td className="whitespace-nowrap">{formatDate(m.fecha)}</Td>
                        <Td className="max-w-[180px] truncate">{m.categoria || '—'}</Td>
                        <Td>{m.nombre || '—'}</Td>
                        <Td>
                          <Badge tone={m.tipo === 'ENTRADA' ? 'green' : 'red'}>
                            {m.tipo === 'ENTRADA' ? 'Entrada' : 'Salida'}
                          </Badge>
                        </Td>
                        <Td
                          className={`text-right font-semibold tabular-nums ${
                            m.tipo === 'ENTRADA' ? 'text-green-700' : 'text-red-600'
                          }`}
                        >
                          {formatCurrency(m.monto)}
                        </Td>
                        <Td>
                          <Badge tone={m.estado === 'nuevo' ? 'green' : 'amber'}>
                            {m.estado === 'nuevo' ? 'Nuevo' : 'Duplicado'}
                          </Badge>
                        </Td>
                      </tr>
                    ))}
                  </TBody>
                </table>
              </div>
            </div>

            {/* Presupuesto */}
            <div className="space-y-3 border-t border-neutral-200 pt-4">
              <p className="text-sm font-medium text-neutral-700">Presupuesto</p>

              {!hasCambiosPresupuesto ? (
                <p className="text-sm text-neutral-500">
                  {preview.presupuesto.length === 0
                    ? 'No hay partidas de presupuesto que conciliar.'
                    : 'El archivo no trae presupuesto — sin cambios.'}
                </p>
              ) : (
                <>
                  <label className="flex cursor-pointer items-center gap-2 text-sm font-medium text-neutral-700">
                    <input
                      type="checkbox"
                      checked={actualizarPresupuesto}
                      onChange={(e) => setActualizarPresupuesto(e.target.checked)}
                      disabled={isPending}
                      className="h-4 w-4 rounded border-neutral-300 text-neutral-900 focus:ring-neutral-900"
                    />
                    Actualizar presupuesto con el del archivo
                  </label>

                  {actualizarPresupuesto && (
                    <>
                      <div className="max-h-[360px] overflow-auto rounded-xl border border-neutral-200 bg-white">
                        <table className="w-full text-sm">
                          <THead>
                            <Th>Concepto</Th>
                            <Th>Estado</Th>
                            <Th className="text-right">Cantidad × precio</Th>
                          </THead>
                          <TBody>
                            {preview.presupuesto.map((p) => (
                              <PartidaRow
                                key={partidaKey(p)}
                                partida={p}
                                resolucion={resoluciones[partidaKey(p)] ?? 'portal'}
                                onResolucionChange={(r) =>
                                  setResoluciones((prev) => ({ ...prev, [partidaKey(p)]: r }))
                                }
                                disabled={isPending}
                              />
                            ))}
                          </TBody>
                        </table>
                      </div>

                      <div className="flex items-center justify-between rounded-lg border border-neutral-200 bg-neutral-50 px-4 py-3">
                        <span className="text-sm font-medium text-neutral-600">
                          Costo total resultante
                        </span>
                        <span className="text-lg font-bold tabular-nums text-neutral-900">
                          {formatCurrency(costoResultante)}
                        </span>
                      </div>
                    </>
                  )}
                </>
              )}
            </div>

            {/* Advertencias */}
            {preview.advertencias.length > 0 && (
              <div className="rounded-lg border border-amber-200 bg-amber-50 p-4">
                <p className="mb-2 text-sm font-semibold text-amber-800">
                  Advertencias ({preview.advertencias.length})
                </p>
                <ul className="space-y-1">
                  {preview.advertencias.map((adv, i) => (
                    <li key={i} className="text-xs text-amber-700">
                      {adv}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {/* Error de confirmación */}
            {errorGlobal && (
              <p className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                {errorGlobal}
              </p>
            )}

            <div className="flex flex-wrap gap-3">
              <Button type="button" onClick={handleConfirmar} disabled={isPending}>
                {isPending ? 'Importando...' : `Agregar ${numAImportar} movimiento(s)`}
              </Button>
              <Button
                type="button"
                variant="secondary"
                onClick={handleReiniciar}
                disabled={isPending}
              >
                Elegir otro archivo
              </Button>
            </div>
          </div>
        </Card>
      )}
    </div>
  );
}

// ── Componentes auxiliares ──────────────────────────────────────────────────

function SummaryBox({
  label,
  value,
  valueClass = 'text-neutral-900',
}: {
  label: string;
  value: string;
  valueClass?: string;
}) {
  return (
    <div className="rounded-lg border border-neutral-200 bg-neutral-50 px-4 py-3">
      <p className="text-xs font-medium uppercase tracking-wide text-neutral-500">{label}</p>
      <p className={`mt-1 text-xl font-bold tabular-nums ${valueClass}`}>{value}</p>
    </div>
  );
}

function PartidaRow({
  partida,
  resolucion,
  onResolucionChange,
  disabled,
}: {
  partida: PartidaImportadaPreview;
  resolucion: 'portal' | 'archivo';
  onResolucionChange: (r: 'portal' | 'archivo') => void;
  disabled: boolean;
}) {
  const key = partidaKey(partida);

  if (partida.estado === 'conflicto') {
    const totalPortal = (partida.cantidadPortal ?? 0) * (partida.precioUnitarioPortal ?? 0);
    const totalArchivo = partida.cantidad * partida.precioUnitario;
    return (
      <tr className="border-b border-neutral-100 last:border-0">
        <Td className="max-w-[220px] truncate">{partida.concepto}</Td>
        <Td>
          <Badge tone="amber">Conflicto</Badge>
        </Td>
        <Td>
          <div className="flex flex-col items-end gap-1.5 text-right">
            <label className="flex cursor-pointer items-center gap-2 text-xs text-neutral-700">
              <span className="tabular-nums">
                Mantener · portal: {partida.cantidadPortal} {partida.unidad} ×{' '}
                {formatCurrency(partida.precioUnitarioPortal)} = {formatCurrency(totalPortal)}
              </span>
              <input
                type="radio"
                name={`resolucion-${key}`}
                checked={resolucion === 'portal'}
                onChange={() => onResolucionChange('portal')}
                disabled={disabled}
                className="h-4 w-4 border-neutral-300 text-neutral-900 focus:ring-neutral-900"
              />
            </label>
            <label className="flex cursor-pointer items-center gap-2 text-xs text-neutral-700">
              <span className="tabular-nums">
                Usar · archivo: {partida.cantidad} {partida.unidad} ×{' '}
                {formatCurrency(partida.precioUnitario)} = {formatCurrency(totalArchivo)}
              </span>
              <input
                type="radio"
                name={`resolucion-${key}`}
                checked={resolucion === 'archivo'}
                onChange={() => onResolucionChange('archivo')}
                disabled={disabled}
                className="h-4 w-4 border-neutral-300 text-neutral-900 focus:ring-neutral-900"
              />
            </label>
          </div>
        </Td>
      </tr>
    );
  }

  const total = partida.cantidad * partida.precioUnitario;
  const muted = partida.estado === 'igual' || partida.estado === 'soloPortal';

  return (
    <tr className="border-b border-neutral-100 last:border-0">
      <Td className={`max-w-[220px] truncate ${muted ? 'text-neutral-400' : ''}`}>
        {partida.concepto}
      </Td>
      <Td>
        {partida.estado === 'nueva' && <Badge tone="blue">Nueva · del archivo</Badge>}
        {partida.estado === 'soloPortal' && <Badge tone="neutral">Se conserva</Badge>}
        {partida.estado === 'igual' && <Badge tone="neutral">Sin cambios</Badge>}
      </Td>
      <Td className={`text-right tabular-nums ${muted ? 'text-neutral-400' : 'text-neutral-700'}`}>
        {partida.cantidad} {partida.unidad} × {formatCurrency(partida.precioUnitario)} ={' '}
        {formatCurrency(total)}
      </Td>
    </tr>
  );
}
