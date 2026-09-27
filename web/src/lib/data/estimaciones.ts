import { createClient } from '@/lib/supabase/server';
import { getEmpresaUsuario } from './empresa';
import {
  capturasDeFilas,
  conceptosDeContrato,
  type FilaAvance,
  type FilaPresupuesto,
  type FilaRenglonExtra,
} from '@/lib/estimaciones/conceptos';
import { avanceFisico, ejecutadoPorConcepto, type AvanceFisico } from '@/lib/estimaciones/avance';
import {
  acumulados,
  calcularImportes,
  estimadoPorConcepto,
  proponerCantidades,
  type Acumulados,
  type EstimacionResumen,
} from '@/lib/estimaciones/calculo';
import { cantidad4, precio4 } from '@/lib/estimaciones/dinero';
import { leerFoto, leerRetenciones, type FotoEstimacion } from '@/lib/estimaciones/snapshot';
import {
  CONTRATO_VACIO,
  claveDe,
  type CapturaAvance,
  type ConceptoContrato,
  type ContratoObra,
  type EstadoEstimacion,
  type Estimacion,
  type EstimacionConRenglones,
  type RenglonEstimacion,
  type RetencionObra,
  type TipoRetencion,
} from '@/lib/estimaciones/tipos';

/**
 * Acceso al AVANCE y las ESTIMACIONES (migración 0039). Las cuentas viven en
 * `lib/estimaciones/`; aquí solo se lee, se llama al cálculo y se escribe.
 *
 * Quién puede qué lo deciden la RLS, los triggers y las RPC de 0039: el
 * supervisor captura avance; solo el admin crea, edita y envía estimaciones;
 * el cliente responde por RPC; admin y contador marcan cobrada. Si alguien sin
 * permiso llega aquí, la base lo rechaza y el mensaje sube tal cual.
 */

export interface Resultado {
  ok: boolean;
  error?: string;
}

function deRpc(data: unknown, error: { message: string } | null, porDefecto: string): Resultado {
  if (error) return { ok: false, error: porDefecto };
  const r = data as { ok?: boolean; error?: string } | null;
  if (!r?.ok) return { ok: false, error: r?.error ?? porDefecto };
  return { ok: true };
}

const n = (x: unknown) => {
  const v = typeof x === 'number' ? x : Number(x);
  return Number.isFinite(v) ? v : 0;
};

async function empresaId(): Promise<string | null> {
  try {
    return (await getEmpresaUsuario()).empresaId;
  } catch {
    return null;
  }
}

// ── Partidas del contrato y avance ───────────────────────────────────────────

/** Presupuesto de la obra + renglones de extras APROBADOS, listos para avanzar/estimar. */
export async function listConceptosObra(
  obraId: string,
): Promise<{ data: ConceptoContrato[]; error: string | null }> {
  const supabase = await createClient();
  const { data: pres, error } = await supabase
    .from('obra_presupuesto')
    .select('id, concepto, unidad, seccion, cantidad, precio_unitario, orden')
    .eq('obra_id', obraId)
    .is('deleted_at', null)
    .order('orden', { ascending: true });
  if (error) return { data: [], error: error.message };

  // Extras aprobados. Si falla (0036 sin aplicar), se sigue solo con el presupuesto.
  let extras: FilaRenglonExtra[] = [];
  const { data: ordenes } = await supabase
    .from('orden_cambio')
    .select('id, folio')
    .eq('obra_id', obraId)
    .eq('estado', 'APROBADA')
    .is('deleted_at', null);
  if (ordenes && ordenes.length > 0) {
    const folios = new Map(ordenes.map((o) => [o.id as string, o.folio as number]));
    const { data: renglones } = await supabase
      .from('orden_cambio_renglon')
      .select('id, orden_cambio_id, concepto, unidad, cantidad, precio_unitario, orden')
      .in('orden_cambio_id', [...folios.keys()])
      .is('deleted_at', null);
    extras = ((renglones ?? []) as (FilaRenglonExtra & { orden_cambio_id: string })[]).map((r) => ({
      ...r,
      extra_folio: folios.get(r.orden_cambio_id) ?? null,
    }));
  }
  return { data: conceptosDeContrato((pres ?? []) as FilaPresupuesto[], extras), error: null };
}

const COLS_AVANCE = 'id, presupuesto_id, orden_cambio_renglon_id, fecha, cantidad, nota, capturo_id, capturo_nombre';

