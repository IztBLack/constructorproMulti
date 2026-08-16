'use client';

import { useState } from 'react';
import { Button, Modal } from '@/components/ui';
import { formatCurrency } from '@/lib/data/format';
import {
  ETIQUETA_AJUSTE,
  signoAjuste,
  type AjusteProyeccion,
  type ProyeccionRenglon,
} from '@/lib/data/proyeccion-nomina';

const DIAS_LARGOS = ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado', 'Domingo'];
const DIAS = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'];

interface Props {
  renglon: ProyeccionRenglon;
  obraNombre: string;
  cuadrillaNombre: string | null;
  ajustes: AjusteProyeccion[];
  tieneSalarioPropio: boolean;
  simularCompleta: boolean;
  /// Obra base de la persona y catálogo de obras, para los préstamos por día.
  obraBaseId: string;
  obras: { id: string; nombre: string }[];
  /// `día → obraId` de los días que hoy están prestados.
  prestamos: Record<number, string>;
  /// `obraId === null` devuelve el día a su obra base.
  onMoverDia: (dia: number, obraId: string | null) => void;
  onAlternarDia: (dia: number) => void;
  /// `null` restablece el salario del puesto.
  onSalario: (valor: number | null) => void;
  onDestajo: (valor: number) => void;
  onSimularCompleta: (valor: boolean) => void;
  onNuevoAjuste: () => void;
  onEditarAjuste: (ajuste: AjusteProyeccion) => void;
  onQuitarPersona: () => void;
  onCerrar: () => void;
}

