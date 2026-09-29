import { createClient } from '@/lib/supabase/server';
import { getEmpresaUsuario } from './empresa';
import type {
  EstadoOrden,
  EstadoRequisicion,
  Material,
  MovimientoMaterial,
  OrdenCompra,
  OrdenConRenglones,
  PagoProveedor,
  Proveedor,
  RecepcionConRenglones,
  RenglonOrden,
  RenglonRecibido,
  RenglonRequisicion,
  Requisicion,
  RequisicionConRenglones,
  ResumenFactura,
  TipoMovimientoMaterial,
} from '@/lib/compras/tipos';
import { calcularExistencias, saldoOrden, type Existencia } from '@/lib/compras/calculo';

/**
 * Acceso a COMPRAS Y MATERIAL (migración 0038). Las cuentas viven en
 * `lib/compras/calculo.ts`; aquí solo se lee y se escribe.
 *
 * Quién puede qué lo deciden las policies, los triggers y las RPC de 0038
 * (supervisor pide y recibe, admin aprueba y compra, contador paga). Este
 * código no repite esas reglas: si alguien sin permiso llega, la base lo
 * rechaza y aquí solo se traduce el mensaje.
 *
 * Si 0038 todavía no está aplicada, las lecturas regresan vacío con
 * `error = SIN_MIGRACION` en vez de reventar (mismo criterio que F0-9).
 */

export interface Resultado {
  ok: boolean;
  error?: string;
}

export const BUCKET_COMPRAS = 'compras';
export const MAX_BYTES_ARCHIVO = 10 * 1024 * 1024;
export const TIPOS_REMISION = ['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'application/pdf'];
export const SIN_MIGRACION = 'Las compras todavía no están listas en la base de datos (falta la migración 0038).';

const C_PROVEEDOR = 'id, empresa_id, nombre, rfc, contacto, telefono, correo, dias_credito, notas, deleted_at';
const C_MATERIAL =
  'id, empresa_id, nombre, unidad, ultimo_precio, proveedor_id, clave_sat, unidad_sat, notas, deleted_at';
const C_REQ =
  'id, empresa_id, obra_id, folio, estado, para_cuando, notas, pedido_por, pedido_por_nombre, decidido_at, motivo_rechazo, created_at, deleted_at';
const C_REQ_R = 'id, requisicion_id, material_id, descripcion, unidad, cantidad, notas, orden';
const C_OC =
  'id, empresa_id, obra_id, proveedor_id, folio, fecha, estado, iva_pct, condiciones, dias_credito, fecha_entrega, notas, texto_final, subtotal, iva, total, emitida_at, cancelada_at, factura_uuid, factura_rfc, factura_total, factura_iva, factura_fecha, factura_xml_path, factura_pdf_path, factura_resumen, created_at, deleted_at';
const C_OC_R = 'id, orden_compra_id, requisicion_renglon_id, material_id, descripcion, unidad, cantidad, precio_unitario, orden';
const C_REC = 'id, orden_compra_id, obra_id, fecha, remision_uri, notas, recibido_por_nombre, deleted_at';
const C_REC_R = 'id, recepcion_id, orden_compra_renglon_id, cantidad_recibida, notas';
const C_PAGO = 'id, orden_compra_id, proveedor_id, monto, fecha, metodo_pago, referencia, notas, movimiento_id, deleted_at';
const C_MOV_MAT = 'id, obra_id, material_id, tipo, cantidad, obra_destino_id, fecha, notas, deleted_at';

/** ¿El error es porque la tabla/función de 0038 no existe todavía? */
export function faltaMigracion(e: { code?: string; message?: string } | null | undefined): boolean {
  if (!e) return false;
  return (
    e.code === '42P01' ||
    e.code === 'PGRST205' ||
    e.code === 'PGRST202' ||
    /does not exist|Could not find the (table|function)/i.test(e.message ?? '')
  );
}

/** Mensajes de la base → lenguaje de obra. Los de los triggers ya vienen en español. */
export function traducirError(e: { code?: string; message?: string } | null | undefined, porDefecto: string): string {
  if (!e) return porDefecto;
  if (faltaMigracion(e)) return SIN_MIGRACION;
  const m = e.message ?? '';
  if (/row-level security/i.test(m)) return 'No tienes permiso para hacer esto.';
  if (/uq_proveedores_rfc/.test(m)) return 'Ya hay un proveedor con ese RFC.';
  if (/proveedores_rfc/.test(m)) return 'El RFC no tiene el formato correcto (12 o 13 caracteres).';
  if (/clave_sat_formato/.test(m)) return 'La clave SAT son 8 dígitos.';
  if (/unidad_sat_formato/.test(m)) return 'La clave de unidad SAT son hasta 3 letras o números (por ejemplo, H87).';
  if (/uq_ordenes_compra_factura/.test(m)) return 'Esa factura ya está ligada a otra orden de compra.';
  if (/rechazo_con_motivo/.test(m)) return 'Escribe por qué se rechaza.';
  if (/check constraint/i.test(m)) return 'Algún dato no es válido. Revisa cantidades, precios y textos.';
  if (/duplicate key/i.test(m)) return 'Esto ya se había guardado.';
  // Mensajes de `raise exception` de 0038: ya están en español y son para el usuario.
  if (/^[A-ZÁÉÍÓÚÑ¿][^{}]*\.?$/.test(m) && m.length < 300) return m;
  return porDefecto;
}

function deRpc(data: unknown, error: { code?: string; message?: string } | null, porDefecto: string) {
  if (error) return { ok: false as const, error: traducirError(error, porDefecto) };
  const r = data as { ok?: boolean; error?: string } & Record<string, unknown>;
  if (!r?.ok) return { ok: false as const, error: r?.error ?? porDefecto };
  return { ok: true as const, data: r };
}

async function empresa(): Promise<{ empresaId: string; rol: string } | { error: string }> {
  try {
    return await getEmpresaUsuario();
  } catch (e) {
    return { error: e instanceof Error ? e.message : 'Error de autenticación.' };
  }
}

function agrupar<T, K extends keyof T>(filas: T[], llave: K): Map<string, T[]> {
  const m = new Map<string, T[]>();
  for (const f of filas) {
    const k = String(f[llave]);
    const l = m.get(k);
    if (l) l.push(f);
    else m.set(k, [f]);
  }
  return m;
}

// ════════════════════════════════════════════════════════════════════════════
// Proveedores y materiales
// ════════════════════════════════════════════════════════════════════════════

export async function listProveedores(): Promise<{ data: Proveedor[]; error: string | null }> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('proveedores')
    .select(C_PROVEEDOR)
    .is('deleted_at', null)
    .order('nombre');
  if (error) return { data: [], error: traducirError(error, 'No se pudieron leer los proveedores.') };
  return { data: (data ?? []) as Proveedor[], error: null };
}

