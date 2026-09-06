'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button, Card, CardTitle, Field, Input, Select, Textarea } from '@/components/ui';
import { formatCurrency } from '@/lib/data/format';
import {
  calcularTotales,
  type EstadoNota,
  type NotaConRenglones,
} from '@/lib/data/notas-obra-calculo';
import { msAFechaInput } from '@/lib/data/tz';
import { actualizarNotaAction, eliminarNotaAction, type SeccionNota } from '../actions';
import RenglonesNota from './renglones-nota';

interface ColaboradorLite {
  id: string;
  nombre: string;
}

interface FormNota {
  destinatario: string;
  colaborador_id: string;
  titulo: string;
  fecha: string;
  estado: EstadoNota;
  total_override: string;
  saldo_override: string;
  notas: string;
}

/**
 * Qué campos manda cada tarjeta al guardar. Es lo único que hace independientes
 * a las tres: el botón de la nota al pie no acarrea el destinatario, así que no
 * puede tropezar con una validación que no es suya.
 */
const CAMPOS_SECCION: Record<SeccionNota, readonly (keyof FormNota)[]> = {
  datos: ['destinatario', 'colaborador_id', 'titulo', 'fecha', 'estado'],
  cuentas: ['total_override', 'saldo_override'],
  pie: ['notas'],
};

function aForm(nota: NotaConRenglones): FormNota {
  return {
    destinatario: nota.destinatario,
    colaborador_id: nota.colaborador_id ?? '',
    titulo: nota.titulo,
    fecha: msAFechaInput(nota.fecha),
    estado: nota.estado,
    total_override: nota.total_override === null ? '' : String(nota.total_override),
    saldo_override: nota.saldo_override === null ? '' : String(nota.saldo_override),
    notas: nota.notas,
  };
}

