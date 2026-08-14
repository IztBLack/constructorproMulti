'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button, Modal } from '@/components/ui';
import { formatCurrency } from '@/lib/data/format';
import {
  ETIQUETA_AJUSTE,
  calcularProyeccion,
  fechaDelDia,
  indiceDiaSemana,
  type AjusteProyeccion,
  type DestinoAjuste,
  type ProyeccionEstado,
  type RepartoAjuste,
  type TipoAjuste,
} from '@/lib/data/proyeccion-nomina';
import type { Asistencia, Colaborador, Destajo, Puesto } from '@/lib/data/types';
import { medianocheMx, partesTz, sumarDiasCalendario } from '@/lib/data/tz';

const DIAS = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'];

type Agrupar = 'cuadrilla' | 'obra' | 'ninguno';

interface Props {
  lunesMs: number;
  /// Índice (0..6) del día de hoy dentro de la semana mostrada, o `null` si la
  /// semana no es la actual. Lo calcula el servidor con el reloj de México.
  hoyIndice: number | null;
  colaboradores: Colaborador[];
  puestos: Puesto[];
  asistencias: Asistencia[];
  destajos: Destajo[];
  obraPorColaborador: Record<string, string>;
  cuadrillaPorColaborador: Record<string, string>;
  nombreObra: Record<string, string>;
  nombreCuadrilla: Record<string, string>;
}