export interface ProveedorInput {
  nombre: string;
  rfc: string | null;
  contacto: string;
  telefono: string;
  correo: string;
  dias_credito: number;
  notas: string;
}

export async function guardarProveedor(id: string | null, input: ProveedorInput): Promise<Resultado & { id?: string }> {
  const e = await empresa();
  if ('error' in e) return { ok: false, error: e.error };
  const supabase = await createClient();
  const now = Date.now();
  if (id) {
    const { data, error } = await supabase
      .from('proveedores')
      .update({ ...input, updated_at: now })
      .eq('id', id)
      .select('id');
    if (error) return { ok: false, error: traducirError(error, 'No se pudo guardar el proveedor.') };
    if (!data?.length) return { ok: false, error: 'No tienes permiso para cambiar proveedores.' };
    return { ok: true, id };
  }
  const nuevo = crypto.randomUUID();
  const { error } = await supabase
    .from('proveedores')
    .insert({ id: nuevo, empresa_id: e.empresaId, ...input, created_at: now, updated_at: now });
  if (error) return { ok: false, error: traducirError(error, 'No se pudo dar de alta el proveedor.') };
  return { ok: true, id: nuevo };
}

export async function eliminarProveedor(id: string): Promise<Resultado> {
  const supabase = await createClient();
  const now = Date.now();
  const { data, error } = await supabase
    .from('proveedores')
    .update({ deleted_at: now, updated_at: now })
    .eq('id', id)
    .select('id');
  if (error) return { ok: false, error: traducirError(error, 'No se pudo quitar el proveedor.') };
  if (!data?.length) return { ok: false, error: 'No tienes permiso para quitar proveedores.' };
  return { ok: true };
}

export async function listMateriales(): Promise<{ data: Material[]; error: string | null }> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('materiales')
    .select(C_MATERIAL)
    .is('deleted_at', null)
    .order('nombre');
  if (error) return { data: [], error: traducirError(error, 'No se pudo leer el catálogo de materiales.') };
  return { data: (data ?? []) as Material[], error: null };
}

export interface MaterialInput {
  nombre: string;
  unidad: string;
  ultimo_precio: number | null;
  proveedor_id: string | null;
  clave_sat: string | null;
  unidad_sat: string | null;
  notas: string;
}

export async function guardarMaterial(id: string | null, input: MaterialInput): Promise<Resultado & { id?: string }> {
  const e = await empresa();
  if ('error' in e) return { ok: false, error: e.error };
  const supabase = await createClient();
  const now = Date.now();
  if (id) {
    const { data, error } = await supabase
      .from('materiales')
      .update({ ...input, updated_at: now })
      .eq('id', id)
      .select('id');
    if (error) return { ok: false, error: traducirError(error, 'No se pudo guardar el material.') };
    if (!data?.length) return { ok: false, error: 'Solo el administrador cambia el catálogo de materiales.' };
    return { ok: true, id };
  }
  const nuevo = crypto.randomUUID();
  const { error } = await supabase
    .from('materiales')
    .insert({ id: nuevo, empresa_id: e.empresaId, ...input, created_at: now, updated_at: now });
  if (error) return { ok: false, error: traducirError(error, 'No se pudo dar de alta el material.') };
  return { ok: true, id: nuevo };
}