/// Todo lo de una persona en un solo lugar, alcanzable desde lo único que
/// SIEMPRE está en pantalla: su nombre en la columna congelada.
///
/// Antes, sus días vivían a la derecha del scroll horizontal, su salario y sus
/// ajustes detrás de dos botones de un carácter, y los ajustes ya creados no se
/// podían ni ver ni quitar. Aquí se ve y se deshace todo.
export function FichaPersona(props: Props) {
  const {
    renglon: r,
    obraNombre,
    cuadrillaNombre,
    ajustes,
    tieneSalarioPropio,
    simularCompleta,
  } = props;

  const [salario, setSalario] = useState(String(r.salarioDia));
  const [destajo, setDestajo] = useState(String(r.destajo));
  const [avisoBloqueado, setAvisoBloqueado] = useState<number[]>([]);

  const diasCapturados = r.celdas.filter((c) => c.origen === 'REAL').map((c) => c.indice);

  function tocarDia(indice: number) {
    const celda = r.celdas[indice];
    if (celda.origen === 'REAL') {
      setAvisoBloqueado(diasCapturados);
      return;
    }
    props.onAlternarDia(indice);
  }

  return (
    <Modal open onClose={props.onCerrar} title={r.colaborador.nombre} size="lg">
      <div className="space-y-6">
        <p className="-mt-2 text-sm text-neutral-500">
          {[r.esDestajista ? 'A destajo' : r.puestoNombre, obraNombre, cuadrillaNombre]
            .filter(Boolean)
            .join(' · ')}
        </p>

        {/* ── Días ─────────────────────────────────────────────────────── */}
        {!r.esDestajista && (
          <section className="space-y-2">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-neutral-500">
              Días de la semana
            </h3>
            <div className="flex flex-wrap gap-2">
              {r.celdas.map((celda) => (
                <ChipDia
                  key={celda.indice}
                  celda={celda}
                  nombre={r.colaborador.nombre}
                  onClick={() => tocarDia(celda.indice)}
                />
              ))}
            </div>

            {/* La salida del callejón vive JUNTO al problema, no en una barra de
                controles que en un teléfono queda fuera de pantalla. */}
            {avisoBloqueado.length > 0 && !simularCompleta && (
              <div className="flex flex-wrap items-center gap-2 rounded-lg bg-neutral-100 px-3 py-2 text-sm text-neutral-700">
                <span>
                  {avisoBloqueado.map((d) => DIAS[d]).join(', ')}{' '}
                  {avisoBloqueado.length === 1 ? 'ya está' : 'ya están'} en el pase de lista.
                </span>
                <button
                  type="button"
                  onClick={() => {
                    props.onSimularCompleta(true);
                    setAvisoBloqueado([]);
                  }}
                  className="min-h-9 rounded-lg border border-neutral-300 bg-white px-3 text-sm font-medium hover:border-blue-500 hover:text-blue-700 outline-none focus-visible:ring-2 focus-visible:ring-neutral-900 focus-visible:ring-offset-2"
                >
                  Simular semana completa
                </button>
              </div>
            )}

            <p className="text-sm text-neutral-600">
              <span className="tabular-nums font-semibold text-neutral-900">
                {r.diasTotales}
              </span>{' '}
              {r.diasTotales === 1 ? 'día' : 'días'} ×{' '}
              <span className="tabular-nums">{formatCurrency(r.salarioDia)}</span> ={' '}
              <span className="tabular-nums font-semibold text-neutral-900">
                {formatCurrency(r.baseCapturada + r.baseProyectada)}
              </span>
            </p>

            <PrestamosPorDia
              celdas={r.celdas}
              obraBaseId={props.obraBaseId}
              obraBaseNombre={obraNombre}
              obras={props.obras}
              prestamos={props.prestamos}
              onMoverDia={props.onMoverDia}
            />
          </section>
        )}

        {/* ── Dinero ───────────────────────────────────────────────────── */}
        <section className="space-y-2">
          <h3 className="text-xs font-semibold uppercase tracking-wider text-neutral-500">
            {r.esDestajista ? 'Destajo estimado de la semana' : 'Salario por día'}
          </h3>

          {r.esDestajista ? (
            <>
              <input
                type="number"
                value={destajo}
                min={0}
                step={100}
                onChange={(e) => setDestajo(e.target.value)}
                onBlur={() => props.onDestajo(Math.abs(Number(destajo) || 0))}
                className="w-44 rounded-lg border border-purple-700 px-3 py-2 text-right tabular-nums text-purple-700 outline-none focus-visible:ring-2 focus-visible:ring-neutral-900 focus-visible:ring-offset-2"
                aria-label={`Destajo estimado de ${r.colaborador.nombre}`}
              />
              <p className="text-xs text-neutral-500">
                Es el TOTAL de la semana, no un extra sobre lo ya registrado. La asistencia
                no lo mueve.
              </p>
              {r.destajoIncongruente && (
                <p className="text-xs font-medium text-red-700">
                  Estimaste menos que los {formatCurrency(r.destajoCapturado)} que ya están
                  registrados esta semana.
                </p>
              )}
            </>
          ) : (
            <div className="flex flex-wrap items-center gap-2">
              <input
                type="number"
                value={salario}
                min={0}
                step={10}
                onChange={(e) => setSalario(e.target.value)}
                // Se guarda al SALIR del campo, no en cada tecla: al seleccionar
                // todo y teclear, un `onChange` deja el salario en 0 por un
                // instante y el gran total se desploma a media captura.
                onBlur={() => props.onSalario(Math.abs(Number(salario) || 0))}
                className="w-32 rounded-lg border border-neutral-300 px-3 py-2 text-right tabular-nums outline-none focus-visible:ring-2 focus-visible:ring-neutral-900 focus-visible:ring-offset-2"
                aria-label={`Salario por día de ${r.colaborador.nombre}`}
              />
              {tieneSalarioPropio && (
                <button
                  type="button"
                  onClick={() => {
                    props.onSalario(null);
                    props.onCerrar();
                  }}
                  className="min-h-9 rounded-lg px-2 text-sm text-neutral-500 underline hover:text-neutral-900 outline-none focus-visible:ring-2 focus-visible:ring-neutral-900 focus-visible:ring-offset-2"
                >
                  Restablecer el del puesto
                </button>
              )}
            </div>
          )}
          {!r.esDestajista && (
            <p className="text-xs text-neutral-500">
              Solo dentro de esta proyección. No cambia su sueldo en el catálogo.
            </p>
          )}
        </section>

        {/* ── Ajustes ──────────────────────────────────────────────────── */}
        <section className="space-y-2">
          <h3 className="text-xs font-semibold uppercase tracking-wider text-neutral-500">
            Ajustes
          </h3>

          {ajustes.length === 0 ? (
            <p className="text-sm text-neutral-500">
              Sin ajustes. Aquí van los destajos extra, los anticipos que ya se
              entregaron y los descuentos.
            </p>
          ) : (
            <ul className="divide-y divide-neutral-200 rounded-lg border border-neutral-200">
              {ajustes.map((a) => (
                <li key={a.id} className="flex items-center gap-3 px-3 py-2">
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm font-medium text-neutral-900">
                      {ETIQUETA_AJUSTE[a.tipo]}
                    </span>
                    {a.nota && (
                      <span className="block truncate text-xs text-neutral-500">{a.nota}</span>
                    )}
                  </span>
                  <span
                    className={`shrink-0 text-sm font-semibold tabular-nums ${
                      signoAjuste(a.tipo) < 0 ? 'text-red-700' : 'text-green-700'
                    }`}
                  >
                    {signoAjuste(a.tipo) > 0 ? '+' : '−'}
                    {formatCurrency(a.monto)}
                  </span>
                  <button
                    type="button"
                    onClick={() => props.onEditarAjuste(a)}
                    className="min-h-9 shrink-0 rounded-lg px-2 text-sm text-blue-700 hover:bg-blue-50 outline-none focus-visible:ring-2 focus-visible:ring-neutral-900 focus-visible:ring-offset-2"
                  >
                    Editar
                  </button>
                </li>
              ))}
            </ul>
          )}

          <Button variant="secondary" size="sm" onClick={props.onNuevoAjuste}>
            + Agregar destajo, anticipo o descuento
          </Button>
        </section>

        {/* ── Total ────────────────────────────────────────────────────── */}
        <section className="rounded-lg bg-neutral-50 px-4 py-3">
          <span className="text-xs font-semibold uppercase tracking-wider text-neutral-500">
            Su raya de la semana
          </span>
          <span className="block text-2xl font-bold tabular-nums text-neutral-900">
            {formatCurrency(r.total)}
          </span>
          {r.ajustes !== 0 && (
            <span className="text-xs text-neutral-500">
              incluye {formatCurrency(r.ajustes)} de ajustes
            </span>
          )}
        </section>

        {/* Destructivo, separado del resto (§destructive-emphasis). */}
        <section className="border-t border-neutral-200 pt-4">
          <button
            type="button"
            onClick={props.onQuitarPersona}
            className="min-h-11 rounded-lg px-3 text-sm font-medium text-red-700 hover:bg-red-50 outline-none focus-visible:ring-2 focus-visible:ring-neutral-900 focus-visible:ring-offset-2"
          >
            Quitar de la proyección
          </button>
          <p className="mt-1 px-3 text-xs text-neutral-500">
            Solo lo saca de esta cuenta. Sigue dado de alta en la app.
          </p>
        </section>
      </div>
    </Modal>
  );
}

