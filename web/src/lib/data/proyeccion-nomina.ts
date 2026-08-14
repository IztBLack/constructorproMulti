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
import type { Asistencia, Colaborador, Destajo, Puesto, Rol } from './types';
import { partesTz, medianocheMx, sumarDiasCalendario } from './tz';

// ═══════════════════════════════════════════════════════════════════════════
// Permisos
// ═══════════════════════════════════════════════════════════════════════════

/// Roles con acceso a la proyección.
///
/// Es una LISTA BLANCA a propósito, al revés que `seccionesDe` en
/// `lib/auth/secciones.ts`: esta pantalla enseña el salario de cada persona
/// junto a su nombre, así que un rol nuevo debe tener que pedir el permiso en
/// vez de heredarlo. Espeja `_rolesProyeccionNomina` del móvil.
///
/// `contador` queda FUERA por ahora, y es el caso discutible: la migración 0022
/// lo define como tesorero que «ve los montos a pagar». Si se decide abrirle la
/// pantalla, va aquí y en el móvil, en solo lectura.
const ROLES_PROYECCION: readonly string[] = ['admin', 'supervisor'];

export function puedeVerProyeccion(rol: Rol): boolean {
  return ROLES_PROYECCION.includes(rol);
}

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
  /// `colaboradorId → obraId`. Solo sella las asistencias sintéticas.
  obraPorColaborador?: Record<string, string>;
}): ProyeccionResultado {
  const {
    estado,
    colaboradores,
    puestos,
    asistenciasReales = [],
    destajosReales = [],
    cuadrillaPorColaborador = {},
    obraPorColaborador = {},
  } = params;

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
    const obraId = obraPorColaborador[c.id] ?? '';
    const reales = realPorDia.get(c.id) ?? new Map<number, number>();

    if (c.tipo_pago === 'DIA') {
      if (!estado.simularCompleta) {
        for (const [d, frac] of reales) {
          if (frac <= 0) continue; // falta capturada: no paga, pero sí bloquea
          asistenciasSinteticas.push(
            asistenciaSintetica(c.id, obraId, fechaDelDia(estado.lunesMs, d), frac),
          );
        }
      }
      // Los días proyectados rellenan SOLO lo que no está capturado: una
      // palomita no puede pisar un día que ya se pasó a lista.
      for (const d of estado.diasProyectados[c.id] ?? []) {
        if (!estado.simularCompleta && reales.has(d)) continue;
        asistenciasSinteticas.push(
          asistenciaSintetica(c.id, obraId, fechaDelDia(estado.lunesMs, d), 1),
        );
      }
    } else {
      // A destajo la asistencia no mueve el pago. El monto del escenario es el
      // TOTAL esperado de la semana, no un extra sobre lo capturado.
      const monto =
        estado.destajoEstimado[c.id] ?? destajoRealPorColab.get(c.id) ?? 0;
      if (monto !== 0) {
        destajosSinteticos.push(
          destajoSintetico(c.id, obraId, estado.lunesMs, monto),
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
      // A destajo no hay celdas de día: su pago no lo mueve la asistencia, y es
      // lo que hace `calcularNomina` (la rama de destajo ni mira asistencias).
      if (!esDia) {
        celdas.push({ indice: d, origen: 'VACIA', fraccion: 0 });
        continue;
      }
      const real = reales.get(d);
      const tieneReal = real !== undefined && !estado.simularCompleta;
      if (tieneReal) {
        fraccionReal += real;
        celdas.push({ indice: d, origen: 'REAL', fraccion: real });
      } else if (proyectados.has(d)) {
        diasProyectados++;
        celdas.push({ indice: d, origen: 'PROYECTADA', fraccion: 1 });
      } else {
        celdas.push({ indice: d, origen: 'VACIA', fraccion: 0 });
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