export async function eliminarMaterial(id: string): Promise<Resultado> {
  const supabase = await createClient();
  const now = Date.now();
  const { data, error } = await supabase
    .from('materiales')
    .update({ deleted_at: now, updated_at: now })
    .eq('id', id)
    .select('id');
  if (error) return { ok: false, error: traducirError(error, 'No se pudo quitar el material.') };
  if (!data?.length) return { ok: false, error: 'Solo el administrador cambia el catálogo de materiales.' };
  return { ok: true };
}

// ════════════════════════════════════════════════════════════════════════════
// Requisiciones
// ════════════════════════════════════════════════════════════════════════════

export async function listRequisiciones(filtro: {
  obraId?: string;
  estados?: EstadoRequisicion[];
  limite?: number;
} = {}): Promise<{ data: RequisicionConRenglones[]; error: string | null }> {
  const supabase = await createClient();
  let q = supabase.from('requisiciones').select(C_REQ).is('deleted_at', null);
  if (filtro.obraId) q = q.eq('obra_id', filtro.obraId);
  if (filtro.estados?.length) q = q.in('estado', filtro.estados);
  const { data, error } = await q.order('folio', { ascending: false }).limit(filtro.limite ?? 200);
  if (error) return { data: [], error: traducirError(error, 'No se pudieron leer las requisiciones.') };
  const reqs = (data ?? []) as Requisicion[];
  if (reqs.length === 0) return { data: [], error: null };

  const { data: rr, error: errR } = await supabase
    .from('requisicion_renglon')
    .select(C_REQ_R)
    .in('requisicion_id', reqs.map((r) => r.id))
    .is('deleted_at', null)
    .order('orden');
  if (errR) return { data: [], error: traducirError(errR, 'No se pudieron leer las requisiciones.') };
  const por = agrupar((rr ?? []) as RenglonRequisicion[], 'requisicion_id');
  return { data: reqs.map((r) => ({ ...r, renglones: por.get(r.id) ?? [] })), error: null };
}

export async function getRequisicion(id: string): Promise<RequisicionConRenglones | null> {
  const supabase = await createClient();
  const { data } = await supabase.from('requisiciones').select(C_REQ).eq('id', id).is('deleted_at', null).maybeSingle();
  if (!data) return null;
  const { data: rr } = await supabase
    .from('requisicion_renglon')
    .select(C_REQ_R)
    .eq('requisicion_id', id)
    .is('deleted_at', null)
    .order('orden');
  return { ...(data as Requisicion), renglones: (rr ?? []) as RenglonRequisicion[] };
}

export interface RenglonRequisicionInput {
  material_id: string | null;
  descripcion: string;
  unidad: string;
  cantidad: number;
  notas: string;
}

/**
 * Alta de una requisición con sus renglones. `id` lo genera el navegador: si el
 * mismo envío llega dos veces (doble clic, señal intermitente), la llave
 * repetida (23505) se da por buena y no se duplica.
 */
export async function crearRequisicion(p: {
  id: string;
  obraId: string;
  paraCuando: number | null;
  notas: string;
  renglones: RenglonRequisicionInput[];
}): Promise<Resultado & { id?: string }> {
  const e = await empresa();
  if ('error' in e) return { ok: false, error: e.error };
  const supabase = await createClient();
  const now = Date.now();
  const { error } = await supabase.from('requisiciones').insert({
    id: p.id,
    empresa_id: e.empresaId,
    obra_id: p.obraId,
    para_cuando: p.paraCuando,
    notas: p.notas,
    created_at: now,
    updated_at: now,
  });
  if (error) {
    if (error.code === '23505') return { ok: true, id: p.id };
    return { ok: false, error: traducirError(error, 'No se pudo guardar la requisición.') };
  }
  const { error: errR } = await supabase.from('requisicion_renglon').insert(
    p.renglones.map((r, i) => ({
      id: crypto.randomUUID(),
      empresa_id: e.empresaId,
      requisicion_id: p.id,
      ...r,
      orden: (i + 1) * 100,
      created_at: now,
      updated_at: now,
    })),
  );
  if (errR) {
    // Sin renglones la requisición no sirve: se borra (lógico) para no dejar una vacía.
    await supabase.from('requisiciones').update({ deleted_at: now, updated_at: now }).eq('id', p.id);
    return { ok: false, error: traducirError(errR, 'No se pudieron guardar los materiales pedidos.') };
  }
  return { ok: true, id: p.id };
}

/** Aprobar o rechazar (solo admin: lo exige la RLS). */
export async function decidirRequisicion(id: string, aprobar: boolean, motivo: string): Promise<Resultado> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('requisiciones')
    .update({
      estado: aprobar ? 'APROBADA' : 'RECHAZADA',
      motivo_rechazo: aprobar ? null : motivo,
      updated_at: Date.now(),
    })
    .eq('id', id)
    .eq('estado', 'PENDIENTE')
    .select('id');
  if (error) return { ok: false, error: traducirError(error, 'No se pudo guardar la decisión.') };
  if (!data?.length) return { ok: false, error: 'Esta requisición ya se había decidido, o no tienes permiso.' };
  return { ok: true };
}