/// La tabla editable de la proyección.
///
/// Todo el escenario vive en el estado de este componente y **nada se guarda**:
/// es la misma decisión que en el móvil. Persistir escenarios son dos tablas y
/// una migración, y todavía no sabemos si la gente los colecciona o solo hace la
/// cuenta antes de ir al banco.
export function TablaProyeccion(props: Props) {
  const {
    lunesMs,
    hoyIndice,
    colaboradores,
    puestos,
    asistencias,
    destajos,
    obraPorColaborador,
    cuadrillaPorColaborador,
    nombreObra,
    nombreCuadrilla,
  } = props;

  const router = useRouter();
  const [obraFiltro, setObraFiltro] = useState<string>('');
  const [agrupar, setAgrupar] = useState<Agrupar>('cuadrilla');
  const [ajusteAbierto, setAjusteAbierto] = useState<
    { destino: DestinoAjuste; destinoId: string; titulo: string } | null
  >(null);

  // ── Escenario inicial ────────────────────────────────────────────────────
  // Cada quien arranca con los días que de verdad trabaja (`dias_semana`), no
  // con «todos de lunes a sábado»: así el número que se ve al abrir ya es
  // defendible sin tocar nada.
  const [estado, setEstado] = useState<ProyeccionEstado>(() => {
    const activos = colaboradores.filter((c) => obraPorColaborador[c.id]);
    const destajoCapturado: Record<string, number> = {};
    for (const d of destajos) {
      destajoCapturado[d.colaborador_id] = (destajoCapturado[d.colaborador_id] ?? 0) + d.monto;
    }
    return {
      lunesMs,
      participantes: activos.map((c) => c.id),
      diasProyectados: Object.fromEntries(
        activos.map((c) => [
          c.id,
          Array.from({ length: Math.min(Math.max(c.dias_semana ?? 6, 1), 7) }, (_, i) => i),
        ]),
      ),
      destajoEstimado: destajoCapturado,
      salarioOverride: {},
      ajustes: [],
      simularCompleta: false,
    };
  });

  // ── Cálculo ──────────────────────────────────────────────────────────────
  const participantesVisibles = useMemo(
    () =>
      estado.participantes.filter(
        (id) => !obraFiltro || obraPorColaborador[id] === obraFiltro,
      ),
    [estado.participantes, obraFiltro, obraPorColaborador],
  );

  const resultado = useMemo(
    () =>
      calcularProyeccion({
        estado: { ...estado, participantes: participantesVisibles },
        colaboradores,
        puestos,
        asistenciasReales: asistencias,
        destajosReales: destajos,
        cuadrillaPorColaborador,
        obraPorColaborador,
      }),
    [
      estado,
      participantesVisibles,
      colaboradores,
      puestos,
      asistencias,
      destajos,
      cuadrillaPorColaborador,
      obraPorColaborador,
    ],
  );

  /// Días ya capturados por persona: la interfaz los bloquea.
  const diasBloqueados = useMemo(() => {
    const mapa: Record<string, Set<number>> = {};
    if (estado.simularCompleta) return mapa;
    for (const a of asistencias) {
      const d = indiceDiaSemana(lunesMs, a.fecha);
      if (d === null) continue;
      (mapa[a.colaborador_id] ??= new Set()).add(d);
    }
    return mapa;
  }, [asistencias, lunesMs, estado.simularCompleta]);

  const candidatos = useMemo(
    () =>
      colaboradores.filter(
        (c) =>
          !estado.participantes.includes(c.id) &&
          (!obraFiltro || obraPorColaborador[c.id] === obraFiltro),
      ),
    [colaboradores, estado.participantes, obraFiltro, obraPorColaborador],
  );

  // ── Mutaciones ───────────────────────────────────────────────────────────
  function alternarDia(colaboradorId: string, dia: number) {
    if (diasBloqueados[colaboradorId]?.has(dia)) return;
    setEstado((e) => {
      const actuales = new Set(e.diasProyectados[colaboradorId] ?? []);
      if (actuales.has(dia)) actuales.delete(dia);
      else actuales.add(dia);
      return {
        ...e,
        diasProyectados: { ...e.diasProyectados, [colaboradorId]: [...actuales].sort() },
      };
    });
  }

  function alternarColumna(dia: number) {
    const movibles = resultado.renglones
      .filter((r) => !r.esDestajista && !diasBloqueados[r.colaborador.id]?.has(dia))
      .map((r) => r.colaborador.id);
    const todosPrendidos =
      movibles.length > 0 &&
      movibles.every((id) => (estado.diasProyectados[id] ?? []).includes(dia));
    setEstado((e) => {
      const mapa = { ...e.diasProyectados };
      for (const id of movibles) {
        const actuales = new Set(mapa[id] ?? []);
        if (todosPrendidos) actuales.delete(dia);
        else actuales.add(dia);
        mapa[id] = [...actuales].sort();
      }
      return { ...e, diasProyectados: mapa };
    });
  }

  function quitar(colaboradorId: string) {
    setEstado((e) => {
      return {
        ...e,
        participantes: e.participantes.filter((id) => id !== colaboradorId),
        diasProyectados: sinClave(e.diasProyectados, colaboradorId),
        destajoEstimado: sinClave(e.destajoEstimado, colaboradorId),
        salarioOverride: sinClave(e.salarioOverride, colaboradorId),
        // Dejar un anticipo colgando de alguien que ya no está sumaría al total
        // sin que se vea de dónde sale.
        ajustes: e.ajustes.filter(
          (a) => !(a.destino === 'COLABORADOR' && a.destinoId === colaboradorId),
        ),
      };
    });
  }

  function agregar(c: Colaborador) {
    // Quien entra a media semana arranca proyectado de hoy en adelante.
    // `hoyIndice` viene del servidor: leer el reloj aquí sería una llamada
    // impura dentro del árbol de React, y además el reloj del navegador puede
    // estar en otra zona que la de la obra.
    const hoy = hoyIndice ?? 0;
    const hasta = Math.min(Math.max(c.dias_semana ?? 6, 1), 7);
    setEstado((e) => ({
      ...e,
      participantes: [...e.participantes, c.id],
      diasProyectados: {
        ...e.diasProyectados,
        [c.id]: Array.from({ length: Math.max(hasta - hoy, 0) }, (_, i) => hoy + i),
      },
    }));
  }

  function setMonto(
    campo: 'destajoEstimado' | 'salarioOverride',
    colaboradorId: string,
    valor: number,
  ) {
    setEstado((e) => ({ ...e, [campo]: { ...e[campo], [colaboradorId]: valor } }));
  }

  function guardarAjuste(a: Omit<AjusteProyeccion, 'id'>) {
    setEstado((e) => ({
      ...e,
      ajustes: [...e.ajustes, { ...a, id: crypto.randomUUID(), monto: Math.abs(a.monto) }],
    }));
    setAjusteAbierto(null);
  }

  function borrarAjuste(id: string) {
    setEstado((e) => ({ ...e, ajustes: e.ajustes.filter((a) => a.id !== id) }));
  }

  function rellenar(modo: 'lunesASabado' | 'sinSabado' | 'conDomingo' | 'limpiar') {
    setEstado((e) => {
      const mapa = { ...e.diasProyectados };
      for (const r of resultado.renglones) {
        if (r.esDestajista) continue;
        const id = r.colaborador.id;
        const bloqueados = diasBloqueados[id] ?? new Set<number>();
        const actuales = new Set(mapa[id] ?? []);
        if (modo === 'lunesASabado') {
          for (let d = 0; d < 6; d++) if (!bloqueados.has(d)) actuales.add(d);
        } else if (modo === 'sinSabado') {
          if (!bloqueados.has(5)) actuales.delete(5);
        } else if (modo === 'conDomingo') {
          if (!bloqueados.has(6)) actuales.add(6);
        } else {
          for (const d of [...actuales]) if (!bloqueados.has(d)) actuales.delete(d);
        }
        mapa[id] = [...actuales].sort();
      }
      return { ...e, diasProyectados: mapa };
    });
  }

  function navegar(dir: number) {
    // Se salta en CALENDARIO, no sumando 7×86 400 000 ms: si alguna vez vuelve
    // el horario de verano, una semana no mide exactamente 168 horas y el salto
    // caería en domingo o en martes. El servidor lo normaliza igual con
    // `navegarSemana`, pero mandarle un lunes de verdad evita depender de eso.
    const p = partesTz(lunesMs);
    const destino = sumarDiasCalendario(p.year, p.month, p.day, dir * 7);
    router.push(
      `/admin/proyeccion?semana=${medianocheMx(destino.y, destino.m0, destino.d)}`,
    );
  }

  // ── Agrupación ───────────────────────────────────────────────────────────
  const grupos = useMemo(() => {
    if (agrupar === 'ninguno') return [{ nombre: null, clave: '', items: resultado.renglones }];
    const orden: string[] = [];
    const mapa = new Map<string, typeof resultado.renglones>();
    for (const r of resultado.renglones) {
      const clave =
        agrupar === 'obra' ? obraPorColaborador[r.colaborador.id] ?? '' : r.cuadrillaId ?? '';
      if (!mapa.has(clave)) {
        mapa.set(clave, []);
        orden.push(clave);
      }
      mapa.get(clave)!.push(r);
    }
    return orden.map((clave) => ({
      clave,
      nombre:
        agrupar === 'obra'
          ? nombreObra[clave] ?? 'Sin obra'
          : nombreCuadrilla[clave] ?? 'Sin cuadrilla',
      items: mapa.get(clave)!,
    }));
  }, [agrupar, resultado, obraPorColaborador, nombreObra, nombreCuadrilla]);

  const rangoTexto = useMemo(() => {
    const l = partesTz(lunesMs);
    const d = partesTz(fechaDelDia(lunesMs, 6));
    return `${l.day}/${l.month} al ${d.day}/${d.month}`;
  }, [lunesMs]);

  return (
    <div className="space-y-4">
      {/* Aviso permanente: el riesgo real es confundir un escenario con la raya. */}
      <div className="flex items-start gap-2 rounded-lg border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-blue-800">
        <span aria-hidden="true">ⓘ</span>
        <p>
          {estado.simularCompleta
            ? 'Hipótesis: se ignora lo capturado y puedes mover toda la semana. Nada de esto toca el pase de lista.'
            : 'Estás proyectando. Las celdas con color ya están capturadas en el pase de lista; las punteadas son estimaciones tuyas.'}
        </p>
      </div>

      {/* Totales */}
      <div className="grid grid-cols-2 gap-px overflow-hidden rounded-lg border border-neutral-200 bg-neutral-200 sm:grid-cols-4">
        <Metrica
          etiqueta="Raya proyectada"
          valor={formatCurrency(resultado.total)}
          detalle={`${formatCurrency(resultado.totalCapturado)} en firme + ${formatCurrency(
            resultado.totalProyectado,
          )} estimado`}
          grande
        />
        <Metrica
          etiqueta="Días-hombre"
          valor={sinCeros(resultado.diasHombre)}
          detalle={`${resultado.personas} personas`}
        />
        <Metrica etiqueta="Pago por día" valor={formatCurrency(resultado.totalDia)} />
        <Metrica
          etiqueta="Ajustes"
          valor={formatCurrency(resultado.totalAjustes)}
          detalle="destajos, anticipos y descuentos"
          tono={resultado.totalAjustes < 0 ? 'negativo' : 'positivo'}
        />
      </div>

      {/* Controles */}
      <div className="flex flex-wrap items-center gap-2">
        <Button variant="secondary" size="sm" onClick={() => navegar(-1)}>
          ‹ Semana anterior
        </Button>
        <span className="text-sm font-medium text-neutral-700">{rangoTexto}</span>
        <Button variant="secondary" size="sm" onClick={() => navegar(1)}>
          Semana siguiente ›
        </Button>

        <select
          value={obraFiltro}
          onChange={(e) => setObraFiltro(e.target.value)}
          className="ml-2 min-h-9 rounded-lg border border-neutral-300 px-2 text-sm"
          aria-label="Filtrar por obra"
        >
          <option value="">Todas las obras</option>
          {Object.entries(nombreObra).map(([id, nombre]) => (
            <option key={id} value={id}>
              {nombre}
            </option>
          ))}
        </select>

        <select
          value={agrupar}
          onChange={(e) => setAgrupar(e.target.value as Agrupar)}
          className="min-h-9 rounded-lg border border-neutral-300 px-2 text-sm"
          aria-label="Agrupar por"
        >
          <option value="cuadrilla">Agrupar por cuadrilla</option>
          <option value="obra">Agrupar por obra</option>
          <option value="ninguno">Sin agrupar</option>
        </select>

        <label className="flex items-center gap-2 text-sm text-neutral-700">
          <input
            type="checkbox"
            checked={estado.simularCompleta}
            onChange={(e) => setEstado((s) => ({ ...s, simularCompleta: e.target.checked }))}
          />
          Simular semana completa
        </label>
      </div>

      <div className="flex flex-wrap gap-2">
        <Button variant="secondary" size="sm" onClick={() => rellenar('lunesASabado')}>
          Completa L–S
        </Button>
        <Button variant="secondary" size="sm" onClick={() => rellenar('sinSabado')}>
          Sin sábado
        </Button>
        <Button variant="secondary" size="sm" onClick={() => rellenar('conDomingo')}>
          Con domingo
        </Button>
        <Button variant="secondary" size="sm" onClick={() => rellenar('limpiar')}>
          Limpiar
        </Button>
      </div>

      {/* La tabla. La primera columna queda congelada con `sticky left-0`: sin
          eso, al deslizar para ver el sábado se pierde de quién es el renglón. */}
      <div className="overflow-x-auto rounded-lg border border-neutral-200">
        <table className="w-full min-w-[860px] border-collapse text-sm">
          <thead>
            <tr className="bg-neutral-50">
              <th className="sticky left-0 z-10 bg-neutral-50 px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide text-neutral-500">
                Colaborador
              </th>
              <th className="px-2 py-2 text-right text-xs font-semibold uppercase tracking-wide text-neutral-500">
                $/día
              </th>
              {DIAS.map((d, i) => (
                <th key={d} className="px-1 py-2 text-center">
                  <button
                    type="button"
                    onClick={() => alternarColumna(i)}
                    className="w-full rounded px-1 py-0.5 text-xs font-semibold text-neutral-700 hover:bg-blue-50 hover:text-blue-700"
                    title="Prender o apagar toda la columna"
                  >
                    {d}
                    <span className="block text-[10px] font-normal text-neutral-400">
                      {partesTz(fechaDelDia(lunesMs, i)).day}
                    </span>
                  </button>
                </th>
              ))}
              <th className="px-2 py-2 text-right text-xs font-semibold uppercase tracking-wide text-neutral-500">
                Días
              </th>
              <th className="px-3 py-2 text-right text-xs font-semibold uppercase tracking-wide text-neutral-500">
                Subtotal
              </th>
              <th className="w-10 px-1 py-2" />
            </tr>
          </thead>

          <tbody>
            {grupos.map((g) => (
              <GrupoFilas
                key={g.clave || 'todos'}
                nombre={g.nombre}
                items={g.items}
                agrupar={agrupar}
                nombreCuadrilla={nombreCuadrilla}
                diasBloqueados={diasBloqueados}
                onAlternarDia={alternarDia}
                onQuitar={quitar}
                onSalario={(id, v) => setMonto('salarioOverride', id, v)}
                onDestajo={(id, v) => setMonto('destajoEstimado', id, v)}
                onAjusteColaborador={(id, nombre) =>
                  setAjusteAbierto({ destino: 'COLABORADOR', destinoId: id, titulo: nombre })
                }
                onAjusteCuadrilla={(id, nombre) =>
                  setAjusteAbierto({ destino: 'CUADRILLA', destinoId: id, titulo: nombre })
                }
              />
            ))}

            {/* Ajustes de cuadrilla que NO se repartieron: son parte del total y
                sin ellos la suma de los renglones no daría el gran total. */}
            {resultado.lineasCuadrilla
              .filter((l) => !l.repartido)
              .map((l) => (
                <tr key={l.ajuste.id} className="border-t border-neutral-100">
                  <td className="sticky left-0 z-10 bg-white px-3 py-2">
                    <span className="font-medium text-purple-700">
                      {ETIQUETA_AJUSTE[l.ajuste.tipo]} · {nombreCuadrilla[l.cuadrillaId] ?? 'Cuadrilla'}
                    </span>
                    <span className="block text-xs text-neutral-500">
                      {l.ajuste.nota || 'a la cuadrilla'}
                    </span>
                  </td>
                  <td colSpan={9} />
                  <td
                    className={`px-3 py-2 text-right font-semibold tabular-nums ${
                      l.montoConSigno < 0 ? 'text-red-700' : 'text-green-700'
                    }`}
                  >
                    {formatCurrency(l.montoConSigno)}
                  </td>
                  <td className="px-1 text-center">
                    <button
                      type="button"
                      onClick={() => borrarAjuste(l.ajuste.id)}
                      className="rounded px-1 text-neutral-400 hover:bg-red-50 hover:text-red-700"
                      aria-label="Quitar el ajuste"
                    >
                      ×
                    </button>
                  </td>
                </tr>
              ))}
          </tbody>

          <tfoot>
            <tr className="border-t-2 border-neutral-300 bg-neutral-50">
              <td className="sticky left-0 z-10 bg-neutral-50 px-3 py-2 text-xs font-semibold uppercase tracking-wide text-neutral-500">
                Total por día
              </td>
              <td />
              {resultado.totalPorDia.map((monto, i) => (
                <td key={i} className="px-1 py-2 text-center">
                  <span className="block text-xs font-bold tabular-nums text-neutral-900">
                    {resultado.personasPorDia[i] === 0 ? '—' : compacto(monto)}
                  </span>
                  <span className="block text-[10px] text-neutral-500">
                    {resultado.personasPorDia[i] === 0 ? '' : `${resultado.personasPorDia[i]}p`}
                  </span>
                </td>
              ))}
              <td className="px-2 py-2 text-right text-sm tabular-nums text-neutral-700">
                {sinCeros(resultado.diasHombre)}
              </td>
              <td className="px-3 py-2 text-right text-base font-bold tabular-nums text-neutral-900">
                {formatCurrency(resultado.total)}
              </td>
              <td />
            </tr>
          </tfoot>
        </table>
      </div>

      {/* Agregar participantes */}
      {candidatos.length > 0 && (
        <div className="space-y-2">
          <p className="text-xs font-semibold uppercase tracking-wide text-neutral-500">
            Agregar a la proyección
          </p>
          <div className="flex flex-wrap gap-2">
            {candidatos.map((c) => (
              <button
                key={c.id}
                type="button"
                onClick={() => agregar(c)}
                className="inline-flex min-h-9 items-center gap-2 rounded-full border border-dashed border-neutral-300 px-3 text-sm text-neutral-700 hover:border-blue-500 hover:text-blue-700"
              >
                + {c.nombre}
                <span className="text-xs text-neutral-400">
                  {c.tipo_pago === 'DESTAJO' ? 'destajo' : `${c.dias_semana ?? 6} días`}
                </span>
              </button>
            ))}
          </div>
        </div>
      )}

      {ajusteAbierto && (
        <ModalAjuste
          titulo={ajusteAbierto.titulo}
          destino={ajusteAbierto.destino}
          destinoId={ajusteAbierto.destinoId}
          onGuardar={guardarAjuste}
          onCerrar={() => setAjusteAbierto(null)}
        />
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════

function GrupoFilas(props: {
  nombre: string | null;
  items: ReturnType<typeof calcularProyeccion>['renglones'];
  agrupar: Agrupar;
  nombreCuadrilla: Record<string, string>;
  diasBloqueados: Record<string, Set<number>>;
  onAlternarDia: (id: string, dia: number) => void;
  onQuitar: (id: string) => void;
  onSalario: (id: string, v: number) => void;
  onDestajo: (id: string, v: number) => void;
  onAjusteColaborador: (id: string, nombre: string) => void;
  onAjusteCuadrilla: (id: string, nombre: string) => void;
}) {
  const { nombre, items, agrupar } = props;
  const subtotal = items.reduce((a, r) => a + r.total, 0);
  const cuadrillaId = agrupar === 'cuadrilla' ? items[0]?.cuadrillaId ?? null : null;

  return (
    <>
      {nombre && (
        <tr className="bg-neutral-50">
          <td className="sticky left-0 z-10 bg-neutral-50 px-3 py-1.5 text-xs font-semibold text-neutral-800">
            {nombre}
            <span className="ml-2 font-normal text-neutral-500">{items.length}</span>
          </td>
          <td colSpan={9} className="px-2">
            {cuadrillaId && (
              <button
                type="button"
                onClick={() => props.onAjusteCuadrilla(cuadrillaId, nombre)}
                className="rounded px-2 py-0.5 text-xs text-neutral-500 hover:bg-neutral-200 hover:text-neutral-900"
              >
                + ajuste a la cuadrilla
              </button>
            )}
          </td>
          <td className="px-3 py-1.5 text-right text-xs font-bold tabular-nums text-neutral-900">
            {formatCurrency(subtotal)}
          </td>
          <td />
        </tr>
      )}

      {items.map((r) => (
        <tr key={r.colaborador.id} className="border-t border-neutral-100">
          <td className="sticky left-0 z-10 bg-white px-3 py-2">
            <span className="block font-medium text-neutral-900">{r.colaborador.nombre}</span>
            <span className="block text-xs text-neutral-500">
              {r.esDestajista ? 'A destajo' : r.puestoNombre}
            </span>
          </td>

          <td className="px-2 py-2 text-right">
            {r.esDestajista ? (
              <span className="text-neutral-400">—</span>
            ) : (
              <input
                type="number"
                value={r.salarioDia}
                min={0}
                step={10}
                onChange={(e) => props.onSalario(r.colaborador.id, Number(e.target.value) || 0)}
                className="w-20 rounded border border-transparent px-1 py-0.5 text-right tabular-nums hover:border-neutral-300 focus:border-blue-500 focus:outline-none"
                aria-label={`Salario por día de ${r.colaborador.nombre}`}
              />
            )}
          </td>

          {r.esDestajista ? (
            <td colSpan={7} className="px-2 py-2">
              <input
                type="number"
                value={r.destajo}
                min={0}
                step={100}
                onChange={(e) => props.onDestajo(r.colaborador.id, Number(e.target.value) || 0)}
                className="w-40 rounded border border-dashed border-purple-400 px-2 py-1 text-right tabular-nums text-purple-700 focus:outline-none"
                aria-label={`Destajo estimado de ${r.colaborador.nombre}`}
              />
              <span className="ml-2 text-xs text-neutral-500">
                {r.destajoIncongruente
                  ? `menos que los ${formatCurrency(r.destajoCapturado)} ya registrados`
                  : 'estimado de la semana · la asistencia no lo mueve'}
              </span>
            </td>
          ) : (
            r.celdas.map((celda) => (
              <td key={celda.indice} className="px-1 py-1 text-center">
                <CeldaDiaBoton
                  celda={celda}
                  onClick={() => props.onAlternarDia(r.colaborador.id, celda.indice)}
                  nombre={r.colaborador.nombre}
                />
              </td>
            ))
          )}

          <td className="px-2 py-2 text-right tabular-nums text-neutral-700">
            {r.esDestajista ? '—' : sinCeros(r.diasTotales)}
          </td>

          <td className="px-3 py-2 text-right">
            <span className="block font-semibold tabular-nums text-neutral-900">
              {formatCurrency(r.total)}
            </span>
            {r.ajustes !== 0 && (
              <span
                className={`block text-xs tabular-nums ${
                  r.ajustes < 0 ? 'text-red-700' : 'text-green-700'
                }`}
              >
                {r.ajustes > 0 ? '+' : ''}
                {formatCurrency(r.ajustes)}
              </span>
            )}
          </td>

          <td className="px-1 text-center">
            <button
              type="button"
              onClick={() => props.onAjusteColaborador(r.colaborador.id, r.colaborador.nombre)}
              className="rounded px-1 text-neutral-400 hover:bg-neutral-100 hover:text-neutral-900"
              title="Agregar destajo, anticipo o descuento"
              aria-label={`Ajuste para ${r.colaborador.nombre}`}
            >
              +
            </button>
            <button
              type="button"
              onClick={() => props.onQuitar(r.colaborador.id)}
              className="rounded px-1 text-neutral-400 hover:bg-red-50 hover:text-red-700"
              title="Quitar de la proyección (no lo da de baja)"
              aria-label={`Quitar a ${r.colaborador.nombre} de la proyección`}
            >
              ×
            </button>
          </td>
        </tr>
      ))}
    </>
  );
}

/// Los cuatro estados se distinguen por FORMA además de por color (relleno vs.
/// punteado, palomita vs. guion vs. punto): el color solo no comunica.
function CeldaDiaBoton(props: {
  celda: { indice: number; origen: string; fraccion: number };
  onClick: () => void;
  nombre: string;
}) {
  const { celda, onClick, nombre } = props;
  const bloqueada = celda.origen === 'REAL';

  let clase = 'border border-dashed border-neutral-300 text-neutral-300';
  let simbolo = '·';
  let descripcion = 'no cuenta';

  if (celda.origen === 'REAL' && celda.fraccion > 0) {
    clase = 'bg-green-100 text-green-700 border border-green-100';
    simbolo = '✓';
    descripcion = 'asistió (capturado)';
  } else if (celda.origen === 'REAL') {
    clase = 'bg-red-100 text-red-700 border border-red-100';
    simbolo = '–';
    descripcion = 'faltó (capturado)';
  } else if (celda.origen === 'PROYECTADA') {
    clase = 'border border-dashed border-indigo-500 text-indigo-600';
    simbolo = '✓';
    descripcion = 'se espera que asista';
  }

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={bloqueada}
      title={
        bloqueada
          ? 'Ya está en el pase de lista. Prende «Simular semana completa» para moverlo.'
          : undefined
      }
      aria-label={`${nombre}, ${DIAS[celda.indice]}: ${descripcion}`}
      className={`inline-flex h-8 w-8 items-center justify-center rounded-lg text-sm font-bold ${clase} ${
        bloqueada ? 'cursor-default' : 'hover:bg-indigo-50'
      }`}
    >
      {simbolo}
    </button>
  );
}

function ModalAjuste(props: {
  titulo: string;
  destino: DestinoAjuste;
  destinoId: string;
  onGuardar: (a: Omit<AjusteProyeccion, 'id'>) => void;
  onCerrar: () => void;
}) {
  const [tipo, setTipo] = useState<TipoAjuste>('DESTAJO');
  const [monto, setMonto] = useState('');
  const [nota, setNota] = useState('');
  const [reparto, setReparto] = useState<RepartoAjuste>('PARTES_IGUALES');
  const valor = Math.abs(Number(monto) || 0);

  const explicacion: Record<TipoAjuste, string> = {
    DESTAJO: 'Trabajo a precio alzado que se paga ADEMÁS de los días.',
    ANTICIPO: 'Dinero que ya se entregó a cuenta de esta raya.',
    DESCUENTO: 'Préstamo, herramienta o material a descontar.',
  };

  return (
    <Modal
      open
      onClose={props.onCerrar}
      title="Nuevo ajuste"
      footer={
        <>
          <Button variant="secondary" onClick={props.onCerrar}>
            Cancelar
          </Button>
          <Button
            disabled={valor <= 0}
            onClick={() =>
              props.onGuardar({
                tipo,
                destino: props.destino,
                destinoId: props.destinoId,
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
          {props.destino === 'CUADRILLA' ? `Cuadrilla ${props.titulo}` : props.titulo}
        </p>

        <div className="flex gap-2">
          {(['DESTAJO', 'ANTICIPO', 'DESCUENTO'] as TipoAjuste[]).map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => setTipo(t)}
              className={`min-h-9 flex-1 rounded-lg border px-3 text-sm ${
                tipo === t
                  ? 'border-blue-500 bg-blue-50 font-semibold text-blue-700'
                  : 'border-neutral-300 text-neutral-700'
              }`}
            >
              {ETIQUETA_AJUSTE[t]}
            </button>
          ))}
        </div>
        <p className="text-xs text-neutral-500">{explicacion[tipo]}</p>

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
          {valor > 0 && (
            <span
              className={`text-xs font-semibold ${
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

        {props.destino === 'CUADRILLA' && (
          <fieldset className="space-y-2">
            <legend className="text-sm font-medium text-neutral-700">¿Cómo se reparte?</legend>
            {(
              [
                ['PARTES_IGUALES', 'En partes iguales', 'Entre los miembros que están en la proyección.'],
                ['A_LA_CUADRILLA', 'Como renglón de la cuadrilla', 'Para cuando el maestro cobra el alzado y él reparte.'],
              ] as [RepartoAjuste, string, string][]
            ).map(([valorOpt, titulo, ayuda]) => (
              <label key={valorOpt} className="flex gap-2 text-sm">
                <input
                  type="radio"
                  name="reparto"
                  checked={reparto === valorOpt}
                  onChange={() => setReparto(valorOpt)}
                />
                <span>
                  <span className="block text-neutral-900">{titulo}</span>
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

function Metrica(props: {
  etiqueta: string;
  valor: string;
  detalle?: string;
  grande?: boolean;
  tono?: 'positivo' | 'negativo';
}) {
  const color =
    props.tono === 'negativo'
      ? 'text-red-700'
      : props.tono === 'positivo'
        ? 'text-green-700'
        : 'text-neutral-900';
  return (
    <div className="bg-white px-4 py-3">
      <span className="block text-[10px] font-semibold uppercase tracking-wider text-neutral-500">
        {props.etiqueta}
      </span>
      <span
        className={`block font-bold tabular-nums ${color} ${
          props.grande ? 'text-2xl' : 'text-lg'
        }`}
      >
        {props.valor}
      </span>
      {props.detalle && <span className="block text-xs text-neutral-500">{props.detalle}</span>}
    </div>
  );
}

function sinCeros(v: number): string {
  return Number.isInteger(v) ? v.toFixed(0) : v.toFixed(2);
}

/// Copia del objeto sin una clave, sin dejar variables sueltas que el linter
/// marque como no usadas.
function sinClave<T>(obj: Record<string, T>, clave: string): Record<string, T> {
  const copia = { ...obj };
  delete copia[clave];
  return copia;
}

/// Miles abreviados: en una celda de día no cabe «$12,120».
function compacto(v: number): string {
  return Math.abs(v) >= 1000 ? `${(v / 1000).toFixed(1)}k` : v.toFixed(0);
}
