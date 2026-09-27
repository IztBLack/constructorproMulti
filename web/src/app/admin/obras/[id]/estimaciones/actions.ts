'use server';

import { revalidatePath } from 'next/cache';
import { moduloActivo } from '@/lib/data/modulos';
import {
  actualizarDatosEstimacion,
  agregarRenglon,
  crearEstimacion,
  crearRetencion,
  eliminarEstimacion,
  eliminarRetencion,
  enviarEstimacion,
  fijarCantidadRenglon,
  getContratoObra,
  getEstimacion,
  getVistaEstimacion,
  guardarContratoObra,
  listConceptosObra,
  marcarEstimacionCobrada,
  recalcularEstimacion,
  registrarRespuestaEstimacion,
  type NuevaEstimacionInput,
} from '@/lib/data/estimaciones';
import { crearMovimiento, getObra } from '@/lib/data/obras';
import { validarRenglones } from '@/lib/estimaciones/calculo';
import { claveDe, LARGO_MOTIVO_RECHAZO, type TipoRetencion } from '@/lib/estimaciones/tipos';
import { fechaInputAMs, hoyMxMs } from '@/lib/data/tz';

/**
 * Acciones de las ESTIMACIONES de una obra (0039).
 *
 * Los permisos de verdad los ponen la RLS, los triggers y las RPC: solo el
 * admin crea, edita y envía; admin y contador marcan cobrada. Aquí se valida la
 * forma de lo que llega del navegador (que no es de fiar) y se dan mensajes en
 * lenguaje de obra. Con el módulo apagado no se escribe nada.
 */

export interface ActionResult {
  ok: boolean;
  error?: string;
  id?: string;
  avisos?: string[];
}

const UUID = /^[0-9a-f-]{36}$/i;

function numero(fd: FormData, campo: string): number {
  const bruto = String(fd.get(campo) ?? '').trim().replace(',', '.');
  if (bruto === '') return Number.NaN;
  return Number(bruto);
}

async function apagado(): Promise<ActionResult | null> {
  if (await moduloActivo('estimaciones')) return null;
  return {
    ok: false,
    error: 'Avance y estimaciones está apagado en tu empresa. El administrador puede prenderlo en Ajustes → Módulos.',
  };
}

function revalidar(obraId: string, estId?: string) {
  revalidatePath(`/admin/obras/${obraId}/estimaciones`);
  if (estId) revalidatePath(`/admin/obras/${obraId}/estimaciones/${estId}`);
  revalidatePath(`/admin/obras/${obraId}`);
  revalidatePath('/admin/facturacion');
}

/** La estimación existe, es de ESTA obra y la sesión la puede leer. */
async function deLaObra(obraId: string, estId: string): Promise<ActionResult | null> {
  if (!UUID.test(estId)) return { ok: false, error: 'Estimación no válida.' };
  const { data, error } = await getEstimacion(estId);
  if (error) return { ok: false, error };
  if (!data || data.obra_id !== obraId) return { ok: false, error: 'Estimación no encontrada.' };
  return null;
}

function parsePeriodo(fd: FormData): { input: NuevaEstimacionInput } | { error: string } {
  const ini = String(fd.get('periodo_inicio') ?? '').trim();
  const fin = String(fd.get('periodo_fin') ?? '').trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(ini) || !/^\d{4}-\d{2}-\d{2}$/.test(fin)) {
    return { error: 'Pon las dos fechas del periodo.' };
  }
  const periodoInicio = fechaInputAMs(ini);
  const periodoFin = fechaInputAMs(fin);
  if (periodoFin < periodoInicio) return { error: 'El fin del periodo no puede ser antes del inicio.' };
  return {
    input: {
      periodoInicio,
      periodoFin,
      esFiniquito: fd.get('es_finiquito') === 'on' || fd.get('es_finiquito') === 'true',
      notas: String(fd.get('notas') ?? '').trim().slice(0, 2000),
    },
  };
}

