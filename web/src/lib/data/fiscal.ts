/**
 * Capa de datos del módulo `fiscal` (migración 0037). Solo servidor.
 *
 * Quién ve qué lo decide la RLS: admin y contador ven y escriben; los demás
 * roles reciben vacío. Aquí además se revisa el rol para dar un mensaje claro
 * en vez de una pantalla vacía.
 *
 * Los "cobros" salen de dos lugares (ver 0037 §5):
 *   · `pagos` de una cotización,
 *   · `movimientos` tipo ENTRADA de una obra.
 */

import { cache } from 'react';
import { createClient } from '@/lib/supabase/server';
import { getEmpresaUsuario } from './empresa';
import { getModulosEmpresa } from './modulos';
import { IVA_POR_DEFECTO } from './types';
import type { ConceptoOrigen, DocumentoOrigen, EntradaHoja } from '@/lib/fiscal/hoja';
import type { GastoPaquete } from '@/lib/fiscal/paquete';
import type {
  ClienteFiscal,
  Cobro,
  CobroFiscal,
  EmpresaFiscal,
  OrigenCobro,
} from '@/lib/fiscal/tipos';

export const BUCKET_FISCAL = 'fiscal';
export const ROLES_FISCAL = ['admin', 'contador'] as const;

export interface AccesoFiscal {
  /** El módulo está prendido en la empresa. */
  activo: boolean;
  /** El rol puede ver y editar datos fiscales (admin o contador). */
  puede: boolean;
  empresaId: string | null;
  rol: string;
}

/** ¿Se muestra lo fiscal a este usuario? Nunca lanza. */
export const getAccesoFiscal = cache(async (): Promise<AccesoFiscal> => {
  const { activos } = await getModulosEmpresa();
  try {
    const { empresaId, rol } = await getEmpresaUsuario();
    return {
      activo: activos.includes('fiscal'),
      puede: (ROLES_FISCAL as readonly string[]).includes(rol),
      empresaId,
      rol,
    };
  } catch {
    return { activo: activos.includes('fiscal'), puede: false, empresaId: null, rol: '' };
  }
});

// ── Emisor ───────────────────────────────────────────────────────────────────

export async function getEmpresaFiscal(): Promise<EmpresaFiscal | null> {
  const { empresaId, puede } = await getAccesoFiscal();
  if (!empresaId || !puede) return null;
  const supabase = await createClient();
  const { data } = await supabase
    .from('empresa_fiscal')
    .select('rfc, razon_social, regimen, cp_fiscal')
    .eq('empresa_id', empresaId)
    .is('deleted_at', null)
    .maybeSingle();
  return (data as EmpresaFiscal | null) ?? null;
}

/** Guarda la fila COMPLETA del emisor (no hay upsert parcial: RT7). */
export async function guardarEmpresaFiscal(d: EmpresaFiscal): Promise<{ error: string | null }> {
  const { empresaId, puede } = await getAccesoFiscal();
  if (!empresaId || !puede) return { error: 'Solo el administrador o el contador pueden cambiar esto.' };
  const supabase = await createClient();
  const ahora = Date.now();
  const { error } = await supabase.from('empresa_fiscal').upsert(
    {
      empresa_id: empresaId,
      rfc: d.rfc,
      razon_social: d.razon_social,
      regimen: d.regimen,
      cp_fiscal: d.cp_fiscal,
      updated_at: ahora,
      deleted_at: null,
    },
    { onConflict: 'empresa_id' },
  );
  return { error: error?.message ?? null };
}

// ── Receptor ─────────────────────────────────────────────────────────────────

const COLS_CLIENTE =
  'cliente_id, rfc, razon_social, regimen, cp_fiscal, uso_cfdi, correo_factura, constancia_path, fiscales_confirmados_at';

export async function getClienteFiscal(clienteId: string): Promise<ClienteFiscal | null> {
  const { puede } = await getAccesoFiscal();
  if (!puede) return null;
  const supabase = await createClient();
  const { data } = await supabase
    .from('cliente_fiscal')
    .select(COLS_CLIENTE)
    .eq('cliente_id', clienteId)
    .is('deleted_at', null)
    .maybeSingle();
  return (data as ClienteFiscal | null) ?? null;
}