export async function listCapturasAvance(
  obraId: string,
): Promise<{ data: CapturaAvance[]; error: string | null }> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('avance_partida')
    .select(COLS_AVANCE)
    .eq('obra_id', obraId)
    .is('deleted_at', null)
    .order('fecha', { ascending: false })
    .order('created_at', { ascending: false })
    .limit(5000);
  if (error) return { data: [], error: error.message };
  return { data: capturasDeFilas((data ?? []) as FilaAvance[]), error: null };
}

export interface CapturaInput {
  obraId: string;
  origen: 'presupuesto' | 'extra';
  conceptoId: string;
  fecha: number;
  cantidad: number;
  nota: string;
}

export async function registrarAvance(input: CapturaInput): Promise<Resultado & { id?: string }> {
  const emp = await empresaId();
  if (!emp) return { ok: false, error: 'No hay sesión activa.' };
  const supabase = await createClient();
  const id = crypto.randomUUID();
  const ahora = Date.now();
  const { error } = await supabase.from('avance_partida').insert({
    id,
    empresa_id: emp,
    obra_id: input.obraId,
    presupuesto_id: input.origen === 'presupuesto' ? input.conceptoId : null,
    orden_cambio_renglon_id: input.origen === 'extra' ? input.conceptoId : null,
    fecha: input.fecha,
    cantidad: cantidad4(input.cantidad),
    nota: input.nota,
    created_at: ahora,
    updated_at: ahora,
  });
  if (error) {
    if (/abajo de cero/.test(error.message)) {
      return { ok: false, error: 'Con esa corrección el avance quedaría abajo de cero.' };
    }
    if (/row-level security/.test(error.message)) {
      return { ok: false, error: 'No tienes permiso para capturar avance en esta partida.' };
    }
    return { ok: false, error: error.message };
  }
  return { ok: true, id };
}

/** Borrado lógico de una captura (el supervisor, solo lo suyo: lo decide la RLS). */
export async function eliminarCaptura(obraId: string, id: string): Promise<Resultado> {
  const supabase = await createClient();
  const ahora = Date.now();
  const { data, error } = await supabase
    .from('avance_partida')
    .update({ deleted_at: ahora, updated_at: ahora })
    .eq('id', id)
    .eq('obra_id', obraId)
    .select('id');
  if (error) {
    if (/abajo de cero/.test(error.message)) {
      return { ok: false, error: 'Sin esa captura el avance quedaría abajo de cero: borra primero la corrección.' };
    }
    return { ok: false, error: error.message };
  }
  if (!data || data.length === 0) return { ok: false, error: 'Solo puedes borrar lo que tú capturaste.' };
  return { ok: true };
}

/**
 * Avance físico de una obra. Nunca lanza: si 0039 no está aplicada o falla la
 * lectura, `null` (y quien lo use cae a su fuente anterior).
 */
export async function getAvanceFisicoObra(obraId: string): Promise<AvanceFisico | null> {
  const [conceptos, capturas] = await Promise.all([listConceptosObra(obraId), listCapturasAvance(obraId)]);
  if (conceptos.error || capturas.error) return null;
  return avanceFisico(conceptos.data, ejecutadoPorConcepto(capturas.data));
}

/**
 * % físico de VARIAS obras de la empresa (para la utilidad y el comparativo).
 * Solo las obras con capturas llevan valor. Nunca lanza.
 */
export async function avanceFisicoPorObra(empresa: string, obraId?: string): Promise<Map<string, number>> {
  const out = new Map<string, number>();
  try {
    const supabase = await createClient();
    const filtro: Record<string, string> = obraId ? { obra_id: obraId } : {};
    const { data: avances, error } = await supabase
      .from('avance_partida')
      .select('obra_id, presupuesto_id, orden_cambio_renglon_id, fecha, cantidad, id')
      .eq('empresa_id', empresa)
      .is('deleted_at', null)
      .match(filtro)
      .limit(20_000);
    if (error || !avances || avances.length === 0) return out;
    const obras = [...new Set(avances.map((a) => a.obra_id as string))];
    for (const o of obras) {
      const { data: conceptos, error: e } = await listConceptosObra(o);
      if (e) continue;
      const capturas = capturasDeFilas(avances.filter((a) => a.obra_id === o) as FilaAvance[]);
      const r = avanceFisico(conceptos, ejecutadoPorConcepto(capturas));
      if (r.hayCapturas && r.pct !== null) out.set(o, r.pct);
    }
  } catch {
    // Sin avance: cada quien usa su fuente anterior.
  }
  return out;
}