/// Préstamos por día: «el jueves me lo llevo a Alfaro».
///
/// Se muestra un renglón por día en vez de un selector global porque el
/// préstamo es de DÍAS SUELTOS, no de la semana: en la obra se presta gente un
/// jueves, no un mes. Cada renglón dice a qué obra pertenece ese día y deja
/// cambiarlo; los que siguen en la obra base se ven en gris para que el ojo
/// encuentre rápido los que sí se movieron.
function PrestamosPorDia(props: {
  celdas: ProyeccionRenglon['celdas'];
  obraBaseId: string;
  obraBaseNombre: string;
  obras: { id: string; nombre: string }[];
  prestamos: Record<number, string>;
  onMoverDia: (dia: number, obraId: string | null) => void;
}) {
  const { celdas, obraBaseId, obraBaseNombre, obras, prestamos } = props;
  const [abierto, setAbierto] = useState(Object.keys(prestamos).length > 0);
  const cuantos = Object.keys(prestamos).length;

  // Con una sola obra no hay a dónde mover a nadie.
  const otras = obras.filter((o) => o.id !== obraBaseId);
  if (otras.length === 0) return null;

  return (
    <div className="rounded-lg border border-neutral-200">
      <button
        type="button"
        onClick={() => setAbierto((v) => !v)}
        aria-expanded={abierto}
        className="flex min-h-11 w-full items-center gap-2 rounded-lg px-3 text-left text-sm outline-none focus-visible:ring-2 focus-visible:ring-neutral-900 focus-visible:ring-offset-2"
      >
        <span className="flex-1 font-medium text-neutral-800">
          ¿Se va a otra obra algún día?
        </span>
        {cuantos > 0 && (
          <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-semibold text-amber-800">
            {cuantos} {cuantos === 1 ? 'día movido' : 'días movidos'}
          </span>
        )}
        <span aria-hidden="true" className="text-neutral-500">
          {abierto ? '▴' : '▾'}
        </span>
      </button>

      {abierto && (
        <div className="space-y-1 border-t border-neutral-200 px-3 py-2">
          <p className="pb-1 text-xs text-neutral-500">
            El día que muevas se marca como asistido en la obra destino y suma a
            la raya de ESA obra, junto con la gente que ya está asignada ahí.
          </p>
          {celdas.map((celda) => {
            const destino = prestamos[celda.indice];
            const bloqueado = celda.origen === 'REAL';
            return (
              <div key={celda.indice} className="flex items-center gap-2">
                <span
                  className={`w-10 shrink-0 text-xs font-semibold ${
                    destino ? 'text-amber-800' : 'text-neutral-500'
                  }`}
                >
                  {DIAS[celda.indice]}
                </span>
                <select
                  value={destino ?? obraBaseId}
                  disabled={bloqueado}
                  onChange={(e) =>
                    props.onMoverDia(
                      celda.indice,
                      e.target.value === obraBaseId ? null : e.target.value,
                    )
                  }
                  aria-label={`Obra del ${DIAS[celda.indice]}`}
                  className={`min-h-9 flex-1 rounded-lg border px-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-neutral-900 focus-visible:ring-offset-2 ${
                    destino
                      ? 'border-amber-700 bg-amber-50 font-medium text-amber-900'
                      : 'border-neutral-200 text-neutral-500'
                  } ${bloqueado ? 'cursor-not-allowed opacity-60' : ''}`}
                >
                  <option value={obraBaseId}>{obraBaseNombre}</option>
                  {otras.map((o) => (
                    <option key={o.id} value={o.id}>
                      {o.nombre}
                    </option>
                  ))}
                </select>
                {bloqueado && (
                  <span className="shrink-0 text-xs text-neutral-500">ya capturado</span>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

/// Un día, grande y tocable. Mismos cuatro estados que la tabla, distinguidos
/// por FORMA además de por color.
function ChipDia(props: {
  celda: ProyeccionRenglon['celdas'][number];
  nombre: string;
  onClick: () => void;
}) {
  const { celda, nombre, onClick } = props;
  const capturado = celda.origen === 'REAL';

  let clase = 'border border-dashed border-neutral-500 text-neutral-500';
  let simbolo = '+';
  let descripcion = 'no cuenta, toca para prenderlo';

  if (capturado && celda.fraccion > 0) {
    clase = 'bg-green-100 text-green-800 border border-green-200';
    simbolo = '✓';
    descripcion = 'asistió, ya capturado';
  } else if (capturado) {
    clase = 'bg-red-100 text-red-800 border border-red-200';
    simbolo = '–';
    descripcion = 'faltó, ya capturado';
  } else if (celda.origen === 'PROYECTADA') {
    clase = 'border-2 border-dashed border-indigo-500 bg-blue-50 text-blue-800';
    simbolo = '✓';
    descripcion = 'se espera que asista';
  }

  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={`${nombre}, ${DIAS_LARGOS[celda.indice]}: ${descripcion}`}
      className={`relative flex h-14 w-14 flex-col items-center justify-center rounded-xl text-lg font-bold outline-none focus-visible:ring-2 focus-visible:ring-neutral-900 focus-visible:ring-offset-2 ${clase} ${
        capturado ? 'cursor-default' : 'hover:border-indigo-500'
      }`}
    >
      <span className="text-[10px] font-semibold uppercase tracking-wide opacity-70">
        {DIAS[celda.indice]}
      </span>
      <span aria-hidden="true">{simbolo}</span>
      {capturado && (
        <span
          aria-hidden="true"
          title="Ya está en el pase de lista"
          className="absolute right-1 top-1 text-[9px] leading-none opacity-70"
        >
          🔒
        </span>
      )}
    </button>
  );
}