/** Borrado lógico (por aprobar: quien la pidió o el admin; aprobada sin comprar: el admin). */
export async function eliminarRequisicion(id: string): Promise<Resultado> {
  const supabase = await createClient();
  const now = Date.now();
  const { data, error } = await supabase
    .from('requisiciones')
    .update({ deleted_at: now, updated_at: now })
    .eq('id', id)
    .select('id');
  if (error) return { ok: false, error: traducirError(error, 'No se pudo borrar la requisición.') };
  if (!data?.length) return { ok: false, error: 'No puedes borrar esta requisición.' };
  return { ok: true };
}

// ════════════════════════════════════════════════════════════════════════════
// Órdenes de compra
// ════════════════════════════════════════════════════════════════════════════

export async function listOrdenes(filtro: {
  obraId?: string;
  estados?: EstadoOrden[];
  ids?: string[];
  limite?: number;
} = {}): Promise<{ data: OrdenConRenglones[]; error: string | null }> {
  const supabase = await createClient();
  let q = supabase.from('ordenes_compra').select(C_OC).is('deleted_at', null);
  if (filtro.obraId) q = q.eq('obra_id', filtro.obraId);
  if (filtro.estados?.length) q = q.in('estado', filtro.estados);
  if (filtro.ids) q = q.in('id', filtro.ids.length ? filtro.ids : ['00000000-0000-0000-0000-000000000000']);
  const { data, error } = await q.order('folio', { ascending: false }).limit(filtro.limite ?? 300);
  if (error) return { data: [], error: traducirError(error, 'No se pudieron leer las órdenes de compra.') };
  const ordenes = (data ?? []) as OrdenCompra[];
  if (ordenes.length === 0) return { data: [], error: null };
  const { data: rr, error: errR } = await supabase
    .from('orden_compra_renglon')
    .select(C_OC_R)
    .in('orden_compra_id', ordenes.map((o) => o.id))
    .is('deleted_at', null)
    .order('orden');
  if (errR) return { data: [], error: traducirError(errR, 'No se pudieron leer las órdenes de compra.') };
  const por = agrupar((rr ?? []) as RenglonOrden[], 'orden_compra_id');
  return { data: ordenes.map((o) => ({ ...o, renglones: por.get(o.id) ?? [] })), error: null };
}

export async function getOrden(id: string): Promise<OrdenConRenglones | null> {
  const { data } = await listOrdenes({ ids: [id], limite: 1 });
  return data[0] ?? null;
}

/** Renglones de órdenes NO canceladas que salen de requisiciones (para "por comprar"). */
export async function listOrdenadoDeRequisiciones(
  renglonIds: string[],
): Promise<{ requisicion_renglon_id: string | null; cantidad: number }[]> {
  if (renglonIds.length === 0) return [];
  const supabase = await createClient();
  const { data } = await supabase
    .from('orden_compra_renglon')
    .select('requisicion_renglon_id, cantidad, orden_compra_id, ordenes_compra!inner(estado, deleted_at)')
    .in('requisicion_renglon_id', renglonIds)
    .is('deleted_at', null)
    .neq('ordenes_compra.estado', 'CANCELADA')
    .is('ordenes_compra.deleted_at', null);
  return ((data ?? []) as { requisicion_renglon_id: string | null; cantidad: number }[]).map((r) => ({
    requisicion_renglon_id: r.requisicion_renglon_id,
    cantidad: Number(r.cantidad),
  }));
}

export interface OrdenNuevaInput {
  obraId: string;
  proveedorId: string;
  ivaPct: number;
  diasCredito: number;
  condiciones: string;
  renglones: {
    requisicion_renglon_id: string | null;
    material_id: string | null;
    descripcion: string;
    unidad: string;
    cantidad: number;
    precio_unitario: number;
  }[];
}

/** Crea órdenes en BORRADOR (una por obra+proveedor, ya agrupadas por quien llama). */
export async function crearOrdenes(ordenes: OrdenNuevaInput[]): Promise<Resultado & { ids?: string[] }> {
  const e = await empresa();
  if ('error' in e) return { ok: false, error: e.error };
  const supabase = await createClient();
  const now = Date.now();
  const ids: string[] = [];
  for (const o of ordenes) {
    const id = crypto.randomUUID();
    const { error } = await supabase.from('ordenes_compra').insert({
      id,
      empresa_id: e.empresaId,
      obra_id: o.obraId,
      proveedor_id: o.proveedorId,
      iva_pct: o.ivaPct,
      dias_credito: o.diasCredito,
      condiciones: o.condiciones,
      fecha: now,
      created_at: now,
      updated_at: now,
    });
    if (error) {
      return { ok: false, ids, error: traducirError(error, 'No se pudo crear la orden de compra.') };
    }
    ids.push(id);
    if (o.renglones.length) {
      const { error: errR } = await supabase.from('orden_compra_renglon').insert(
        o.renglones.map((r, i) => ({
          id: crypto.randomUUID(),
          empresa_id: e.empresaId,
          orden_compra_id: id,
          ...r,
          orden: (i + 1) * 100,
          created_at: now,
          updated_at: now,
        })),
      );
      if (errR) {
        // La orden sin sus renglones confundiría: se borra el borrador.
        await supabase.from('ordenes_compra').update({ deleted_at: now, updated_at: now }).eq('id', id);
        ids.pop();
        return { ok: false, ids, error: traducirError(errR, 'No se pudieron agregar los materiales a la orden.') };
      }
    }
  }
  return { ok: true, ids };
}

