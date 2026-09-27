'use server';

import { revalidatePath } from 'next/cache';
import { getEmpresaUsuario } from '@/lib/data/empresa';
import { fechaInputAMs } from '@/lib/data/tz';
import { getObra } from '@/lib/data/obras';
import { getNotaObra } from '@/lib/data/notas-obra';
import { subcontratistaParaNombre, type Resultado } from '@/lib/data/cumplimiento';
import {
  actualizarRenglon,
  actualizarSubcontrato,
  agregarRenglon,
  borrarSubcontrato,
  crearSubcontrato,
  getSubcontrato,
  guardarClausulas,
  PASO_ORDEN_RENGLON,
  puedeEscribirSubcontratos,
  quitarPago,
  quitarRenglon,
  registrarPago,
  subcontratoDeNota,
  type RenglonInput,
} from '@/lib/data/subcontratos';
import { calcularPago, contratoDesdeNota, esEstadoSubcontrato, importeRenglon } from '@/lib/subcontratos/calculo';
import { LARGO_MAXIMO_CLAUSULAS } from '@/lib/subcontratos/clausulas';

/**
 * Acciones de SUBCONTRATOS. Escriben admin y contador (RLS de 0040); aquí se
 * revisa el rol antes para dar un mensaje claro.
 */

async function exigirEscritura(): Promise<{ error: string } | null> {
  try {
    const { rol } = await getEmpresaUsuario();
    if (!puedeEscribirSubcontratos(rol)) return { error: 'Solo el administrador o el contador pueden cambiar contratos.' };
    return null;
  } catch (e) {
    return { error: e instanceof Error ? e.message : 'Error de autenticación.' };
  }
}

function texto(fd: FormData, k: string, max = 2000): string {
  return String(fd.get(k) ?? '').trim().slice(0, max);
}

function numero(fd: FormData, k: string): number | null {
  const v = String(fd.get(k) ?? '').trim().replace(/[$,\s]/g, '');
  if (!v) return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : NaN;
}

function fecha(fd: FormData, k: string): number | null {
  const v = String(fd.get(k) ?? '').trim();
  return v ? fechaInputAMs(v) : null;
}

function revalidar(id?: string) {
  revalidatePath('/admin/subcontratos');
  if (id) revalidatePath(`/admin/subcontratos/${id}`, 'layout');
}

// ── Nota → contrato (RF5.7) ─────────────────────────────────────────────────

export async function convertirNotaEnContratoAction(
  obraId: string,
  notaId: string,
): Promise<Resultado<{ id: string; avisos: string[] }>> {
  const bloqueo = await exigirEscritura();
  if (bloqueo) return { ok: false, error: bloqueo.error };

  const ya = await subcontratoDeNota(notaId);
  if (ya) return { ok: true, data: { id: ya.id, avisos: ['Esta nota ya tenía contrato: te llevamos a él.'] } };

  const [{ data: obra }, { data: nota, error }] = await Promise.all([getObra(obraId), getNotaObra(notaId)]);
  if (error) return { ok: false, error };
  if (!obra || !nota || nota.obra_id !== obraId) return { ok: false, error: 'No se encontró la nota.' };

  const borrador = contratoDesdeNota(nota, obra.nombre);
  const sub = await subcontratistaParaNombre(borrador.subcontratistaNombre, borrador.colaboradorId);
  if (!sub.ok || !sub.data) return { ok: false, error: sub.error };

  const r = await crearSubcontrato({
    obraId,
    subcontratistaId: sub.data.id,
    subcontratistaNombre: sub.data.nombre,
    notaObraId: notaId,
    alcance: borrador.alcance,
    // El monto queda como la suma de renglones (null) salvo que la nota
    // tuviera un total fijado a mano: ese trato manda.
    monto: nota.total_override ?? null,
    retencionPct: borrador.retencionPct,
    renglones: borrador.renglones,
    pagosPrevios: borrador.pagosPrevios,
  });
  if (!r.ok || !r.data) return { ok: false, error: r.error };
  revalidar();
  revalidatePath(`/admin/obras/${obraId}/notas/${notaId}`);
  return { ok: true, data: { id: r.data.id, avisos: borrador.avisos } };
}