// ── Contrato y retenciones ───────────────────────────────────────────────────

export async function guardarContratoAction(obraId: string, fd: FormData): Promise<ActionResult> {
  const off = await apagado();
  if (off) return off;

  const pctDe = (campo: string) => {
    const v = numero(fd, campo);
    return Number.isFinite(v) ? v : 0;
  };
  const anticipoModo = String(fd.get('anticipo_modo') ?? 'monto');
  let anticipo = numero(fd, 'anticipo');
  if (!Number.isFinite(anticipo)) anticipo = 0;
  const amortizacionPct = pctDe('amortizacion_pct');
  const fondoGarantiaPct = pctDe('fondo_garantia_pct');
  const ivaPct = pctDe('iva_pct');
  const movimiento = String(fd.get('anticipo_movimiento_id') ?? '').trim();

  for (const [nombre, v] of [
    ['amortización', amortizacionPct],
    ['fondo de garantía', fondoGarantiaPct],
    ['IVA', ivaPct],
  ] as const) {
    if (v < 0 || v > 100) return { ok: false, error: `El % de ${nombre} va de 0 a 100.` };
  }
  if (anticipo < 0) return { ok: false, error: 'El anticipo no puede ser negativo.' };
  if (movimiento && !UUID.test(movimiento)) return { ok: false, error: 'Entrada de caja no válida.' };

  if (anticipoModo === 'pct') {
    if (anticipo > 100) return { ok: false, error: 'El anticipo en % va de 0 a 100.' };
    const { data: conceptos, error } = await listConceptosObra(obraId);
    if (error) return { ok: false, error };
    const contratado = conceptos
      .filter((c) => c.origen === 'presupuesto')
      .reduce((s, c) => s + c.cantidad * c.precioUnitario, 0);
    anticipo = Math.round(contratado * anticipo) / 100;
  }

  const r = await guardarContratoObra(obraId, {
    anticipo,
    anticipoMovimientoId: movimiento || null,
    amortizacionPct,
    fondoGarantiaPct,
    ivaPct,
    notas: String(fd.get('notas') ?? '').trim().slice(0, 2000),
  });
  if (!r.ok) return r;
  revalidar(obraId);
  return { ok: true };
}

export async function agregarRetencionAction(obraId: string, fd: FormData): Promise<ActionResult> {
  const off = await apagado();
  if (off) return off;
  const concepto = String(fd.get('concepto') ?? '').trim().slice(0, 120);
  const tipo = String(fd.get('tipo') ?? 'PORCENTAJE') as TipoRetencion;
  const valor = numero(fd, 'valor');
  if (!concepto) return { ok: false, error: 'Escribe qué retención es (por ejemplo, "5 al millar").' };
  if (tipo !== 'PORCENTAJE' && tipo !== 'MONTO') return { ok: false, error: 'Tipo no válido.' };
  if (!Number.isFinite(valor) || valor < 0) return { ok: false, error: 'El valor no es válido.' };
  if (tipo === 'PORCENTAJE' && valor > 100) return { ok: false, error: 'El % va de 0 a 100.' };
  const { data } = await getContratoObra(obraId);
  const r = await crearRetencion(obraId, { concepto, tipo, valor }, (data.retenciones.length + 1) * 100);
  if (!r.ok) return r;
  revalidar(obraId);
  return { ok: true };
}

export async function quitarRetencionAction(obraId: string, id: string): Promise<ActionResult> {
  const off = await apagado();
  if (off) return off;
  if (!UUID.test(id)) return { ok: false, error: 'Retención no válida.' };
  const r = await eliminarRetencion(obraId, id);
  if (!r.ok) return r;
  revalidar(obraId);
  return { ok: true };
}

// ── Estimaciones ─────────────────────────────────────────────────────────────