function numeroONull(v: string): number | null {
  const s = v.trim();
  if (s === '') return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

/**
 * Editor de una nota de obra. Aunque el encabezado, los totales fijados y el
 * pie son la misma fila, cada tarjeta se guarda por su cuenta —igual que los
 * renglones—: manda solo sus campos y solo ella se valida.
 *
 * Los totales se recalculan en vivo con lo que hay escrito, no con lo guardado:
 * la gracia de fijar un total a mano es ver de inmediato qué saldo deja.
 */
export default function EditorNota({
  obraId,
  nota,
  colaboradores,
  puedeEditar,
}: {
  obraId: string;
  nota: NotaConRenglones;
  colaboradores: ColaboradorLite[];
  puedeEditar: boolean;
}) {
  const router = useRouter();
  const [form, setForm] = useState<FormNota>(() => aForm(nota));
  const [guardando, setGuardando] = useState<SeccionNota | null>(null);
  const [eliminando, setEliminando] = useState(false);
  const [error, setError] = useState<{ seccion: SeccionNota | 'nota'; mensaje: string } | null>(null);
  const [aviso, setAviso] = useState<SeccionNota | null>(null);

  const guardado = useMemo(() => aForm(nota), [nota]);
  const ocupado = guardando !== null || eliminando;

  function sinCambios(seccion: SeccionNota) {
    return CAMPOS_SECCION[seccion].every((campo) => form[campo] === guardado[campo]);
  }

  const totales = useMemo(
    () =>
      calcularTotales(
        {
          total_override: numeroONull(form.total_override),
          saldo_override: numeroONull(form.saldo_override),
        },
        nota.renglones,
      ),
    [form.total_override, form.saldo_override, nota.renglones],
  );

  function set<K extends keyof FormNota>(campo: K, valor: FormNota[K]) {
    setForm((f) => ({ ...f, [campo]: valor }));
  }

  async function guardar(seccion: SeccionNota) {
    setGuardando(seccion);
    setError(null);
    setAviso(null);

    const fd = new FormData();
    for (const campo of CAMPOS_SECCION[seccion]) fd.set(campo, form[campo]);

    const r = await actualizarNotaAction(obraId, nota.id, seccion, fd);
    setGuardando(null);

    if (!r.ok) {
      setError({ seccion, mensaje: r.error ?? 'No se pudo guardar.' });
      return;
    }

    setAviso(seccion);
    window.setTimeout(() => setAviso((s) => (s === seccion ? null : s)), 2500);
    router.refresh();
  }

  async function eliminar() {
    const aQuien = nota.destinatario ? ` de ${nota.destinatario}` : '';
    if (!confirm(`¿Eliminar la nota${aQuien}? No se puede deshacer.`)) return;
    setEliminando(true);
    setError(null);
    const r = await eliminarNotaAction(obraId, nota.id);
    setEliminando(false);
    if (!r.ok) {
      setError({ seccion: 'nota', mensaje: r.error ?? 'No se pudo eliminar la nota.' });
      return;
    }
    router.push(`/admin/obras/${obraId}/notas`);
  }

  /**
   * El botón de una tarjeta: se apaga si esa tarjeta no cambió, y su aviso y su
   * error salen junto a él y no arriba, para que se vea cuál sección guardó.
   */
  function botonGuardar(seccion: SeccionNota) {
    return (
      <div className="flex flex-wrap items-center gap-3">
        <Button
          type="button"
          size="sm"
          disabled={ocupado || sinCambios(seccion)}
          onClick={() => guardar(seccion)}
        >
          {guardando === seccion ? 'Guardando…' : 'Guardar'}
        </Button>
        {aviso === seccion && (
          <span role="status" className="text-sm text-green-700">
            Guardado.
          </span>
        )}
        {error?.seccion === seccion && (
          <span role="alert" className="text-sm text-red-700">
            {error.mensaje}
          </span>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {error?.seccion === 'nota' && (
        <p role="alert" className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
          {error.mensaje}
        </p>
      )}

      {/* ── Encabezado ─────────────────────────────────────────────────── */}
      <Card>
        <CardTitle as="h2" className="mb-3 text-sm font-semibold text-neutral-700">
          Datos de la nota
        </CardTitle>

        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="A nombre de *">
            <Input
              value={form.destinatario}
              onChange={(e) => set('destinatario', e.target.value)}
              disabled={!puedeEditar}
              required
            />
          </Field>

          <Field label="Título" hint="Ej. el lote o la etapa.">
            <Input
              value={form.titulo}
              onChange={(e) => set('titulo', e.target.value)}
              disabled={!puedeEditar}
              placeholder="MZ 2 LT 1"
            />
          </Field>

          <Field label="Fecha">
            <Input
              type="date"
              value={form.fecha}
              onChange={(e) => set('fecha', e.target.value)}
              disabled={!puedeEditar}
            />
          </Field>

          <Field label="Estado">
            <Select
              value={form.estado}
              onChange={(e) => set('estado', e.target.value as EstadoNota)}
              disabled={!puedeEditar}
            >
              <option value="ABIERTA">Abierta</option>
              <option value="LIQUIDADA">Liquidada</option>
            </Select>
          </Field>

          {colaboradores.length > 0 && (
            <Field
              label="Ligada a"
              hint="Opcional: alguien del equipo ya registrado."
              className="sm:col-span-2"
            >
              <Select
                value={form.colaborador_id}
                onChange={(e) => set('colaborador_id', e.target.value)}
                disabled={!puedeEditar}
              >
                <option value="">No está en el sistema</option>
                {colaboradores.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.nombre}
                  </option>
                ))}
              </Select>
            </Field>
          )}
        </div>

        {puedeEditar && <div className="mt-4">{botonGuardar('datos')}</div>}
      </Card>

      {/* ── Renglones ──────────────────────────────────────────────────── */}
      <section className="space-y-3">
        <h2 className="text-sm font-semibold text-neutral-700">Renglones</h2>
        <RenglonesNota
          obraId={obraId}
          notaId={nota.id}
          renglones={nota.renglones}
          puedeEditar={puedeEditar}
        />
      </section>

      {/* ── Totales ────────────────────────────────────────────────────── */}
      <Card>
        <CardTitle as="h2" className="mb-3 text-sm font-semibold text-neutral-700">
          Cuentas
        </CardTitle>

        <dl className="space-y-2 text-sm">
          <div className="flex justify-between text-neutral-600">
            <dt>Suma de conceptos</dt>
            <dd className="tabular-nums">{formatCurrency(totales.subtotal)}</dd>
          </div>

          {totales.deducciones > 0 && (
            <div className="flex justify-between text-neutral-600">
              <dt>Deducciones</dt>
              <dd className="tabular-nums text-amber-700">−{formatCurrency(totales.deducciones)}</dd>
            </div>
          )}

          <div className="flex items-center justify-between border-t border-neutral-200 pt-2 font-semibold text-neutral-900">
            <dt>TOTAL</dt>
            <dd className="tabular-nums">{formatCurrency(totales.total)}</dd>
          </div>

          {puedeEditar && (
            <ValorFijado
              etiqueta="total"
              valor={form.total_override}
              calculado={totales.totalCalculado}
              onChange={(v) => set('total_override', v)}
            />
          )}

          <div className="flex justify-between pt-1 text-neutral-600">
            <dt>Pagado</dt>
            <dd className="tabular-nums text-green-700">−{formatCurrency(totales.pagado)}</dd>
          </div>

          <div className="flex items-center justify-between border-t border-neutral-200 pt-2 text-base font-bold text-neutral-900">
            <dt>SALDO</dt>
            <dd className="tabular-nums">{formatCurrency(totales.saldo)}</dd>
          </div>

          {puedeEditar && (
            <ValorFijado
              etiqueta="saldo"
              valor={form.saldo_override}
              calculado={totales.saldoCalculado}
              onChange={(v) => set('saldo_override', v)}
            />
          )}
        </dl>

        {puedeEditar && <div className="mt-4">{botonGuardar('cuentas')}</div>}
      </Card>

      {/* ── Pie ────────────────────────────────────────────────────────── */}
      <Card>
        <CardTitle as="h2" className="mb-3 text-sm font-semibold text-neutral-700">
          Nota al pie
        </CardTitle>
        <Textarea
          value={form.notas}
          onChange={(e) => set('notas', e.target.value)}
          disabled={!puedeEditar}
          rows={3}
          maxLength={2000}
          placeholder="Lo que quieras aclararle al socio. Sale impreso en el PDF."
        />
        {puedeEditar && <div className="mt-3">{botonGuardar('pie')}</div>}
      </Card>

      {puedeEditar && (
        <div className="flex justify-end">
          <Button type="button" variant="danger" size="sm" disabled={ocupado} onClick={eliminar}>
            Eliminar nota
          </Button>
        </div>
      )}
    </div>
  );
}

/**
 * Control para pisar un total calculado. Se enseña el número que saldría de la
 * aritmética al lado del que se fijó, porque la diferencia entre los dos suele
 * ser la parte importante: es lo que la constructora retuvo o asignó distinto.
 */
function ValorFijado({
  etiqueta,
  valor,
  calculado,
  onChange,
}: {
  etiqueta: string;
  valor: string;
  calculado: number;
  onChange: (v: string) => void;
}) {
  const fijado = valor.trim() !== '';

  if (!fijado) {
    return (
      <div className="flex justify-end">
        <button
          type="button"
          onClick={() => onChange(String(calculado))}
          className="text-xs text-neutral-500 underline underline-offset-2 transition hover:text-neutral-900"
        >
          Fijar el {etiqueta} a mano
        </button>
      </div>
    );
  }

  return (
    <div className="flex flex-wrap items-center justify-end gap-2 rounded-lg bg-amber-50 px-3 py-2">
      <span className="text-xs text-amber-800">
        {etiqueta === 'total' ? 'Total' : 'Saldo'} fijado · calculado {formatCurrency(calculado)}
      </span>
      <Input
        type="number"
        step="0.01"
        value={valor}
        onChange={(e) => onChange(e.target.value)}
        className="w-36"
        aria-label={`${etiqueta} fijado a mano`}
      />
      <button
        type="button"
        onClick={() => onChange('')}
        className="text-xs text-neutral-600 underline underline-offset-2 transition hover:text-neutral-900"
      >
        Usar el calculado
      </button>
    </div>
  );
}