export interface OrdenDatosInput {
  proveedor_id: string;
  iva_pct: number;
  dias_credito: number;
  condiciones: string;
  fecha_entrega: number | null;
  notas: string;
}

export async function actualizarOrden(id: string, input: OrdenDatosInput): Promise<Resultado> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('ordenes_compra')
    .update({ ...input, updated_at: Date.now() })
    .eq('id', id)
    .select('id');
  if (error) return { ok: false, error: traducirError(error, 'No se pudo guardar la orden.') };
  if (!data?.length) return { ok: false, error: 'Solo se editan las órdenes en borrador (y solo el administrador).' };
  return { ok: true };
}

export async function eliminarOrdenBorrador(id: string): Promise<Resultado> {
  const supabase = await createClient();
  const now = Date.now();
  const { data, error } = await supabase
    .from('ordenes_compra')
    .update({ deleted_at: now, updated_at: now })
    .eq('id', id)
    .select('id');
  if (error) return { ok: false, error: traducirError(error, 'No se pudo borrar la orden.') };
  if (!data?.length) return { ok: false, error: 'Solo se borran borradores; una orden emitida se cancela.' };
  return { ok: true };
}

export interface RenglonOrdenInput {
  material_id: string | null;
  descripcion: string;
  unidad: string;
  cantidad: number;
  precio_unitario: number;
}

export async function agregarRenglonOrden(ordenId: string, r: RenglonOrdenInput, orden: number): Promise<Resultado> {
  const e = await empresa();
  if ('error' in e) return { ok: false, error: e.error };
  const supabase = await createClient();
  const now = Date.now();
  const { error } = await supabase.from('orden_compra_renglon').insert({
    id: crypto.randomUUID(),
    empresa_id: e.empresaId,
    orden_compra_id: ordenId,
    ...r,
    orden,
    created_at: now,
    updated_at: now,
  });
  if (error) return { ok: false, error: traducirError(error, 'No se pudo agregar el renglón.') };
  return { ok: true };
}

export async function actualizarRenglonOrden(ordenId: string, renglonId: string, r: RenglonOrdenInput): Promise<Resultado> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('orden_compra_renglon')
    .update({ ...r, updated_at: Date.now() })
    .eq('id', renglonId)
    .eq('orden_compra_id', ordenId)
    .select('id');
  if (error) return { ok: false, error: traducirError(error, 'No se pudo guardar el renglón.') };
  if (!data?.length) return { ok: false, error: 'Renglón no encontrado.' };
  return { ok: true };
}

export async function eliminarRenglonOrden(ordenId: string, renglonId: string): Promise<Resultado> {
  const supabase = await createClient();
  const now = Date.now();
  const { data, error } = await supabase
    .from('orden_compra_renglon')
    .update({ deleted_at: now, updated_at: now })
    .eq('id', renglonId)
    .eq('orden_compra_id', ordenId)
    .select('id');
  if (error) return { ok: false, error: traducirError(error, 'No se pudo quitar el renglón.') };
  if (!data?.length) return { ok: false, error: 'Renglón no encontrado.' };
  return { ok: true };
}

export async function emitirOrden(id: string): Promise<Resultado> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc('emitir_orden_compra', { p_id: id });
  const r = deRpc(data, error, 'No se pudo emitir la orden.');
  return r.ok ? { ok: true } : r;
}

export async function cancelarOrden(id: string): Promise<Resultado> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc('cancelar_orden_compra', { p_id: id });
  const r = deRpc(data, error, 'No se pudo cancelar la orden.');
  return r.ok ? { ok: true } : r;
}

// ════════════════════════════════════════════════════════════════════════════
// Recepciones
// ════════════════════════════════════════════════════════════════════════════

export async function listRecepciones(ordenIds: string[]): Promise<RecepcionConRenglones[]> {
  if (ordenIds.length === 0) return [];
  const supabase = await createClient();
  const { data } = await supabase
    .from('recepciones')
    .select(C_REC)
    .in('orden_compra_id', ordenIds)
    .is('deleted_at', null)
    .order('fecha', { ascending: true });
  const recs = (data ?? []) as RecepcionConRenglones[];
  if (recs.length === 0) return [];
  const { data: rr } = await supabase
    .from('recepcion_renglon')
    .select(C_REC_R)
    .in('recepcion_id', recs.map((r) => r.id))
    .is('deleted_at', null);
  const por = agrupar((rr ?? []) as RenglonRecibido[], 'recepcion_id');
  return recs.map((r) => ({ ...r, renglones: por.get(r.id) ?? [] }));
}

