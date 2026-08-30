'use client';

import { useMemo, useState } from 'react';
import { Button, Modal } from '@/components/ui';
import { formatCurrency } from '@/lib/data/format';
import { salarioDiarioDesdePeriodo } from '@/lib/data/salario';
import type { Colaborador, Puesto } from '@/lib/data/types';
import type { SueldoProyectado } from '@/lib/data/proyeccion-nomina';
import { EditorSueldo } from './editor-sueldo';
import { APAGADO, FOCO } from './estilos';

export interface RenglonPlaza {
  clave: string;
  puestoId: string;
  cuantas: number;
  sueldo: SueldoProyectado;
}

interface Props {
  colaboradores: Colaborador[];
  puestos: Puesto[];
  /// Ids que ya están dentro; no se ofrecen dos veces.
  participantes: string[];
  obras: { id: string; nombre: string }[];
  /// Obra que se aplicará a lo que se agregue; la del filtro, si hay.
  obraSugerida: string | null;
  /// Días que se le ponen a cada quien al entrar.
  diasPorDefecto: number[];
  onAplicar: (params: {
    personas: string[];
    plazas: RenglonPlaza[];
    obraId: string | null;
  }) => void;
  onCerrar: () => void;
}

const SUELDO_NUEVO: SueldoProyectado = {
  periodo: 'SEMANAL',
  monto: 3500,
  diasSemana: 6,
};