// ── Contrato y retenciones ───────────────────────────────────────────────────

export interface ContratoCompleto {
  contrato: ContratoObra;
  /** ¿Ya hay fila guardada? */
  existe: boolean;
  retenciones: (RetencionObra & { id: string })[];
}

export async function getContratoObra(obraId: string): Promise<{ data: ContratoCompleto; error: string | null }> {
  const supabase = await createClient();
  const [{ data: c, error }, { data: rets, error: errR }] = await Promise.all([
    supabase
      .from('obra_contrato')
      .select('anticipo_monto, anticipo_movimiento_id, amortizacion_pct, fondo_garantia_pct, iva_pct, notas')
      .eq('obra_id', obraId)
      .is('deleted_at', null)
      .maybeSingle(),
    supabase
      .from('obra_retencion')
      .select('id, concepto, tipo, valor, orden')
      .eq('obra_id', obraId)
      .is('deleted_at', null)
      .order('orden'),
  ]);
  const vacio = { contrato: CONTRATO_VACIO, existe: false, retenciones: [] };
  if (error || errR) return { data: vacio, error: (error ?? errR)!.message };
  return {
    data: {
      existe: !!c,
      contrato: c
        ? {
            anticipo: n(c.anticipo_monto),
            anticipoMovimientoId: (c.anticipo_movimiento_id as string | null) ?? null,
            amortizacionPct: n(c.amortizacion_pct),
            fondoGarantiaPct: n(c.fondo_garantia_pct),
            ivaPct: n(c.iva_pct),
            notas: (c.notas as string) ?? '',
          }
        : CONTRATO_VACIO,
      retenciones: (rets ?? []).map((r) => ({
        id: r.id as string,
        concepto: r.concepto as string,
        tipo: r.tipo as TipoRetencion,
        valor: n(r.valor),
      })),
    },
    error: null,
  };
}

/** Guarda la fila COMPLETA del contrato (nunca upsert parcial: RT7). */
export async function guardarContratoObra(obraId: string, c: ContratoObra): Promise<Resultado> {
  const emp = await empresaId();
  if (!emp) return { ok: false, error: 'No hay sesión activa.' };
  const supabase = await createClient();
  const ahora = Date.now();
  const { error } = await supabase.from('obra_contrato').upsert(
    {
      obra_id: obraId,
      empresa_id: emp,
      anticipo_monto: Math.round(c.anticipo * 100) / 100,
      anticipo_movimiento_id: c.anticipoMovimientoId,
      amortizacion_pct: c.amortizacionPct,
      fondo_garantia_pct: c.fondoGarantiaPct,
      iva_pct: c.ivaPct,
      notas: c.notas,
      updated_at: ahora,
      deleted_at: null,
    },
    { onConflict: 'obra_id' },
  );
  if (error) {
    if (/row-level security/.test(error.message)) {
      return { ok: false, error: 'Solo el administrador cambia el contrato (y el anticipo tiene que ser una entrada de esta obra).' };
    }
    return { ok: false, error: error.message };
  }
  return { ok: true };
}

export async function crearRetencion(obraId: string, r: RetencionObra, orden: number): Promise<Resultado> {
  const emp = await empresaId();
  if (!emp) return { ok: false, error: 'No hay sesión activa.' };
  const supabase = await createClient();
  const ahora = Date.now();
  const { error } = await supabase.from('obra_retencion').insert({
    id: crypto.randomUUID(),
    empresa_id: emp,
    obra_id: obraId,
    concepto: r.concepto,
    tipo: r.tipo,
    valor: r.valor,
    orden,
    created_at: ahora,
    updated_at: ahora,
  });
  return error ? { ok: false, error: error.message } : { ok: true };
}

export async function eliminarRetencion(obraId: string, id: string): Promise<Resultado> {
  const supabase = await createClient();
  const ahora = Date.now();
  const { data, error } = await supabase
    .from('obra_retencion')
    .update({ deleted_at: ahora, updated_at: ahora })
    .eq('id', id)
    .eq('obra_id', obraId)
    .select('id');
  if (error) return { ok: false, error: error.message };
  if (!data || data.length === 0) return { ok: false, error: 'Solo el administrador quita retenciones.' };
  return { ok: true };
}

