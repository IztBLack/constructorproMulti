/**
 * Bitácora de obra (migración 0041) — reglas PURAS, sin Supabase.
 *
 * Lo importan igual la página (servidor), los formularios (cliente), el PDF y
 * las pruebas. Las reglas de verdad (cierre a las 24 h, quién escribe, máximo
 * de fotos) las pone la base; aquí solo se reflejan para no ofrecer en pantalla
 * algo que la base va a rechazar, y para traducir sus errores a lenguaje de obra.
 */

import { partesTz } from '@/lib/data/tz';

export const TIPOS_ENTRADA = ['AVANCE', 'INCIDENCIA', 'INSTRUCCION', 'VISITA', 'CLIMA', 'OTRO'] as const;
export type TipoEntrada = (typeof TIPOS_ENTRADA)[number];

export const ETIQUETA_TIPO: Record<TipoEntrada, string> = {
  AVANCE: 'Avance',
  INCIDENCIA: 'Incidencia',
  INSTRUCCION: 'Instrucción',
  VISITA: 'Visita',
  CLIMA: 'Clima',
  OTRO: 'Otro',
};

export const CLIMAS = ['', 'SOLEADO', 'NUBLADO', 'LLUVIA', 'TORMENTA', 'CALOR', 'FRIO', 'VIENTO'] as const;
export type Clima = (typeof CLIMAS)[number];

export const ETIQUETA_CLIMA: Record<Clima, string> = {
  '': 'Sin anotar',
  SOLEADO: 'Soleado',
  NUBLADO: 'Nublado',
  LLUVIA: 'Lluvia',
  TORMENTA: 'Tormenta',
  CALOR: 'Mucho calor',
  FRIO: 'Frío',
  VIENTO: 'Viento',
};

/** Igual que `bitacora_abierta()` en 0041. */
export const VENTANA_EDICION_MS = 24 * 60 * 60 * 1000;
/** Igual que el trigger `bitacora_foto_reglas` de 0041. */
export const MAX_FOTOS = 10;
export const MAX_TEXTO = 5000;

export function esTipoEntrada(x: unknown): x is TipoEntrada {
  return typeof x === 'string' && (TIPOS_ENTRADA as readonly string[]).includes(x);
}
export function esClima(x: unknown): x is Clima {
  return typeof x === 'string' && (CLIMAS as readonly string[]).includes(x);
}

// ── Tipos de datos ──────────────────────────────────────────────────────────

export interface FotoBitacora {
  id: string;
  path: string;
  orden: number;
  /** URL firmada para verla (null si no se pudo firmar). */
  url: string | null;
}

export interface AclaracionBitacora {
  id: string;
  texto: string;
  autor_nombre: string;
  registrada_en: number;
}

export interface EntradaBitacora {
  id: string;
  obra_id: string;
  fecha: number;
  tipo: TipoEntrada;
  texto: string;
  clima: Clima;
  personal_presente: number | null;
  personal_nombres: string[];
  visible_cliente: boolean;
  autor_id: string | null;
  autor_nombre: string;
  registrada_en: number;
  fotos: FotoBitacora[];
  aclaraciones: AclaracionBitacora[];
}

// ── Cierre a las 24 h ───────────────────────────────────────────────────────

/** ¿La entrada todavía se puede editar? Mismo criterio que la base. */
export function entradaAbierta(registradaEn: number, ahora: number = Date.now()): boolean {
  return registradaEn >= ahora - VENTANA_EDICION_MS;
}

/** "Se cierra en 5 h" / "en 20 min". `null` si ya está cerrada. */
export function textoCierre(registradaEn: number, ahora: number = Date.now()): string | null {
  const resta = registradaEn + VENTANA_EDICION_MS - ahora;
  if (resta < 0) return null;
  const min = Math.floor(resta / 60_000);
  if (min < 60) return `Se cierra en ${Math.max(min, 1)} min`;
  return `Se cierra en ${Math.floor(min / 60)} h`;
}

