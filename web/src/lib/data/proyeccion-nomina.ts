/// Proyección de nómina: la raya ESPERADA de una semana.
///
/// Puerto literal de `lib/domain/logic/proyeccion_nomina.dart` y
/// `models_proyeccion.dart` del proyecto Flutter. **El contrato vive allá**: si
/// cambia una regla, cámbiala en los dos lados o la oficina y la obra dejarán de
/// dar el mismo número — que es exactamente el problema que este módulo existe
/// para evitar.
///
/// La regla que gobierna el archivo: **aquí no se calcula nómina**. El escenario
/// se traduce a asistencias y destajos sintéticos y el cálculo lo hace
/// `calcularNomina`, el mismo que produce la nómina real. Lo único que esta capa
/// suma por su cuenta son los ajustes, porque el cálculo no tiene dónde ponerlos.
///
/// Dos conceptos que conviene no confundir:
///   · **real / capturado**: lo que ya existe en `asistencias` y `destajos`.
///     Manda sobre la proyección y normalmente está bloqueado en la interfaz.
///   · **proyectado**: lo que el usuario espera. Siempre día COMPLETO
///     (fracción 1.0): las fracciones de ½ y ¾ sirven para capturar la realidad,
///     no para adivinarla.


import { calcularNomina } from './nomina-calculo';
import type { Asistencia, Colaborador, Destajo, PeriodoPago, Puesto } from './types';
import { salarioDiarioDesdePeriodo } from './salario';
import { partesTz, medianocheMx, sumarDiasCalendario } from './tz';

// Los permisos viven en `lib/auth/sueldos.ts`: gobiernan también la nómina, que
// enseña el mismo dato, y tener dos listas fue justo lo que las dejó separarse.

// ═══════════════════════════════════════════════════════════════════════════
// Fechas
// ═══════════════════════════════════════════════════════════════════════════

/// Índice de día (0 = lunes … 6 = domingo) de `fechaMs` dentro de la semana que
/// empieza en `lunesMs`; `null` si cae fuera.
///
/// Se calcula en calendario de **México**, no en la zona del servidor: Vercel
/// corre en UTC y restar epoch crudos movería un día las asistencias que el
/// móvil guardó a medianoche local.
export function indiceDiaSemana(lunesMs: number, fechaMs: number): number | null {
  const lunes = partesTz(lunesMs);
  const f = partesTz(fechaMs);
  const diff = Math.round(
    (Date.UTC(f.year, f.month - 1, f.day) -
      Date.UTC(lunes.year, lunes.month - 1, lunes.day)) /
      86_400_000,
  );
  return diff >= 0 && diff < 7 ? diff : null;
}

/// Epoch ms de las 00:00 de México del día `indice` de la semana.
export function fechaDelDia(lunesMs: number, indice: number): number {
  const p = partesTz(lunesMs);
  const d = sumarDiasCalendario(p.year, p.month, p.day, indice);
  return medianocheMx(d.y, d.m0, d.d);
}

// ═══════════════════════════════════════════════════════════════════════════
// Ajustes
// ═══════════════════════════════════════════════════════════════════════════

export type TipoAjuste = 'DESTAJO' | 'ANTICIPO' | 'DESCUENTO';
export type DestinoAjuste = 'COLABORADOR' | 'CUADRILLA';
export type RepartoAjuste = 'PARTES_IGUALES' | 'A_LA_CUADRILLA';

export const ETIQUETA_AJUSTE: Record<TipoAjuste, string> = {
  DESTAJO: 'Destajo',
  ANTICIPO: 'Anticipo',
  DESCUENTO: 'Descuento',
};

/// +1 suma a la raya, −1 la baja.
export function signoAjuste(tipo: TipoAjuste): number {
  return tipo === 'DESTAJO' ? 1 : -1;
}

/// Un monto extra (o menos) que entra a la raya sin pasar por la asistencia.
///
/// Aplica igual a quien cobra por día que a quien cobra a destajo, y puede
/// dirigirse a una persona o a una cuadrilla completa.
export interface AjusteProyeccion {
  id: string;
  tipo: TipoAjuste;
  destino: DestinoAjuste;
  /// `colaboradorId` o `cuadrillaId` según `destino`.
  destinoId: string;
  /// SIEMPRE positivo. El signo lo pone el tipo, para que no exista la
  /// ambigüedad de un «descuento de −500» que en realidad sumaría.
  monto: number;
  nota: string;
  /// Solo se usa cuando `destino` es CUADRILLA.
  reparto: RepartoAjuste;
}

// ═══════════════════════════════════════════════════════════════════════════
// Sueldo capturado, plazas y redondeo
// ═══════════════════════════════════════════════════════════════════════════

