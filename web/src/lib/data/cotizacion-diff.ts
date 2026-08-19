/// Comparación de una cotización contra la "foto" (snapshot) que el cliente
/// aprobó, para detectar y desglosar cambios posteriores (re-aprobación).
///
/// El snapshot se guarda en `cotizaciones.aprobado_snapshot_json` cuando el
/// cliente acepta (RPC `cliente_responder_cotizacion`) o el admin marca la
/// cotización como aceptada. El diff se calcula al vuelo comparando esa foto
/// contra el estado actual (secciones/partidas vivas). Ver migración 0011.

import { IVA_POR_DEFECTO } from './types';

export interface SnapshotPartida {
  id: string;
  descripcion: string;
  unidad: string | null;
  cantidad: number;
  precio_unitario: number;
  orden: number;
}

export interface SnapshotSeccion {
  id: string;
  nombre: string;
  orden: number;
  partidas: SnapshotPartida[];
}

export interface CotizacionSnapshot {
  descuento: number;
  iva_enabled: boolean;
  secciones: SnapshotSeccion[];
}

/// Forma estructural mínima que satisfacen tanto `CotizacionConDetalle` (admin)
/// como `CotizacionPortalConDetalle` (cliente): ambas exponen secciones→partidas
/// con estos campos.
export interface DetalleParaSnapshot {
  descuento: number;
  iva_enabled: boolean;
  /// Tasa CONGELADA de la cotización (migración 0017). Opcional porque las filas
  /// previas a 0017 no la traen; se cae a `IVA_POR_DEFECTO`, que es la que
  /// tenían quemada en el código.
  iva_porcentaje?: number | null;
  secciones: {
    id: string;
    nombre: string;
    orden: number;
    partidas: {
      id: string;
      descripcion: string;
      unidad: string | null;
      cantidad: number;
      precio_unitario: number;
      orden: number;
    }[];
  }[];
}

/// Construye la foto normalizada (ordenada) a partir del detalle actual.
export function buildSnapshot(detalle: DetalleParaSnapshot): CotizacionSnapshot {
  return {
    descuento: detalle.descuento ?? 0,
    iva_enabled: detalle.iva_enabled,
    secciones: [...detalle.secciones]
      .sort((a, b) => a.orden - b.orden)
      .map((s) => ({
        id: s.id,
        nombre: s.nombre,
        orden: s.orden,
        partidas: [...s.partidas]
          .sort((a, b) => a.orden - b.orden)
          .map((p) => ({
            id: p.id,
            descripcion: p.descripcion,
            unidad: p.unidad ?? null,
            cantidad: p.cantidad,
            precio_unitario: p.precio_unitario,
            orden: p.orden,
          })),
      })),
  };
}

export function parseSnapshot(json: string | null | undefined): CotizacionSnapshot | null {
  if (!json) return null;
  try {
    const raw = JSON.parse(json) as CotizacionSnapshot;
    if (!raw || !Array.isArray(raw.secciones)) return null;
    return raw;
  } catch {
    return null;
  }
}

/// Total de una foto, con la tasa de IVA de la cotización.
///
/// `ivaPorcentaje` viene de fuera y NO del snapshot a propósito: la tasa se
/// congela al crear la cotización (0017) y ya no cambia, así que las dos fotos
/// —la aprobada y la actual— se valoran con la misma. Antes esto multiplicaba
/// por un `1.16` quemado, y en una empresa con IVA al 8% (frontera) o sin IVA,
/// el cliente veía «Total antes / Total ahora» inflados justo al lado del botón
/// de aprobar. Se debe leer con `cotizaciones.ts:calcularTotales`, que es la
/// fórmula buena.
function totalDeSnapshot(snap: CotizacionSnapshot, ivaPorcentaje: number): number {
  const subtotal = snap.secciones.reduce(
    (acc, s) => acc + s.partidas.reduce((a, p) => a + p.cantidad * p.precio_unitario, 0),
    0,
  );
  const base = subtotal - subtotal * ((snap.descuento ?? 0) / 100);
  return snap.iva_enabled ? base * (1 + ivaPorcentaje / 100) : base;
}

