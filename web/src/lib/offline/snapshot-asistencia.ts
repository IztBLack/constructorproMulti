/// Snapshots de LECTURA del pase de lista (Fase D).
///
/// La cola (`cola-asistencia.ts`) resuelve la escritura sin señal, pero de nada
/// sirve poder marcar si al abrir la pantalla en la obra —sin red— no se ve la
/// lista de colaboradores ni lo ya marcado. Aquí se guarda una copia de la
/// semana para poder pintar la cuadrícula offline.
///
/// Un snapshot es por (obra, semana). La clave de semana es el epoch ms de la
/// medianoche de México del lunes (o del día inicial que use la vista); NUNCA
/// se construye con `new Date('YYYY-MM-DD')` — eso interpreta la cadena en UTC
/// y desfasa el día, bug ya sufrido en este proyecto. Usa los helpers de
/// `@/lib/data/tz` (`medianocheMx`, `fechaInputAMs`) para calcularla.

import type { Colaborador } from '@/lib/data/types';
import { STORE_SNAPSHOTS, hayIdb, idbDeleteMuchos, idbGet, idbGetAll, idbPut } from './idb';

export interface SnapshotAsistencia {
  colaboradores: Colaborador[];
  /** clave `${colaboradorId}|${fechaMs}` → fracción */
  fracciones: Record<string, number>;
  guardadoEn: number;
}

interface RegistroSnapshot extends SnapshotAsistencia {
  /** `${obraId}|${inicioSemanaMs}` (keyPath del store). */
  clave: string;
}

/** Snapshots que se conservan por defecto. ~1 mes de historial. */
const MAX_SEMANAS_POR_DEFECTO = 8;

function claveSnap(obraId: string, inicioSemanaMs: number): string {
  return `${obraId}|${inicioSemanaMs}`;
}

/** Construye la clave de una celda dentro de `fracciones`. */
export function claveCelda(colaboradorId: string, fechaMs: number): string {
  return `${colaboradorId}|${fechaMs}`;
}

/**
 * Guarda (o reemplaza) el snapshot de esa obra/semana. Llamar tras cada carga
 * exitosa desde el servidor, cuando SÍ hubo red: es la única forma de que la
 * copia offline esté fresca.
 */
export async function guardarSnapshot(
  obraId: string,
  inicioSemanaMs: number,
  s: Omit<SnapshotAsistencia, 'guardadoEn'>,
): Promise<void> {
  if (!hayIdb()) return;
  const reg: RegistroSnapshot = {
    clave: claveSnap(obraId, inicioSemanaMs),
    colaboradores: s.colaboradores,
    fracciones: s.fracciones,
    guardadoEn: Date.now(),
  };
  await idbPut(STORE_SNAPSHOTS, reg);
  // Poda oportunista: evita que la BD crezca sin límite sin exigirle a la UI
  // acordarse de podar. Si falla (cuota, etc.) no debe tumbar el guardado.
  void podarSnapshots().catch(() => {});
}

/**
 * Lee el snapshot de esa obra/semana, o `null` si no hay.
 *
 * OJO: devuelve lo que había la última vez que hubo red. La vista debe fusionar
 * encima las marcas todavía pendientes en la cola (`listarPendientes()`) para
 * que el usuario vea sus propias capturas offline reflejadas.
 */
export async function leerSnapshot(
  obraId: string,
  inicioSemanaMs: number,
): Promise<SnapshotAsistencia | null> {
  const r = await idbGet<RegistroSnapshot>(STORE_SNAPSHOTS, claveSnap(obraId, inicioSemanaMs));
  if (!r) return null;
  return { colaboradores: r.colaboradores, fracciones: r.fracciones, guardadoEn: r.guardadoEn };
}

/**
 * Poda los snapshots más viejos, conservando los `maxSemanas` más recientes.
 * En iOS el techo de almacenamiento por origen ronda los ~50MB y, al pasarse,
 * Safari puede purgar TODO el origen (incluida la cola de escritura pendiente).
 * Por eso la poda es agresiva con la lectura, que siempre se puede recuperar
 * del servidor, y nunca toca la cola, que es dato del usuario aún no subido.
 */
export async function podarSnapshots(
  maxSemanas: number = MAX_SEMANAS_POR_DEFECTO,
): Promise<void> {
  if (!hayIdb()) return;
  const todos = await idbGetAll<RegistroSnapshot>(STORE_SNAPSHOTS);
  if (todos.length <= maxSemanas) return;
  todos.sort((a, b) => b.guardadoEn - a.guardadoEn); // más reciente primero
  const sobran = todos.slice(maxSemanas).map((r) => r.clave);
  await idbDeleteMuchos(STORE_SNAPSHOTS, sobran);
}
