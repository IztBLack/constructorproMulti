/**
 * Resumen del EXPEDIENTE de un subcontratista (RF5.4): qué documento está al
 * día, cuál vence y cuál falta. Puro, para el tablero y las pruebas.
 */

import { peorSemaforo, semaforoVencimiento, type NivelSemaforo, type Semaforo } from './avisos';

export type TipoDocExpediente = 'REPSE' | 'CONSTANCIA_FISCAL' | 'OPINION_32D' | 'IMSS_OPINION' | 'OTRO';

/** Los que se le piden a todo subcontratista (el OTRO es libre). */
export const DOCUMENTOS_BASICOS: TipoDocExpediente[] = ['REPSE', 'CONSTANCIA_FISCAL', 'OPINION_32D', 'IMSS_OPINION'];

export interface DocExpediente {
  tipo: TipoDocExpediente;
  vigencia_hasta: number | null;
  created_at: number;
}

export interface ResumenExpediente {
  nivel: NivelSemaforo;
  /** Documentos básicos que no se han agregado. */
  faltan: TipoDocExpediente[];
  /** Semáforo del documento más reciente de cada tipo presente. */
  porTipo: Partial<Record<TipoDocExpediente, Semaforo>>;
}

export function resumenExpediente<T extends DocExpediente>(documentos: T[], hoyMs: number): ResumenExpediente {
  // El más reciente de cada tipo manda (la opinión se renueva seguido: la
  // vieja vencida no debe pintar de rojo un expediente que ya se actualizó).
  const recientes = new Map<TipoDocExpediente, T>();
  for (const d of documentos) {
    const previo = recientes.get(d.tipo);
    if (!previo || d.created_at > previo.created_at) recientes.set(d.tipo, d);
  }
  const porTipo: Partial<Record<TipoDocExpediente, Semaforo>> = {};
  for (const [tipo, d] of recientes) {
    const s = semaforoVencimiento(d.vigencia_hasta, hoyMs);
    // Constancia fiscal y OTRO no suelen vencer: sin fecha no es alarma.
    porTipo[tipo] = s.nivel === 'SIN_FECHA' && (tipo === 'CONSTANCIA_FISCAL' || tipo === 'OTRO')
      ? { ...s, nivel: 'VIGENTE', texto: 'Sin vencimiento' }
      : s;
  }
  const faltan = DOCUMENTOS_BASICOS.filter((t) => !recientes.has(t));
  const niveles = Object.values(porTipo).map((s) => s!.nivel);
  // Que falte un documento pesa como "pronto": hay que pedirlo, pero no venció nada.
  if (faltan.length > 0) niveles.push('PRONTO');
  return { nivel: niveles.length ? peorSemaforo(niveles) : 'SIN_FECHA', faltan, porTipo };
}