/// `PeriodoPago` NO se redefine aquí: vive en `./types` desde que existe el
/// sueldo por periodo en el catálogo, y tener dos definiciones del mismo
/// concepto es como empiezan a separarse. Se reexporta para que quien use el
/// escenario no tenga que importarlo de dos sitios.
export type { PeriodoPago } from './types';
export type ModoRedondeo = 'CERCANO' | 'ARRIBA' | 'ABAJO';
export type CampoRedondeo = 'SALARIO_DIA' | 'RAYA' | 'SUBTOTALES' | 'TOTAL';

/// El sueldo tal como se capturó, no solo el diario que salió de él.
///
/// El escenario ya guarda un `salarioOverride` con el salario POR DÍA, que es lo
/// que consume el cálculo. Eso alcanzaba mientras el diario se capturaba a mano;
/// con el sueldo por periodo hace falta recordar de DÓNDE salió ese diario: si
/// solo se guardara el resultado, al reabrir la ficha habría que adivinar si
/// $600 vinieron de $3,600 semanales o de $15,600 mensuales.
///
/// Los dos conviven: esto es lo capturado, `salarioOverride` es lo derivado.
export interface SueldoProyectado {
  periodo: PeriodoPago;
  monto: number;
  diasSemana: number;
}

/// Prefijo del id de una plaza: lo que la distingue de un colaborador real en
/// cualquier mapa del escenario sin llevar una lista aparte.
export const PREFIJO_PLAZA = 'plaza:';

export function esPlaza(id: string): boolean {
  return id.startsWith(PREFIJO_PLAZA);
}

/// Un puesto sin cubrir: «4 × Maestro a $3,600». No existe en el catálogo y
/// muere con el escenario; sirve para preguntar cuánto costaría contratarlos.
export interface PlazaProyectada {
  id: string;
  etiqueta: string;
  puestoId: string;
  obraId: string | null;
  cuadrillaId: string | null;
  sueldo: SueldoProyectado;
}

/// El colaborador SINTÉTICO que ve el calculador.
///
/// Una plaza no existe en el catálogo, pero dentro del escenario tiene que
/// comportarse como una persona más: días, sueldo, obra y ajustes. En vez de
/// enseñarle al calculador qué es una plaza —y arriesgar que la trate distinto
/// en alguno de los sitios donde recorre gente—, la plaza se disfraza de
/// colaborador y el calculador no se entera. Espeja `comoColaborador` del móvil.
///
/// Quien llama a `calcularProyeccion` tiene que meterlas en `colaboradores`:
/// el calculador solo arma renglones de los participantes que encuentra ahí.
export function plazaComoColaborador(plaza: PlazaProyectada): Colaborador {
  return {
    id: plaza.id,
    empresa_id: '',
    nombre: plaza.etiqueta,
    puesto_id: plaza.puestoId || null,
    tipo_pago: 'DIA',
    telefono: null,
    contacto_nombre: null,
    contacto_telefono: null,
    contacto_parentesco: null,
    activo: true,
    salario_personalizado: salarioDiarioDesdePeriodo(
      plaza.sueldo.monto,
      plaza.sueldo.periodo,
      plaza.sueldo.diasSemana,
    ),
    periodo_pago: plaza.sueldo.periodo,
    salario_periodo: plaza.sueldo.monto,
    dias_semana: plaza.sueldo.diasSemana,
    created_at: 0,
    updated_at: 0,
    server_updated_at: null,
    deleted_at: null,
  };
}

/// Las plazas del escenario, ya disfrazadas, para concatenar al catálogo.
export function plazasComoColaboradores(estado: ProyeccionEstado): Colaborador[] {
  return Object.values(estado.plazas).map(plazaComoColaborador);
}

/// Redondeo de presentación: no cambia lo capturado, ajusta cómo se enseña.
export interface RedondeoConfig {
  activo: boolean;
  /// Múltiplo al que se redondea, en pesos.
  paso: number;
  modo: ModoRedondeo;
  /// Qué cifras se redondean. Vacío con `activo` en true es válido aunque
  /// inútil: la UI lo evita apagando el interruptor.
  campos: CampoRedondeo[];
}

export const REDONDEO_APAGADO: RedondeoConfig = {
  activo: false,
  paso: 1,
  modo: 'CERCANO',
  campos: [],
};

// ═══════════════════════════════════════════════════════════════════════════
// Escenario
// ═══════════════════════════════════════════════════════════════════════════

