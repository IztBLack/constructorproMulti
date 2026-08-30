/// Escenarios de proyección con nombre: la parte PURA.
///
/// La fila tal como vive en `proyeccion_guardada` (migración 0034) y las dos
/// conversiones que hacen falta para entrar y salir de ella. Sin cliente de
/// Supabase, para que la pantalla —que es un componente de cliente— pueda
/// importar los tipos sin arrastrar el bundle de servidor.
///
/// Gemelo de `ProyeccionGuardadaRow` y `ProyeccionRepository` del móvil
/// (`lib/data/repositories_proyeccion.dart`).

import {
  VERSION_ESQUEMA,
  deserializarEscenario,
  proyeccionUtilizable,
  serializarEscenario,
} from './proyeccion-contrato';
import type { ProyeccionEstado } from './proyeccion-nomina';

/// Una fila de la lista. **No trae el escenario**: la lista pinta veinte de
/// estos y parsear veinte JSON para enseñar un nombre y un total sería trabajo
/// tirado. El escenario se lee al abrir, con `leerProyeccion`.
export interface ProyeccionResumen {
  id: string;
  nombre: string;
  lunesMs: number;
  /// Obra que se estaba viendo al guardar; `''` = todas.
  obraFiltro: string;
  esquema: number;
  /// Total y personas AL MOMENTO DE GUARDAR. Son una foto: el número de verdad
  /// se recalcula al abrir, y por eso la lista los rotula «al guardar».
  totalSnapshot: number;
  personasSnapshot: number;
  notas: string;
  updatedAt: number;
}

/// Una fila completa, ya con su escenario deserializado.
export interface ProyeccionCompleta extends ProyeccionResumen {
  estado: ProyeccionEstado;
}

/// La forma cruda que devuelve PostgREST.
export interface FilaProyeccion {
  id: string;
  nombre: string | null;
  lunes_millis: number;
  obra_filtro: string | null;
  escenario: string | null;
  esquema: number | null;
  total_snapshot: number | null;
  personas_snapshot: number | null;
  notas: string | null;
  updated_at: number | null;
}

/// Columnas de la LISTA. Se pide `esquema` aunque no se pinte: es lo que decide
/// si la fila se puede abrir, y pedirlo aquí evita descubrirlo al abrirla.
export const SELECT_RESUMEN =
  'id, nombre, lunes_millis, obra_filtro, esquema, total_snapshot, personas_snapshot, notas, updated_at';

export const SELECT_COMPLETA = `${SELECT_RESUMEN}, escenario`;

export function aResumen(fila: FilaProyeccion): ProyeccionResumen {
  return {
    id: fila.id,
    nombre: fila.nombre ?? '',
    lunesMs: fila.lunes_millis,
    obraFiltro: fila.obra_filtro ?? '',
    esquema: fila.esquema ?? 1,
    totalSnapshot: fila.total_snapshot ?? 0,
    personasSnapshot: fila.personas_snapshot ?? 0,
    notas: fila.notas ?? '',
    updatedAt: fila.updated_at ?? 0,
  };
}

/// ¿Esta plataforma entiende esta fila?
///
/// La autoridad es la columna `esquema`, no la llave `v` del JSON: así una fila
/// escrita por una versión más nueva se descarta **sin llegar a parsear el
/// texto**. Gemelo del candado de `repositories_proyeccion.dart:182`.
export function seEntiende(resumen: ProyeccionResumen): boolean {
  return proyeccionUtilizable(resumen.esquema);
}

/// Reconstruye la proyección completa, o `null` si esta versión no la entiende.
///
/// Devolver `null` en vez de lanzar es deliberado: una fila que no se entiende
/// —o una con el JSON corrupto— no puede tumbar la LISTA entera, solo quedarse
/// sin abrir. Es la misma regla que el lector del escenario.
export function aCompleta(fila: FilaProyeccion): ProyeccionCompleta | null {
  const resumen = aResumen(fila);
  if (!seEntiende(resumen)) return null;

  let crudo: unknown;
  try {
    crudo = JSON.parse(fila.escenario ?? '{}');
  } catch {
    return null;
  }

  return { ...resumen, estado: deserializarEscenario(crudo) };
}

/// Lo que se escribe al guardar. `esquema` sale de la constante y no del
/// llamador: es la versión con la que ESTA plataforma escribe, y dejar que se
/// pasara desde fuera permitiría guardar una fila mintiendo sobre su formato.
export function aFilaEscritura(params: {
  nombre: string;
  estado: ProyeccionEstado;
  obraFiltro: string;
  totalSnapshot: number;
  personasSnapshot: number;
  notas?: string;
}): {
  nombre: string;
  lunes_millis: number;
  obra_filtro: string;
  escenario: string;
  esquema: number;
  total_snapshot: number;
  personas_snapshot: number;
  notas: string;
} {
  return {
    nombre: params.nombre.trim(),
    lunes_millis: params.estado.lunesMs,
    obra_filtro: params.obraFiltro,
    escenario: JSON.stringify(serializarEscenario(params.estado)),
    esquema: VERSION_ESQUEMA,
    total_snapshot: params.totalSnapshot,
    personas_snapshot: params.personasSnapshot,
    notas: params.notas ?? '',
  };
}

/// Nombre por defecto de un escenario nuevo: «Simulación del 18 de mayo».
///
/// Se propone en vez de dejarlo vacío porque una lista de «Sin nombre (3)» no
/// se puede leer, y quien guarda a las 6 de la tarde en la obra no está para
/// inventar títulos.
export function nombrePropuesto(lunesMs: number, existentes: string[]): string {
  const fecha = new Date(lunesMs).toLocaleDateString('es-MX', {
    day: 'numeric',
    month: 'long',
    timeZone: 'America/Mexico_City',
  });
  const base = `Simulación del ${fecha}`;
  if (!existentes.includes(base)) return base;

  // Ya hay una con ese nombre: se numera en vez de repetir, para que la lista
  // siga distinguiéndolas.
  for (let n = 2; ; n++) {
    const intento = `${base} (${n})`;
    if (!existentes.includes(intento)) return intento;
  }
}
