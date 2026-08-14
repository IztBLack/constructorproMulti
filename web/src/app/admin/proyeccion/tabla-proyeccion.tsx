'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button, Modal } from '@/components/ui';
import { formatCurrency } from '@/lib/data/format';
import {
  ETIQUETA_AJUSTE,
  calcularProyeccion,
  fechaDelDia,
  indiceDiaSemana,
  obraBaseEfectiva,
  participantesDeObra,
  type AjusteProyeccion,
  type DestinoAjuste,
  type ProyeccionEstado,
} from '@/lib/data/proyeccion-nomina';
import type { Asistencia, Colaborador, Destajo, Puesto } from '@/lib/data/types';
import { medianocheMx, partesTz, sumarDiasCalendario } from '@/lib/data/tz';
import { FichaPersona } from './ficha-persona';
import { GestorParticipantes } from './gestor-participantes';
import { ModalAjuste } from './modal-ajuste';

const DIAS = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'];

type Agrupar = 'cuadrilla' | 'obra' | 'ninguno';

interface Props {
  lunesMs: number;
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
  const [obraFiltro, setObraFiltro] = useState('');
  const [agrupar, setAgrupar] = useState<Agrupar>('cuadrilla');
  const [fichaAbierta, setFichaAbierta] = useState<string | null>(null);
  const [gestorAbierto, setGestorAbierto] = useState(false);
  const [confirmarSemana, setConfirmarSemana] = useState<number | null>(null);
  const [ajusteAbierto, setAjusteAbierto] = useState<{
    destino: DestinoAjuste;
    destinoId: string;
    titulo: string;
    existente?: AjusteProyeccion;
  } | null>(null);

  // ── Escenario ────────────────────────────────────────────────────────────
  const estadoInicial = useMemo<ProyeccionEstado>(() => {
    const activos = colaboradores.filter((c) => obraPorColaborador[c.id]);
    const destajoCapturado: Record<string, number> = {};
    for (const d of destajos) {
      destajoCapturado[d.colaborador_id] = (destajoCapturado[d.colaborador_id] ?? 0) + d.monto;
    }
    return {
      lunesMs,
      participantes: activos.map((c) => c.id),
      // Cada quien arranca con los días que de verdad trabaja, no con «todos
      // L–S»: así el número de la primera pantalla ya es defendible.
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
      obraPorDia: {},
      obraBase: {},
    };
  }, [colaboradores, obraPorColaborador, destajos, lunesMs]);

  const [estado, setEstado] = useState<ProyeccionEstado>(estadoInicial);

  /// Dónde trabaja cada quien, ya con lo que el escenario haya asignado encima
  /// (para quien no tenía obra en el sistema). Todo lo demás parte de aquí.
  const obraDe = useMemo(
    () => obraBaseEfectiva(estado, obraPorColaborador),
    [estado, obraPorColaborador],
  );

  /// ¿El usuario ya invirtió trabajo aquí? Decide si se le pregunta antes de
  /// tirarlo. Comparar el estado completo es suficiente y no necesita banderas
  /// que alguien olvide poner al agregar una mutación nueva.
  const tocado = useMemo(
    () => JSON.stringify(estado) !== JSON.stringify(estadoInicial),
    [estado, estadoInicial],
  );