// ── Estimaciones: lectura ────────────────────────────────────────────────────

const COLS_EST =
  'id, empresa_id, obra_id, folio, periodo_inicio, periodo_fin, estado, es_finiquito, notas, texto_final, importe_bruto, amortizacion, subtotal, iva_pct, iva, total, fondo_garantia_pct, fondo_garantia, retenciones, retenciones_total, neto, snapshot_json, enviado_at, respondido_at, respondido_nombre, respuesta_origen, motivo_rechazo, cobrado_at, movimiento_id, created_at';
const COLS_RENGLON =
  'id, estimacion_id, presupuesto_id, orden_cambio_renglon_id, concepto, unidad, seccion, cantidad, precio_unitario, importe, orden';

function aEstimacion(f: Record<string, unknown>): Estimacion {
  return {
    id: f.id as string,
    empresa_id: f.empresa_id as string,
    obra_id: f.obra_id as string,
    folio: n(f.folio),
    periodo_inicio: n(f.periodo_inicio),
    periodo_fin: n(f.periodo_fin),
    estado: f.estado as EstadoEstimacion,
    es_finiquito: f.es_finiquito === true,
    notas: (f.notas as string) ?? '',
    texto_final: (f.texto_final as string | null) ?? null,
    importe_bruto: n(f.importe_bruto),
    amortizacion: n(f.amortizacion),
    subtotal: n(f.subtotal),
    iva_pct: n(f.iva_pct),
    iva: n(f.iva),
    total: n(f.total),
    fondo_garantia_pct: n(f.fondo_garantia_pct),
    fondo_garantia: n(f.fondo_garantia),
    retenciones: leerRetenciones(f.retenciones),
    retenciones_total: n(f.retenciones_total),
    neto: n(f.neto),
    snapshot_json: f.snapshot_json ?? null,
    enviado_at: f.enviado_at == null ? null : n(f.enviado_at),
    respondido_at: f.respondido_at == null ? null : n(f.respondido_at),
    respondido_nombre: (f.respondido_nombre as string | null) ?? null,
    respuesta_origen: (f.respuesta_origen as 'PORTAL' | 'OFICINA' | null) ?? null,
    motivo_rechazo: (f.motivo_rechazo as string | null) ?? null,
    cobrado_at: f.cobrado_at == null ? null : n(f.cobrado_at),
    movimiento_id: (f.movimiento_id as string | null) ?? null,
    created_at: n(f.created_at),
  };
}

function aRenglon(f: Record<string, unknown>): RenglonEstimacion {
  return {
    id: f.id as string,
    estimacion_id: f.estimacion_id as string,
    presupuesto_id: (f.presupuesto_id as string | null) ?? null,
    orden_cambio_renglon_id: (f.orden_cambio_renglon_id as string | null) ?? null,
    concepto: (f.concepto as string) ?? '',
    unidad: (f.unidad as string) ?? '',
    seccion: (f.seccion as string | null) ?? null,
    cantidad: n(f.cantidad),
    precio_unitario: n(f.precio_unitario),
    importe: n(f.importe),
    orden: n(f.orden),
  };
}

export async function listEstimacionesObra(
  obraId: string,
): Promise<{ data: EstimacionConRenglones[]; error: string | null }> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('estimaciones')
    .select(COLS_EST)
    .eq('obra_id', obraId)
    .is('deleted_at', null)
    .order('folio', { ascending: false });
  if (error) return { data: [], error: error.message };
  const ests = (data ?? []).map((f) => aEstimacion(f as Record<string, unknown>));
  if (ests.length === 0) return { data: [], error: null };
  const { data: rs, error: errR } = await supabase
    .from('estimacion_renglon')
    .select(COLS_RENGLON)
    .in(
      'estimacion_id',
      ests.map((e) => e.id),
    )
    .is('deleted_at', null)
    .order('orden');
  if (errR) return { data: [], error: errR.message };
  const por = new Map<string, RenglonEstimacion[]>();
  for (const f of rs ?? []) {
    const r = aRenglon(f as Record<string, unknown>);
    const l = por.get(r.estimacion_id);
    if (l) l.push(r);
    else por.set(r.estimacion_id, [r]);
  }
  return { data: ests.map((e) => ({ ...e, renglones: por.get(e.id) ?? [] })), error: null };
}