// ── Alta directa ─────────────────────────────────────────────────────────────

export async function crearSubcontratoAction(fd: FormData): Promise<Resultado<{ id: string }>> {
  const bloqueo = await exigirEscritura();
  if (bloqueo) return { ok: false, error: bloqueo.error };
  const obraId = texto(fd, 'obra_id', 40);
  const nombre = texto(fd, 'subcontratista', 200);
  if (!obraId) return { ok: false, error: 'Elige la obra.' };
  if (!nombre) return { ok: false, error: 'Escribe a quién se le contrata.' };
  const sub = await subcontratistaParaNombre(nombre, null);
  if (!sub.ok || !sub.data) return { ok: false, error: sub.error };
  const r = await crearSubcontrato({
    obraId,
    subcontratistaId: sub.data.id,
    subcontratistaNombre: sub.data.nombre,
    notaObraId: null,
    alcance: texto(fd, 'alcance', 4000),
    monto: null,
    retencionPct: 0,
    renglones: [],
    pagosPrevios: [],
  });
  if (r.ok) revalidar();
  return r;
}

// ── Datos del contrato ──────────────────────────────────────────────────────

export async function actualizarSubcontratoAction(id: string, fd: FormData): Promise<Resultado> {
  const bloqueo = await exigirEscritura();
  if (bloqueo) return { ok: false, error: bloqueo.error };
  const estado = texto(fd, 'estado', 20);
  if (!esEstadoSubcontrato(estado)) return { ok: false, error: 'Estado no válido.' };
  const monto = numero(fd, 'monto');
  if (Number.isNaN(monto) || (monto !== null && monto < 0)) return { ok: false, error: 'El monto no es válido.' };
  const pct = numero(fd, 'retencion_pct') ?? 0;
  if (Number.isNaN(pct) || pct < 0 || pct > 100) return { ok: false, error: 'La retención va de 0 a 100 %.' };
  const inicio = fecha(fd, 'fecha_inicio');
  const fin = fecha(fd, 'fecha_fin');
  if (inicio !== null && fin !== null && fin < inicio) return { ok: false, error: 'La fecha de fin es antes del inicio.' };

  const r = await actualizarSubcontrato(id, {
    alcance: texto(fd, 'alcance', 4000),
    monto,
    retencion_pct: pct,
    forma_pago: texto(fd, 'forma_pago', 1000),
    fecha_inicio: inicio,
    fecha_fin: fin,
    fecha_firma: fecha(fd, 'fecha_firma'),
    estado,
    notas: texto(fd, 'notas'),
  });
  if (r.ok) revalidar(id);
  return r;
}

export async function guardarClausulasAction(id: string, clausulas: string | null): Promise<Resultado> {
  const bloqueo = await exigirEscritura();
  if (bloqueo) return { ok: false, error: bloqueo.error };
  const valor = clausulas === null ? null : clausulas.trim().slice(0, LARGO_MAXIMO_CLAUSULAS) || null;
  const r = await guardarClausulas(id, valor);
  if (r.ok) revalidar(id);
  return r;
}

export async function borrarSubcontratoAction(id: string): Promise<Resultado> {
  const bloqueo = await exigirEscritura();
  if (bloqueo) return { ok: false, error: bloqueo.error };
  const r = await borrarSubcontrato(id);
  if (r.ok) revalidar();
  return r;
}

// ── Renglones ───────────────────────────────────────────────────────────────

function leerRenglon(fd: FormData): RenglonInput | { error: string } {
  const concepto = texto(fd, 'concepto', 500);
  if (!concepto) return { error: 'Escribe el concepto.' };
  const cantidad = numero(fd, 'cantidad');
  const pu = numero(fd, 'precio_unitario');
  const imp = numero(fd, 'importe');
  if ([cantidad, pu, imp].some((n) => Number.isNaN(n))) return { error: 'Revisa los números.' };
  if (imp === null && (cantidad === null || pu === null)) {
    return { error: 'Pon el importe, o la cantidad y el precio unitario.' };
  }
  return {
    concepto,
    unidad: texto(fd, 'unidad', 40),
    cantidad,
    precio_unitario: pu,
    importe: importeRenglon(cantidad, pu, imp ?? 0),
  };
}