async function mapaClientesFiscales(ids: string[]): Promise<Map<string, ClienteFiscal>> {
  const mapa = new Map<string, ClienteFiscal>();
  if (ids.length === 0) return mapa;
  const supabase = await createClient();
  const { data } = await supabase
    .from('cliente_fiscal')
    .select(COLS_CLIENTE)
    .in('cliente_id', ids)
    .is('deleted_at', null);
  for (const f of (data ?? []) as ClienteFiscal[]) mapa.set(f.cliente_id, f);
  return mapa;
}

export interface ClienteFiscalInput {
  rfc: string | null;
  razon_social: string | null;
  regimen: string | null;
  cp_fiscal: string | null;
  uso_cfdi: string | null;
  correo_factura: string | null;
}

/**
 * La oficina guarda los datos del cliente. Si los cambia, dejan de ser "los que
 * confirmó el cliente": se borra la confirmación (la constancia se conserva).
 */
export async function guardarClienteFiscal(
  clienteId: string,
  d: ClienteFiscalInput,
): Promise<{ error: string | null }> {
  const { empresaId, puede } = await getAccesoFiscal();
  if (!empresaId || !puede) return { error: 'Solo el administrador o el contador pueden cambiar esto.' };
  const supabase = await createClient();
  const actual = await getClienteFiscal(clienteId);
  const igual =
    actual &&
    actual.rfc === d.rfc &&
    actual.razon_social === d.razon_social &&
    actual.regimen === d.regimen &&
    actual.cp_fiscal === d.cp_fiscal &&
    actual.uso_cfdi === d.uso_cfdi &&
    actual.correo_factura === d.correo_factura;
  const ahora = Date.now();
  const { error } = await supabase.from('cliente_fiscal').upsert(
    {
      cliente_id: clienteId,
      empresa_id: empresaId,
      ...d,
      constancia_path: actual?.constancia_path ?? null,
      fiscales_confirmados_at: igual ? actual!.fiscales_confirmados_at : null,
      fiscales_confirmados_por: igual ? undefined : null,
      updated_at: ahora,
      deleted_at: null,
    },
    { onConflict: 'cliente_id' },
  );
  return { error: error?.message ?? null };
}

// ── Cobros ───────────────────────────────────────────────────────────────────

interface PagoFila {
  id: string;
  cotizacion_id: string;
  fecha: number;
  monto: number;
  metodo: string;
  concepto: string;
  referencia: string | null;
}
interface MovFila {
  id: string;
  obra_id: string;
  fecha: number;
  monto: number;
  metodo_pago: string | null;
  concepto: string | null;
  categoria: string | null;
  referencia: string | null;
}
interface CotFila {
  id: string;
  nombre_proyecto: string;
  cliente: string;
  cliente_id: string | null;
  iva_enabled: boolean;
  iva_porcentaje: number | null;
  descuento: number | null;
}
interface ObraFila {
  id: string;
  nombre: string;
  cliente: string | null;
  cliente_id: string | null;
}

export interface FiltroCobros {
  desde?: number;
  hasta?: number;
  cotizacionId?: string;
  obraId?: string;
  /** Solo un origen (para la hoja de un cobro). */
  soloOrigen?: OrigenCobro;
}

async function listarCobroFiscal(): Promise<CobroFiscal[]> {
  const supabase = await createClient();
  const { data } = await supabase.from('cobro_fiscal').select('*').is('deleted_at', null);
  return (data ?? []) as CobroFiscal[];
}

/**
 * Cobros de la empresa con su estado fiscal. Si el rol no puede ver lo fiscal,
 * `fiscal` viene null (la RLS no devuelve filas de `cobro_fiscal`).
 */