export interface ProyeccionEstado {
  /// Lunes 00:00 de México de la semana proyectada, en epoch ms.
  lunesMs: number;
  /// `colaboradorId` en el orden en que se muestran.
  participantes: string[];
  /// `colaboradorId → índices de día (0..6)` que se esperan trabajados.
  diasProyectados: Record<string, number[]>;
  /// `colaboradorId → total de destajo esperado en la semana`.
  destajoEstimado: Record<string, number>;
  /// `colaboradorId → salario diario` que pisa al del puesto solo dentro del
  /// escenario. No toca el catálogo.
  salarioOverride: Record<string, number>;
  ajustes: AjusteProyeccion[];
  /// Trata la semana entera como hipótesis: ignora lo capturado.
  simularCompleta: boolean;

  /// `colaboradorId → { índice de día → obraId }`: préstamos de un día a otra
  /// obra. Solo se guardan los días que se MUEVEN; el resto se queda en la obra
  /// base de la persona.
  ///
  /// Existe porque en la obra real la gente se presta por días: «el jueves me
  /// llevo a Fulanito a Alfaro». Sin esto, la obra es un atributo de la persona
  /// y no se puede preguntar «¿cuánto sale la raya de Alfaro ese día?» sin
  /// reasignarla de verdad. Un préstamo NO cambia el total global —la persona
  /// trabaja los mismos días— pero sí mueve el total de cada obra.
  obraPorDia: Record<string, Record<number, string>>;

  /// `colaboradorId → obraId`: obra asignada SOLO dentro del escenario.
  ///
  /// Para meter a alguien que todavía no está asignado a ninguna obra en el
  /// sistema — el peón nuevo, el que se acaba de contratar. Sin esto sus días no
  /// pertenecerían a ninguna parte y no sumarían a la raya de ninguna obra.
  /// No escribe nada en `obra_colaborador`: es del escenario y muere con él.
  obraBase: Record<string, string>;

  /// `colaboradorId → sueldo capturado`. Convive con `salarioOverride`, que es
  /// el diario derivado y lo que consume el cálculo.
  sueldoOverride: Record<string, SueldoProyectado>;

  /// `plazaId → plaza`. La llave lleva el prefijo `plaza:` y es la misma que se
  /// usa en `participantes`, `diasProyectados` y el resto de mapas por persona:
  /// una plaza se comporta como alguien más en todo salvo en que no existe.
  plazas: Record<string, PlazaProyectada>;

  redondeo: RedondeoConfig;
}

/// Escenario recién nacido, sin nadie dentro. Los campos que se agregaron
/// después viven aquí con su vacío para que ningún sitio tenga que acordarse.
export function escenarioVacio(lunesMs: number): ProyeccionEstado {
  return {
    lunesMs,
    participantes: [],
    diasProyectados: {},
    destajoEstimado: {},
    salarioOverride: {},
    ajustes: [],
    simularCompleta: false,
    obraPorDia: {},
    obraBase: {},
    sueldoOverride: {},
    plazas: {},
    redondeo: REDONDEO_APAGADO,
  };
}

/// Saca a alguien del escenario y borra TODO lo que colgaba de esa persona.
///
/// Vive aquí, junto al estado, y no suelto en el componente, porque la lista de
/// campos por persona crece: `obraPorDia` y `obraBase` se agregaron después y
/// nadie se acordó de limpiarlos al quitar a alguien. Con eso, quitar a una
/// persona le dejaba una obra asignada fantasma: al volver a la lista de «fuera
/// de la proyección» ya no salía como «Sin obra asignada» y perdía su selector
/// de obra. Espeja `ProyeccionEstado.sinParticipante` del móvil.
///
/// **Si agregas un campo por persona a [ProyeccionEstado], límpialo aquí.**
export function sinParticipante(
  estado: ProyeccionEstado,
  colaboradorId: string,
): ProyeccionEstado {
  const sin = <T,>(obj: Record<string, T>): Record<string, T> => {
    const copia = { ...obj };
    delete copia[colaboradorId];
    return copia;
  };
  return {
    ...estado,
    participantes: estado.participantes.filter((id) => id !== colaboradorId),
    diasProyectados: sin(estado.diasProyectados),
    destajoEstimado: sin(estado.destajoEstimado),
    salarioOverride: sin(estado.salarioOverride),
    obraPorDia: sin(estado.obraPorDia),
    obraBase: sin(estado.obraBase),
    sueldoOverride: sin(estado.sueldoOverride),
    // Si es una plaza, se va también su ficha: nadie más la referencia y
    // dejarla sería un renglón fantasma que reaparece al guardar.
    plazas: sin(estado.plazas),
    // Un anticipo colgando de alguien que ya no está sumaría al total sin que
    // se vea de dónde sale.
    ajustes: estado.ajustes.filter(
      (a) => !(a.destino === 'COLABORADOR' && a.destinoId === colaboradorId),
    ),
  };
}