export async function agregarRenglonAction(subcontratoId: string, fd: FormData): Promise<Resultado> {
  const bloqueo = await exigirEscritura();
  if (bloqueo) return { ok: false, error: bloqueo.error };
  const r = leerRenglon(fd);
  if ('error' in r) return { ok: false, error: r.error };
  const { data } = await getSubcontrato(subcontratoId);
  if (!data) return { ok: false, error: 'No se encontró el contrato.' };
  const orden = (data.renglones.at(-1)?.orden ?? 0) + PASO_ORDEN_RENGLON;
  const res = await agregarRenglon(subcontratoId, r, orden);
  if (res.ok) revalidar(subcontratoId);
  return res;
}

export async function actualizarRenglonAction(subcontratoId: string, id: string, fd: FormData): Promise<Resultado> {
  const bloqueo = await exigirEscritura();
  if (bloqueo) return { ok: false, error: bloqueo.error };
  const r = leerRenglon(fd);
  if ('error' in r) return { ok: false, error: r.error };
  const res = await actualizarRenglon(id, r);
  if (res.ok) revalidar(subcontratoId);
  return res;
}

export async function quitarRenglonAction(subcontratoId: string, id: string): Promise<Resultado> {
  const bloqueo = await exigirEscritura();
  if (bloqueo) return { ok: false, error: bloqueo.error };
  const res = await quitarRenglon(id);
  if (res.ok) revalidar(subcontratoId);
  return res;
}

// ── Pagos (RF5.9) ───────────────────────────────────────────────────────────

const METODOS = ['EFECTIVO', 'TRANSFERENCIA', 'CHEQUE', 'OTRO'];

export async function registrarPagoAction(subcontratoId: string, fd: FormData): Promise<Resultado<{ aviso?: string }>> {
  const bloqueo = await exigirEscritura();
  if (bloqueo) return { ok: false, error: bloqueo.error };
  const { data: contrato } = await getSubcontrato(subcontratoId);
  if (!contrato) return { ok: false, error: 'No se encontró el contrato.' };
  if (contrato.estado === 'CANCELADO') return { ok: false, error: 'El contrato está cancelado.' };

  const monto = numero(fd, 'monto');
  if (monto === null || Number.isNaN(monto) || monto <= 0) return { ok: false, error: 'El monto debe ser mayor a cero.' };
  const fijada = numero(fd, 'retencion');
  if (Number.isNaN(fijada)) return { ok: false, error: 'La retención no es válida.' };
  // La retención se recalcula aquí con el % del contrato; si el usuario la
  // escribió, manda la suya (acotada entre 0 y el pago).
  const pago = calcularPago(monto, contrato.retencion_pct, fijada);
  const metodo = texto(fd, 'metodo_pago', 40);

  const r = await registrarPago(
    contrato,
    {
      fecha: fecha(fd, 'fecha') ?? Date.now(),
      monto: pago.monto,
      retencion: pago.retencion,
      metodo_pago: METODOS.includes(metodo) ? metodo : 'TRANSFERENCIA',
      referencia: texto(fd, 'referencia', 200),
      notas: texto(fd, 'notas', 1000),
    },
    fd.get('crear_salida') === 'on',
  );
  if (r.ok) {
    revalidar(subcontratoId);
    revalidatePath(`/admin/obras/${contrato.obra_id}`);
  }
  return r;
}

export async function quitarPagoAction(subcontratoId: string, id: string): Promise<Resultado<{ aviso?: string }>> {
  const bloqueo = await exigirEscritura();
  if (bloqueo) return { ok: false, error: bloqueo.error };
  const r = await quitarPago(id);
  if (!r.ok) return { ok: false, error: r.error };
  revalidar(subcontratoId);
  return {
    ok: true,
    data: r.data?.teniaMovimiento
      ? { aviso: 'Se quitó el pago. Su salida en la caja de la obra sigue ahí: bórrala en la obra si también sobra.' }
      : {},
  };
}