export async function listCobros(filtro: FiltroCobros = {}): Promise<{ data: Cobro[]; error: string | null }> {
  const supabase = await createClient();

  let qPagos = supabase
    .from('pagos')
    .select('id, cotizacion_id, fecha, monto, metodo, concepto, referencia')
    .is('deleted_at', null);
  let qMovs = supabase
    .from('movimientos')
    .select('id, obra_id, fecha, monto, metodo_pago, concepto, categoria, referencia')
    .eq('tipo', 'ENTRADA')
    .is('deleted_at', null);
  if (filtro.desde != null) {
    qPagos = qPagos.gte('fecha', filtro.desde);
    qMovs = qMovs.gte('fecha', filtro.desde);
  }
  if (filtro.hasta != null) {
    qPagos = qPagos.lt('fecha', filtro.hasta);
    qMovs = qMovs.lt('fecha', filtro.hasta);
  }
  if (filtro.cotizacionId) qPagos = qPagos.eq('cotizacion_id', filtro.cotizacionId);
  if (filtro.obraId) qMovs = qMovs.eq('obra_id', filtro.obraId);

  const quierePagos = filtro.soloOrigen !== 'movimiento' && !filtro.obraId;
  const quiereMovs = filtro.soloOrigen !== 'pago' && !filtro.cotizacionId;

  const [rPagos, rMovs, fiscales] = await Promise.all([
    quierePagos ? qPagos : Promise.resolve({ data: [], error: null }),
    quiereMovs ? qMovs : Promise.resolve({ data: [], error: null }),
    listarCobroFiscal(),
  ]);
  const error = rPagos.error?.message ?? rMovs.error?.message ?? null;
  if (error) return { data: [], error };

  const pagos = (rPagos.data ?? []) as PagoFila[];
  const movs = (rMovs.data ?? []) as MovFila[];

  const cotIds = [...new Set(pagos.map((p) => p.cotizacion_id))];
  const obraIds = [...new Set(movs.map((m) => m.obra_id))];
  const [rCots, rObras] = await Promise.all([
    cotIds.length
      ? supabase.from('cotizaciones').select('id, nombre_proyecto, cliente, cliente_id').in('id', cotIds)
      : Promise.resolve({ data: [] }),
    obraIds.length
      ? supabase.from('obras').select('id, nombre, cliente, cliente_id').in('id', obraIds)
      : Promise.resolve({ data: [] }),
  ]);
  const cots = new Map(((rCots.data ?? []) as CotFila[]).map((c) => [c.id, c]));
  const obras = new Map(((rObras.data ?? []) as ObraFila[]).map((o) => [o.id, o]));

  const clienteIds = [
    ...new Set(
      [...cots.values(), ...obras.values()].map((x) => x.cliente_id).filter((x): x is string => !!x),
    ),
  ];
  const nombres = new Map<string, string>();
  if (clienteIds.length) {
    const { data } = await supabase.from('clientes').select('id, nombre').in('id', clienteIds);
    for (const c of (data ?? []) as { id: string; nombre: string }[]) nombres.set(c.id, c.nombre);
  }

  const porPago = new Map(fiscales.filter((f) => f.pago_id).map((f) => [f.pago_id!, f]));
  const porMov = new Map(fiscales.filter((f) => f.movimiento_id).map((f) => [f.movimiento_id!, f]));

  const cobros: Cobro[] = [
    ...pagos.map((p): Cobro => {
      const c = cots.get(p.cotizacion_id);
      return {
        origen: 'pago',
        id: p.id,
        fecha: p.fecha,
        monto: p.monto,
        metodo: p.metodo,
        concepto: p.concepto ?? '',
        referencia: p.referencia ?? '',
        documentoId: p.cotizacion_id,
        documentoNombre: c?.nombre_proyecto || c?.cliente || 'Cotización',
        clienteId: c?.cliente_id ?? null,
        clienteNombre: (c?.cliente_id && nombres.get(c.cliente_id)) || c?.cliente || '',
        fiscal: porPago.get(p.id) ?? null,
      };
    }),
    ...movs.map((m): Cobro => {
      const o = obras.get(m.obra_id);
      return {
        origen: 'movimiento',
        id: m.id,
        fecha: m.fecha,
        monto: m.monto,
        metodo: m.metodo_pago ?? '',
        concepto: m.concepto || m.categoria || '',
        referencia: m.referencia ?? '',
        documentoId: m.obra_id,
        documentoNombre: o?.nombre ?? 'Obra',
        clienteId: o?.cliente_id ?? null,
        clienteNombre: (o?.cliente_id && nombres.get(o.cliente_id)) || o?.cliente || '',
        fiscal: porMov.get(m.id) ?? null,
      };
    }),
  ].sort((a, b) => b.fecha - a.fecha);

  return { data: cobros, error: null };
}

// ── Documento de origen (cotización u obra) ──────────────────────────────────