export async function crearEstimacionAction(obraId: string, fd: FormData): Promise<ActionResult> {
  const off = await apagado();
  if (off) return off;
  const p = parsePeriodo(fd);
  if ('error' in p) return { ok: false, error: p.error };
  const r = await crearEstimacion(obraId, p.input);
  if (!r.id) return { ok: false, error: r.error ?? 'No se pudo crear la estimación.' };
  revalidar(obraId, r.id);
  return {
    ok: true,
    id: r.id,
    error: r.error ?? undefined,
    avisos: r.excedentes.length
      ? [`Se hizo más de lo contratado (cóbralo con un extra): ${r.excedentes.join('; ')}.`]
      : undefined,
  };
}

export async function guardarDatosEstimacionAction(
  obraId: string,
  estId: string,
  fd: FormData,
): Promise<ActionResult> {
  const off = await apagado();
  if (off) return off;
  const ajena = await deLaObra(obraId, estId);
  if (ajena) return ajena;
  const p = parsePeriodo(fd);
  if ('error' in p) return { ok: false, error: p.error };
  const r = await actualizarDatosEstimacion(estId, p.input);
  if (!r.ok) return r;
  revalidar(obraId, estId);
  return { ok: true };
}

export async function fijarCantidadAction(
  obraId: string,
  estId: string,
  renglonId: string,
  valor: string,
): Promise<ActionResult> {
  const off = await apagado();
  if (off) return off;
  const ajena = await deLaObra(obraId, estId);
  if (ajena) return ajena;
  if (!UUID.test(renglonId)) return { ok: false, error: 'Partida no válida.' };
  const cantidad = Number(String(valor).trim().replace(',', '.'));
  if (!Number.isFinite(cantidad) || cantidad < 0 || cantidad > 1e8) {
    return { ok: false, error: 'La cantidad no es válida.' };
  }
  const r = await fijarCantidadRenglon(estId, renglonId, cantidad);
  if (!r.ok) return r;
  revalidar(obraId, estId);
  return { ok: true };
}

export async function agregarPartidaAction(
  obraId: string,
  estId: string,
  clave: string,
  valor: string,
): Promise<ActionResult> {
  const off = await apagado();
  if (off) return off;
  const ajena = await deLaObra(obraId, estId);
  if (ajena) return ajena;
  const cantidad = Number(String(valor).trim().replace(',', '.'));
  if (!Number.isFinite(cantidad) || cantidad <= 0 || cantidad > 1e8) {
    return { ok: false, error: 'Pon una cantidad mayor que cero.' };
  }
  const { data: conceptos, error } = await listConceptosObra(obraId);
  if (error) return { ok: false, error };
  const c = conceptos.find((x) => x.clave === clave);
  if (!c) return { ok: false, error: 'Esa partida no está en el contrato de la obra.' };
  const r = await agregarRenglon(estId, c, cantidad, Date.now() % 1_000_000_000);
  if (!r.ok) return r;
  revalidar(obraId, estId);
  return { ok: true };
}

export async function recalcularAction(obraId: string, estId: string): Promise<ActionResult> {
  const off = await apagado();
  if (off) return off;
  const ajena = await deLaObra(obraId, estId);
  if (ajena) return ajena;
  const r = await recalcularEstimacion(estId);
  if (!r.ok) return r;
  revalidar(obraId, estId);
  return { ok: true };
}

export async function eliminarEstimacionAction(obraId: string, estId: string): Promise<ActionResult> {
  const off = await apagado();
  if (off) return off;
  const ajena = await deLaObra(obraId, estId);
  if (ajena) return ajena;
  const r = await eliminarEstimacion(estId);
  if (!r.ok) return r;
  revalidar(obraId);
  return { ok: true };
}

/**
 * Enviar al cliente: se recalcula (por si cambió un precio o el anticipo), se
 * valida contra lo contratado con mensajes claros y la RPC congela.
 */