export async function getEstimacion(
  id: string,
): Promise<{ data: EstimacionConRenglones | null; error: string | null }> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('estimaciones')
    .select(COLS_EST)
    .eq('id', id)
    .is('deleted_at', null)
    .maybeSingle();
  if (error) return { data: null, error: error.message };
  if (!data) return { data: null, error: null };
  const { data: rs, error: errR } = await supabase
    .from('estimacion_renglon')
    .select(COLS_RENGLON)
    .eq('estimacion_id', id)
    .is('deleted_at', null)
    .order('orden');
  if (errR) return { data: null, error: errR.message };
  return {
    data: {
      ...aEstimacion(data as Record<string, unknown>),
      renglones: (rs ?? []).map((f) => aRenglon(f as Record<string, unknown>)),
    },
    error: null,
  };
}

export function resumenDe(e: EstimacionConRenglones): EstimacionResumen {
  return {
    id: e.id,
    estado: e.estado,
    importe_bruto: e.importe_bruto,
    amortizacion: e.amortizacion,
    fondo_garantia: e.fondo_garantia,
    neto: e.neto,
    renglones: e.renglones.map((r) => ({ clave: claveDe(r), cantidad: r.cantidad })),
  };
}

/** Acumulados de la obra (lo estimado, amortizado, retenido y por cobrar). */
export function acumuladosDe(
  estimaciones: EstimacionConRenglones[],
  anticipo: number,
  excepto?: string,
): Acumulados {
  return acumulados(estimaciones.map(resumenDe), anticipo, excepto);
}

// ── Estimaciones: escritura (solo admin, lo exige la RLS) ────────────────────

/**
 * Vuelve a calcular un BORRADOR: refresca el texto y el PRECIO de cada renglón
 * desde el contrato de hoy, y guarda las cuentas con los acumulados de las
 * demás. Es lo que se llama después de cualquier cambio del borrador.
 */
export async function recalcularEstimacion(id: string): Promise<Resultado> {
  const { data: est, error } = await getEstimacion(id);
  if (error) return { ok: false, error };
  if (!est) return { ok: false, error: 'Estimación no encontrada.' };
  if (est.estado !== 'BORRADOR') return { ok: false, error: 'Solo se recalculan los borradores.' };

  const [conceptos, contrato, todas] = await Promise.all([
    listConceptosObra(est.obra_id),
    getContratoObra(est.obra_id),
    listEstimacionesObra(est.obra_id),
  ]);
  if (conceptos.error) return { ok: false, error: conceptos.error };
  if (contrato.error) return { ok: false, error: contrato.error };
  if (todas.error) return { ok: false, error: todas.error };

  const supabase = await createClient();
  const porClave = new Map(conceptos.data.map((c) => [c.clave, c]));
  const ahora = Date.now();
  for (const r of est.renglones) {
    const c = porClave.get(claveDe(r) ?? '');
    if (!c) continue; // la validación antes de enviar lo avisa
    const pu = precio4(c.precioUnitario);
    if (pu !== r.precio_unitario || c.concepto !== r.concepto || c.unidad !== r.unidad || c.seccion !== r.seccion) {
      const { error: e } = await supabase
        .from('estimacion_renglon')
        .update({ precio_unitario: pu, concepto: c.concepto, unidad: c.unidad, seccion: c.seccion, updated_at: ahora })
        .eq('id', r.id)
        .eq('estimacion_id', id);
      if (e) return { ok: false, error: e.message };
      r.precio_unitario = pu;
    }
  }

  const ac = acumuladosDe(todas.data, contrato.data.contrato.anticipo, id);
  const imp = calcularImportes({
    renglones: est.renglones.map((r) => ({ cantidad: r.cantidad, precioUnitario: r.precio_unitario })),
    contrato: contrato.data.contrato,
    retenciones: contrato.data.retenciones,
    amortizadoPrevio: ac.amortizado,
    esFiniquito: est.es_finiquito,
  });

  const { data: upd, error: errU } = await supabase
    .from('estimaciones')
    .update({
      importe_bruto: imp.importeBruto,
      amortizacion: imp.amortizacion,
      subtotal: imp.subtotal,
      iva_pct: imp.ivaPct,
      iva: imp.iva,
      total: imp.total,
      fondo_garantia_pct: imp.fondoGarantiaPct,
      fondo_garantia: imp.fondoGarantia,
      retenciones: imp.retenciones,
      retenciones_total: imp.retencionesTotal,
      neto: imp.neto,
      updated_at: ahora,
    })
    .eq('id', id)
    .select('id');
  if (errU) return { ok: false, error: errU.message };
  if (!upd || upd.length === 0) return { ok: false, error: 'Solo el administrador edita estimaciones en borrador.' };
  return { ok: true };
}

