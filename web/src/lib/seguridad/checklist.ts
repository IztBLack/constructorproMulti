/**
 * Revisión diaria de seguridad — reglas PURAS (sin Supabase).
 *
 * Espejo de `seguridad_puntos_validos()` de 0043: la base rechaza lo inválido;
 * aquí se limpia lo que llega del formulario y se calcula el cumplimiento.
 */

import { puntosPlantilla } from './plantilla';

export const RESULTADOS = ['CUMPLE', 'NO_CUMPLE', 'NO_APLICA'] as const;
export type ResultadoPunto = (typeof RESULTADOS)[number];

export const ETIQUETA_RESULTADO: Record<ResultadoPunto, string> = {
  CUMPLE: 'Sí cumple',
  NO_CUMPLE: 'No cumple',
  NO_APLICA: 'No aplica',
};

export interface PuntoChecklist {
  clave: string;
  texto: string;
  resultado: ResultadoPunto | null;
  nota?: string;
}

export const MAX_PUNTOS = 80;
export const MAX_NOTA_PUNTO = 500;
export const MAX_OBSERVACIONES = 3000;

export function esResultado(x: unknown): x is ResultadoPunto {
  return typeof x === 'string' && (RESULTADOS as readonly string[]).includes(x);
}

/** Puntos de la plantilla NOM-031, sin contestar. */
export function puntosNuevos(): PuntoChecklist[] {
  return puntosPlantilla().map((p) => ({ clave: p.clave, texto: p.texto, resultado: null }));
}

/**
 * Lee lo que venga (jsonb de la base o del navegador) y deja solo puntos
 * válidos: clave y texto con largo permitido, resultado conocido o nulo, nota
 * recortada. Lo que no se reconoce se descarta; nunca lanza.
 */
export function normalizarPuntos(crudo: unknown): PuntoChecklist[] {
  if (!Array.isArray(crudo)) return [];
  const vistos = new Set<string>();
  const salida: PuntoChecklist[] = [];
  for (const x of crudo) {
    if (!x || typeof x !== 'object' || Array.isArray(x)) continue;
    const o = x as Record<string, unknown>;
    const clave = typeof o.clave === 'string' ? o.clave.trim().slice(0, 60) : '';
    const texto = typeof o.texto === 'string' ? o.texto.trim().slice(0, 300) : '';
    if (!clave || !texto || vistos.has(clave)) continue;
    vistos.add(clave);
    const nota = typeof o.nota === 'string' ? o.nota.trim().slice(0, MAX_NOTA_PUNTO) : '';
    salida.push({
      clave,
      texto,
      resultado: esResultado(o.resultado) ? o.resultado : null,
      ...(nota ? { nota } : {}),
    });
    if (salida.length >= MAX_PUNTOS) break;
  }
  return salida;
}

export interface Cumplimiento {
  cumple: number;
  noCumple: number;
  noAplica: number;
  sinResponder: number;
  /**
   * Cumple ÷ (cumple + no cumple), redondeado a entero. "No aplica" y lo sin
   * contestar no cuentan: una obra sin excavaciones no sale mal por no tenerlas.
   * `null` si no hay nada que medir.
   */
  porcentaje: number | null;
}

export function cumplimiento(puntos: readonly PuntoChecklist[]): Cumplimiento {
  let cumple = 0;
  let noCumple = 0;
  let noAplica = 0;
  let sinResponder = 0;
  for (const p of puntos) {
    if (p.resultado === 'CUMPLE') cumple++;
    else if (p.resultado === 'NO_CUMPLE') noCumple++;
    else if (p.resultado === 'NO_APLICA') noAplica++;
    else sinResponder++;
  }
  const medibles = cumple + noCumple;
  return {
    cumple,
    noCumple,
    noAplica,
    sinResponder,
    porcentaje: medibles === 0 ? null : Math.round((cumple / medibles) * 100),
  };
}

export type NivelCumplimiento = 'BIEN' | 'REVISAR' | 'MAL' | 'SIN_DATOS';

/**
 * Semáforo: verde solo con 100 % (cada "no cumple" es un riesgo de hoy),
 * amarillo desde 80 %, rojo abajo. El color siempre va con texto.
 */
export function nivelCumplimiento(porcentaje: number | null): NivelCumplimiento {
  if (porcentaje === null) return 'SIN_DATOS';
  if (porcentaje >= 100) return 'BIEN';
  if (porcentaje >= 80) return 'REVISAR';
  return 'MAL';
}

export const TEXTO_NIVEL: Record<NivelCumplimiento, string> = {
  BIEN: 'Todo en orden',
  REVISAR: 'Hay pendientes',
  MAL: 'Atender hoy',
  SIN_DATOS: 'Sin revisar',
};