/// Guarda el sueldo capturado y, con él, el diario que consume el cálculo.
///
/// Se escriben SIEMPRE los dos. Separarlos es la manera segura de que un día
/// queden en desacuerdo y la ficha enseñe $3,600 semanales mientras la tabla
/// cobra un diario viejo. Espeja `ProyeccionEstado.conSueldo` del móvil.
export function conSueldo(
  estado: ProyeccionEstado,
  colaboradorId: string,
  sueldo: SueldoProyectado | null,
): ProyeccionEstado {
  const sueldoOverride = { ...estado.sueldoOverride };
  const salarioOverride = { ...estado.salarioOverride };
  const plazas = { ...estado.plazas };

  if (sueldo === null) {
    delete sueldoOverride[colaboradorId];
    delete salarioOverride[colaboradorId];
  } else {
    sueldoOverride[colaboradorId] = sueldo;
    const diario = salarioDiarioDesdePeriodo(
      sueldo.monto,
      sueldo.periodo,
      sueldo.diasSemana,
    );
    if (diario === null) delete salarioOverride[colaboradorId];
    else salarioOverride[colaboradorId] = diario;

    // Si es una plaza, su ficha lleva el mismo sueldo: son la misma cosa vista
    // desde dos sitios, y dejarlas separadas las desincroniza al guardar.
    const plaza = plazas[colaboradorId];
    if (plaza) plazas[colaboradorId] = { ...plaza, sueldo };
  }

  return { ...estado, sueldoOverride, salarioOverride, plazas };
}

/// Da de alta N plazas de un puesto y las mete al escenario con sus días.
///
/// La numeración mira las que YA existen del mismo puesto para no repetir
/// «Maestro 1» dos veces: la lista dejaría de poder distinguirlas.
export function conPlazas(
  estado: ProyeccionEstado,
  params: {
    puestoId: string;
    puestoNombre: string;
    cuantas: number;
    sueldo: SueldoProyectado;
    obraId: string | null;
    cuadrillaId?: string | null;
    dias: number[];
  },
): { estado: ProyeccionEstado; nuevas: PlazaProyectada[] } {
  const { puestoId, puestoNombre, cuantas, sueldo, obraId, dias } = params;
  const usadas = Object.values(estado.plazas).filter((p) => p.puestoId === puestoId).length;

  let siguiente = { ...estado };
  const nuevas: PlazaProyectada[] = [];

  for (let i = 0; i < Math.max(0, cuantas); i++) {
    const id = `${PREFIJO_PLAZA}${crypto.randomUUID()}`;
    const plaza: PlazaProyectada = {
      id,
      etiqueta: `${puestoNombre} ${usadas + i + 1}`,
      puestoId,
      obraId,
      cuadrillaId: params.cuadrillaId ?? null,
      sueldo,
    };
    nuevas.push(plaza);
    siguiente = {
      ...siguiente,
      participantes: [...siguiente.participantes, id],
      diasProyectados: { ...siguiente.diasProyectados, [id]: [...dias].sort((a, b) => a - b) },
      plazas: { ...siguiente.plazas, [id]: plaza },
      obraBase: obraId
        ? { ...siguiente.obraBase, [id]: obraId }
        : siguiente.obraBase,
    };
    siguiente = conSueldo(siguiente, id, sueldo);
  }

  return { estado: siguiente, nuevas };
}

/// Cambia la etiqueta de una plaza. NO le mueve el sueldo: renombrar es
/// renombrar, y que de paso se recalculara algo sería una sorpresa cara.
export function conEtiquetaDePlaza(
  estado: ProyeccionEstado,
  plazaId: string,
  etiqueta: string,
): ProyeccionEstado {
  const plaza = estado.plazas[plazaId];
  if (!plaza) return estado;
  return {
    ...estado,
    plazas: { ...estado.plazas, [plazaId]: { ...plaza, etiqueta: etiqueta.trim() || plaza.etiqueta } },
  };
}

/// La obra base de cada quien, con lo que el escenario haya asignado encima.
///
/// Un solo lugar para resolverlo, porque tanto el cálculo como el filtro y la
/// lista de participantes tienen que estar de acuerdo en dónde trabaja alguien.
export function obraBaseEfectiva(
  estado: ProyeccionEstado,
  obraPorColaborador: Record<string, string>,
): Record<string, string> {
  return { ...obraPorColaborador, ...estado.obraBase };
}

// ═══════════════════════════════════════════════════════════════════════════
// Resultado
// ═══════════════════════════════════════════════════════════════════════════