  const participantesVisibles = useMemo(
    () => participantesDeObra(estado, obraDe, obraFiltro || null),
    [estado, obraFiltro, obraDe],
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
        obraPorColaborador: obraDe,
        obraFiltro: obraFiltro || null,
      }),
    [
      estado,
      participantesVisibles,
      colaboradores,
      puestos,
      asistencias,
      destajos,
      cuadrillaPorColaborador,
      obraDe,
      obraFiltro,
    ],
  );

  // ── Delta: decir QUÉ cambió, no solo cambiar el número ───────────────────
  const totalPrevio = useRef(resultado.total);
  const [delta, setDelta] = useState<number | null>(null);

  useEffect(() => {
    const diferencia = resultado.total - totalPrevio.current;
    totalPrevio.current = resultado.total;
    if (Math.abs(diferencia) < 0.005) return;
    setDelta(diferencia);
    const t = setTimeout(() => setDelta(null), 2600);
    return () => clearTimeout(t);
  }, [resultado.total]);

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

  /// ¿Está la columna entera prendida? Sirve para que el encabezado ANUNCIE lo
  /// que va a hacer en vez de que haya que tocarlo para averiguarlo.
  function columnaLlena(dia: number): boolean {
    const movibles = resultado.renglones.filter((r) => !r.esDestajista);
    return (
      movibles.length > 0 &&
      movibles.every((r) => r.celdas[dia].fraccion > 0)
    );
  }

  function alternarColumna(dia: number) {
    const movibles = resultado.renglones
      .filter((r) => !r.esDestajista && !diasBloqueados[r.colaborador.id]?.has(dia))
      .map((r) => r.colaborador.id);

    // Un control que no puede hacer nada tiene que decirlo, no quedarse callado.
    if (movibles.length === 0) {
      setAvisoColumna(`Todos ya tienen el ${DIAS[dia].toLowerCase()} en el pase de lista.`);
      return;
    }
    const todosPrendidos = movibles.every((id) =>
      (estado.diasProyectados[id] ?? []).includes(dia),
    );
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

  const [avisoColumna, setAvisoColumna] = useState<string | null>(null);
  useEffect(() => {
    if (!avisoColumna) return;
    const t = setTimeout(() => setAvisoColumna(null), 3000);
    return () => clearTimeout(t);
  }, [avisoColumna]);

  function quitar(colaboradorId: string) {
    setEstado((e) => ({
      ...e,
      participantes: e.participantes.filter((id) => id !== colaboradorId),
      diasProyectados: sinClave(e.diasProyectados, colaboradorId),
      destajoEstimado: sinClave(e.destajoEstimado, colaboradorId),
      salarioOverride: sinClave(e.salarioOverride, colaboradorId),
      // Un anticipo colgando de alguien que ya no está sumaría al total sin que
      // se vea de dónde sale.
      ajustes: e.ajustes.filter(
        (a) => !(a.destino === 'COLABORADOR' && a.destinoId === colaboradorId),
      ),
    }));
  }

  /// Mete a alguien al escenario. `obraAsignada` solo se usa para quien no
  /// tiene obra en el sistema: sin ella sus días no pertenecerían a ninguna y no
  /// sumarían a la raya de nadie.
  function agregar(colaboradorId: string, obraAsignada: string | null) {
    const c = colaboradores.find((x) => x.id === colaboradorId);
    if (!c) return;
    const hoy = hoyIndice ?? 0;
    const hasta = Math.min(Math.max(c.dias_semana ?? 6, 1), 7);
    setEstado((e) => ({
      ...e,
      participantes: [...e.participantes, c.id],
      // Quien entra a media semana arranca proyectado de hoy en adelante: no
      // tiene sentido proponerle días que ya pasaron sin que estuviera.
      diasProyectados: {
        ...e.diasProyectados,
        [c.id]: Array.from({ length: Math.max(hasta - hoy, 0) }, (_, i) => hoy + i),
      },
      obraBase: obraAsignada ? { ...e.obraBase, [c.id]: obraAsignada } : e.obraBase,
    }));
  }

  function setSalario(colaboradorId: string, valor: number | null) {
    setEstado((e) => ({
      ...e,
      salarioOverride:
        valor === null
          ? sinClave(e.salarioOverride, colaboradorId)
          : { ...e.salarioOverride, [colaboradorId]: valor },
    }));
  }

  /// Presta (o devuelve) un día de una persona a otra obra.
  ///
  /// Mover un día lo marca además como asistido: si dices «el jueves se va a
  /// Alfaro» es porque va a trabajar allá, y tener que prenderlo aparte sería un
  /// paso que nadie entiende para qué es.
  function moverDia(colaboradorId: string, dia: number, obraDestino: string | null) {
    setEstado((e) => {
      const deLaPersona = { ...(e.obraPorDia[colaboradorId] ?? {}) };
      if (obraDestino === null) delete deLaPersona[dia];
      else deLaPersona[dia] = obraDestino;

      const obraPorDia = { ...e.obraPorDia };
      if (Object.keys(deLaPersona).length === 0) delete obraPorDia[colaboradorId];
      else obraPorDia[colaboradorId] = deLaPersona;

      const dias = new Set(e.diasProyectados[colaboradorId] ?? []);
      if (obraDestino !== null) dias.add(dia);

      return {
        ...e,
        obraPorDia,
        diasProyectados: {
          ...e.diasProyectados,
          [colaboradorId]: [...dias].sort((a, b) => a - b),
        },
      };
    });
  }

  function setDestajo(colaboradorId: string, valor: number) {
    setEstado((e) => ({
      ...e,
      destajoEstimado: { ...e.destajoEstimado, [colaboradorId]: valor },
    }));
  }

  /// Alta Y edición: empareja por id, igual que el móvil.
  function guardarAjuste(a: AjusteProyeccion) {
    setEstado((e) => {
      const i = e.ajustes.findIndex((x) => x.id === a.id);
      const lista = [...e.ajustes];
      if (i >= 0) lista[i] = a;
      else lista.push(a);
      return { ...e, ajustes: lista };
    });
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

  function irASemana(dir: number) {
    const p = partesTz(lunesMs);
    const destino = sumarDiasCalendario(p.year, p.month, p.day, dir * 7);
    const ms = medianocheMx(destino.y, destino.m0, destino.d);
    // El escenario vive en memoria: cambiar de semana lo borra. Si hay trabajo
    // invertido, se pregunta — el mismo daño que «Reiniciar», que sí preguntaba.
    if (tocado) setConfirmarSemana(ms);
    else router.push(`/admin/proyeccion?semana=${ms}`);
  }

  // ── Agrupación ───────────────────────────────────────────────────────────
  const grupos = useMemo(() => {
    if (agrupar === 'ninguno') return [{ nombre: null, clave: '', items: resultado.renglones }];
    const orden: string[] = [];
    const mapa = new Map<string, typeof resultado.renglones>();
    for (const r of resultado.renglones) {
      const clave =
        agrupar === 'obra' ? obraDe[r.colaborador.id] ?? '' : r.cuadrillaId ?? '';
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
  }, [agrupar, resultado, obraDe, nombreObra, nombreCuadrilla]);

  const rangoTexto = useMemo(() => {
    const l = partesTz(lunesMs);
    const d = partesTz(fechaDelDia(lunesMs, 6));
    return `${l.day}/${l.month} al ${d.day}/${d.month}`;
  }, [lunesMs]);

  const renglonAbierto = resultado.renglones.find((r) => r.colaborador.id === fichaAbierta);

  return (
    <div className="space-y-4">
      <TarjetaEscenario
        resultado={resultado}
        delta={delta}
        rangoTexto={rangoTexto}
        obraNombre={obraFiltro ? nombreObra[obraFiltro] ?? '' : ''}
        tocado={tocado}
        simularCompleta={estado.simularCompleta}
        onSimularCompleta={(v) => setEstado((e) => ({ ...e, simularCompleta: v }))}
        onSemana={irASemana}
      />

      {/* Controles */}
      <div className="flex flex-wrap items-center gap-2">
        <select
          value={obraFiltro}
          onChange={(e) => setObraFiltro(e.target.value)}
          className="min-h-11 rounded-lg border border-neutral-300 px-2 text-sm"
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
          className="min-h-11 rounded-lg border border-neutral-300 px-2 text-sm"
          aria-label="Agrupar por"
        >
          <option value="cuadrilla">Agrupar por cuadrilla</option>
          <option value="obra">Agrupar por obra</option>
          <option value="ninguno">Sin agrupar</option>
        </select>

        <Button variant="secondary" size="sm" onClick={() => setGestorAbierto(true)}>
          Participantes · {estado.participantes.length}
        </Button>

        <span className="ml-auto flex flex-wrap gap-2">
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
        </span>
      </div>

      {avisoColumna && (
        <p role="status" className="rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-800">
          {avisoColumna}
        </p>
      )}

      {/* La tabla */}
      <div className="overflow-x-auto rounded-lg border border-neutral-200">
        <table className="w-full min-w-[780px] border-collapse text-sm">
          <thead>
            <tr className="bg-neutral-50">
              <th className="sticky left-0 z-10 bg-neutral-50 px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide text-neutral-500">
                Colaborador
              </th>
              <th className="px-2 py-2 text-right text-xs font-semibold uppercase tracking-wide text-neutral-500">
                $/día
              </th>
              {DIAS.map((d, i) => {
                const llena = columnaLlena(i);
                return (
                  <th key={d} className="px-1 py-1.5 text-center">
                    <button
                      type="button"
                      onClick={() => alternarColumna(i)}
                      aria-pressed={llena}
                      title={
                        llena
                          ? `Apagar el ${d.toLowerCase()} para todos`
                          : `Prender el ${d.toLowerCase()} para todos`
                      }
                      className={`w-full rounded-lg border px-1 py-1 text-xs font-semibold ${
                        llena
                          ? 'border-blue-700 bg-blue-700 text-white'
                          : 'border-neutral-200 bg-white text-neutral-700 hover:border-indigo-500 hover:text-blue-800'
                      } ${i === hoyIndice ? 'ring-1 ring-indigo-500' : ''}`}
                    >
                      {d}
                      <span
                        className={`block text-[10px] font-normal ${
                          llena ? 'text-blue-100' : 'text-neutral-500'
                        }`}
                      >
                        {partesTz(fechaDelDia(lunesMs, i)).day}
                      </span>
                    </button>
                  </th>
                );
              })}
              <th className="px-2 py-2 text-right text-xs font-semibold uppercase tracking-wide text-neutral-500">
                Días
              </th>
              <th className="px-3 py-2 text-right text-xs font-semibold uppercase tracking-wide text-neutral-500">
                Subtotal
              </th>
            </tr>
          </thead>

          <tbody>
            {grupos.map((g) => (
              <GrupoFilas
                key={g.clave || 'todos'}
                nombre={g.nombre}
                items={g.items}
                agrupar={agrupar}
                nombreObra={nombreObra}
                onAlternarDia={alternarDia}
                onAbrirFicha={setFichaAbierta}
                onAjusteCuadrilla={(id, nombre) =>
                  setAjusteAbierto({ destino: 'CUADRILLA', destinoId: id, titulo: nombre })
                }
              />
            ))}

            {resultado.lineasCuadrilla
              .filter((l) => !l.repartido)
              .map((l) => (
                <tr key={l.ajuste.id} className="border-t border-neutral-100">
                  <td className="sticky left-0 z-10 bg-white px-3 py-2">
                    <button
                      type="button"
                      onClick={() =>
                        setAjusteAbierto({
                          destino: 'CUADRILLA',
                          destinoId: l.cuadrillaId,
                          titulo: nombreCuadrilla[l.cuadrillaId] ?? 'Cuadrilla',
                          existente: l.ajuste,
                        })
                      }
                      className="text-left"
                    >
                      <span className="block text-sm font-medium text-purple-700 underline decoration-purple-700/40 underline-offset-2">
                        {ETIQUETA_AJUSTE[l.ajuste.tipo]} ·{' '}
                        {nombreCuadrilla[l.cuadrillaId] ?? 'Cuadrilla'}
                      </span>
                      <span className="block text-xs text-neutral-500">
                        {l.ajuste.nota || 'a la cuadrilla'}
                      </span>
                    </button>
                  </td>
                  <td colSpan={9} />
                  <td
                    className={`px-3 py-2 text-right font-semibold tabular-nums ${
                      l.montoConSigno < 0 ? 'text-red-700' : 'text-green-700'
                    }`}
                  >
                    {formatCurrency(l.montoConSigno)}
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
            </tr>
          </tfoot>
        </table>
      </div>

      <p className="text-xs text-neutral-500">
        La proyección trae a todos los colaboradores asignados a una obra activa.
        Con <strong>Participantes</strong> puedes sacar o meter gente solo para esta
        cuenta — incluidos los que todavía no están asignados a ninguna obra.
      </p>

      {/* ── Capas ────────────────────────────────────────────────────────── */}
      {renglonAbierto && (
        <FichaPersona
          renglon={renglonAbierto}
          obraNombre={nombreObra[obraDe[renglonAbierto.colaborador.id] ?? ''] ?? ''}
          cuadrillaNombre={
            renglonAbierto.cuadrillaId ? nombreCuadrilla[renglonAbierto.cuadrillaId] ?? null : null
          }
          ajustes={estado.ajustes.filter(
            (a) => a.destino === 'COLABORADOR' && a.destinoId === renglonAbierto.colaborador.id,
          )}
          tieneSalarioPropio={
            estado.salarioOverride[renglonAbierto.colaborador.id] !== undefined
          }
          simularCompleta={estado.simularCompleta}
          obraBaseId={obraDe[renglonAbierto.colaborador.id] ?? ''}
          obras={Object.entries(nombreObra).map(([id, nombre]) => ({ id, nombre }))}
          prestamos={estado.obraPorDia[renglonAbierto.colaborador.id] ?? {}}
          onMoverDia={(d, obra) => moverDia(renglonAbierto.colaborador.id, d, obra)}
          onAlternarDia={(d) => alternarDia(renglonAbierto.colaborador.id, d)}
          onSalario={(v) => setSalario(renglonAbierto.colaborador.id, v)}
          onDestajo={(v) => setDestajo(renglonAbierto.colaborador.id, v)}
          onSimularCompleta={(v) => setEstado((e) => ({ ...e, simularCompleta: v }))}
          onNuevoAjuste={() =>
            setAjusteAbierto({
              destino: 'COLABORADOR',
              destinoId: renglonAbierto.colaborador.id,
              titulo: renglonAbierto.colaborador.nombre,
            })
          }
          onEditarAjuste={(a) =>
            setAjusteAbierto({
              destino: 'COLABORADOR',
              destinoId: renglonAbierto.colaborador.id,
              titulo: renglonAbierto.colaborador.nombre,
              existente: a,
            })
          }
          onQuitarPersona={() => {
            quitar(renglonAbierto.colaborador.id);
            setFichaAbierta(null);
          }}
          onCerrar={() => setFichaAbierta(null)}
        />
      )}

      {gestorAbierto && (
        <GestorParticipantes
          colaboradores={colaboradores}
          participantes={estado.participantes}
          obraDe={obraDe}
          obras={Object.entries(nombreObra).map(([id, nombre]) => ({ id, nombre }))}
          obraSugerida={obraFiltro || null}
          onAgregar={agregar}
          onQuitar={quitar}
          onCerrar={() => setGestorAbierto(false)}
        />
      )}

      {ajusteAbierto && (
        <ModalAjuste
          titulo={ajusteAbierto.titulo}
          destino={ajusteAbierto.destino}
          destinoId={ajusteAbierto.destinoId}
          existente={ajusteAbierto.existente}
          onGuardar={guardarAjuste}
          onQuitar={borrarAjuste}
          onCerrar={() => setAjusteAbierto(null)}
        />
      )}

      {confirmarSemana !== null && (
        <Modal
          open
          onClose={() => setConfirmarSemana(null)}
          title="¿Cambiar de semana?"
          size="sm"
          footer={
            <>
              <Button variant="secondary" onClick={() => setConfirmarSemana(null)}>
                Quedarme aquí
              </Button>
              <Button onClick={() => router.push(`/admin/proyeccion?semana=${confirmarSemana}`)}>
                Ir de todos modos
              </Button>
            </>
          }
        >
          <p className="text-sm text-neutral-700">
            Se pierde lo que armaste en esta semana: los días, los salarios y los ajustes. La
            proyección no se guarda.
          </p>
        </Modal>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════

/// Una sola tarjeta con lo que hay que entender en cinco segundos: qué es esto,
/// cuánto da, y por qué unas celdas se ven distinto.
///
/// Antes eran tres bandas apiladas (aviso + totales + controles) que se comían
/// la pantalla antes del primer renglón, y la leyenda no existía en ningún lado.
function TarjetaEscenario(props: {
  resultado: ReturnType<typeof calcularProyeccion>;
  delta: number | null;
  rangoTexto: string;
  /// Nombre de la obra que se está viendo, o vacío si son todas.
  obraNombre: string;
  tocado: boolean;
  simularCompleta: boolean;
  onSimularCompleta: (v: boolean) => void;
  onSemana: (dir: number) => void;
}) {
  const { resultado: r, delta, simularCompleta } = props;
  const [leyendaAbierta, setLeyendaAbierta] = useState(false);

  return (
    <section className="rounded-xl border border-neutral-200 bg-white p-4 sm:p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <span
          className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold ${
            simularCompleta ? 'bg-amber-100 text-amber-800' : 'bg-blue-100 text-blue-800'
          }`}
        >
          {simularCompleta ? '🧪 HIPÓTESIS' : '📋 ESCENARIO'}
          <span className="font-normal">· no toca el pase de lista</span>
        </span>

        <div className="flex items-center gap-1">
          <Button variant="secondary" size="sm" onClick={() => props.onSemana(-1)}>
            ‹
          </Button>
          <span className="px-1 text-sm font-medium text-neutral-700">
            {props.rangoTexto}
            {props.tocado && (
              <span
                title="Tienes cambios sin guardar en esta semana"
                className="ml-1.5 inline-block h-1.5 w-1.5 rounded-full bg-indigo-500 align-middle"
              />
            )}
          </span>
          <Button variant="secondary" size="sm" onClick={() => props.onSemana(1)}>
            ›
          </Button>
        </div>
      </div>

      <div className="mt-3 flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <span className="text-xs font-semibold uppercase tracking-wider text-neutral-500">
          {/* Con filtro, el total NO es el global: es el de esa obra, con los
              días prestados que llegaron y sin los que se fueron. Decirlo evita
              leer una cifra parcial como si fuera la de toda la empresa. */}
          {props.obraNombre ? `Raya de ${props.obraNombre}` : 'Raya proyectada'}
        </span>
        <span className="text-3xl font-bold tabular-nums text-neutral-900">
          {formatCurrency(r.total)}
        </span>
        {/* Decir QUÉ cambió, no solo cambiar el número. */}
        {delta !== null && (
          <span
            role="status"
            className={`rounded-full px-2 py-0.5 text-sm font-bold tabular-nums ${
              delta > 0 ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'
            }`}
          >
            {delta > 0 ? '+' : '−'}
            {formatCurrency(Math.abs(delta))}
          </span>
        )}
      </div>

      <p className="mt-0.5 text-sm text-neutral-600">
        <span className="tabular-nums">{formatCurrency(r.totalCapturado)}</span> en firme +{' '}
        <span className="tabular-nums">{formatCurrency(r.totalProyectado)}</span> estimado
      </p>
      <p className="text-sm text-neutral-500">
        <span className="tabular-nums">{sinCeros(r.diasHombre)}</span> días-hombre ·{' '}
        <span className="tabular-nums">{r.personas}</span>{' '}
        {r.personas === 1 ? 'persona' : 'personas'}
        {/* El hueco se reserva SIEMPRE para que meter el primer ajuste no
            reacomode la tarjeta justo cuando se quiere leer su efecto. */}
        <span className={r.totalAjustes === 0 ? 'text-neutral-500' : 'font-medium text-neutral-700'}>
          {' · '}
          {formatCurrency(r.totalAjustes)} de ajustes
        </span>
      </p>

      {/* Leyenda: las cuatro formas reales, sin tocar nada. */}
      <div className="mt-3 border-t border-neutral-100 pt-3">
        <button
          type="button"
          onClick={() => setLeyendaAbierta((v) => !v)}
          aria-expanded={leyendaAbierta}
          className="flex w-full flex-wrap items-center gap-x-4 gap-y-1 text-left text-xs text-neutral-600 hover:text-neutral-900"
        >
          <Muestra clase="bg-green-100 text-green-800 border border-green-200" simbolo="✓" texto="capturado" />
          <Muestra clase="bg-red-100 text-red-800 border border-red-200" simbolo="–" texto="faltó" />
          <Muestra clase="border-2 border-dashed border-indigo-500 text-blue-800" simbolo="✓" texto="estimado" />
          <Muestra clase="border border-dashed border-neutral-400 text-neutral-500" simbolo="+" texto="no cuenta" />
          <span className="ml-auto underline">{leyendaAbierta ? 'Ocultar' : '¿Qué significan?'}</span>
        </button>

        {leyendaAbierta && (
          <div className="mt-2 space-y-2 text-sm text-neutral-600">
            <p>
              Las celdas <strong>verdes y rojas</strong> ya están en el pase de lista y no se
              pueden mover desde aquí. Las <strong>punteadas</strong> son tu estimación: tócalas
              para prenderlas y apagarlas. Toca el <strong>nombre</strong> de alguien para ver sus
              días, su salario y sus ajustes.
            </p>
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={simularCompleta}
                onChange={(e) => props.onSimularCompleta(e.target.checked)}
              />
              <span>
                <strong>Simular semana completa</strong> — ignora lo ya capturado y deja mover
                todos los días. Sigue sin tocar el pase de lista.
              </span>
            </label>
          </div>
        )}
      </div>
    </section>
  );
}

function Muestra(props: { clase: string; simbolo: string; texto: string }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span
        aria-hidden="true"
        className={`inline-flex h-5 w-5 items-center justify-center rounded text-[11px] font-bold ${props.clase}`}
      >
        {props.simbolo}
      </span>
      {props.texto}
    </span>
  );
}

function GrupoFilas(props: {
  nombre: string | null;
  items: ReturnType<typeof calcularProyeccion>['renglones'];
  agrupar: Agrupar;
  nombreObra: Record<string, string>;
  onAlternarDia: (id: string, dia: number) => void;
  onAbrirFicha: (id: string) => void;
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
          <td colSpan={8} className="px-2">
            {cuadrillaId && (
              <button
                type="button"
                onClick={() => props.onAjusteCuadrilla(cuadrillaId, nombre)}
                className="min-h-9 rounded-lg px-2 text-xs text-neutral-600 underline underline-offset-2 hover:text-blue-700"
              >
                + ajuste a la cuadrilla
              </button>
            )}
          </td>
          <td />
          <td className="px-3 py-1.5 text-right text-xs font-bold tabular-nums text-neutral-900">
            {formatCurrency(subtotal)}
          </td>
        </tr>
      )}

      {items.map((r) => (
        <tr key={r.colaborador.id} className="border-t border-neutral-100 hover:bg-neutral-50/60">
          {/* El nombre es el control principal: es lo único que SIEMPRE se ve. */}
          <td className="sticky left-0 z-10 bg-white px-1 py-1">
            <button
              type="button"
              onClick={() => props.onAbrirFicha(r.colaborador.id)}
              className="flex min-h-11 w-full items-center gap-2 rounded-lg px-2 text-left hover:bg-neutral-100"
              aria-label={`Abrir la ficha de ${r.colaborador.nombre}`}
            >
              <span className="min-w-0 flex-1">
                <span className="block truncate font-medium text-neutral-900">
                  {r.colaborador.nombre}
                </span>
                <span className="block truncate text-xs text-neutral-500">
                  {r.esDestajista ? 'A destajo' : r.puestoNombre}
                  {r.ajustes !== 0 && (
                    <span className={r.ajustes < 0 ? 'text-red-700' : 'text-green-700'}>
                      {' · '}
                      {r.ajustes > 0 ? '+' : ''}
                      {formatCurrency(r.ajustes)}
                    </span>
                  )}
                </span>
              </span>
              <span aria-hidden="true" className="shrink-0 text-neutral-500">
                ›
              </span>
            </button>
          </td>

          <td className="px-2 py-2 text-right tabular-nums text-neutral-700">
            {r.esDestajista ? '—' : formatCurrency(r.salarioDia)}
          </td>

          {r.esDestajista ? (
            <td colSpan={7} className="px-3 py-2 text-sm text-purple-700">
              <span className="tabular-nums font-semibold">{formatCurrency(r.destajo)}</span>
              <span className="ml-2 text-xs text-neutral-500">
                estimado de la semana · la asistencia no lo mueve
              </span>
            </td>
          ) : (
            r.celdas.map((celda) => (
              <td key={celda.indice} className="px-1 py-1 text-center">
                <CeldaDiaBoton
                  celda={celda}
                  nombre={r.colaborador.nombre}
                  obraDestino={props.nombreObra[celda.obraId]}
                  onClick={() => props.onAlternarDia(r.colaborador.id, celda.indice)}
                />
              </td>
            ))
          )}

          <td className="px-2 py-2 text-right tabular-nums text-neutral-700">
            {r.esDestajista ? '—' : sinCeros(r.diasTotales)}
          </td>

          <td className="px-3 py-2 text-right font-semibold tabular-nums text-neutral-900">
            {formatCurrency(r.total)}
          </td>
        </tr>
      ))}
    </>
  );
}

/// Los cuatro estados se distinguen por FORMA además de por color.
///
/// La celda vacía muestra un `+` fantasma y no un punto gris: «vacío» y «toca
/// aquí» tienen que verse distinto, o nadie descubre que la tabla se edita.
function CeldaDiaBoton(props: {
  celda: ReturnType<typeof calcularProyeccion>['renglones'][number]['celdas'][number];
  nombre: string;
  obraDestino?: string;
  onClick: () => void;
}) {
  const { celda, nombre, onClick, obraDestino } = props;
  const bloqueada = celda.origen === 'REAL';

  // Un día prestado se ve pero no cuenta aquí. Se pinta en ámbar —el color de
  // «ojo con esto» en el sistema— con la inicial de la obra a la que se fue,
  // para que se entienda de un vistazo por qué esa persona trae menos días.
  if (celda.prestado) {
    return (
      <button
        type="button"
        onClick={onClick}
        disabled
        title={`Ese día se va a ${obraDestino ?? 'otra obra'}`}
        aria-label={`${nombre}, ${DIAS[celda.indice]}: prestado a ${obraDestino ?? 'otra obra'}`}
        className="inline-flex h-9 w-9 cursor-default items-center justify-center rounded-lg border border-dashed border-amber-400 bg-amber-50 text-[11px] font-bold text-amber-700"
      >
        {(obraDestino ?? '?').slice(0, 2).toUpperCase()}
      </button>
    );
  }

  let clase = 'border border-dashed border-neutral-400 text-neutral-500 hover:border-indigo-500 hover:text-blue-700';
  let simbolo = '+';
  let descripcion = 'no cuenta, toca para prenderlo';

  if (bloqueada && celda.fraccion > 0) {
    clase = 'bg-green-100 text-green-800 border border-green-200';
    simbolo = '✓';
    descripcion = 'asistió, ya capturado';
  } else if (bloqueada) {
    clase = 'bg-red-100 text-red-800 border border-red-200';
    simbolo = '–';
    descripcion = 'faltó, ya capturado';
  } else if (celda.origen === 'PROYECTADA') {
    clase = 'border-2 border-dashed border-indigo-500 bg-blue-50 text-blue-800 hover:bg-blue-100';
    simbolo = '✓';
    descripcion = 'se espera que asista';
  }

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={bloqueada}
      title={bloqueada ? 'Ya está en el pase de lista' : undefined}
      aria-label={`${nombre}, ${DIAS[celda.indice]}: ${descripcion}`}
      className={`inline-flex h-9 w-9 items-center justify-center rounded-lg text-sm font-bold ${clase} ${
        bloqueada ? 'cursor-default' : ''
      }`}
    >
      {simbolo}
    </button>
  );
}

function sinCeros(v: number): string {
  return Number.isInteger(v) ? v.toFixed(0) : v.toFixed(2);
}

/// Miles abreviados: en una celda de día no cabe «$12,120».
function compacto(v: number): string {
  return Math.abs(v) >= 1000 ? `${(v / 1000).toFixed(1)}k` : v.toFixed(0);
}

/// Copia del objeto sin una clave, sin dejar variables sueltas que el linter
/// marque como no usadas.
function sinClave<T>(obj: Record<string, T>, clave: string): Record<string, T> {
  const copia = { ...obj };
  delete copia[clave];
  return copia;
}
