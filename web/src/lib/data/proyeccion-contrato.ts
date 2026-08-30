/// CONTRATO del escenario de proyección guardado (`proyeccion_guardada.escenario`).
///
/// Gemelo de `ProyeccionEstado.toJson` / `.fromJson` del móvil
/// (`lib/domain/logic/models_proyeccion.dart`). Las dos plataformas escriben y
/// leen la MISMA columna de texto, así que este archivo no puede inventar nada:
/// cada nombre de llave y cada código de enum sale de allá.
///
/// Lo que se está protegiendo no es un detalle de formato. Si aquí se escribiera
/// `salarios` donde el móvil lee `salario`, nada fallaría: la llave no estaría,
/// el lector del móvil es tolerante a llaves faltantes a propósito, y el
/// escenario abriría con los sueldos BASE en vez de los que alguien ajustó a
/// mano. La pantalla se vería perfecta y el número estaría mal.
///
/// Por eso `proyeccion-contrato.test.ts` no espeja casos a mano como el resto de
/// pruebas de paridad del proyecto: lee **el mismo archivo** que la prueba del
/// móvil, `test/fixtures/proyeccion_v1.json`.
///
/// LA AUTORIDAD DE VERSIÓN ES LA COLUMNA, NO EL JSON
/// El escenario lleva una llave `v`, y es fácil mirarla y creer que ahí está la
/// puerta. No lo está: nadie la lee. El candado vive en la columna `esquema` de
/// la tabla, que permite descartar una fila sin llegar a parsear el texto —ver
/// `proyeccionUtilizable` más abajo, y su gemelo en
/// `repositories_proyeccion.dart`.
///
/// Ver `docs/PARIDAD_PROYECCION_WEB.md`.

import type {
  AjusteProyeccion,
  CampoRedondeo,
  DestinoAjuste,
  ModoRedondeo,
  PeriodoPago,
  PlazaProyectada,
  ProyeccionEstado,
  RepartoAjuste,
  SueldoProyectado,
  TipoAjuste,
} from './proyeccion-nomina';

/// Versión del formato que esta plataforma sabe escribir y leer.
/// Espeja `ProyeccionEstado.versionEsquema`.
export const VERSION_ESQUEMA = 1;

/// El escenario que viaja en la columna es EL MISMO que la pantalla tiene en la
/// mano: un solo tipo, no dos que haya que mantener de acuerdo.
///
/// `ProyeccionEstado` lleva `plazas`, `sueldoOverride` y `redondeo` desde antes
/// de que la web tenga pantalla para editarlos (eso es la Fase 4), y eso es a
/// propósito: si el tipo los ignorara, abrir en la oficina un escenario armado
/// en la tableta y volver a guardarlo los borraría sin decir nada. Un ida y
/// vuelta tiene que ser fiel antes de que exista la pantalla que los edita.
export type EscenarioGuardado = ProyeccionEstado;

// ═══════════════════════════════════════════════════════════════════════════
// Lectura
// ═══════════════════════════════════════════════════════════════════════════

/// Tolerante a llaves faltantes Y a valores mal tipados, igual que el lector del
/// móvil. La regla es SALTAR lo que no se entiende, nunca sustituirlo por un
/// default: en una raya, una cifra ausente se ve; una cifra inventada, no.
///
/// Importa más aquí que allá: un escenario roto no puede tumbar la LISTA entera
/// de proyecciones guardadas, solo dejar fuera la fila mala.