export type OrigenCelda = 'REAL' | 'PROYECTADA' | 'VACIA';

export interface CeldaDia {
  indice: number;
  origen: OrigenCelda;
  /// Real: 0 (faltó), 0.5, 0.75 o 1. Proyectada: siempre 1. Vacía: 0.
  fraccion: number;
  /// Obra a la que pertenece ESTE día (la base de la persona, o la del
  /// préstamo si ese día se movió).
  obraId: string;
  /// Cuando se está viendo UNA obra: este día es de otra. Se muestra —para que
  /// se entienda por qué la persona aparece con menos días— pero NO suma a la
  /// raya de la obra que se está viendo.
  prestado: boolean;
}

export interface ProyeccionRenglon {
  colaborador: Colaborador;
  puestoNombre: string;
  cuadrillaId: string | null;
  salarioDia: number;
  /// Siempre 7, de lunes a domingo.
  celdas: CeldaDia[];
  fraccionCapturada: number;
  diasProyectados: number;
  baseCapturada: number;
  baseProyectada: number;
  destajo: number;
  destajoCapturado: number;
  /// Neto de ajustes con signo ya aplicado.
  ajustes: number;
  esDestajista: boolean;
  diasTotales: number;
  total: number;
  /// Estimó menos destajo del que ya está capturado.
  destajoIncongruente: boolean;
}

export interface LineaCuadrilla {
  cuadrillaId: string;
  ajuste: AjusteProyeccion;
  /// Lo que este renglón suma al total. Es 0 cuando el ajuste sí se repartió
  /// (entonces ya vive dentro de los renglones y contarlo otra vez lo duplicaría).
  montoConSigno: number;
  repartidoEntre: string[];
  repartido: boolean;
}

export interface ProyeccionResultado {
  renglones: ProyeccionRenglon[];
  lineasCuadrilla: LineaCuadrilla[];
  /// Ajustes dirigidos a alguien que ya no está en el escenario. No se suman.
  ajustesIgnorados: AjusteProyeccion[];
  /// 7 posiciones: lo que cuesta cada día (solo pago por día).
  totalPorDia: number[];
  personasPorDia: number[];
  totalDia: number;
  totalDestajo: number;
  totalAjustes: number;
  /// Parte del total que ya está capturada (no se va a mover).
  totalCapturado: number;
  /// Parte que es estimación, ajustes incluidos.
  totalProyectado: number;
  diasHombre: number;
  total: number;
  personas: number;
}

/// Quién aparece cuando se está viendo una obra.
///
/// No basta con «los que tienen esa obra base»: si a alguien de Boticaria se le
/// prestó el jueves a Alfaro, tiene que salir en Alfaro —con ese día contando y
/// el resto marcado como prestado—, o la raya de Alfaro no incluiría a quien de
/// verdad va a trabajar ahí. Y al revés: quien se fue TODA la semana sigue
/// saliendo en su obra base, con todos sus días en gris, para que se vea que se
/// fue en vez de desaparecer sin explicación.
export function participantesDeObra(
  estado: ProyeccionEstado,
  obraPorColaborador: Record<string, string>,
  obraFiltro: string | null,
): string[] {
  if (!obraFiltro) return estado.participantes;
  return estado.participantes.filter((id) => {
    if (obraPorColaborador[id] === obraFiltro) return true;
    const dias = estado.obraPorDia[id];
    return dias ? Object.values(dias).includes(obraFiltro) : false;
  });
}

// ═══════════════════════════════════════════════════════════════════════════
// El cálculo
// ═══════════════════════════════════════════════════════════════════════════

