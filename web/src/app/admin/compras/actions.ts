'use server';

import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { getEmpresaUsuario } from '@/lib/data/empresa';
import { getEmpresaConfig } from '@/lib/data/empresa-config';
import { moduloActivo } from '@/lib/data/modulos';
import { fechaInputAMs } from '@/lib/data/tz';
import {
  BUCKET_COMPRAS,
  MAX_BYTES_ARCHIVO,
  TIPOS_REMISION,
  actualizarOrden,
  actualizarRenglonOrden,
  agregarRenglonOrden,
  anularPago,
  cancelarOrden,
  crearOrdenes,
  crearRequisicion,
  decidirRequisicion,
  eliminarMaterial,
  eliminarMovimientoMaterial,
  eliminarOrdenBorrador,
  eliminarProveedor,
  eliminarRecepcion,
  eliminarRenglonOrden,
  eliminarRequisicion,
  emitirOrden,
  fijarRemision,
  getOrden,
  getRecepcion,
  guardarMaterial,
  guardarProveedor,
  ligarFactura,
  listMateriales,
  listOrdenadoDeRequisiciones,
  listProveedores,
  listRequisiciones,
  pagarOrden,
  registrarMovimientoMaterial,
  registrarRecepcion,
  type RenglonOrdenInput,
  type RenglonRequisicionInput,
} from '@/lib/data/compras';
import { agruparEnOrdenes, ordenadoPorRenglon, pendientePorComprar } from '@/lib/compras/calculo';
import { esMetodoPagoProveedor, type TipoMovimientoMaterial } from '@/lib/compras/tipos';
import { fechaCfdiAMs, leerCfdi } from '@/lib/fiscal/cfdi';
import { limpiarRfc, validarRfc } from '@/lib/fiscal/rfc';

/**
 * Acciones de COMPRAS Y MATERIAL (0038). Las usan `/admin/compras` y la pestaña
 * "Material" de cada obra.
 *
 * Los permisos de verdad los ponen la RLS, los triggers y las RPC; aquí solo se
 * valida la FORMA de lo que llega del navegador (que no es de fiar) y se dan
 * mensajes en lenguaje de obra. Con el módulo apagado no se escribe nada.
 */

