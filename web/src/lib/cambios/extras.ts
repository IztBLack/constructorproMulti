/**
 * EXTRAS (órdenes de cambio, migración 0036): tipos y cuentas PURAS.
 *
 * Sin Supabase ni `server-only`: lo importan igual el editor (cliente), el PDF,
 * el portal y las pruebas. Si cada pantalla sumara por su cuenta, tarde o
 * temprano enseñarían números distintos del mismo extra.
 *
 * REGLA QUE MANDA: lo que se envió al cliente no cambia. Por eso el dinero de un
 * extra enviado sale SIEMPRE de su foto (`snapshot_json` / `total_enviado`) y
 * nunca de volver a sumar renglones. Los renglones vivos solo cuentan mientras
 * el extra es borrador.
 */

export type EstadoExtra = 'BORRADOR' | 'ENVIADA' | 'APROBADA' | 'RECHAZADA' | 'CANCELADA';

export const ESTADOS_EXTRA: readonly EstadoExtra[] = [
  'BORRADOR',
  'ENVIADA',
  'APROBADA',
  'RECHAZADA',
  'CANCELADA',
];

/** Cómo se lee cada estado, en palabras de obra. */
export const ETIQUETA_ESTADO_EXTRA: Record<EstadoExtra, string> = {
  BORRADOR: 'Borrador',
  ENVIADA: 'Esperando al cliente',
  APROBADA: 'Aprobado',
  RECHAZADA: 'Rechazado',
  CANCELADA: 'Cancelado',
};

export const TONO_ESTADO_EXTRA: Record<EstadoExtra, 'neutral' | 'blue' | 'green' | 'red' | 'amber'> = {
  BORRADOR: 'neutral',
  ENVIADA: 'amber',
  APROBADA: 'green',
  RECHAZADA: 'red',
  CANCELADA: 'neutral',
};

export interface RenglonExtra {
  id: string;
  orden_cambio_id: string;
  concepto: string;
  unidad: string;
  cantidad: number;
  precio_unitario: number;
  orden: number;
}

/** Renglón tal como quedó en la foto al enviar. */
export interface RenglonSnapshot {
  concepto: string;
  unidad: string;
  cantidad: number;
  precio_unitario: number;
  importe: number;
}

export interface SnapshotExtra {
  folio: number;
  titulo: string;
  motivo: string;
  fecha: number | null;
  foto_uri: string | null;
  renglones: RenglonSnapshot[];
  total: number;
}

export interface OrdenCambio {
  id: string;
  empresa_id: string;
  obra_id: string;
  folio: number;
  titulo: string;
  motivo: string;
  fecha: number;
  estado: EstadoExtra;
  foto_uri: string | null;
  texto_final: string | null;
  snapshot_json: unknown;
  total_enviado: number | null;
  enviado_at: number | null;
  respondido_at: number | null;
  respondido_nombre: string | null;
  motivo_rechazo: string | null;
  cancelado_at: number | null;
  created_at: number;
  deleted_at: number | null;
}

export interface OrdenCambioConRenglones extends OrdenCambio {
  renglones: RenglonExtra[];
}

/** Redondeo a centavos, igual que `round(…, 2)` de la foto en la base. */
export function aCentavos(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

export function importeRenglon(r: Pick<RenglonExtra, 'cantidad' | 'precio_unitario'>): number {
  const c = Number(r.cantidad);
  const p = Number(r.precio_unitario);
  if (!Number.isFinite(c) || !Number.isFinite(p)) return 0;
  return aCentavos(c * p);
}

/** Total de los renglones vivos (solo tiene sentido en un borrador). */
export function totalRenglones(renglones: Pick<RenglonExtra, 'cantidad' | 'precio_unitario'>[]): number {
  return aCentavos(
    renglones.reduce((acc, r) => {
      const c = Number(r.cantidad);
      const p = Number(r.precio_unitario);
      return Number.isFinite(c) && Number.isFinite(p) ? acc + c * p : acc;
    }, 0),
  );
}

function num(v: unknown): number {
  const n = typeof v === 'number' ? v : Number(v);
  return Number.isFinite(n) ? n : 0;
}

function texto(v: unknown): string {
  return typeof v === 'string' ? v : '';
}

/**
 * Lee la foto guardada (jsonb). Tolera basura: devuelve `null` si no es un
 * objeto, y descarta renglones que no lo sean. Nunca lanza, porque se lee en el
 * portal del cliente y un dato raro no debe tumbar la página.
 */
export function leerSnapshot(crudo: unknown): SnapshotExtra | null {
  let o: unknown = crudo;
  if (typeof o === 'string') {
    try {
      o = JSON.parse(o);
    } catch {
      return null;
    }
  }
  if (!o || typeof o !== 'object' || Array.isArray(o)) return null;
  const s = o as Record<string, unknown>;
  const renglones = Array.isArray(s.renglones)
    ? s.renglones
        .filter((r): r is Record<string, unknown> => !!r && typeof r === 'object')
        .map((r) => ({
          concepto: texto(r.concepto),
          unidad: texto(r.unidad),
          cantidad: num(r.cantidad),
          precio_unitario: num(r.precio_unitario),
          importe: num(r.importe),
        }))
    : [];
  return {
    folio: num(s.folio),
    titulo: texto(s.titulo),
    motivo: texto(s.motivo),
    fecha: s.fecha === null || s.fecha === undefined ? null : num(s.fecha),
    foto_uri: typeof s.foto_uri === 'string' ? s.foto_uri : null,
    renglones,
    total: num(s.total),
  };
}

/**
 * El importe de un extra, venga de donde venga: la foto si ya se envió, los
 * renglones vivos si todavía es borrador (o si se canceló antes de enviarse).
 */
export function totalExtra(o: Pick<OrdenCambio, 'total_enviado'> & { renglones?: RenglonExtra[] }): number {
  if (o.total_enviado !== null && o.total_enviado !== undefined) return aCentavos(num(o.total_enviado));
  return totalRenglones(o.renglones ?? []);
}

/**
 * Lo que el cliente debe por extras: solo los APROBADOS, con el total de la foto.
 * Es lo que suma al estado de cuenta como línea aparte (RF1.4).
 */
export function totalExtrasAprobados(
  ordenes: Pick<OrdenCambio, 'estado' | 'total_enviado' | 'deleted_at'>[],
): number {
  return aCentavos(
    ordenes
      .filter((o) => o.estado === 'APROBADA' && !o.deleted_at)
      .reduce((acc, o) => acc + num(o.total_enviado), 0),
  );
}

/** "Extra 3" — como lo nombra la gente. */
export function nombreExtra(o: Pick<OrdenCambio, 'folio' | 'titulo'>): string {
  const t = o.titulo.trim();
  return t ? `Extra ${o.folio} · ${t}` : `Extra ${o.folio}`;
}

/** ¿Se puede editar? Solo el borrador (lo mismo que exige la base). */
export function esEditable(o: Pick<OrdenCambio, 'estado'>): boolean {
  return o.estado === 'BORRADOR';
}

/** Tope del motivo de rechazo: el mismo que valida la RPC. */
export const LARGO_MOTIVO_RECHAZO = 1000;