export async function registrarRecepcion(p: {
  id: string;
  ordenId: string;
  fecha: number;
  notas: string;
  lineas: { renglonId: string; cantidad: number; notas: string }[];
}): Promise<Resultado> {
  const e = await empresa();
  if ('error' in e) return { ok: false, error: e.error };
  const supabase = await createClient();
  const now = Date.now();
  const orden = await getOrden(p.ordenId);
  if (!orden) return { ok: false, error: 'Orden de compra no encontrada.' };
  const { error } = await supabase.from('recepciones').insert({
    id: p.id,
    empresa_id: e.empresaId,
    orden_compra_id: p.ordenId,
    obra_id: orden.obra_id, // la base la vuelve a copiar de la orden
    fecha: p.fecha,
    notas: p.notas,
    created_at: now,
    updated_at: now,
  });
  if (error) {
    if (error.code === '23505') return { ok: true };
    return { ok: false, error: traducirError(error, 'No se pudo registrar la entrega.') };
  }
  const lineas = p.lineas.filter((l) => l.cantidad > 0);
  if (lineas.length) {
    const { error: errR } = await supabase.from('recepcion_renglon').insert(
      lineas.map((l) => ({
        id: crypto.randomUUID(),
        empresa_id: e.empresaId,
        recepcion_id: p.id,
        orden_compra_renglon_id: l.renglonId,
        cantidad_recibida: l.cantidad,
        notas: l.notas,
        created_at: now,
        updated_at: now,
      })),
    );
    if (errR) {
      await supabase.from('recepciones').update({ deleted_at: now, updated_at: now }).eq('id', p.id);
      return { ok: false, error: traducirError(errR, 'No se pudo registrar lo recibido.') };
    }
  }
  return { ok: true };
}

export async function fijarRemision(recepcionId: string, uri: string | null): Promise<Resultado> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('recepciones')
    .update({ remision_uri: uri, updated_at: Date.now() })
    .eq('id', recepcionId)
    .select('id');
  if (error) return { ok: false, error: traducirError(error, 'No se pudo guardar la foto de la remisión.') };
  if (!data?.length) return { ok: false, error: 'Recepción no encontrada.' };
  return { ok: true };
}

export async function eliminarRecepcion(id: string): Promise<Resultado> {
  const supabase = await createClient();
  const now = Date.now();
  const { data, error } = await supabase
    .from('recepciones')
    .update({ deleted_at: now, updated_at: now })
    .eq('id', id)
    .select('id');
  if (error) return { ok: false, error: traducirError(error, 'Solo el administrador borra una entrega.') };
  if (!data?.length) return { ok: false, error: 'Recepción no encontrada.' };
  return { ok: true };
}

export async function getRecepcion(id: string): Promise<RecepcionConRenglones | null> {
  const supabase = await createClient();
  const { data } = await supabase.from('recepciones').select(C_REC).eq('id', id).maybeSingle();
  if (!data) return null;
  return { ...(data as RecepcionConRenglones), renglones: [] };
}

// ════════════════════════════════════════════════════════════════════════════
// Pagos a proveedor
// ════════════════════════════════════════════════════════════════════════════

/** Pagos vivos de estas órdenes. El supervisor no los ve (RLS): regresa []. */
export async function listPagos(ordenIds?: string[]): Promise<PagoProveedor[]> {
  const supabase = await createClient();
  let q = supabase.from('pagos_proveedor').select(C_PAGO).is('deleted_at', null);
  if (ordenIds) {
    if (ordenIds.length === 0) return [];
    q = q.in('orden_compra_id', ordenIds);
  }
  const { data } = await q.order('fecha');
  return (data ?? []) as PagoProveedor[];
}

export async function pagarOrden(p: {
  id: string;
  ordenId: string;
  monto: number;
  fecha: number;
  metodo: string;
  referencia: string;
  notas: string;
}): Promise<Resultado & { movimientoId?: string }> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc('pagar_orden_compra', {
    p_id: p.id,
    p_oc: p.ordenId,
    p_monto: p.monto,
    p_fecha: p.fecha,
    p_metodo: p.metodo,
    p_referencia: p.referencia,
    p_notas: p.notas,
  });
  const r = deRpc(data, error, 'No se pudo registrar el pago.');
  if (!r.ok) return r;
  return { ok: true, movimientoId: String(r.data.movimiento_id ?? '') };
}

export async function anularPago(id: string): Promise<Resultado> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc('anular_pago_proveedor', { p_id: id });
  const r = deRpc(data, error, 'No se pudo anular el pago.');
  return r.ok ? { ok: true } : r;
}

// ════════════════════════════════════════════════════════════════════════════
// Factura del proveedor
// ════════════════════════════════════════════════════════════════════════════