async function documentoDeCotizacion(cotId: string): Promise<DocumentoOrigen | null> {
  const supabase = await createClient();
  const { data: cot } = await supabase
    .from('cotizaciones')
    .select('id, nombre_proyecto, cliente, iva_enabled, iva_porcentaje, descuento')
    .eq('id', cotId)
    .maybeSingle();
  if (!cot) return null;
  const c = cot as CotFila;
  const { data: secs } = await supabase
    .from('secciones')
    .select('id, orden')
    .eq('cotizacion_id', cotId)
    .is('deleted_at', null)
    .order('orden');
  const secIds = ((secs ?? []) as { id: string }[]).map((s) => s.id);
  const orden = new Map(secIds.map((id, i) => [id, i]));
  let partidas: Record<string, unknown>[] = [];
  if (secIds.length) {
    const { data } = await supabase
      .from('partidas')
      .select('*')
      .in('seccion_id', secIds)
      .is('deleted_at', null)
      .order('orden');
    partidas = (data ?? []) as Record<string, unknown>[];
  }
  partidas.sort(
    (a, b) =>
      (orden.get(a.seccion_id as string) ?? 0) - (orden.get(b.seccion_id as string) ?? 0) ||
      (a.orden as number) - (b.orden as number),
  );
  const descuento = (c.descuento ?? 0) / 100;
  const conceptos: ConceptoOrigen[] = partidas.map((p) => ({
    id: p.id as string,
    tabla: 'partidas',
    descripcion: [p.clave, p.descripcion].filter(Boolean).join(' '),
    cantidad: p.cantidad as number,
    unidad: (p.unidad as string) ?? '',
    // El descuento de la cotización se reparte en el precio (así el total cuadra).
    precioUnitario: (p.precio_unitario as number) * (1 - descuento),
    claveSat: (p.clave_sat as string | null | undefined) ?? null,
    unidadSat: (p.unidad_sat as string | null | undefined) ?? null,
  }));
  const ivaPct = c.iva_porcentaje ?? IVA_POR_DEFECTO;
  const base = conceptos.reduce((s, x) => s + x.cantidad * x.precioUnitario, 0);
  return {
    titulo: c.nombre_proyecto || c.cliente || 'Cotización',
    total: c.iva_enabled ? base * (1 + ivaPct / 100) : base,
    conIva: c.iva_enabled,
    ivaPct,
    conceptos,
  };
}

async function documentoDeObra(obraId: string, ivaPorDefecto: number): Promise<DocumentoOrigen | null> {
  const supabase = await createClient();
  const { data: obra } = await supabase
    .from('obras')
    .select('id, nombre, cotizacion_origen_id')
    .eq('id', obraId)
    .maybeSingle();
  if (!obra) return null;
  const { data } = await supabase
    .from('obra_presupuesto')
    .select('*')
    .eq('obra_id', obraId)
    .is('deleted_at', null)
    .order('orden');
  const conceptos: ConceptoOrigen[] = ((data ?? []) as Record<string, unknown>[]).map((p) => ({
    id: p.id as string,
    tabla: 'obra_presupuesto',
    descripcion: (p.concepto as string) ?? '',
    cantidad: p.cantidad as number,
    unidad: (p.unidad as string) ?? '',
    precioUnitario: p.precio_unitario as number,
    claveSat: (p.clave_sat as string | null | undefined) ?? null,
    unidadSat: (p.unidad_sat as string | null | undefined) ?? null,
  }));
  // Si la obra nació de una cotización, su IVA manda (el presupuesto no lo guarda).
  let conIva: boolean | null = null;
  let ivaPct = ivaPorDefecto;
  if (obra.cotizacion_origen_id) {
    const { data: cot } = await supabase
      .from('cotizaciones')
      .select('iva_enabled, iva_porcentaje')
      .eq('id', obra.cotizacion_origen_id as string)
      .maybeSingle();
    if (cot) {
      conIva = cot.iva_enabled as boolean;
      ivaPct = (cot.iva_porcentaje as number | null) ?? ivaPorDefecto;
    }
  }
  const base = conceptos.reduce((s, x) => s + x.cantidad * x.precioUnitario, 0);
  return {
    titulo: (obra.nombre as string) || 'Obra',
    // El presupuesto de la obra se captura como costo total (lo que cobra la
    // constructora); se toma tal cual como el valor del contrato.
    total: base,
    conIva,
    ivaPct,
    conceptos,
  };
}

async function ivaDeEmpresa(): Promise<number> {
  const supabase = await createClient();
  const { data } = await supabase.from('empresa_config').select('iva_porcentaje').maybeSingle();
  return (data?.iva_porcentaje as number | undefined) ?? IVA_POR_DEFECTO;
}