/// Agregar VARIOS de una vez: gente del equipo y plazas nuevas, al mismo carrito.
///
/// Antes se agregaba de uno en uno: armar «cuatro maestros y tres ayudantes»
/// eran siete viajes y siete ediciones de salario después.
///
/// El pie enseña cuánto sube la raya ANTES de tocar el botón, porque esa es la
/// pregunta que se está contestando y verla después de aplicar llega tarde. Todo
/// se aplica con un solo «Agregar», que deja UN cambio deshacible de una vez.
///
/// Espeja `agregar_masivo_sheet.dart` del móvil.
export function ModalAgregarMasivo(props: Props) {
  const { colaboradores, puestos, participantes, obras, diasPorDefecto } = props;

  const [pestana, setPestana] = useState<'equipo' | 'plazas'>('equipo');
  const [elegidos, setElegidos] = useState<Set<string>>(new Set());
  const [renglones, setRenglones] = useState<RenglonPlaza[]>([]);
  const [obraId, setObraId] = useState<string | null>(props.obraSugerida);

  const dentro = useMemo(() => new Set(participantes), [participantes]);
  const puestoPorId = useMemo(
    () => Object.fromEntries(puestos.map((p) => [p.id, p])),
    [puestos],
  );

  /// Candidatos agrupados por puesto: es como se piensa en la obra («me faltan
  /// dos ayudantes»), no por orden alfabético de toda la plantilla.
  const grupos = useMemo(() => {
    const fuera = colaboradores.filter((c) => !dentro.has(c.id));
    const mapa = new Map<string, Colaborador[]>();
    for (const c of fuera) {
      const clave = c.puesto_id ?? '';
      if (!mapa.has(clave)) mapa.set(clave, []);
      mapa.get(clave)!.push(c);
    }
    return [...mapa.entries()]
      .map(([puestoId, gente]) => ({
        puestoId,
        nombre: puestoPorId[puestoId]?.nombre ?? 'Sin puesto',
        gente: gente.sort((a, b) => a.nombre.localeCompare(b.nombre)),
      }))
      .sort((a, b) => a.nombre.localeCompare(b.nombre));
  }, [colaboradores, dentro, puestoPorId]);

  /// Cuánto sube la raya con lo que hay en el carrito. Se calcula con el mismo
  /// diario que consumirá el cálculo, no con una aproximación.
  const subida = useMemo(() => {
    const dias = diasPorDefecto.length;
    let total = 0;
    for (const id of elegidos) {
      const c = colaboradores.find((x) => x.id === id);
      if (!c) continue;
      const diario =
        c.salario_personalizado ?? puestoPorId[c.puesto_id ?? '']?.salario_dia_default ?? 0;
      total += diario * dias;
    }
    for (const r of renglones) {
      const diario =
        salarioDiarioDesdePeriodo(r.sueldo.monto, r.sueldo.periodo, r.sueldo.diasSemana) ?? 0;
      total += diario * dias * Math.max(0, r.cuantas);
    }
    return total;
  }, [elegidos, renglones, colaboradores, puestoPorId, diasPorDefecto]);

  const cuantos =
    elegidos.size + renglones.reduce((a, r) => a + Math.max(0, r.cuantas), 0);

  function alternarPersona(id: string) {
    setElegidos((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
  }

  function alternarGrupo(ids: string[]) {
    const todos = ids.every((id) => elegidos.has(id));
    setElegidos((s) => {
      const n = new Set(s);
      for (const id of ids) {
        if (todos) n.delete(id);
        else n.add(id);
      }
      return n;
    });
  }

  return (
    <Modal
      open
      onClose={props.onCerrar}
      title="Agregar a la proyección"
      size="lg"
      footer={
        <>
          <span className="mr-auto text-sm text-neutral-600 dark:text-neutral-300">
            {cuantos === 0 ? (
              'Nada seleccionado todavía'
            ) : (
              <>
                {cuantos} {cuantos === 1 ? 'persona' : 'personas'} ·{' '}
                <strong className="tabular-nums">+{formatCurrency(subida)}</strong> a la
                raya
              </>
            )}
          </span>
          <Button variant="secondary" onClick={props.onCerrar}>
            Cancelar
          </Button>
          <Button
            disabled={cuantos === 0}
            onClick={() =>
              props.onAplicar({
                personas: [...elegidos],
                plazas: renglones.filter((r) => r.cuantas > 0),
                obraId,
              })
            }
          >
            Agregar
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        {/* ── Pestañas ─────────────────────────────────────────────────── */}
        <div className="flex gap-1 border-b border-neutral-200 dark:border-neutral-800">
          {(['equipo', 'plazas'] as const).map((p) => (
            <button
              key={p}
              type="button"
              onClick={() => setPestana(p)}
              className={`-mb-px border-b-2 px-3 py-2 text-sm ${FOCO} ${
                pestana === p
                  ? 'border-neutral-900 font-semibold'
                  : 'border-transparent text-neutral-500'
              }`}
            >
              {p === 'equipo' ? 'Del equipo' : 'Plazas nuevas'}
            </button>
          ))}
        </div>

        {/* ── Obra ─────────────────────────────────────────────────────── */}
        <label className="block text-sm">
          <span className="text-xs text-neutral-500">
            Obra para lo que se agregue (solo dentro de esta proyección)
          </span>
          <select
            value={obraId ?? ''}
            onChange={(e) => setObraId(e.target.value || null)}
            className={`mt-1 min-h-11 w-full rounded-lg border border-neutral-300 px-2 dark:border-neutral-700 dark:bg-neutral-900 ${FOCO}`}
          >
            <option value="">La que ya tengan</option>
            {obras.map((o) => (
              <option key={o.id} value={o.id}>
                {o.nombre}
              </option>
            ))}
          </select>
        </label>

        {pestana === 'equipo' ? (
          grupos.length === 0 ? (
            <p className="py-6 text-center text-sm text-neutral-500">
              Ya están todos dentro. Puedes crear plazas nuevas en la otra pestaña.
            </p>
          ) : (
            <ul className="space-y-3">
              {grupos.map((g) => {
                const ids = g.gente.map((c) => c.id);
                const todos = ids.every((id) => elegidos.has(id));
                return (
                  <li key={g.puestoId || 'sin'}>
                    <label className="flex items-center gap-2 text-sm font-medium">
                      <input
                        type="checkbox"
                        checked={todos}
                        onChange={() => alternarGrupo(ids)}
                        className={FOCO}
                      />
                      {g.nombre}
                      <span className="font-normal text-neutral-500">
                        {g.gente.length}
                      </span>
                    </label>
                    <ul className="mt-1 grid gap-1 pl-6 sm:grid-cols-2">
                      {g.gente.map((c) => (
                        <li key={c.id}>
                          <label className="flex items-center gap-2 text-sm">
                            <input
                              type="checkbox"
                              checked={elegidos.has(c.id)}
                              onChange={() => alternarPersona(c.id)}
                              className={FOCO}
                            />
                            {c.nombre}
                          </label>
                        </li>
                      ))}
                    </ul>
                  </li>
                );
              })}
            </ul>
          )
        ) : (
          <div className="space-y-3">
            <p className="text-sm text-neutral-500">
              Una plaza es un puesto <strong>sin cubrir</strong>: sirve para preguntar
              cuánto costaría contratarlo. No se da de alta a nadie ni se toca el
              catálogo.
            </p>

            {renglones.map((r, i) => (
              <div
                key={r.clave}
                className="space-y-2 rounded-lg border border-neutral-200 p-3 dark:border-neutral-800"
              >
                <div className="flex flex-wrap items-end gap-3">
                  <label className="text-sm">
                    <span className="block text-xs text-neutral-500">Cuántas</span>
                    <input
                      type="number"
                      min={1}
                      max={99}
                      value={r.cuantas}
                      onChange={(e) =>
                        setRenglones((rs) =>
                          rs.map((x, j) =>
                            j === i
                              ? { ...x, cuantas: Math.max(0, Number(e.target.value) || 0) }
                              : x,
                          ),
                        )
                      }
                      className={`mt-1 w-20 rounded-lg border border-neutral-300 px-2 py-2 text-right tabular-nums dark:border-neutral-700 dark:bg-neutral-900 ${FOCO}`}
                      aria-label="Cuántas plazas"
                    />
                  </label>
                  <label className="text-sm">
                    <span className="block text-xs text-neutral-500">Puesto</span>
                    <select
                      value={r.puestoId}
                      onChange={(e) =>
                        setRenglones((rs) =>
                          rs.map((x, j) =>
                            j === i ? { ...x, puestoId: e.target.value } : x,
                          ),
                        )
                      }
                      className={`mt-1 min-h-11 rounded-lg border border-neutral-300 px-2 dark:border-neutral-700 dark:bg-neutral-900 ${FOCO}`}
                      aria-label="Puesto de la plaza"
                    >
                      {puestos.map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.nombre}
                        </option>
                      ))}
                    </select>
                  </label>
                  <button
                    type="button"
                    onClick={() => setRenglones((rs) => rs.filter((_, j) => j !== i))}
                    className={`ml-auto min-h-9 rounded-lg px-2 text-sm text-red-700 underline ${FOCO}`}
                  >
                    Quitar
                  </button>
                </div>

                <EditorSueldo
                  valor={r.sueldo}
                  onCambiar={(sueldo) =>
                    setRenglones((rs) => rs.map((x, j) => (j === i ? { ...x, sueldo } : x)))
                  }
                />
              </div>
            ))}

            <button
              type="button"
              disabled={puestos.length === 0}
              onClick={() =>
                setRenglones((rs) => [
                  ...rs,
                  {
                    clave: crypto.randomUUID(),
                    puestoId: puestos[0]?.id ?? '',
                    cuantas: 1,
                    sueldo: SUELDO_NUEVO,
                  },
                ])
              }
              className={`min-h-11 w-full rounded-lg border border-dashed border-neutral-300 px-3 text-sm dark:border-neutral-700 ${FOCO} ${APAGADO}`}
            >
              + Agregar un renglón de plazas
            </button>
          </div>
        )}
      </div>
    </Modal>
  );
}