export async function ligarFactura(p: {
  ordenId: string;
  uuid: string | null;
  rfc: string | null;
  total: number | null;
  iva: number | null;
  fecha: number | null;
  xmlPath: string | null;
  pdfPath: string | null;
  resumen: ResumenFactura | null;
}): Promise<Resultado> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc('ligar_factura_orden_compra', {
    p_oc: p.ordenId,
    p_uuid: p.uuid,
    p_rfc: p.rfc,
    p_total: p.total,
    p_iva: p.iva,
    p_fecha: p.fecha,
    p_xml_path: p.xmlPath,
    p_pdf_path: p.pdfPath,
    p_resumen: p.resumen,
  });
  const r = deRpc(data, error, 'No se pudo ligar la factura.');
  return r.ok ? { ok: true } : r;
}

// ════════════════════════════════════════════════════════════════════════════
// Archivos (bucket `compras`)
// ════════════════════════════════════════════════════════════════════════════

/** URL firmada (1 hora). Corre con la sesión: la policy del bucket decide. */
export async function urlArchivoCompras(path: string | null): Promise<string | null> {
  if (!path) return null;
  const supabase = await createClient();
  const { data } = await supabase.storage.from(BUCKET_COMPRAS).createSignedUrl(path, 60 * 60);
  return data?.signedUrl ?? null;
}

export async function descargarArchivoCompras(path: string): Promise<Uint8Array | null> {
  const supabase = await createClient();
  const { data } = await supabase.storage.from(BUCKET_COMPRAS).download(path);
  if (!data) return null;
  return new Uint8Array(await data.arrayBuffer());
}

// ════════════════════════════════════════════════════════════════════════════
// Existencias (RF2.7)
// ════════════════════════════════════════════════════════════════════════════

export async function listMovimientosMaterial(obraId: string): Promise<MovimientoMaterial[]> {
  // Va dentro de un filtro `or=(…)` de PostgREST: solo un uuid, nada más.
  if (!/^[0-9a-f-]{36}$/i.test(obraId)) return [];
  const supabase = await createClient();
  const { data } = await supabase
    .from('material_movimiento')
    .select(C_MOV_MAT)
    .or(`obra_id.eq.${obraId},obra_destino_id.eq.${obraId}`)
    .is('deleted_at', null)
    .order('fecha', { ascending: false })
    .limit(200);
  return (data ?? []) as MovimientoMaterial[];
}

/**
 * Existencias de una obra, desde la vista `existencias_obra` (misma regla que
 * `calcularExistencias`). Solo material del catálogo.
 */
export async function existenciasDeObra(obraId: string): Promise<{ data: Existencia[]; error: string | null }> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('existencias_obra')
    .select('obra_id, material_id, recibido, consumido, traspaso_entrada, traspaso_salida, ajuste, existencia')
    .eq('obra_id', obraId);
  if (error) return { data: [], error: traducirError(error, 'No se pudieron leer las existencias.') };
  return {
    data: ((data ?? []) as Record<string, unknown>[]).map((f) => ({
      obraId: String(f.obra_id),
      materialId: String(f.material_id),
      recibido: Number(f.recibido) || 0,
      consumido: Number(f.consumido) || 0,
      traspasoEntrada: Number(f.traspaso_entrada) || 0,
      traspasoSalida: Number(f.traspaso_salida) || 0,
      ajuste: Number(f.ajuste) || 0,
      existencia: Number(f.existencia) || 0,
    })),
    error: null,
  };
}

export { calcularExistencias };

export async function registrarMovimientoMaterial(p: {
  obraId: string;
  materialId: string;
  tipo: TipoMovimientoMaterial;
  cantidad: number;
  obraDestinoId: string | null;
  fecha: number;
  notas: string;
}): Promise<Resultado> {
  const e = await empresa();
  if ('error' in e) return { ok: false, error: e.error };
  const supabase = await createClient();
  const now = Date.now();
  const { error } = await supabase.from('material_movimiento').insert({
    id: crypto.randomUUID(),
    empresa_id: e.empresaId,
    obra_id: p.obraId,
    material_id: p.materialId,
    tipo: p.tipo,
    cantidad: p.cantidad,
    obra_destino_id: p.tipo === 'TRASPASO' ? p.obraDestinoId : null,
    fecha: p.fecha,
    notas: p.notas,
    created_at: now,
    updated_at: now,
  });
  if (error) return { ok: false, error: traducirError(error, 'No se pudo registrar el movimiento de material.') };
  return { ok: true };
}

export async function eliminarMovimientoMaterial(id: string): Promise<Resultado> {
  const supabase = await createClient();
  const now = Date.now();
  const { data, error } = await supabase
    .from('material_movimiento')
    .update({ deleted_at: now, updated_at: now })
    .eq('id', id)
    .select('id');
  if (error) return { ok: false, error: traducirError(error, 'No se pudo borrar el movimiento.') };
  if (!data?.length) return { ok: false, error: 'Movimiento no encontrado.' };
  return { ok: true };
}

// ════════════════════════════════════════════════════════════════════════════
// Para otros módulos
// ════════════════════════════════════════════════════════════════════════════