/** Todo lo que necesita `armarHoja` para un cobro. `null` si no existe o no se ve. */
export async function getEntradaHoja(origen: OrigenCobro, id: string): Promise<EntradaHoja | null> {
  const supabase = await createClient();
  const documentoId =
    origen === 'pago'
      ? ((await supabase.from('pagos').select('cotizacion_id').eq('id', id).maybeSingle()).data
          ?.cotizacion_id as string | undefined)
      : ((
          await supabase.from('movimientos').select('obra_id').eq('id', id).eq('tipo', 'ENTRADA').maybeSingle()
        ).data?.obra_id as string | undefined);
  if (!documentoId) return null;

  const filtro: FiltroCobros =
    origen === 'pago' ? { cotizacionId: documentoId, soloOrigen: 'pago' } : { obraId: documentoId, soloOrigen: 'movimiento' };
  const [{ data: cobros }, ivaEmpresa] = await Promise.all([listCobros(filtro), ivaDeEmpresa()]);
  const cobro = cobros.find((c) => c.id === id);
  if (!cobro) return null;

  const [documento, emisor, receptor] = await Promise.all([
    origen === 'pago' ? documentoDeCotizacion(documentoId) : documentoDeObra(documentoId, ivaEmpresa),
    getEmpresaFiscal(),
    cobro.clienteId ? getClienteFiscal(cobro.clienteId) : Promise.resolve(null),
  ]);
  if (!documento) return null;

  return {
    cobro,
    documento,
    emisor,
    receptor,
    otrosCobros: cobros.filter((c) => c.id !== id),
    ivaPorDefecto: ivaEmpresa,
  };
}

/**
 * Entradas de hoja de todos los cobros de un periodo, para el paquete. Los
 * "otros cobros" de cada documento se toman de TODAS las fechas: una parcialidad
 * de septiembre depende de la factura PPD de agosto.
 */
export async function listEntradasPeriodo(
  desde: number,
  hasta: number,
): Promise<{ data: EntradaHoja[]; error: string | null }> {
  const [{ data: todos, error }, emisor, ivaEmpresa] = await Promise.all([
    listCobros(),
    getEmpresaFiscal(),
    ivaDeEmpresa(),
  ]);
  if (error) return { data: [], error };
  const enPeriodo = todos.filter((c) => c.fecha >= desde && c.fecha < hasta);

  const docs = new Map<string, DocumentoOrigen | null>();
  for (const c of enPeriodo) {
    const clave = `${c.origen}:${c.documentoId}`;
    if (!docs.has(clave)) {
      docs.set(
        clave,
        c.origen === 'pago'
          ? await documentoDeCotizacion(c.documentoId)
          : await documentoDeObra(c.documentoId, ivaEmpresa),
      );
    }
  }
  const receptores = await mapaClientesFiscales([
    ...new Set(enPeriodo.map((c) => c.clienteId).filter((x): x is string => !!x)),
  ]);

  const data: EntradaHoja[] = [];
  for (const c of enPeriodo) {
    const documento = docs.get(`${c.origen}:${c.documentoId}`);
    if (!documento) continue;
    data.push({
      cobro: c,
      documento,
      emisor,
      receptor: c.clienteId ? receptores.get(c.clienteId) ?? null : null,
      otrosCobros: todos.filter(
        (o) => o.id !== c.id && o.origen === c.origen && o.documentoId === c.documentoId,
      ),
      ivaPorDefecto: ivaEmpresa,
    });
  }
  return { data, error: null };
}

/** Salidas de caja del periodo (gastos y raya), con el nombre de la obra. */
export async function listGastosPeriodo(
  desde: number,
  hasta: number,
): Promise<{ data: GastoPaquete[]; error: string | null }> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('movimientos')
    .select('obra_id, fecha, categoria, concepto, nombre, monto, metodo_pago, referencia')
    .eq('tipo', 'SALIDA')
    .is('deleted_at', null)
    .gte('fecha', desde)
    .lt('fecha', hasta)
    .order('fecha');
  if (error) return { data: [], error: error.message };
  const filas = (data ?? []) as Record<string, unknown>[];
  const obraIds = [...new Set(filas.map((f) => f.obra_id as string))];
  const nombres = new Map<string, string>();
  if (obraIds.length) {
    const { data: obras } = await supabase.from('obras').select('id, nombre').in('id', obraIds);
    for (const o of (obras ?? []) as { id: string; nombre: string }[]) nombres.set(o.id, o.nombre);
  }
  return {
    data: filas.map((f) => ({
      obra: nombres.get(f.obra_id as string) ?? 'Obra',
      fecha: f.fecha as number,
      categoria: (f.categoria as string) ?? '',
      concepto: (f.concepto as string) ?? '',
      nombre: (f.nombre as string) ?? '',
      monto: f.monto as number,
      metodo: (f.metodo_pago as string) ?? '',
      referencia: (f.referencia as string) ?? '',
    })),
    error: null,
  };
}

