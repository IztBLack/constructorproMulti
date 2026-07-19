'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button, Field, Input, Modal } from '@/components/ui';
import { formatCurrency } from '@/lib/data/format';
import { registrarDestajoCuadrilla } from '../actions';

type Opcion = { id: string; nombre: string };

const SELECT_CLASS =
  'w-full cursor-pointer rounded-lg border border-neutral-300 px-3 py-2 text-sm text-neutral-900 outline-none transition focus:border-neutral-900 focus-visible:ring-2 focus-visible:ring-neutral-900/10';

const round2 = (v: number) => Math.round(v * 100) / 100;

function repartoIgual(miembros: Opcion[]): Record<string, number> {
  const pct: Record<string, number> = {};
  if (miembros.length === 0) return pct;
  const base = Math.floor(100 / miembros.length);
  const resto = 100 - base * miembros.length;
  miembros.forEach((m, i) => {
    pct[m.id] = base + (i === 0 ? resto : 0);
  });
  return pct;
}

export default function DestajoCuadrillaForm({
  cuadrillaId,
  miembros,
  obras,
}: {
  cuadrillaId: string;
  miembros: Opcion[];
  obras: Opcion[];
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [obraId, setObraId] = useState(obras[0]?.id ?? '');
  const [concepto, setConcepto] = useState('');
  const [total, setTotal] = useState('');
  const [pct, setPct] = useState<Record<string, number>>(() => repartoIgual(miembros));

  const bolsa = Number(total) || 0;
  const totalPct = miembros.reduce((a, m) => a + (pct[m.id] ?? 0), 0);
  const cuadra = totalPct === 100;

  // Montos por miembro; el último absorbe el redondeo para sumar exacto la bolsa.
  const montos: Record<string, number> = {};
  {
    let acum = 0;
    miembros.forEach((m, i) => {
      const monto =
        i === miembros.length - 1
          ? round2(bolsa - acum)
          : round2((bolsa * (pct[m.id] ?? 0)) / 100);
      if (i < miembros.length - 1) acum += monto;
      montos[m.id] = monto;
    });
  }

  const puedeGuardar = cuadra && bolsa > 0 && !!obraId && concepto.trim().length > 0;

  function reset() {
    setConcepto('');
    setTotal('');
    setObraId(obras[0]?.id ?? '');
    setPct(repartoIgual(miembros));
    setError(null);
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!puedeGuardar) return;
    setLoading(true);
    setError(null);
    const reparto = miembros.map((m) => ({ colaboradorId: m.id, monto: montos[m.id] }));
    const r = await registrarDestajoCuadrilla(cuadrillaId, obraId, concepto, reparto);
    setLoading(false);
    if (!r.ok) {
      setError(r.error ?? 'No se pudo guardar el destajo.');
      return;
    }
    setOpen(false);
    reset();
    router.refresh();
  }

  return (
    <>
      <Button
        variant="secondary"
        disabled={miembros.length === 0}
        title={miembros.length === 0 ? 'Agrega miembros primero' : undefined}
        onClick={() => setOpen(true)}
      >
        Registrar destajo
      </Button>

      <Modal open={open} onClose={() => !loading && setOpen(false)} title="Destajo por cuadrilla" size="lg">
        <form onSubmit={onSubmit} className="grid gap-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Obra *">
              <select
                className={SELECT_CLASS}
                value={obraId}
                onChange={(e) => setObraId(e.target.value)}
              >
                <option value="">Selecciona una obra…</option>
                {obras.map((o) => (
                  <option key={o.id} value={o.id}>
                    {o.nombre}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Total de la bolsa (MXN) *">
              <Input
                type="number"
                inputMode="decimal"
                min="0"
                step="0.01"
                value={total}
                onChange={(e) => setTotal(e.target.value)}
                placeholder="12000"
              />
            </Field>
          </div>

          <Field label="Concepto *">
            <Input
              value={concepto}
              onChange={(e) => setConcepto(e.target.value)}
              placeholder="Ej. Armado de castillos"
            />
          </Field>

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium text-neutral-700">Reparto entre miembros</span>
              <button
                type="button"
                className="text-xs text-neutral-500 underline hover:text-neutral-800"
                onClick={() => setPct(repartoIgual(miembros))}
              >
                Partes iguales
              </button>
            </div>
            <ul className="divide-y divide-neutral-100">
              {miembros.map((m) => (
                <li key={m.id} className="flex items-center gap-3 py-2">
                  <span className="flex-1 text-sm text-neutral-800">{m.nombre}</span>
                  <input
                    type="number"
                    min="0"
                    max="100"
                    step="1"
                    value={pct[m.id] ?? 0}
                    onChange={(e) =>
                      setPct((prev) => ({ ...prev, [m.id]: Math.max(0, Number(e.target.value) || 0) }))
                    }
                    className="w-20 rounded-lg border border-neutral-300 px-2 py-1 text-right text-sm tabular-nums outline-none focus:border-neutral-900"
                  />
                  <span className="w-8 text-sm text-neutral-500">%</span>
                  <span className="w-28 text-right text-sm font-medium tabular-nums text-neutral-900">
                    {formatCurrency(montos[m.id] ?? 0)}
                  </span>
                </li>
              ))}
            </ul>
            <div
              className={`flex items-center justify-between rounded-lg px-3 py-2 text-sm ${
                cuadra ? 'bg-neutral-50 text-neutral-700' : 'bg-red-50 text-red-700'
              }`}
            >
              <span>Total repartido: {formatCurrency(bolsa)}</span>
              <span className="font-medium tabular-nums">
                {totalPct}% {cuadra ? '· cuadra' : totalPct > 100 ? `· sobra ${totalPct - 100}%` : `· falta ${100 - totalPct}%`}
              </span>
            </div>
          </div>

          {error && <p className="text-sm text-red-600">{error}</p>}

          <div className="flex items-center gap-3">
            <Button type="submit" disabled={loading || !puedeGuardar}>
              {loading ? 'Guardando…' : 'Guardar reparto'}
            </Button>
            <Button type="button" variant="secondary" disabled={loading} onClick={() => setOpen(false)}>
              Cancelar
            </Button>
          </div>
        </form>
      </Modal>
    </>
  );
}