export interface NuevaEstimacionInput {
  periodoInicio: number;
  periodoFin: number;
  esFiniquito: boolean;
  notas: string;
}

/**
 * Crea un BORRADOR con lo hecho (hasta el fin del periodo) que no se ha
 * estimado, a precios del contrato. Devuelve también lo hecho DE MÁS, para
 * avisar que eso se cobra con un extra.
 */
export async function crearEstimacion(
  obraId: string,
  input: NuevaEstimacionInput,
): Promise<{ id: string | null; error: string | null; excedentes: string[] }> {
  const emp = await empresaId();
  if (!emp) return { id: null, error: 'No hay sesión activa.', excedentes: [] };

  const [conceptos, capturas, todas] = await Promise.all([
    listConceptosObra(obraId),
    listCapturasAvance(obraId),
    listEstimacionesObra(obraId),
  ]);
  const err = conceptos.error ?? capturas.error ?? todas.error;
  if (err) return { id: null, error: err, excedentes: [] };

  const propuesta = proponerCantidades(
    conceptos.data,
    ejecutadoPorConcepto(capturas.data, input.periodoFin),
    estimadoPorConcepto(todas.data.map(resumenDe)),
  );

  const supabase = await createClient();
  const id = crypto.randomUUID();
  const ahora = Date.now();
  const { error } = await supabase.from('estimaciones').insert({
    id,
    empresa_id: emp,
    obra_id: obraId,
    periodo_inicio: input.periodoInicio,
    periodo_fin: input.periodoFin,
    es_finiquito: input.esFiniquito,
    notas: input.notas,
    created_at: ahora,
    updated_at: ahora,
  });
  if (error) {
    if (/uq_estimacion_borrador/.test(error.message)) {
      return { id: null, error: 'Ya hay una estimación en borrador en esta obra: termínala o bórrala primero.', excedentes: [] };
    }
    if (/row-level security/.test(error.message)) {
      return { id: null, error: 'Solo el administrador crea estimaciones.', excedentes: [] };
    }
    return { id: null, error: error.message, excedentes: [] };
  }

  const filas = propuesta
    .filter((p) => p.cantidad > 0)
    .map((p, i) => ({
      id: crypto.randomUUID(),
      empresa_id: emp,
      estimacion_id: id,
      presupuesto_id: p.concepto.origen === 'presupuesto' ? p.concepto.id : null,
      orden_cambio_renglon_id: p.concepto.origen === 'extra' ? p.concepto.id : null,
      concepto: p.concepto.concepto,
      unidad: p.concepto.unidad,
      seccion: p.concepto.seccion,
      cantidad: p.cantidad,
      precio_unitario: precio4(p.concepto.precioUnitario),
      orden: (i + 1) * 100,
      created_at: ahora,
      updated_at: ahora,
    }));
  if (filas.length > 0) {
    const { error: errR } = await supabase.from('estimacion_renglon').insert(filas);
    if (errR) return { id, error: errR.message, excedentes: [] };
  }
  const r = await recalcularEstimacion(id);
  return {
    id,
    error: r.ok ? null : (r.error ?? null),
    excedentes: propuesta
      .filter((p) => p.excedente > 0)
      .map((p) => `${p.concepto.concepto}: ${p.excedente.toLocaleString('es-MX')} ${p.concepto.unidad} de más`),
  };
}

export async function actualizarDatosEstimacion(
  id: string,
  input: NuevaEstimacionInput,
): Promise<Resultado> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('estimaciones')
    .update({
      periodo_inicio: input.periodoInicio,
      periodo_fin: input.periodoFin,
      es_finiquito: input.esFiniquito,
      notas: input.notas,
      updated_at: Date.now(),
    })
    .eq('id', id)
    .select('id');
  if (error) return { ok: false, error: error.message };
  if (!data || data.length === 0) return { ok: false, error: 'Solo se editan los borradores.' };
  return recalcularEstimacion(id);
}