export interface ActionResult {
  ok: boolean;
  error?: string;
  id?: string;
  ids?: string[];
  avisos?: string[];
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const esUuid = (x: unknown): x is string => typeof x === 'string' && UUID.test(x);

function texto(v: unknown, max: number): string {
  return String(v ?? '').trim().slice(0, max);
}

function numero(v: unknown): number {
  const bruto = String(v ?? '').trim().replace(/,/g, '').replace(/\s/g, '');
  if (bruto === '') return Number.NaN;
  return Number(bruto);
}

async function apagado(): Promise<ActionResult | null> {
  if (await moduloActivo('compras')) return null;
  return {
    ok: false,
    error: 'Compras está apagado en tu empresa. El administrador puede prenderlo en Ajustes → Módulos.',
  };
}

function revalidarCompras(extra?: string[]) {
  revalidatePath('/admin/compras', 'layout');
  for (const p of extra ?? []) revalidatePath(p);
}

function revalidarObra(obraId: string) {
  revalidatePath(`/admin/obras/${obraId}/material`);
  revalidatePath(`/admin/obras/${obraId}`);
}

// ════════════════════════════════════════════════════════════════════════════
// Catálogos
// ════════════════════════════════════════════════════════════════════════════

export async function guardarProveedorAction(id: string | null, fd: FormData): Promise<ActionResult> {
  const off = await apagado();
  if (off) return off;
  if (id !== null && !esUuid(id)) return { ok: false, error: 'Proveedor no encontrado.' };
  const nombre = texto(fd.get('nombre'), 200);
  if (!nombre) return { ok: false, error: 'Escribe el nombre del proveedor.' };
  const rfcCrudo = limpiarRfc(texto(fd.get('rfc'), 20));
  if (rfcCrudo) {
    const v = validarRfc(rfcCrudo, { permitirGenerico: false });
    if (!v.ok) return { ok: false, error: v.error };
  }
  const dias = numero(fd.get('dias_credito') || '0');
  if (!Number.isInteger(dias) || dias < 0 || dias > 365) {
    return { ok: false, error: 'Los días de crédito van de 0 a 365.' };
  }
  const r = await guardarProveedor(id, {
    nombre,
    rfc: rfcCrudo || null,
    contacto: texto(fd.get('contacto'), 200),
    telefono: texto(fd.get('telefono'), 40),
    correo: texto(fd.get('correo'), 200),
    dias_credito: dias,
    notas: texto(fd.get('notas'), 2000),
  });
  if (r.ok) revalidarCompras();
  return r;
}

export async function eliminarProveedorAction(id: string): Promise<ActionResult> {
  const off = await apagado();
  if (off) return off;
  if (!esUuid(id)) return { ok: false, error: 'Proveedor no encontrado.' };
  const r = await eliminarProveedor(id);
  if (r.ok) revalidarCompras();
  return r;
}

export async function guardarMaterialAction(id: string | null, fd: FormData): Promise<ActionResult> {
  const off = await apagado();
  if (off) return off;
  if (id !== null && !esUuid(id)) return { ok: false, error: 'Material no encontrado.' };
  const nombre = texto(fd.get('nombre'), 200);
  if (!nombre) return { ok: false, error: 'Escribe el nombre del material.' };
  const precioStr = String(fd.get('ultimo_precio') ?? '').trim();
  const precio = precioStr === '' ? null : numero(precioStr);
  if (precio !== null && (!Number.isFinite(precio) || precio < 0 || precio > 1e9)) {
    return { ok: false, error: 'El precio no es válido.' };
  }
  const prov = String(fd.get('proveedor_id') ?? '');
  const clave = texto(fd.get('clave_sat'), 8);
  const unidadSat = texto(fd.get('unidad_sat'), 3).toUpperCase();
  if (clave && !/^\d{8}$/.test(clave)) return { ok: false, error: 'La clave SAT son 8 dígitos.' };
  if (unidadSat && !/^[A-Z0-9]{1,3}$/.test(unidadSat)) return { ok: false, error: 'La unidad SAT son hasta 3 letras o números.' };
  const r = await guardarMaterial(id, {
    nombre,
    unidad: texto(fd.get('unidad'), 20) || 'pza',
    ultimo_precio: precio,
    proveedor_id: esUuid(prov) ? prov : null,
    clave_sat: clave || null,
    unidad_sat: unidadSat || null,
    notas: texto(fd.get('notas'), 2000),
  });
  if (r.ok) revalidarCompras();
  return r;
}

export async function eliminarMaterialAction(id: string): Promise<ActionResult> {
  const off = await apagado();
  if (off) return off;
  if (!esUuid(id)) return { ok: false, error: 'Material no encontrado.' };
  const r = await eliminarMaterial(id);
  if (r.ok) revalidarCompras();
  return r;
}

// ════════════════════════════════════════════════════════════════════════════
// Requisiciones
// ════════════════════════════════════════════════════════════════════════════

export interface RequisicionPayload {
  id: string;
  obraId: string;
  /** 'YYYY-MM-DD' o ''. */
  paraCuando: string;
  notas: string;
  renglones: { materialId: string | null; descripcion: string; unidad: string; cantidad: string | number; notas?: string }[];
}

export async function crearRequisicionAction(p: RequisicionPayload): Promise<ActionResult> {
  const off = await apagado();
  if (off) return off;
  if (!p || !esUuid(p.id) || !esUuid(p.obraId)) return { ok: false, error: 'Datos incompletos.' };
  if (!Array.isArray(p.renglones) || p.renglones.length === 0) {
    return { ok: false, error: 'Agrega al menos un material.' };
  }
  if (p.renglones.length > 100) return { ok: false, error: 'Máximo 100 materiales por requisición.' };
  const renglones: RenglonRequisicionInput[] = [];
  for (const [i, r] of p.renglones.entries()) {
    const descripcion = texto(r.descripcion, 300);
    const cantidad = numero(r.cantidad);
    if (!descripcion) return { ok: false, error: `Renglón ${i + 1}: escribe qué material.` };
    if (!Number.isFinite(cantidad) || cantidad <= 0 || cantidad >= 1e9) {
      return { ok: false, error: `Renglón ${i + 1}: la cantidad debe ser mayor que cero.` };
    }
    renglones.push({
      material_id: esUuid(r.materialId) ? r.materialId : null,
      descripcion,
      unidad: texto(r.unidad, 20),
      cantidad,
      notas: texto(r.notas, 500),
    });
  }
  const paraCuando = /^\d{4}-\d{2}-\d{2}$/.test(p.paraCuando ?? '') ? fechaInputAMs(p.paraCuando) : null;
  const r = await crearRequisicion({
    id: p.id,
    obraId: p.obraId,
    paraCuando,
    notas: texto(p.notas, 2000),
    renglones,
  });
  if (r.ok) {
    revalidarObra(p.obraId);
    revalidarCompras();
  }
  return r;
}

export async function decidirRequisicionAction(
  id: string,
  aprobar: boolean,
  motivo: string,
): Promise<ActionResult> {
  const off = await apagado();
  if (off) return off;
  if (!esUuid(id)) return { ok: false, error: 'Requisición no encontrada.' };
  const m = texto(motivo, 1000);
  if (!aprobar && !m) return { ok: false, error: 'Escribe por qué se rechaza (lo lee quien la pidió).' };
  const r = await decidirRequisicion(id, aprobar === true, m);
  if (r.ok) revalidarCompras(['/admin/obras']);
  return r;
}

export async function eliminarRequisicionAction(id: string, obraId: string): Promise<ActionResult> {
  const off = await apagado();
  if (off) return off;
  if (!esUuid(id)) return { ok: false, error: 'Requisición no encontrada.' };
  const r = await eliminarRequisicion(id);
  if (r.ok) {
    if (esUuid(obraId)) revalidarObra(obraId);
    revalidarCompras();
  }
  return r;
}

// ════════════════════════════════════════════════════════════════════════════
// Armar órdenes a partir de requisiciones aprobadas
// ════════════════════════════════════════════════════════════════════════════

export interface EleccionCompra {
  requisicionRenglonId: string;
  proveedorId: string;
  cantidad: string | number;
  precio: string | number;
}

/**
 * Convierte lo elegido en órdenes BORRADOR, una por (obra, proveedor).
 *
 * Del navegador solo se toma QUÉ renglón, a QUÉ proveedor, CUÁNTO y a QUÉ
 * precio. La obra, la descripción, la unidad y el material se vuelven a leer de
 * la requisición en el servidor, y la cantidad no puede pasar de lo que falta
 * por comprar: así nadie arma una orden con datos inventados.
 */
export async function crearOrdenesDesdeRequisicionesAction(elegidos: EleccionCompra[]): Promise<ActionResult> {
  const off = await apagado();
  if (off) return off;
  if (!Array.isArray(elegidos) || elegidos.length === 0) return { ok: false, error: 'Elige al menos un material.' };
  if (elegidos.length > 300) return { ok: false, error: 'Demasiados renglones a la vez.' };

  const [{ data: reqs, error }, { data: proveedores }, { ivaPorcentaje }] = await Promise.all([
    listRequisiciones({ estados: ['APROBADA', 'PARCIAL'], limite: 500 }),
    listProveedores(),
    getEmpresaConfig(),
  ]);
  if (error) return { ok: false, error };
  const renglonPor = new Map(
    reqs.flatMap((q) => q.renglones.map((r) => [r.id, { r, obraId: q.obra_id }] as const)),
  );
  const provPor = new Map(proveedores.map((p) => [p.id, p]));
  const ordenado = ordenadoPorRenglon(await listOrdenadoDeRequisiciones([...renglonPor.keys()]));

  const items = [];
  for (const e of elegidos) {
    const base = renglonPor.get(e.requisicionRenglonId);
    if (!base) return { ok: false, error: 'Un material ya no está por comprar. Recarga la página.' };
    if (!provPor.has(e.proveedorId)) return { ok: false, error: `Elige proveedor para «${base.r.descripcion}».` };
    const cantidad = numero(e.cantidad);
    const precio = numero(e.precio);
    const falta = pendientePorComprar(base.r.cantidad, ordenado.get(base.r.id) ?? 0);
    if (!Number.isFinite(cantidad) || cantidad <= 0) {
      return { ok: false, error: `«${base.r.descripcion}»: la cantidad debe ser mayor que cero.` };
    }
    if (cantidad > falta + 1e-6) {
      return { ok: false, error: `«${base.r.descripcion}»: solo faltan ${falta} por comprar.` };
    }
    if (!Number.isFinite(precio) || precio < 0 || precio >= 1e10) {
      return { ok: false, error: `«${base.r.descripcion}»: el precio no es válido.` };
    }
    items.push({
      requisicionRenglonId: base.r.id,
      obraId: base.obraId,
      proveedorId: e.proveedorId,
      materialId: base.r.material_id,
      descripcion: base.r.descripcion,
      unidad: base.r.unidad,
      cantidad,
      precioUnitario: precio,
    });
  }

  const grupos = agruparEnOrdenes(items);
  const r = await crearOrdenes(
    grupos.map((g) => ({
      obraId: g.obraId,
      proveedorId: g.proveedorId,
      ivaPct: ivaPorcentaje,
      diasCredito: provPor.get(g.proveedorId)?.dias_credito ?? 0,
      condiciones: '',
      renglones: g.renglones.map((x) => ({
        requisicion_renglon_id: x.requisicionRenglonId,
        material_id: x.materialId,
        descripcion: x.descripcion,
        unidad: x.unidad,
        cantidad: x.cantidad,
        precio_unitario: x.precioUnitario,
      })),
    })),
  );
  revalidarCompras(['/admin/obras']);
  return r;
}

/** Orden directa (sin requisición): nace vacía en BORRADOR y se llena en su pantalla. */
export async function crearOrdenDirectaAction(obraId: string, proveedorId: string): Promise<ActionResult> {
  const off = await apagado();
  if (off) return off;
  if (!esUuid(obraId)) return { ok: false, error: 'Elige la obra.' };
  if (!esUuid(proveedorId)) return { ok: false, error: 'Elige el proveedor.' };
  const [{ data: proveedores }, { ivaPorcentaje }] = await Promise.all([listProveedores(), getEmpresaConfig()]);
  const prov = proveedores.find((p) => p.id === proveedorId);
  if (!prov) return { ok: false, error: 'Proveedor no encontrado.' };
  const r = await crearOrdenes([
    { obraId, proveedorId, ivaPct: ivaPorcentaje, diasCredito: prov.dias_credito, condiciones: '', renglones: [] },
  ]);
  if (!r.ok || !r.ids?.[0]) return { ok: false, error: r.error ?? 'No se pudo crear la orden.' };
  revalidarCompras();
  return { ok: true, id: r.ids[0] };
}

// ════════════════════════════════════════════════════════════════════════════
// Orden de compra
// ════════════════════════════════════════════════════════════════════════════

async function ordenValida(id: string): Promise<ActionResult | null> {
  if (!esUuid(id)) return { ok: false, error: 'Orden no encontrada.' };
  return null;
}

export async function guardarDatosOrdenAction(id: string, fd: FormData): Promise<ActionResult> {
  const off = (await apagado()) ?? (await ordenValida(id));
  if (off) return off;
  const proveedorId = String(fd.get('proveedor_id') ?? '');
  if (!esUuid(proveedorId)) return { ok: false, error: 'Elige el proveedor.' };
  const iva = numero(fd.get('iva_pct'));
  if (!Number.isFinite(iva) || iva < 0 || iva > 100) return { ok: false, error: 'El IVA va de 0 a 100 %.' };
  const dias = numero(fd.get('dias_credito') || '0');
  if (!Number.isInteger(dias) || dias < 0 || dias > 365) return { ok: false, error: 'Los días de crédito van de 0 a 365.' };
  const entregaStr = String(fd.get('fecha_entrega') ?? '').trim();
  const r = await actualizarOrden(id, {
    proveedor_id: proveedorId,
    iva_pct: iva,
    dias_credito: dias,
    condiciones: texto(fd.get('condiciones'), 2000),
    fecha_entrega: /^\d{4}-\d{2}-\d{2}$/.test(entregaStr) ? fechaInputAMs(entregaStr) : null,
    notas: texto(fd.get('notas'), 2000),
  });
  if (r.ok) revalidarCompras();
  return r;
}

function parseRenglonOrden(fd: FormData): { input: RenglonOrdenInput } | { error: string } {
  const descripcion = texto(fd.get('descripcion'), 300);
  const cantidad = numero(fd.get('cantidad'));
  const precio = numero(fd.get('precio_unitario'));
  const material = String(fd.get('material_id') ?? '');
  if (!descripcion) return { error: 'Escribe qué material.' };
  if (!Number.isFinite(cantidad) || cantidad <= 0 || cantidad >= 1e9) return { error: 'La cantidad debe ser mayor que cero.' };
  if (!Number.isFinite(precio) || precio < 0 || precio >= 1e10) return { error: 'El precio no es válido.' };
  return {
    input: {
      material_id: esUuid(material) ? material : null,
      descripcion,
      unidad: texto(fd.get('unidad'), 20),
      cantidad,
      precio_unitario: precio,
    },
  };
}

export async function agregarRenglonOrdenAction(id: string, fd: FormData): Promise<ActionResult> {
  const off = (await apagado()) ?? (await ordenValida(id));
  if (off) return off;
  const p = parseRenglonOrden(fd);
  if ('error' in p) return { ok: false, error: p.error };
  const orden = await getOrden(id);
  if (!orden) return { ok: false, error: 'Orden no encontrada.' };
  const siguiente = Math.max(0, ...orden.renglones.map((r) => Number(r.orden))) + 100;
  const r = await agregarRenglonOrden(id, p.input, siguiente);
  if (r.ok) revalidarCompras();
  return r;
}

export async function actualizarRenglonOrdenAction(id: string, renglonId: string, fd: FormData): Promise<ActionResult> {
  const off = (await apagado()) ?? (await ordenValida(id));
  if (off) return off;
  if (!esUuid(renglonId)) return { ok: false, error: 'Renglón no encontrado.' };
  const p = parseRenglonOrden(fd);
  if ('error' in p) return { ok: false, error: p.error };
  const r = await actualizarRenglonOrden(id, renglonId, p.input);
  if (r.ok) revalidarCompras();
  return r;
}

export async function eliminarRenglonOrdenAction(id: string, renglonId: string): Promise<ActionResult> {
  const off = (await apagado()) ?? (await ordenValida(id));
  if (off) return off;
  if (!esUuid(renglonId)) return { ok: false, error: 'Renglón no encontrado.' };
  const r = await eliminarRenglonOrden(id, renglonId);
  if (r.ok) revalidarCompras(['/admin/obras']);
  return r;
}

export async function emitirOrdenAction(id: string): Promise<ActionResult> {
  const off = (await apagado()) ?? (await ordenValida(id));
  if (off) return off;
  const r = await emitirOrden(id);
  if (r.ok) revalidarCompras(['/admin/obras']);
  return r;
}

export async function cancelarOrdenAction(id: string): Promise<ActionResult> {
  const off = (await apagado()) ?? (await ordenValida(id));
  if (off) return off;
  const r = await cancelarOrden(id);
  if (r.ok) revalidarCompras(['/admin/obras']);
  return r;
}

export async function eliminarOrdenBorradorAction(id: string): Promise<ActionResult> {
  const off = (await apagado()) ?? (await ordenValida(id));
  if (off) return off;
  const r = await eliminarOrdenBorrador(id);
  if (r.ok) revalidarCompras(['/admin/obras']);
  return r;
}

// ════════════════════════════════════════════════════════════════════════════
// Recepción en obra
// ════════════════════════════════════════════════════════════════════════════

export interface RecepcionPayload {
  id: string;
  ordenId: string;
  fecha: string;
  notas: string;
  lineas: { renglonId: string; cantidad: string | number; notas?: string }[];
}

export async function registrarRecepcionAction(p: RecepcionPayload): Promise<ActionResult> {
  const off = await apagado();
  if (off) return off;
  if (!p || !esUuid(p.id) || !esUuid(p.ordenId)) return { ok: false, error: 'Datos incompletos.' };
  const orden = await getOrden(p.ordenId);
  if (!orden) return { ok: false, error: 'Orden no encontrada.' };
  const validos = new Set(orden.renglones.map((r) => r.id));
  const lineas = [];
  for (const l of p.lineas ?? []) {
    if (!validos.has(l.renglonId)) return { ok: false, error: 'Un renglón no es de esta orden.' };
    const c = numero(l.cantidad === '' ? '0' : l.cantidad);
    if (!Number.isFinite(c) || c < 0 || c >= 1e9) return { ok: false, error: 'Revisa las cantidades recibidas.' };
    lineas.push({ renglonId: l.renglonId, cantidad: c, notas: texto(l.notas, 500) });
  }
  if (!lineas.some((l) => l.cantidad > 0)) return { ok: false, error: 'Anota cuánto llegó de al menos un material.' };
  const r = await registrarRecepcion({
    id: p.id,
    ordenId: p.ordenId,
    fecha: /^\d{4}-\d{2}-\d{2}$/.test(p.fecha ?? '') ? fechaInputAMs(p.fecha) : Date.now(),
    notas: texto(p.notas, 2000),
    lineas,
  });
  if (r.ok) {
    revalidarCompras();
    revalidarObra(orden.obra_id);
  }
  return r;
}

export interface UrlSubida {
  ok: boolean;
  error?: string;
  path?: string;
  token?: string;
}

async function empresaId(): Promise<string | null> {
  try {
    return (await getEmpresaUsuario()).empresaId;
  } catch {
    return null;
  }
}

function nombreSeguro(n: string): string {
  return n.replace(/[^a-zA-Z0-9._-]/g, '_').slice(-60) || 'archivo';
}

/**
 * URL de subida FIRMADA para la foto de la remisión (el cuerpo de un Server
 * Action no aguanta una foto de varios MB). La ruta la arma el servidor, con la
 * empresa y la recepción: el navegador no puede apuntar a otra carpeta, y la
 * policy del bucket exige que la recepción exista.
 */
export async function crearUrlSubidaRemision(
  recepcionId: string,
  fileName: string,
  fileType: string,
  fileSize: number,
): Promise<UrlSubida> {
  const off = await apagado();
  if (off) return off;
  if (!esUuid(recepcionId)) return { ok: false, error: 'Entrega no encontrada.' };
  if (!fileSize) return { ok: false, error: 'Elige una foto o un PDF.' };
  if (fileSize > MAX_BYTES_ARCHIVO) return { ok: false, error: 'El archivo pasa de 10 MB.' };
  if (!TIPOS_REMISION.includes(fileType)) return { ok: false, error: 'Solo fotos (JPG, PNG, WEBP, HEIC) o PDF.' };
  const rec = await getRecepcion(recepcionId);
  const emp = await empresaId();
  if (!rec || !emp) return { ok: false, error: 'Entrega no encontrada.' };
  const supabase = await createClient();
  const path = `${emp}/remisiones/${recepcionId}/${crypto.randomUUID()}-${nombreSeguro(fileName)}`;
  const { data, error } = await supabase.storage.from(BUCKET_COMPRAS).createSignedUploadUrl(path);
  if (error || !data) return { ok: false, error: `No se pudo preparar la subida: ${error?.message ?? 'desconocido'}` };
  return { ok: true, path: data.path, token: data.token };
}

export async function registrarRemisionAction(recepcionId: string, path: string): Promise<ActionResult> {
  const off = await apagado();
  if (off) return off;
  const emp = await empresaId();
  if (!emp || !esUuid(recepcionId) || !path.startsWith(`${emp}/remisiones/${recepcionId}/`)) {
    return { ok: false, error: 'Ruta de archivo inválida.' };
  }
  const rec = await getRecepcion(recepcionId);
  if (!rec) return { ok: false, error: 'Entrega no encontrada.' };
  const supabase = await createClient();
  const r = await fijarRemision(recepcionId, path);
  if (!r.ok) {
    await supabase.storage.from(BUCKET_COMPRAS).remove([path]);
    return r;
  }
  if (rec.remision_uri && rec.remision_uri !== path) {
    await supabase.storage.from(BUCKET_COMPRAS).remove([rec.remision_uri]);
  }
  revalidarCompras();
  return { ok: true };
}

export async function eliminarRecepcionAction(recepcionId: string): Promise<ActionResult> {
  const off = await apagado();
  if (off) return off;
  if (!esUuid(recepcionId)) return { ok: false, error: 'Entrega no encontrada.' };
  const rec = await getRecepcion(recepcionId);
  const r = await eliminarRecepcion(recepcionId);
  if (r.ok) {
    revalidarCompras();
    if (rec) revalidarObra(rec.obra_id);
  }
  return r;
}

// ════════════════════════════════════════════════════════════════════════════
// Pagos
// ════════════════════════════════════════════════════════════════════════════

export interface PagoPayload {
  id: string;
  ordenId: string;
  monto: string | number;
  fecha: string;
  metodo: string;
  referencia: string;
  notas: string;
}

export async function pagarOrdenAction(p: PagoPayload): Promise<ActionResult> {
  const off = await apagado();
  if (off) return off;
  if (!p || !esUuid(p.id) || !esUuid(p.ordenId)) return { ok: false, error: 'Datos incompletos.' };
  const monto = numero(p.monto);
  if (!Number.isFinite(monto) || monto <= 0) return { ok: false, error: 'El monto debe ser mayor que cero.' };
  if (!esMetodoPagoProveedor(p.metodo)) return { ok: false, error: 'Elige la forma de pago.' };
  const r = await pagarOrden({
    id: p.id,
    ordenId: p.ordenId,
    monto: Math.round(monto * 100) / 100,
    fecha: /^\d{4}-\d{2}-\d{2}$/.test(p.fecha ?? '') ? fechaInputAMs(p.fecha) : Date.now(),
    metodo: p.metodo,
    referencia: texto(p.referencia, 200),
    notas: texto(p.notas, 500),
  });
  if (r.ok) {
    const orden = await getOrden(p.ordenId);
    revalidarCompras();
    if (orden) revalidarObra(orden.obra_id);
  }
  return r;
}

export async function anularPagoAction(pagoId: string, ordenId: string): Promise<ActionResult> {
  const off = await apagado();
  if (off) return off;
  if (!esUuid(pagoId)) return { ok: false, error: 'Pago no encontrado.' };
  const r = await anularPago(pagoId);
  if (r.ok) {
    revalidarCompras();
    const orden = esUuid(ordenId) ? await getOrden(ordenId) : null;
    if (orden) revalidarObra(orden.obra_id);
  }
  return r;
}

// ════════════════════════════════════════════════════════════════════════════
// Factura del proveedor (CFDI 4.0)
// ════════════════════════════════════════════════════════════════════════════

/**
 * Sube el XML de la factura del proveedor y la liga a la orden. Se reusa el
 * lector de F1b (`lib/fiscal/cfdi.ts`): sin DOCTYPE, solo 4.0 timbrado.
 *
 *   · El emisor tiene que ser el proveedor: si el proveedor ya tiene RFC y no
 *     coincide, se RECHAZA (es la factura de otro); si no tiene, se le pone.
 *   · Receptor distinto del RFC de la empresa o total que no cuadra con la
 *     orden: solo AVISAN (ajustes reales: fletes, redondeos).
 *   · El folio fiscal no puede estar en otra orden (lo hace la base).
 */
export async function subirFacturaXmlAction(ordenId: string, fd: FormData): Promise<ActionResult> {
  const off = (await apagado()) ?? (await ordenValida(ordenId));
  if (off) return off;
  const archivo = fd.get('xml');
  if (!(archivo instanceof File) || archivo.size === 0) return { ok: false, error: 'Elige el XML de la factura.' };
  if (archivo.size > 900 * 1024) return { ok: false, error: 'El XML pasa de 900 KB; no parece una factura.' };
  const xml = await archivo.text();
  const leido = leerCfdi(xml);
  if (!leido.ok) return { ok: false, error: leido.error };
  const cfdi = leido.cfdi;
  if (cfdi.tipo !== 'I') return { ok: false, error: 'Ese XML no es una factura de ingreso (tipo I) del proveedor.' };

  const orden = await getOrden(ordenId);
  if (!orden) return { ok: false, error: 'Orden no encontrada.' };
  if (orden.estado === 'BORRADOR' || orden.estado === 'CANCELADA') {
    return { ok: false, error: 'La factura se liga a una orden emitida.' };
  }
  const { data: proveedores } = await listProveedores();
  const prov = proveedores.find((p) => p.id === orden.proveedor_id);
  const avisos: string[] = [];
  if (prov?.rfc && prov.rfc.toUpperCase() !== cfdi.emisor.rfc) {
    return {
      ok: false,
      error: `La factura la emitió ${cfdi.emisor.nombre || cfdi.emisor.rfc} (${cfdi.emisor.rfc}), no ${prov.nombre} (${prov.rfc}).`,
    };
  }
  if (prov && !prov.rfc && validarRfc(cfdi.emisor.rfc, { permitirGenerico: false }).ok) {
    const r = await guardarProveedor(prov.id, { ...prov, rfc: cfdi.emisor.rfc });
    if (r.ok) avisos.push(`Se guardó el RFC ${cfdi.emisor.rfc} en el proveedor.`);
  }
  const total = Number(orden.total ?? 0);
  if (Math.abs(cfdi.total - total) > 1) {
    avisos.push(`La factura es por ${cfdi.total.toFixed(2)} y la orden por ${total.toFixed(2)}. Revisa si hubo cambios.`);
  }

  const emp = await empresaId();
  if (!emp) return { ok: false, error: 'No hay sesión activa.' };
  const supabase = await createClient();
  const ruta = `${emp}/facturas/${ordenId}/${cfdi.uuid}.xml`;
  const { error: upErr } = await supabase.storage
    .from(BUCKET_COMPRAS)
    .upload(ruta, new Blob([xml], { type: 'application/xml' }), { upsert: true, contentType: 'application/xml' });
  if (upErr) return { ok: false, error: `No se pudo guardar el XML: ${upErr.message}` };

  const r = await ligarFactura({
    ordenId,
    uuid: cfdi.uuid,
    rfc: cfdi.emisor.rfc || null,
    total: cfdi.total,
    iva: cfdi.ivaTrasladado,
    fecha: fechaCfdiAMs(cfdi.fecha),
    xmlPath: ruta,
    pdfPath: orden.factura_pdf_path,
    resumen: {
      emisor: cfdi.emisor.nombre,
      conceptos: cfdi.conceptos.slice(0, 200).map((c) => ({
        descripcion: c.descripcion.slice(0, 300),
        cantidad: c.cantidad,
        clave: c.claveProdServ,
        unidad: c.claveUnidad,
        importe: c.importe,
      })),
    },
  });
  if (!r.ok) {
    if (orden.factura_xml_path !== ruta) await supabase.storage.from(BUCKET_COMPRAS).remove([ruta]);
    return r;
  }
  if (orden.factura_xml_path && orden.factura_xml_path !== ruta) {
    await supabase.storage.from(BUCKET_COMPRAS).remove([orden.factura_xml_path]);
  }
  revalidarCompras(['/admin/facturacion']);
  return { ok: true, avisos };
}

export async function crearUrlSubidaFacturaPdf(ordenId: string, fileSize: number): Promise<UrlSubida> {
  const off = (await apagado()) ?? (await ordenValida(ordenId));
  if (off) return off;
  if (!fileSize) return { ok: false, error: 'Elige el PDF.' };
  if (fileSize > 5 * 1024 * 1024) return { ok: false, error: 'El PDF pasa de 5 MB.' };
  const emp = await empresaId();
  if (!emp) return { ok: false, error: 'No hay sesión activa.' };
  const supabase = await createClient();
  const path = `${emp}/facturas/${ordenId}/${crypto.randomUUID()}.pdf`;
  const { data, error } = await supabase.storage.from(BUCKET_COMPRAS).createSignedUploadUrl(path);
  if (error || !data) return { ok: false, error: `No se pudo preparar la subida: ${error?.message ?? 'desconocido'}` };
  return { ok: true, path: data.path, token: data.token };
}

export async function registrarFacturaPdfAction(ordenId: string, path: string): Promise<ActionResult> {
  const off = (await apagado()) ?? (await ordenValida(ordenId));
  if (off) return off;
  const emp = await empresaId();
  if (!emp || !path.startsWith(`${emp}/facturas/${ordenId}/`)) return { ok: false, error: 'Ruta de archivo inválida.' };
  const orden = await getOrden(ordenId);
  if (!orden?.factura_uuid) {
    return { ok: false, error: 'Primero sube el XML: el PDF acompaña a la factura, el XML es el que vale.' };
  }
  const r = await ligarFactura({
    ordenId,
    uuid: orden.factura_uuid,
    rfc: orden.factura_rfc,
    total: orden.factura_total,
    iva: orden.factura_iva,
    fecha: orden.factura_fecha,
    xmlPath: orden.factura_xml_path,
    pdfPath: path,
    resumen: (orden.factura_resumen as never) ?? null,
  });
  const supabase = await createClient();
  if (!r.ok) {
    await supabase.storage.from(BUCKET_COMPRAS).remove([path]);
    return r;
  }
  if (orden.factura_pdf_path && orden.factura_pdf_path !== path) {
    await supabase.storage.from(BUCKET_COMPRAS).remove([orden.factura_pdf_path]);
  }
  revalidarCompras();
  return { ok: true };
}

export async function quitarFacturaAction(ordenId: string): Promise<ActionResult> {
  const off = (await apagado()) ?? (await ordenValida(ordenId));
  if (off) return off;
  const orden = await getOrden(ordenId);
  if (!orden) return { ok: false, error: 'Orden no encontrada.' };
  const r = await ligarFactura({
    ordenId,
    uuid: null,
    rfc: null,
    total: null,
    iva: null,
    fecha: null,
    xmlPath: null,
    pdfPath: null,
    resumen: null,
  });
  if (!r.ok) return r;
  const quitar = [orden.factura_xml_path, orden.factura_pdf_path].filter((x): x is string => !!x);
  if (quitar.length) {
    const supabase = await createClient();
    await supabase.storage.from(BUCKET_COMPRAS).remove(quitar);
  }
  revalidarCompras(['/admin/facturacion']);
  return { ok: true };
}

// ════════════════════════════════════════════════════════════════════════════
// Existencias (RF2.7)
// ════════════════════════════════════════════════════════════════════════════

const TIPOS_MOV: TipoMovimientoMaterial[] = ['CONSUMO', 'TRASPASO', 'AJUSTE'];

export async function registrarMovimientoMaterialAction(obraId: string, fd: FormData): Promise<ActionResult> {
  const off = await apagado();
  if (off) return off;
  if (!esUuid(obraId)) return { ok: false, error: 'Obra no encontrada.' };
  const tipo = String(fd.get('tipo') ?? '') as TipoMovimientoMaterial;
  if (!TIPOS_MOV.includes(tipo)) return { ok: false, error: 'Elige qué pasó con el material.' };
  const materialId = String(fd.get('material_id') ?? '');
  if (!esUuid(materialId)) return { ok: false, error: 'Elige el material.' };
  let cantidad = numero(fd.get('cantidad'));
  if (!Number.isFinite(cantidad) || cantidad === 0 || Math.abs(cantidad) >= 1e9) {
    return { ok: false, error: 'La cantidad no es válida.' };
  }
  if (tipo !== 'AJUSTE') {
    if (cantidad < 0) return { ok: false, error: 'La cantidad debe ser mayor que cero.' };
  } else if (String(fd.get('signo') ?? '') === 'menos') {
    cantidad = -Math.abs(cantidad);
  }
  const destino = String(fd.get('obra_destino_id') ?? '');
  if (tipo === 'TRASPASO' && (!esUuid(destino) || destino === obraId)) {
    return { ok: false, error: 'Elige a qué otra obra se mandó.' };
  }
  const { data: materiales } = await listMateriales();
  if (!materiales.some((m) => m.id === materialId)) return { ok: false, error: 'Material no encontrado.' };
  const fechaStr = String(fd.get('fecha') ?? '');
  const r = await registrarMovimientoMaterial({
    obraId,
    materialId,
    tipo,
    cantidad,
    obraDestinoId: tipo === 'TRASPASO' ? destino : null,
    fecha: /^\d{4}-\d{2}-\d{2}$/.test(fechaStr) ? fechaInputAMs(fechaStr) : Date.now(),
    notas: texto(fd.get('notas'), 500),
  });
  if (r.ok) {
    revalidarObra(obraId);
    if (tipo === 'TRASPASO') revalidarObra(destino);
  }
  return r;
}

export async function eliminarMovimientoMaterialAction(obraId: string, id: string): Promise<ActionResult> {
  const off = await apagado();
  if (off) return off;
  if (!esUuid(id) || !esUuid(obraId)) return { ok: false, error: 'Movimiento no encontrado.' };
  const r = await eliminarMovimientoMaterial(id);
  if (r.ok) revalidarObra(obraId);
  return r;
}