// ── Escritura del estado fiscal de un cobro ──────────────────────────────────

export type CambiosCobroFiscal = Partial<Omit<CobroFiscal, 'id' | 'pago_id' | 'movimiento_id'>>;

/**
 * Crea o actualiza la fila fiscal de un cobro. Se lee primero (y no un upsert a
 * ciegas) para no pisar columnas que el cambio no trae.
 */
export async function guardarCobroFiscal(
  origen: OrigenCobro,
  cobroId: string,
  cambios: CambiosCobroFiscal,
): Promise<{ id: string | null; error: string | null }> {
  const { empresaId, puede } = await getAccesoFiscal();
  if (!empresaId || !puede) return { id: null, error: 'Solo el administrador o el contador pueden hacer esto.' };
  const supabase = await createClient();
  const col = origen === 'pago' ? 'pago_id' : 'movimiento_id';
  const { data: actual, error: errLeer } = await supabase
    .from('cobro_fiscal')
    .select('id')
    .eq(col, cobroId)
    .maybeSingle();
  if (errLeer) return { id: null, error: errLeer.message };
  const ahora = Date.now();
  if (actual) {
    const { error } = await supabase
      .from('cobro_fiscal')
      .update({ ...cambios, updated_at: ahora, deleted_at: null })
      .eq('id', actual.id as string);
    return { id: actual.id as string, error: error ? traducirError(error.message) : null };
  }
  const id = crypto.randomUUID();
  const { error } = await supabase.from('cobro_fiscal').insert({
    id,
    empresa_id: empresaId,
    [col]: cobroId,
    ...cambios,
    created_at: ahora,
    updated_at: ahora,
  });
  return { id: error ? null : id, error: error ? traducirError(error.message) : null };
}

/** Id de la fila fiscal de un cobro, creándola vacía si no existe (para rutas de archivos). */
export async function asegurarCobroFiscal(
  origen: OrigenCobro,
  cobroId: string,
): Promise<{ id: string | null; error: string | null }> {
  return guardarCobroFiscal(origen, cobroId, {});
}

/** ¿Otro cobro ya tiene esta factura de una sola exhibición? (dedup por folio) */
export async function folioPueUsado(uuid: string, excepto: string | null): Promise<boolean> {
  const supabase = await createClient();
  let q = supabase
    .from('cobro_fiscal')
    .select('id')
    .ilike('uuid', uuid)
    .eq('metodo_pago', 'PUE')
    .is('deleted_at', null);
  if (excepto) q = q.neq('id', excepto);
  const { data } = await q.limit(1);
  return (data ?? []).length > 0;
}

function traducirError(msg: string): string {
  if (/uq_cobro_fiscal_uuid_pue/.test(msg)) {
    return 'Ese folio fiscal ya está registrado en otro cobro. Una factura de una sola exhibición ampara un solo cobro.';
  }
  if (/cobro_fiscal_facturado_con_folio/.test(msg)) return 'Para marcarlo como facturado, pega el folio fiscal o sube el XML.';
  if (/cobro_fiscal_uuid/.test(msg)) return 'El folio fiscal no tiene el formato correcto.';
  return msg;
}

// ── Archivos ─────────────────────────────────────────────────────────────────

/** URL firmada (10 min) para abrir un archivo del bucket fiscal. */
export async function urlArchivoFiscal(ruta: string): Promise<string | null> {
  const supabase = await createClient();
  const { data } = await supabase.storage.from(BUCKET_FISCAL).createSignedUrl(ruta, 600);
  return data?.signedUrl ?? null;
}

export async function descargarArchivoFiscal(ruta: string): Promise<Uint8Array | null> {
  const supabase = await createClient();
  const { data } = await supabase.storage.from(BUCKET_FISCAL).download(ruta);
  if (!data) return null;
  return new Uint8Array(await data.arrayBuffer());
}