/** Cantidad de un renglón (o lo quita si es 0). */
export async function fijarCantidadRenglon(estId: string, renglonId: string, cantidad: number): Promise<Resultado> {
  const supabase = await createClient();
  const ahora = Date.now();
  const cambios =
    cantidad > 0
      ? { cantidad: cantidad4(cantidad), updated_at: ahora }
      : { deleted_at: ahora, updated_at: ahora };
  const { error } = await supabase
    .from('estimacion_renglon')
    .update(cambios)
    .eq('id', renglonId)
    .eq('estimacion_id', estId);
  if (error) return { ok: false, error: error.message };
  return recalcularEstimacion(estId);
}

/** Agrega una partida del contrato al borrador. */
export async function agregarRenglon(
  estId: string,
  concepto: ConceptoContrato,
  cantidad: number,
  orden: number,
): Promise<Resultado> {
  const emp = await empresaId();
  if (!emp) return { ok: false, error: 'No hay sesión activa.' };
  const supabase = await createClient();
  const ahora = Date.now();
  const { error } = await supabase.from('estimacion_renglon').insert({
    id: crypto.randomUUID(),
    empresa_id: emp,
    estimacion_id: estId,
    presupuesto_id: concepto.origen === 'presupuesto' ? concepto.id : null,
    orden_cambio_renglon_id: concepto.origen === 'extra' ? concepto.id : null,
    concepto: concepto.concepto,
    unidad: concepto.unidad,
    seccion: concepto.seccion,
    cantidad: cantidad4(cantidad),
    precio_unitario: precio4(concepto.precioUnitario),
    orden,
    created_at: ahora,
    updated_at: ahora,
  });
  if (error) {
    if (/uq_estimacion_renglon/.test(error.message)) return { ok: false, error: 'Esa partida ya está en la estimación.' };
    return { ok: false, error: error.message };
  }
  return recalcularEstimacion(estId);
}

/** Borrado lógico de un BORRADOR (lo enviado no se borra). */
export async function eliminarEstimacion(id: string): Promise<Resultado> {
  const supabase = await createClient();
  const ahora = Date.now();
  const { data, error } = await supabase
    .from('estimaciones')
    .update({ deleted_at: ahora, updated_at: ahora })
    .eq('id', id)
    .select('id');
  if (error) return { ok: false, error: error.message };
  if (!data || data.length === 0) return { ok: false, error: 'Solo se borran los borradores.' };
  return { ok: true };
}

export async function enviarEstimacion(id: string): Promise<Resultado> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc('enviar_estimacion', { p_id: id });
  return deRpc(data, error, 'No se pudo enviar la estimación. Intenta de nuevo.');
}

export async function registrarRespuestaEstimacion(
  id: string,
  autorizar: boolean,
  quien: string,
  motivo: string | null,
): Promise<Resultado> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc('registrar_respuesta_estimacion', {
    p_id: id,
    p_autorizar: autorizar,
    p_quien: quien,
    p_motivo: motivo,
  });
  return deRpc(data, error, 'No se pudo registrar la respuesta. Intenta de nuevo.');
}

export async function marcarEstimacionCobrada(id: string, movimientoId: string | null): Promise<Resultado> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc('marcar_estimacion_cobrada', {
    p_id: id,
    p_movimiento_id: movimientoId,
  });
  return deRpc(data, error, 'No se pudo marcar como cobrada. Intenta de nuevo.');
}

/** Entradas de caja de la obra (para ligar el anticipo o el cobro). */
export async function listEntradasObra(
  obraId: string,
): Promise<{ id: string; fecha: number; monto: number; concepto: string }[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from('movimientos')
    .select('id, fecha, monto, concepto, categoria')
    .eq('obra_id', obraId)
    .eq('tipo', 'ENTRADA')
    .is('deleted_at', null)
    .order('fecha', { ascending: false })
    .limit(300);
  return (data ?? []).map((m) => ({
    id: m.id as string,
    fecha: n(m.fecha),
    monto: n(m.monto),
    concepto: ((m.concepto as string) || (m.categoria as string) || 'Entrada').trim(),
  }));
}

// ── Estado de cuenta ─────────────────────────────────────────────────────────

/** Lo que el estado de cuenta necesita de las estimaciones. [] si no se puede leer. */
export async function listEstimacionesParaEstadoCuenta(
  obraId: string,
): Promise<{ estado: EstadoEstimacion; neto: number; fondo_garantia: number }[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('estimaciones')
    .select('estado, neto, fondo_garantia')
    .eq('obra_id', obraId)
    .in('estado', ['ENVIADA', 'AUTORIZADA', 'COBRADA'])
    .is('deleted_at', null);
  if (error || !data) return [];
  return data.map((e) => ({
    estado: e.estado as EstadoEstimacion,
    neto: n(e.neto),
    fondo_garantia: n(e.fondo_garantia),
  }));
}