export async function enviarEstimacionAction(obraId: string, estId: string): Promise<ActionResult> {
  const off = await apagado();
  if (off) return off;
  const ajena = await deLaObra(obraId, estId);
  if (ajena) return ajena;

  const rc = await recalcularEstimacion(estId);
  if (!rc.ok) return rc;

  const { data: obra } = await getObra(obraId);
  const { data: vista, error } = await getVistaEstimacion(obraId, estId, obra?.nombre ?? '');
  if (error || !vista) return { ok: false, error: error ?? 'Estimación no encontrada.' };
  const problemas = validarRenglones(
    vista.estimacion.renglones.map((r) => ({ clave: claveDe(r), concepto: r.concepto, cantidad: r.cantidad })),
    vista.conceptos,
    vista.estimadoPrevio,
  );
  if (vista.estimacion.renglones.length === 0) return { ok: false, error: 'Agrega al menos una partida antes de enviarla.' };
  if (problemas.length > 0) return { ok: false, error: problemas.map((p) => p.mensaje).join(' ') };

  const r = await enviarEstimacion(estId);
  if (!r.ok) return r;
  revalidar(obraId, estId);
  return { ok: true };
}

export async function registrarRespuestaAction(
  obraId: string,
  estId: string,
  autorizar: boolean,
  quien: string,
  motivo: string,
): Promise<ActionResult> {
  const off = await apagado();
  if (off) return off;
  const ajena = await deLaObra(obraId, estId);
  if (ajena) return ajena;
  if (typeof autorizar !== 'boolean') return { ok: false, error: 'Respuesta no válida.' };
  const q = String(quien ?? '').trim().slice(0, 120);
  const m = String(motivo ?? '').trim().slice(0, LARGO_MOTIVO_RECHAZO);
  if (!q) return { ok: false, error: 'Escribe quién la autorizó o la rechazó.' };
  if (!autorizar && !m) return { ok: false, error: 'Escribe por qué la rechazaron.' };
  const r = await registrarRespuestaEstimacion(estId, autorizar, q, autorizar ? null : m);
  if (!r.ok) return r;
  revalidar(obraId, estId);
  return { ok: true };
}

/**
 * Marcar cobrada. Se puede ligar una entrada de caja que ya existe o registrar
 * la entrada en ese momento (por el neto): así no se captura dos veces.
 */
export async function marcarCobradaAction(
  obraId: string,
  estId: string,
  fd: FormData,
): Promise<ActionResult> {
  const off = await apagado();
  if (off) return off;
  const ajena = await deLaObra(obraId, estId);
  if (ajena) return ajena;

  const modo = String(fd.get('modo') ?? 'nada');
  let movimientoId: string | null = null;
  if (modo === 'ligar') {
    movimientoId = String(fd.get('movimiento_id') ?? '').trim();
    if (!UUID.test(movimientoId)) return { ok: false, error: 'Elige la entrada de caja.' };
  } else if (modo === 'registrar') {
    const { data: est } = await getEstimacion(estId);
    if (!est) return { ok: false, error: 'Estimación no encontrada.' };
    if (est.estado !== 'AUTORIZADA') return { ok: false, error: 'Solo se cobra una estimación autorizada.' };
    const metodo = String(fd.get('metodo_pago') ?? 'TRANSFERENCIA').trim().slice(0, 30) || 'TRANSFERENCIA';
    const fechaStr = String(fd.get('fecha') ?? '').trim();
    const fecha = fechaStr ? fechaInputAMs(fechaStr) : hoyMxMs();
    const creado = await crearMovimiento({
      obraId,
      fecha,
      tipo: 'ENTRADA',
      categoria: 'Estimación',
      concepto: `Pago de la estimación ${est.folio}`,
      monto: est.neto,
      metodoPago: metodo,
      referencia: String(fd.get('referencia') ?? '').trim().slice(0, 120),
      nombre: '',
    });
    if (creado.error || !creado.id) return { ok: false, error: creado.error ?? 'No se pudo registrar la entrada.' };
    movimientoId = creado.id;
  }

  const r = await marcarEstimacionCobrada(estId, movimientoId);
  if (!r.ok) return r;
  revalidar(obraId, estId);
  return { ok: true };
}
