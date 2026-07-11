'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Badge, Button, EmptyState, TableContainer, TBody, Td, Th, THead, Tr } from '@/components/ui';
import { formatCurrency, formatDate } from '@/lib/data/format';
import { fechaInputAMs } from '@/lib/data/tz';
import type { Movimiento } from '@/lib/data/types';
import { eliminarMovimientoAction } from './actions';
import MovimientoForm from './movimiento-form';

type FiltroTipo = 'TODOS' | 'ENTRADA' | 'SALIDA';

/** Minúsculas + sin acentos, para búsquedas tolerantes. */
function normalizar(s: string | null | undefined): string {
  return (s ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase();
}

export default function MovimientosTabla({
  obraId,
  movimientos,
}: {
  obraId: string;
  movimientos: Movimiento[];
}) {
  const router = useRouter();
  const [editandoId, setEditandoId] = useState<string | null>(null);
  const [eliminandoId, setEliminandoId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // ── Filtros ────────────────────────────────────────────────────────────────
  const [tipo, setTipo] = useState<FiltroTipo>('TODOS');
  const [busqueda, setBusqueda] = useState('');
  const [desde, setDesde] = useState('');
  const [hasta, setHasta] = useState('');
  const [canal, setCanal] = useState('');

  // Canales disponibles (métodos de pago presentes en los movimientos).
  const canales = useMemo(() => {
    const set = new Set<string>();
    for (const m of movimientos) {
      const c = (m.metodo_pago ?? '').trim();
      if (c) set.add(c);
    }
    return [...set].sort((a, b) => a.localeCompare(b, 'es'));
  }, [movimientos]);

  const filtrados = useMemo(() => {
    const q = normalizar(busqueda).trim();
    const desdeMs = desde ? fechaInputAMs(desde) : null;
    const hastaMs = hasta ? fechaInputAMs(hasta) : null;
    return movimientos.filter((m) => {
      if (tipo !== 'TODOS' && m.tipo !== tipo) return false;
      if (canal && (m.metodo_pago ?? '').trim() !== canal) return false;
      if (desdeMs !== null && m.fecha < desdeMs) return false;
      if (hastaMs !== null && m.fecha > hastaMs) return false;
      if (q) {
        const heno = `${normalizar(m.concepto)} ${normalizar(m.nombre)} ${normalizar(m.referencia)}`;
        if (!heno.includes(q)) return false;
      }
      return true;
    });
  }, [movimientos, tipo, busqueda, desde, hasta, canal]);

  const hayFiltros =
    tipo !== 'TODOS' || busqueda.trim() !== '' || desde !== '' || hasta !== '' || canal !== '';

  function limpiarFiltros() {
    setTipo('TODOS');
    setBusqueda('');
    setDesde('');
    setHasta('');
    setCanal('');
  }

  async function onEliminar(id: string) {
    if (!confirm('¿Eliminar este movimiento? Esta acción no se puede deshacer.')) return;
    setEliminandoId(id);
    setError(null);
    const result = await eliminarMovimientoAction(id, obraId);
    setEliminandoId(null);
    if (!result.ok) {
      setError(result.error ?? 'No se pudo eliminar el movimiento.');
      return;
    }
    router.refresh();
  }

  if (movimientos.length === 0) {
    return (
      <EmptyState
        title="Aún no hay movimientos registrados en esta obra."
        description="Usa el botón &quot;Registrar movimiento&quot; para capturar la primera entrada o salida."
      />
    );
  }

  const totalEntradas = filtrados
    .filter((m) => m.tipo === 'ENTRADA')
    .reduce((acc, m) => acc + m.monto, 0);
  const totalSalidas = filtrados
    .filter((m) => m.tipo === 'SALIDA')
    .reduce((acc, m) => acc + m.monto, 0);
  const saldo = totalEntradas - totalSalidas;

  const tipoBtn = (valor: FiltroTipo, etiqueta: string) => (
    <button
      type="button"
      onClick={() => setTipo(valor)}
      aria-pressed={tipo === valor}
      className={`min-h-9 cursor-pointer rounded-lg px-3 py-1.5 text-sm font-medium transition ${
        tipo === valor
          ? 'bg-neutral-900 text-white'
          : 'bg-neutral-100 text-neutral-700 hover:bg-neutral-200'
      }`}
    >
      {etiqueta}
    </button>
  );

  return (
    <div className="space-y-3">
      {error && (
        <p className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">{error}</p>
      )}

      {/* ── Barra de filtros ───────────────────────────────────────────────── */}
      <div className="flex flex-wrap items-end gap-3 rounded-xl border border-neutral-200 bg-neutral-50 p-3">
        <div className="flex items-center gap-1" role="group" aria-label="Filtrar por tipo">
          {tipoBtn('TODOS', 'Todos')}
          {tipoBtn('ENTRADA', 'Entradas')}
          {tipoBtn('SALIDA', 'Salidas')}
        </div>

        <label className="flex flex-col gap-1">
          <span className="text-xs font-medium text-neutral-500">Buscar</span>
          <input
            type="search"
            value={busqueda}
            onChange={(e) => setBusqueda(e.target.value)}
            placeholder="Concepto, nombre u observaciones"
            aria-label="Buscar en concepto, nombre u observaciones"
            className="min-h-9 w-56 rounded-lg border border-neutral-300 bg-white px-3 py-1.5 text-sm text-neutral-900 outline-none transition placeholder:text-neutral-500 focus:border-neutral-900 focus-visible:ring-2 focus-visible:ring-neutral-900/10"
          />
        </label>

        <label className="flex flex-col gap-1">
          <span className="text-xs font-medium text-neutral-500">Desde</span>
          <input
            type="date"
            value={desde}
            max={hasta || undefined}
            onChange={(e) => setDesde(e.target.value)}
            aria-label="Fecha desde"
            className="min-h-9 rounded-lg border border-neutral-300 bg-white px-3 py-1.5 text-sm text-neutral-900 outline-none transition focus:border-neutral-900 focus-visible:ring-2 focus-visible:ring-neutral-900/10"
          />
        </label>

        <label className="flex flex-col gap-1">
          <span className="text-xs font-medium text-neutral-500">Hasta</span>
          <input
            type="date"
            value={hasta}
            min={desde || undefined}
            onChange={(e) => setHasta(e.target.value)}
            aria-label="Fecha hasta"
            className="min-h-9 rounded-lg border border-neutral-300 bg-white px-3 py-1.5 text-sm text-neutral-900 outline-none transition focus:border-neutral-900 focus-visible:ring-2 focus-visible:ring-neutral-900/10"
          />
        </label>

        {canales.length > 0 && (
          <label className="flex flex-col gap-1">
            <span className="text-xs font-medium text-neutral-500">Canal</span>
            <select
              value={canal}
              onChange={(e) => setCanal(e.target.value)}
              aria-label="Filtrar por canal"
              className="min-h-9 rounded-lg border border-neutral-300 bg-white px-3 py-1.5 text-sm text-neutral-900 outline-none transition focus:border-neutral-900 focus-visible:ring-2 focus-visible:ring-neutral-900/10"
            >
              <option value="">Todos</option>
              {canales.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </label>
        )}

        {hayFiltros && (
          <Button type="button" variant="secondary" size="sm" onClick={limpiarFiltros}>
            Limpiar
          </Button>
        )}
      </div>

      <p className="text-xs text-neutral-500">
        {hayFiltros
          ? `${filtrados.length} de ${movimientos.length} ${movimientos.length === 1 ? 'movimiento' : 'movimientos'}`
          : `${movimientos.length} ${movimientos.length === 1 ? 'movimiento' : 'movimientos'}`}
      </p>

      {filtrados.length === 0 ? (
        <p className="rounded-xl border border-neutral-200 bg-white px-4 py-6 text-center text-sm text-neutral-500">
          Ningún movimiento coincide con los filtros.
        </p>
      ) : (
        <TableContainer>
          <THead>
            <Th>Fecha</Th>
            <Th>Concepto</Th>
            <Th>Nombre</Th>
            <Th>Canal</Th>
            <Th>Tipo</Th>
            <Th>Observaciones</Th>
            <Th className="text-right">Cantidad</Th>
            <Th className="text-right">Acciones</Th>
          </THead>
          <TBody>
            {filtrados.map((m) =>
              editandoId === m.id ? (
                <tr key={m.id} className="border-b border-neutral-100 last:border-0">
                  <td colSpan={8} className="px-4 py-4">
                    <MovimientoForm
                      obraId={obraId}
                      mode="editar"
                      movimiento={m}
                      onDone={() => setEditandoId(null)}
                      onCancel={() => setEditandoId(null)}
                    />
                  </td>
                </tr>
              ) : (
                <Tr key={m.id}>
                  <Td className="whitespace-nowrap">{formatDate(m.fecha)}</Td>
                  <Td className="max-w-[180px] truncate" title={m.concepto || undefined}>
                    {m.concepto || '—'}
                  </Td>
                  <Td>{m.nombre || '—'}</Td>
                  <Td>{m.metodo_pago || '—'}</Td>
                  <Td>
                    <Badge tone={m.tipo === 'ENTRADA' ? 'green' : 'red'}>
                      {m.tipo === 'ENTRADA' ? 'Entrada' : 'Salida'}
                    </Badge>
                  </Td>
                  <Td
                    className="max-w-[160px] truncate text-neutral-500"
                    title={m.referencia || undefined}
                  >
                    {m.referencia || '—'}
                  </Td>
                  <Td
                    className={`text-right font-semibold tabular-nums ${
                      m.tipo === 'ENTRADA' ? 'text-green-700' : 'text-red-600'
                    }`}
                  >
                    {m.tipo === 'SALIDA' ? '-' : '+'}
                    {formatCurrency(m.monto)}
                  </Td>
                  <Td className="text-right">
                    <div className="flex items-center justify-end gap-2">
                      <Button
                        type="button"
                        variant="secondary"
                        size="sm"
                        onClick={() => setEditandoId(m.id)}
                      >
                        Editar
                      </Button>
                      <Button
                        type="button"
                        variant="danger"
                        size="sm"
                        disabled={eliminandoId === m.id}
                        onClick={() => onEliminar(m.id)}
                      >
                        {eliminandoId === m.id ? 'Eliminando…' : 'Eliminar'}
                      </Button>
                    </div>
                  </Td>
                </Tr>
              ),
            )}
          </TBody>
          <tfoot>
            <tr className="border-t-2 border-neutral-300 bg-neutral-50">
              <td colSpan={6} className="px-4 py-3 text-right text-sm font-semibold text-neutral-700">
                {hayFiltros ? 'Totales (filtrados)' : 'Totales'}
              </td>
              <td className="px-4 py-3 text-right">
                <div className="space-y-0.5 text-right">
                  <p className="text-xs tabular-nums text-green-700">+{formatCurrency(totalEntradas)}</p>
                  <p className="text-xs tabular-nums text-red-600">-{formatCurrency(totalSalidas)}</p>
                  <p
                    className={`text-sm font-bold tabular-nums ${
                      saldo >= 0 ? 'text-green-700' : 'text-red-600'
                    }`}
                  >
                    {formatCurrency(saldo)}
                  </p>
                </div>
              </td>
              <td className="px-4 py-3" />
            </tr>
          </tfoot>
        </TableContainer>
      )}
    </div>
  );
}