export interface CampoCambio {
  antes: number;
  ahora: number;
}

export interface PartidaModificada {
  seccion: string;
  descripcion: string;
  descripcionAntes?: string;
  cantidad?: CampoCambio;
  precioUnitario?: CampoCambio;
}

export interface PartidaSimple {
  seccion: string;
  descripcion: string;
  cantidad: number;
  precioUnitario: number;
}

export interface CotizacionDiff {
  hayCambios: boolean;
  nuevas: PartidaSimple[];
  eliminadas: PartidaSimple[];
  modificadas: PartidaModificada[];
  /// Cambió el descuento o el IVA (afecta el total sin tocar partidas).
  cambioGlobal: boolean;
  totalAntes: number;
  totalAhora: number;
}

/// Compara la foto aprobada contra el detalle actual y desglosa las diferencias.
export function compararSnapshot(
  aprobado: CotizacionSnapshot,
  actual: DetalleParaSnapshot,
): CotizacionDiff {
  const actualSnap = buildSnapshot(actual);

  const aprobadasPorId = new Map<string, { p: SnapshotPartida; seccion: string }>();
  for (const s of aprobado.secciones) {
    for (const p of s.partidas) aprobadasPorId.set(p.id, { p, seccion: s.nombre });
  }
  const actualesPorId = new Map<string, { p: SnapshotPartida; seccion: string }>();
  for (const s of actualSnap.secciones) {
    for (const p of s.partidas) actualesPorId.set(p.id, { p, seccion: s.nombre });
  }

  const nuevas: PartidaSimple[] = [];
  const modificadas: PartidaModificada[] = [];
  for (const [id, { p, seccion }] of actualesPorId) {
    const prev = aprobadasPorId.get(id);
    if (!prev) {
      nuevas.push({ seccion, descripcion: p.descripcion, cantidad: p.cantidad, precioUnitario: p.precio_unitario });
      continue;
    }
    const cambio: PartidaModificada = { seccion, descripcion: p.descripcion };
    let hubo = false;
    if (prev.p.cantidad !== p.cantidad) {
      cambio.cantidad = { antes: prev.p.cantidad, ahora: p.cantidad };
      hubo = true;
    }
    if (prev.p.precio_unitario !== p.precio_unitario) {
      cambio.precioUnitario = { antes: prev.p.precio_unitario, ahora: p.precio_unitario };
      hubo = true;
    }
    if (prev.p.descripcion !== p.descripcion) {
      cambio.descripcionAntes = prev.p.descripcion;
      hubo = true;
    }
    if (hubo) modificadas.push(cambio);
  }

  const eliminadas: PartidaSimple[] = [];
  for (const [id, { p, seccion }] of aprobadasPorId) {
    if (!actualesPorId.has(id)) {
      eliminadas.push({ seccion, descripcion: p.descripcion, cantidad: p.cantidad, precioUnitario: p.precio_unitario });
    }
  }

  const cambioGlobal =
    aprobado.descuento !== actualSnap.descuento || aprobado.iva_enabled !== actualSnap.iva_enabled;

  const ivaPct = actual.iva_porcentaje ?? IVA_POR_DEFECTO;
  const totalAntes = totalDeSnapshot(aprobado, ivaPct);
  const totalAhora = totalDeSnapshot(actualSnap, ivaPct);

  const hayCambios =
    nuevas.length > 0 ||
    eliminadas.length > 0 ||
    modificadas.length > 0 ||
    cambioGlobal ||
    Math.abs(totalAntes - totalAhora) > 0.005;

  return { hayCambios, nuevas, eliminadas, modificadas, cambioGlobal, totalAntes, totalAhora };
}

/// Atajo booleano: ¿hay cambios desde la foto aprobada? (para el indicador admin).
export function hayCambiosSinAprobar(
  snapshotJson: string | null | undefined,
  actual: DetalleParaSnapshot,
): boolean {
  const snap = parseSnapshot(snapshotJson);
  if (!snap) return false;
  return compararSnapshot(snap, actual).hayCambios;
}