/**
 * Lo que se debe a proveedores por obra (órdenes emitidas − pagado). Lo usa la
 * utilidad por obra como costo COMPROMETIDO: todavía no está en caja, así que
 * no se cuenta dos veces (al pagarse sale de aquí y entra a caja). Sin 0038 o
 * sin permiso, 0.
 */
export async function comprometidoComprasPorObra(obraIds?: string[]): Promise<Map<string, number>> {
  const res = new Map<string, number>();
  const supabase = await createClient();
  let q = supabase
    .from('ordenes_compra')
    .select('id, obra_id, total, estado')
    .is('deleted_at', null)
    .in('estado', ['EMITIDA', 'PARCIAL', 'RECIBIDA']);
  if (obraIds) {
    if (obraIds.length === 0) return res;
    q = q.in('obra_id', obraIds);
  }
  const { data, error } = await q;
  if (error || !data?.length) return res;
  const ordenes = data as { id: string; obra_id: string; total: number | null }[];
  const pagos = await listPagos(ordenes.map((o) => o.id));
  const porOrden = agrupar(pagos, 'orden_compra_id');
  for (const o of ordenes) {
    const s = saldoOrden(Number(o.total ?? 0), porOrden.get(o.id) ?? []);
    if (s > 0) res.set(o.obra_id, (res.get(o.obra_id) ?? 0) + s);
  }
  return res;
}

/** Factura del proveedor que ampara cada movimiento de caja pagado por compras. */
export interface FacturaDeGasto {
  movimientoId: string;
  ordenFolio: number;
  proveedor: string;
  rfc: string;
  uuid: string | null;
  /** IVA de la factura proporcional a este pago (null si no hay factura). */
  iva: number | null;
  xmlPath: string | null;
  pdfPath: string | null;
}

export async function facturasDeMovimientos(movimientoIds: string[]): Promise<Map<string, FacturaDeGasto>> {
  const res = new Map<string, FacturaDeGasto>();
  if (movimientoIds.length === 0) return res;
  const supabase = await createClient();
  const pagos: { movimiento_id: string; orden_compra_id: string; proveedor_id: string; monto: number }[] = [];
  // En tandas: un `in` con cientos de uuid rebasa el largo de URL de PostgREST.
  for (let i = 0; i < movimientoIds.length; i += 150) {
    const { data, error } = await supabase
      .from('pagos_proveedor')
      .select('movimiento_id, orden_compra_id, proveedor_id, monto')
      .in('movimiento_id', movimientoIds.slice(i, i + 150))
      .is('deleted_at', null);
    if (error) return res; // 0038 sin aplicar o sin permiso: sin datos de compras
    pagos.push(...((data ?? []) as typeof pagos));
  }
  if (pagos.length === 0) return res;
  const ocIds = [...new Set(pagos.map((p) => p.orden_compra_id))];
  const provIds = [...new Set(pagos.map((p) => p.proveedor_id))];
  const [{ data: ocs }, { data: provs }] = await Promise.all([
    supabase
      .from('ordenes_compra')
      .select('id, folio, factura_uuid, factura_rfc, factura_total, factura_iva, factura_xml_path, factura_pdf_path')
      .in('id', ocIds),
    supabase.from('proveedores').select('id, nombre, rfc').in('id', provIds),
  ]);
  const ocPor = new Map(((ocs ?? []) as Record<string, unknown>[]).map((o) => [String(o.id), o]));
  const provPor = new Map(((provs ?? []) as Record<string, unknown>[]).map((p) => [String(p.id), p]));
  for (const p of pagos) {
    const oc = ocPor.get(p.orden_compra_id);
    const prov = provPor.get(p.proveedor_id);
    const uuid = (oc?.factura_uuid as string | null) ?? null;
    const total = Number(oc?.factura_total ?? 0);
    const ivaFactura = Number(oc?.factura_iva ?? 0);
    res.set(p.movimiento_id, {
      movimientoId: p.movimiento_id,
      ordenFolio: Number(oc?.folio ?? 0),
      proveedor: String(prov?.nombre ?? ''),
      rfc: String((oc?.factura_rfc as string | null) ?? (prov?.rfc as string | null) ?? ''),
      uuid,
      iva: uuid && total > 0 ? Math.round(((ivaFactura * Number(p.monto)) / total) * 100) / 100 : null,
      xmlPath: (oc?.factura_xml_path as string | null) ?? null,
      pdfPath: (oc?.factura_pdf_path as string | null) ?? null,
    });
  }
  return res;
}

/** Cuántas salidas de caja clasificadas como MATERIAL tiene la empresa (para sugerir el módulo). */
export async function contarSalidasMaterial(): Promise<number> {
  const supabase = await createClient();
  const { count, error } = await supabase
    .from('movimientos')
    .select('id', { count: 'exact', head: true })
    .eq('tipo', 'SALIDA')
    .eq('categoria_costo', 'MATERIAL')
    .is('deleted_at', null);
  if (error) return 0; // 0036 sin aplicar: no se sugiere nada
  return count ?? 0;
}