export function calcularProyeccion(params: {
  estado: ProyeccionEstado;
  colaboradores: Colaborador[];
  puestos: Puesto[];
  asistenciasReales?: Asistencia[];
  destajosReales?: Destajo[];
  /// `colaboradorId → cuadrillaId`.
  cuadrillaPorColaborador?: Record<string, string>;
  /// `colaboradorId → obraId`: la obra BASE de cada persona.
  obraPorColaborador?: Record<string, string>;
  /// Si viene, el resultado es la raya de ESA obra: solo cuentan los días que
  /// pertenecen a ella, incluidos los que llegaron prestados desde otra.
  /// Sin filtro, el resultado es el global y los préstamos no lo mueven.
  obraFiltro?: string | null;
}): ProyeccionResultado {
  const {
    estado,
    colaboradores,
    puestos,
    asistenciasReales = [],
    destajosReales = [],
    cuadrillaPorColaborador = {},
    obraPorColaborador = {},
    obraFiltro = null,
  } = params;

  /// A qué obra pertenece un día concreto de una persona.
  const obraDelDia = (colaboradorId: string, dia: number): string =>
    estado.obraPorDia[colaboradorId]?.[dia] ?? obraPorColaborador[colaboradorId] ?? '';

  /// ¿Ese día suma a la obra que se está viendo? Sin filtro, todo suma.
  const cuentaEnLaObra = (colaboradorId: string, dia: number): boolean =>
    obraFiltro === null || obraDelDia(colaboradorId, dia) === obraFiltro;

  const porId = new Map(colaboradores.map((c) => [c.id, c]));
  const puestoPorId = new Map(puestos.map((p) => [p.id, p]));

  // Participantes que existen de verdad, en el orden que puso el usuario.
  const activos: Colaborador[] = [];
  for (const id of estado.participantes) {
    const c = porId.get(id);
    if (c) activos.push(c);
  }

  // ── 1. Lo capturado, indexado por (colaborador, día) ──────────────────────
  const realPorDia = new Map<string, Map<number, number>>();
  for (const a of asistenciasReales) {
    const d = indiceDiaSemana(estado.lunesMs, a.fecha);
    if (d === null) continue;
    if (!porId.has(a.colaborador_id)) continue;
    const m = realPorDia.get(a.colaborador_id) ?? new Map<number, number>();
    m.set(d, (m.get(d) ?? 0) + a.fraccion);
    realPorDia.set(a.colaborador_id, m);
  }

  const destajoRealPorColab = new Map<string, number>();
  for (const dj of destajosReales) {
    if (indiceDiaSemana(estado.lunesMs, dj.fecha) === null) continue;
    destajoRealPorColab.set(
      dj.colaborador_id,
      (destajoRealPorColab.get(dj.colaborador_id) ?? 0) + dj.monto,
    );
  }

  // ── 2. El escenario, traducido a lo que el calculador entiende ────────────
  // El salario que el usuario mueve en la tabla se inyecta como
  // `salario_personalizado`, que es el override que `calcularNomina` ya respeta.
  const paraCalculo = activos.map((c) =>
    estado.salarioOverride[c.id] !== undefined
      ? { ...c, salario_personalizado: estado.salarioOverride[c.id] }
      : c,
  );

  const asistenciasSinteticas: Asistencia[] = [];
  const destajosSinteticos: Destajo[] = [];

  for (const c of activos) {
    const obraBase = obraPorColaborador[c.id] ?? '';
    const reales = realPorDia.get(c.id) ?? new Map<number, number>();

    if (c.tipo_pago === 'DIA') {
      // Cuando se ve UNA obra, solo entran al cálculo los días que le
      // pertenecen: es lo que hace que el total sea «la raya de Alfaro» y no la
      // de todos. Sin filtro entran todos y un préstamo no mueve el global —la
      // persona trabaja los mismos días, nada más que en otro lado.
      if (!estado.simularCompleta) {
        for (const [d, frac] of reales) {
          if (frac <= 0) continue; // falta capturada: no paga, pero sí bloquea
          if (!cuentaEnLaObra(c.id, d)) continue;
          asistenciasSinteticas.push(
            asistenciaSintetica(c.id, obraDelDia(c.id, d), fechaDelDia(estado.lunesMs, d), frac),
          );
        }
      }
      // Los días proyectados rellenan SOLO lo que no está capturado: una
      // palomita no puede pisar un día que ya se pasó a lista.
      for (const d of estado.diasProyectados[c.id] ?? []) {
        if (!estado.simularCompleta && reales.has(d)) continue;
        if (!cuentaEnLaObra(c.id, d)) continue;
        asistenciasSinteticas.push(
          asistenciaSintetica(c.id, obraDelDia(c.id, d), fechaDelDia(estado.lunesMs, d), 1),
        );
      }
    } else {
      // A destajo la asistencia no mueve el pago, así que tampoco se presta por
      // días: el monto pertenece entero a su obra base.
      if (obraFiltro !== null && obraBase !== obraFiltro) continue;
      const monto =
        estado.destajoEstimado[c.id] ?? destajoRealPorColab.get(c.id) ?? 0;
      if (monto !== 0) {
        destajosSinteticos.push(
          destajoSintetico(c.id, obraBase, estado.lunesMs, monto),
        );
      }
    }
  }

  // ── 3. El cálculo de siempre ──────────────────────────────────────────────
  const resumen = calcularNomina({
    colaboradores: paraCalculo,
    asistencias: asistenciasSinteticas,
    destajos: destajosSinteticos,
    puestos,
  });
  const itemPorId = new Map(resumen.items.map((i) => [i.colaborador.id, i]));

  // ── 4. Los ajustes, repartidos ────────────────────────────────────────────
  const { porColab: ajustePorColab, lineas: lineasCuadrilla, ignorados } =
    repartirAjustes({
      estado,
      participantes: new Set(activos.map((c) => c.id)),
      cuadrillaPorColaborador,
    });

  // ── 5. Armado de renglones ────────────────────────────────────────────────
  const renglones: ProyeccionRenglon[] = [];
  for (const c of activos) {
    const item = itemPorId.get(c.id);
    const reales = realPorDia.get(c.id) ?? new Map<number, number>();
    const proyectados = new Set(estado.diasProyectados[c.id] ?? []);
    const puesto = puestoPorId.get(c.puesto_id ?? '');
    const salarioDia =
      estado.salarioOverride[c.id] ??
      c.salario_personalizado ??
      puesto?.salario_dia_default ??
      0;

    const esDia = c.tipo_pago === 'DIA';
    const celdas: CeldaDia[] = [];
    let fraccionReal = 0;
    let diasProyectados = 0;

    for (let d = 0; d < 7; d++) {
      const obraDia = obraDelDia(c.id, d);
      // A destajo no hay celdas de día: su pago no lo mueve la asistencia, y es
      // lo que hace `calcularNomina` (la rama de destajo ni mira asistencias).
      if (!esDia) {
        celdas.push({ indice: d, origen: 'VACIA', fraccion: 0, obraId: obraDia, prestado: false });
        continue;
      }

      // Un día prestado se PINTA con su estado real —para que se vea a dónde se
      // fue la persona— pero no engorda los contadores de esta obra.
      const prestado = !cuentaEnLaObra(c.id, d);
      const real = reales.get(d);
      const tieneReal = real !== undefined && !estado.simularCompleta;

      if (tieneReal) {
        if (!prestado) fraccionReal += real;
        celdas.push({ indice: d, origen: 'REAL', fraccion: real, obraId: obraDia, prestado });
      } else if (proyectados.has(d)) {
        if (!prestado) diasProyectados++;
        celdas.push({ indice: d, origen: 'PROYECTADA', fraccion: 1, obraId: obraDia, prestado });
      } else {
        celdas.push({ indice: d, origen: 'VACIA', fraccion: 0, obraId: obraDia, prestado });
      }
    }

    const baseCapturada = esDia ? fraccionReal * salarioDia : 0;
    const baseProyectada = esDia ? diasProyectados * salarioDia : 0;
    const destajo = esDia ? 0 : item?.totalPagar ?? 0;
    const destajoCapturado = esDia ? 0 : destajoRealPorColab.get(c.id) ?? 0;
    const ajustes = ajustePorColab.get(c.id) ?? 0;

    renglones.push({
      colaborador: c,
      puestoNombre: item?.puestoNombre ?? puesto?.nombre ?? 'Sin Puesto',
      cuadrillaId: cuadrillaPorColaborador[c.id] ?? null,
      salarioDia,
      celdas,
      fraccionCapturada: fraccionReal,
      diasProyectados,
      baseCapturada,
      baseProyectada,
      destajo,
      destajoCapturado,
      ajustes,
      esDestajista: !esDia,
      diasTotales: fraccionReal + diasProyectados,
      total: baseCapturada + baseProyectada + destajo + ajustes,
      destajoIncongruente: !esDia && destajo < destajoCapturado,
    });
  }

  // ── 6. Totales ────────────────────────────────────────────────────────────
  // Los de columna cuentan solo el pago por día: un destajo no pertenece a un
  // día de la semana, y sumarlo al martes sería inventar información.
  const totalPorDia = new Array<number>(7).fill(0);
  const personasPorDia = new Array<number>(7).fill(0);
  for (const r of renglones) {
    if (r.esDestajista) continue;
    for (const celda of r.celdas) {
      if (celda.fraccion <= 0) continue;
      // El día prestado cuenta en la obra a la que se fue, no en esta. Es justo
      // la cifra que se quiere leer: «el jueves, en Alfaro, ¿cuánto sale?».
      if (celda.prestado) continue;
      totalPorDia[celda.indice] += celda.fraccion * r.salarioDia;
      personasPorDia[celda.indice]++;
    }
  }

  let totalCapturado = 0;
  let totalProyectado = 0;
  let totalDia = 0;
  let totalDestajo = 0;
  let diasHombre = 0;
  for (const r of renglones) {
    totalDia += r.baseCapturada + r.baseProyectada;
    totalDestajo += r.destajo;
    diasHombre += r.fraccionCapturada + r.diasProyectados;

    // Del destajo, la parte «en firme» es la ya registrada; el resto es
    // estimación. El mínimo cubre que el usuario estime MENOS de lo capturado.
    const destajoFirme = Math.min(r.destajoCapturado, r.destajo);
    totalCapturado += r.baseCapturada + destajoFirme;
    totalProyectado += r.baseProyectada + (r.destajo - destajoFirme);
  }

  // Los ajustes son estimación por definición: nadie «captura» un anticipo
  // desde esta pantalla.
  let totalAjustes = 0;
  for (const v of ajustePorColab.values()) totalAjustes += v;
  for (const l of lineasCuadrilla) totalAjustes += l.montoConSigno;

  return {
    renglones,
    lineasCuadrilla,
    ajustesIgnorados: ignorados,
    totalPorDia,
    personasPorDia,
    totalDia,
    totalDestajo,
    totalAjustes,
    totalCapturado,
    totalProyectado: totalProyectado + totalAjustes,
    diasHombre,
    total: totalDia + totalDestajo + totalAjustes,
    personas: renglones.length,
  };
}