function esObjeto(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function mapa(v: unknown): Record<string, unknown> {
  return esObjeto(v) ? v : {};
}

function lista(v: unknown): unknown[] {
  return Array.isArray(v) ? v : [];
}

function numeros(v: unknown): Record<string, number> {
  const salida: Record<string, number> = {};
  for (const [k, valor] of Object.entries(mapa(v))) {
    if (typeof valor === 'number' && Number.isFinite(valor)) salida[k] = valor;
  }
  return salida;
}

function textos(v: unknown): Record<string, string> {
  const salida: Record<string, string> = {};
  for (const [k, valor] of Object.entries(mapa(v))) {
    if (typeof valor === 'string') salida[k] = valor;
  }
  return salida;
}

function texto(v: unknown, porDefecto: string): string {
  return typeof v === 'string' ? v : porDefecto;
}

function textoONulo(v: unknown): string | null {
  return typeof v === 'string' ? v : null;
}

function numero(v: unknown, porDefecto: number): number {
  return typeof v === 'number' && Number.isFinite(v) ? v : porDefecto;
}

function periodoPago(v: unknown): PeriodoPago {
  return v === 'SEMANAL' || v === 'QUINCENAL' ? v : 'MENSUAL';
}

function modoRedondeo(v: unknown): ModoRedondeo {
  return v === 'ARRIBA' || v === 'ABAJO' ? v : 'CERCANO';
}

function campoRedondeo(v: unknown): CampoRedondeo | null {
  return v === 'SALARIO_DIA' || v === 'RAYA' || v === 'SUBTOTALES' || v === 'TOTAL'
    ? v
    : null;
}

function tipoAjuste(v: unknown): TipoAjuste {
  return v === 'ANTICIPO' || v === 'DESCUENTO' ? v : 'DESTAJO';
}

function sueldoDesde(v: unknown): SueldoProyectado {
  const m = mapa(v);
  return {
    periodo: periodoPago(m.periodo),
    monto: numero(m.monto, 0),
    diasSemana: numero(m.diasSemana, 6),
  };
}

export function deserializarEscenario(json: unknown): EscenarioGuardado {
  const j = mapa(json);

  const diasProyectados: Record<string, number[]> = {};
  for (const [id, dias] of Object.entries(mapa(j.dias))) {
    diasProyectados[id] = lista(dias)
      .filter((d): d is number => typeof d === 'number' && Number.isFinite(d))
      .map((d) => Math.trunc(d));
  }

  const sueldoOverride: Record<string, SueldoProyectado> = {};
  for (const [id, s] of Object.entries(mapa(j.sueldo))) {
    sueldoOverride[id] = sueldoDesde(s);
  }

  const plazas: Record<string, PlazaProyectada> = {};
  for (const [id, p] of Object.entries(mapa(j.plazas))) {
    const m = mapa(p);
    // Sin `id` de texto no hay plaza que reconstruir.
    if (typeof m.id !== 'string') continue;
    plazas[id] = {
      id: m.id,
      etiqueta: texto(m.etiqueta, 'Plaza'),
      puestoId: texto(m.puestoId, ''),
      obraId: textoONulo(m.obraId),
      cuadrillaId: textoONulo(m.cuadrillaId),
      sueldo: sueldoDesde(m.sueldo),
    };
  }

  const ajustes: AjusteProyeccion[] = [];
  for (const a of lista(j.ajustes)) {
    const m = mapa(a);
    if (typeof m.id !== 'string') continue;
    ajustes.push({
      id: m.id,
      tipo: tipoAjuste(m.tipo),
      destino: (m.destino === 'CUADRILLA'
        ? 'CUADRILLA'
        : 'COLABORADOR') as DestinoAjuste,
      destinoId: texto(m.destinoId, ''),
      monto: numero(m.monto, 0),
      nota: texto(m.nota, ''),
      reparto: (m.reparto === 'A_LA_CUADRILLA'
        ? 'A_LA_CUADRILLA'
        : 'PARTES_IGUALES') as RepartoAjuste,
    });
  }

  const obraPorDia: Record<string, Record<number, string>> = {};
  for (const [id, dias] of Object.entries(mapa(j.obraPorDia))) {
    const suyos: Record<number, string> = {};
    for (const [d, obra] of Object.entries(mapa(dias))) {
      const indice = Number.parseInt(d, 10);
      if (Number.isNaN(indice) || typeof obra !== 'string') continue;
      suyos[indice] = obra;
    }
    obraPorDia[id] = suyos;
  }

  const campos: CampoRedondeo[] = [];
  const r = mapa(j.redondeo);
  for (const c of lista(r.campos)) {
    const campo = campoRedondeo(c);
    if (campo && !campos.includes(campo)) campos.push(campo);
  }

  return {
    lunesMs: numero(j.lunes, 0),
    participantes: lista(j.participantes).filter(
      (p): p is string => typeof p === 'string',
    ),
    diasProyectados,
    destajoEstimado: numeros(j.destajo),
    salarioOverride: numeros(j.salario),
    sueldoOverride,
    plazas,
    ajustes,
    simularCompleta: j.simular === true,
    obraPorDia,
    obraBase: textos(j.obraBase),
    redondeo: {
      activo: r.activo === true,
      paso: numero(r.paso, 1),
      modo: modoRedondeo(r.modo),
      campos,
    },
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// Escritura
// ═══════════════════════════════════════════════════════════════════════════

/// El escenario como JSON, con las MISMAS llaves y el MISMO orden de conceptos
/// que `ProyeccionEstado.toJson` del móvil.
///
/// No se serializa nada de lo CAPTURADO —ni asistencias ni destajos reales—: al
/// reabrir se vuelven a leer de la base. Guardar una copia haría que una
/// proyección de hace dos semanas enseñara el pase de lista de entonces aunque
/// después se hubiera corregido, que es al revés de para lo que sirve.
export function serializarEscenario(e: EscenarioGuardado): Record<string, unknown> {
  const dias: Record<string, number[]> = {};
  for (const [id, suyos] of Object.entries(e.diasProyectados)) {
    // El móvil omite las llaves vacías: un `{c1: []}` haría ver el escenario
    // «tocado» sin que nada cambiara, y los dos lados tienen que emitir igual.
    if (suyos.length === 0) continue;
    dias[id] = [...suyos].sort((a, b) => a - b);
  }

  const sueldo: Record<string, unknown> = {};
  for (const [id, s] of Object.entries(e.sueldoOverride)) {
    sueldo[id] = { periodo: s.periodo, monto: s.monto, diasSemana: s.diasSemana };
  }

  const plazas: Record<string, unknown> = {};
  for (const [id, p] of Object.entries(e.plazas)) {
    plazas[id] = {
      id: p.id,
      etiqueta: p.etiqueta,
      puestoId: p.puestoId,
      obraId: p.obraId,
      cuadrillaId: p.cuadrillaId,
      sueldo: {
        periodo: p.sueldo.periodo,
        monto: p.sueldo.monto,
        diasSemana: p.sueldo.diasSemana,
      },
    };
  }

  const obraPorDia: Record<string, Record<string, string>> = {};
  for (const [id, suyos] of Object.entries(e.obraPorDia)) {
    const salida: Record<string, string> = {};
    for (const [d, obra] of Object.entries(suyos)) salida[String(d)] = obra;
    obraPorDia[id] = salida;
  }

  return {
    v: VERSION_ESQUEMA,
    lunes: e.lunesMs,
    participantes: e.participantes,
    dias,
    destajo: e.destajoEstimado,
    salario: e.salarioOverride,
    sueldo,
    plazas,
    ajustes: e.ajustes.map((a) => ({
      id: a.id,
      tipo: a.tipo,
      destino: a.destino,
      destinoId: a.destinoId,
      monto: a.monto,
      nota: a.nota,
      reparto: a.reparto,
    })),
    simular: e.simularCompleta,
    obraPorDia,
    obraBase: e.obraBase,
    redondeo: {
      activo: e.redondeo.activo,
      paso: e.redondeo.paso,
      modo: e.redondeo.modo,
      campos: e.redondeo.campos,
    },
  };
}

/// ¿Esta plataforma entiende una fila guardada con esta `esquema`?
///
/// La autoridad es la COLUMNA, no la llave `v` del JSON: así una fila escrita
/// por una versión más nueva se descarta sin llegar a parsear el texto. Gemelo
/// del candado de `repositories_proyeccion.dart`.
export function proyeccionUtilizable(esquema: number): boolean {
  return esquema <= VERSION_ESQUEMA;
}