// ── Portal del cliente ───────────────────────────────────────────────────────

export interface EstimacionPortal {
  id: string;
  folio: number;
  estado: Exclude<EstadoEstimacion, 'BORRADOR'>;
  enviadoEl: number | null;
  respondidoEl: number | null;
  respondidoPor: string | null;
  respuestaOrigen: 'PORTAL' | 'OFICINA' | null;
  motivoRechazo: string | null;
  cobradoEl: number | null;
  foto: FotoEstimacion;
}

/**
 * Estimaciones VISTAS POR EL CLIENTE. La RLS ya deja pasar solo las suyas y
 * solo enviadas; todo sale de la FOTO (lo que se le mandó).
 */
export async function listEstimacionesCliente(obraId: string): Promise<EstimacionPortal[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('estimaciones')
    .select('id, folio, estado, snapshot_json, enviado_at, respondido_at, respondido_nombre, respuesta_origen, motivo_rechazo, cobrado_at')
    .eq('obra_id', obraId)
    .in('estado', ['ENVIADA', 'AUTORIZADA', 'RECHAZADA', 'COBRADA'])
    .is('deleted_at', null)
    .order('folio', { ascending: false });
  if (error || !data) return [];
  const out: EstimacionPortal[] = [];
  for (const e of data) {
    const foto = leerFoto(e.snapshot_json);
    if (!foto) continue;
    out.push({
      id: e.id as string,
      folio: n(e.folio),
      estado: e.estado as EstimacionPortal['estado'],
      enviadoEl: e.enviado_at == null ? null : n(e.enviado_at),
      respondidoEl: e.respondido_at == null ? null : n(e.respondido_at),
      respondidoPor: (e.respondido_nombre as string | null) ?? null,
      respuestaOrigen: (e.respuesta_origen as 'PORTAL' | 'OFICINA' | null) ?? null,
      motivoRechazo: (e.motivo_rechazo as string | null) ?? null,
      cobradoEl: e.cobrado_at == null ? null : n(e.cobrado_at),
      foto,
    });
  }
  return out;
}

export async function responderEstimacion(
  id: string,
  autorizar: boolean,
  motivo: string | null,
): Promise<Resultado> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc('responder_estimacion', {
    p_id: id,
    p_autorizar: autorizar,
    p_motivo: motivo,
  });
  return deRpc(data, error, 'Ocurrió un error al registrar tu respuesta. Intenta de nuevo.');
}

/**
 * Avance físico de la obra para el portal (RPC `avance_obra_portal`: el
 * cliente no lee las capturas). Mismo cálculo que la oficina. null si no hay
 * capturas o si 0039 no está aplicada.
 */
export async function getAvanceFisicoPortal(obraId: string): Promise<AvanceFisico | null> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc('avance_obra_portal', { p_obra_id: obraId });
  if (error) return null;
  const r = data as { ok?: boolean; partidas?: Record<string, unknown>[] } | null;
  if (!r?.ok || !Array.isArray(r.partidas)) return null;
  const pres: FilaPresupuesto[] = [];
  const extras: FilaRenglonExtra[] = [];
  const capturas: CapturaAvance[] = [];
  for (const p of r.partidas) {
    const fila = {
      id: p.id as string,
      concepto: (p.concepto as string) ?? '',
      unidad: (p.unidad as string) ?? '',
      seccion: (p.seccion as string | null) ?? null,
      cantidad: n(p.cantidad),
      precio_unitario: n(p.precio_unitario),
      orden: n(p.orden),
    };
    const ej = n(p.ejecutado);
    if (p.origen === 'extra') extras.push({ ...fila, extra_folio: null });
    else pres.push(fila);
    if (ej !== 0) {
      capturas.push({
        id: fila.id,
        clave: `${p.origen === 'extra' ? 'x' : 'p'}:${fila.id}`,
        fecha: 0,
        cantidad: ej,
        nota: '',
        capturoId: null,
        capturoNombre: '',
      });
    }
  }
  const a = avanceFisico(conceptosDeContrato(pres, extras), ejecutadoPorConcepto(capturas));
  return a.hayCapturas ? a : null;
}