/// Reparte cada ajuste a quien le toca.
///
/// Un ajuste de cuadrilla en partes iguales se divide entre los miembros que
/// **están en el escenario** (no entre todos los de la cuadrilla: si sacaste a
/// alguien de la proyección, no le toca). Los centavos que sobran se le cargan
/// al primero, para que la suma de las partes dé exactamente el monto escrito.
function repartirAjustes(params: {
  estado: ProyeccionEstado;
  participantes: Set<string>;
  cuadrillaPorColaborador: Record<string, string>;
}): {
  porColab: Map<string, number>;
  lineas: LineaCuadrilla[];
  ignorados: AjusteProyeccion[];
} {
  const { estado, participantes, cuadrillaPorColaborador } = params;
  const porColab = new Map<string, number>();
  const lineas: LineaCuadrilla[] = [];
  const ignorados: AjusteProyeccion[] = [];

  for (const aj of estado.ajustes) {
    if (aj.monto === 0) continue;
    const signo = signoAjuste(aj.tipo);

    if (aj.destino === 'COLABORADOR') {
      if (!participantes.has(aj.destinoId)) {
        ignorados.push(aj);
        continue;
      }
      porColab.set(
        aj.destinoId,
        (porColab.get(aj.destinoId) ?? 0) + Math.abs(aj.monto) * signo,
      );
      continue;
    }

    const miembros = [...participantes]
      .filter((id) => cuadrillaPorColaborador[id] === aj.destinoId)
      .sort(
        (a, b) =>
          estado.participantes.indexOf(a) - estado.participantes.indexOf(b),
      );

    if (aj.reparto === 'A_LA_CUADRILLA' || miembros.length === 0) {
      // Sin miembros en el escenario no hay entre quién repartir: se queda como
      // renglón de cuadrilla en vez de desaparecer del total.
      lineas.push({
        cuadrillaId: aj.destinoId,
        ajuste: aj,
        montoConSigno: Math.abs(aj.monto) * signo,
        repartidoEntre: [],
        repartido: false,
      });
      continue;
    }

    const centavos = Math.round(aj.monto * 100);
    const base = Math.trunc(centavos / miembros.length);
    const sobra = centavos - base * miembros.length;
    miembros.forEach((id, i) => {
      const parte = ((base + (i === 0 ? sobra : 0)) / 100) * signo;
      porColab.set(id, (porColab.get(id) ?? 0) + parte);
    });
    lineas.push({
      cuadrillaId: aj.destinoId,
      ajuste: aj,
      montoConSigno: 0, // ya está dentro de los renglones
      repartidoEntre: miembros,
      repartido: true,
    });
  }

  return { porColab, lineas, ignorados };
}

/// Asistencia que NO existe en la base: solo alimenta al calculador.
function asistenciaSintetica(
  colaboradorId: string,
  obraId: string,
  fecha: number,
  fraccion: number,
): Asistencia {
  return {
    id: `sintetica-${colaboradorId}-${fecha}`,
    empresa_id: '',
    colaborador_id: colaboradorId,
    obra_id: obraId,
    fecha,
    fraccion,
    created_at: 0,
    updated_at: 0,
    server_updated_at: null,
    deleted_at: null,
  };
}

function destajoSintetico(
  colaboradorId: string,
  obraId: string,
  fecha: number,
  monto: number,
): Destajo {
  return {
    id: `sintetico-${colaboradorId}`,
    empresa_id: '',
    colaborador_id: colaboradorId,
    obra_id: obraId,
    fecha,
    concepto: null,
    monto,
    created_at: 0,
    updated_at: 0,
    server_updated_at: null,
    deleted_at: null,
  };
}