/**
 * ¿Esta persona puede editar ESTA entrada? Refleja la policy de 0041: el admin
 * cualquiera, el supervisor solo las suyas; y solo mientras esté abierta.
 */
export function puedeEditarEntrada(
  e: Pick<EntradaBitacora, 'autor_id' | 'registrada_en'>,
  usuario: { id: string; rol: string },
  ahora: number = Date.now(),
): boolean {
  if (!entradaAbierta(e.registrada_en, ahora)) return false;
  if (usuario.rol === 'admin') return true;
  return usuario.rol === 'supervisor' && e.autor_id === usuario.id;
}

// ── Agrupar por día ─────────────────────────────────────────────────────────

export interface DiaBitacora<T> {
  /** Clave 'YYYY-MM-DD' del día en México. */
  clave: string;
  /** Epoch ms de la medianoche de ese día (la `fecha` de la primera entrada). */
  fecha: number;
  entradas: T[];
}

function claveDia(ms: number): string {
  const p = partesTz(ms);
  return `${p.year}-${String(p.month + 1).padStart(2, '0')}-${String(p.day).padStart(2, '0')}`;
}

/**
 * Timeline: días del más reciente al más viejo; dentro del día, en el orden en
 * que se registraron. Se agrupa por día de CALENDARIO en México (igual que la
 * asistencia), no por el ms exacto de `fecha`.
 */
export function agruparPorDia<T extends { fecha: number; registrada_en: number }>(
  entradas: readonly T[],
): DiaBitacora<T>[] {
  const porDia = new Map<string, DiaBitacora<T>>();
  for (const e of entradas) {
    const clave = claveDia(e.fecha);
    const dia = porDia.get(clave) ?? { clave, fecha: e.fecha, entradas: [] };
    dia.entradas.push(e);
    porDia.set(clave, dia);
  }
  const dias = [...porDia.values()];
  for (const d of dias) d.entradas.sort((x, y) => x.registrada_en - y.registrada_en);
  return dias.sort((x, y) => (x.clave < y.clave ? 1 : x.clave > y.clave ? -1 : 0));
}

// ── Personal presente (sale del pase de lista) ─────────────────────────────

/**
 * Nombres de quienes tienen asistencia ese día (fracción > 0), sin repetir y en
 * orden alfabético. Es la SUGERENCIA; lo que se guarda es la foto fija que el
 * usuario confirme.
 */
export function nombresPresentes(
  asistencias: readonly { colaborador_id: string; fraccion: number }[],
  nombres: ReadonlyMap<string, string>,
): string[] {
  const vistos = new Set<string>();
  for (const a of asistencias) {
    if (a.fraccion > 0) {
      const n = nombres.get(a.colaborador_id)?.trim();
      if (n) vistos.add(n);
    }
  }
  return [...vistos].sort((x, y) => x.localeCompare(y, 'es'));
}

/** Limpia la lista capturada: sin vacíos, sin repetidos, con tope. */
export function limpiarNombres(crudo: readonly string[]): string[] {
  const out: string[] = [];
  const vistos = new Set<string>();
  for (const n of crudo) {
    const t = n.trim().slice(0, 120);
    const k = t.toLocaleLowerCase('es');
    if (t && !vistos.has(k)) {
      vistos.add(k);
      out.push(t);
    }
    if (out.length >= 500) break;
  }
  return out;
}

// ── Errores de la base en lenguaje de obra ──────────────────────────────────

export function mensajeErrorBitacora(msg: string): string {
  if (msg.includes('BITACORA_CERRADA')) {
    return 'Esta entrada ya se cerró (pasaron 24 horas desde que se registró). Agrega una aclaración.';
  }
  if (msg.includes('BITACORA_MAX_FOTOS')) {
    return `Una entrada lleva máximo ${MAX_FOTOS} fotos.`;
  }
  if (/row-level security|permission denied/i.test(msg)) {
    return 'No tienes permiso para hacer esto en la bitácora.';
  }
  return msg;
}
