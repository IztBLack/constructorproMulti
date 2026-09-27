'use server';

import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import {
  BUCKET_FISCAL,
  asegurarCobroFiscal,
  folioPueUsado,
  getAccesoFiscal,
  getEmpresaFiscal,
  getEntradaHoja,
  guardarClienteFiscal,
  guardarCobroFiscal,
  guardarEmpresaFiscal,
  type CambiosCobroFiscal,
} from '@/lib/data/fiscal';
import { esFormaPago, esRegimen, esUsoCfdi } from '@/lib/fiscal/catalogos';
import { fechaCfdiAMs, leerCfdi, normalizarUuid } from '@/lib/fiscal/cfdi';
import { armarHoja } from '@/lib/fiscal/hoja';
import { limpiarRazonSocial, validarCorreo, validarCp, validarRfc } from '@/lib/fiscal/rfc';
import { esEstadoFiscal, esIvaModo, esOrigenCobro, type OrigenCobro } from '@/lib/fiscal/tipos';

export interface ResultadoFiscal {
  ok: boolean;
  error?: string;
  aviso?: string;
}

const texto = (f: FormData, k: string) => String(f.get(k) ?? '').trim();

async function exigirOficina(): Promise<{ empresaId: string } | { error: string }> {
  const acceso = await getAccesoFiscal();
  if (!acceso.activo) return { error: 'El módulo «Datos para facturar» está apagado.' };
  if (!acceso.puede || !acceso.empresaId) {
    return { error: 'Solo el administrador o el contador pueden ver y cambiar datos fiscales.' };
  }
  return { empresaId: acceso.empresaId };
}

/** Valida los 4 datos comunes a emisor y receptor. Vacío = null (todo es opcional). */
function leerDatosBase(
  f: FormData,
  opciones: { permitirGenerico: boolean },
): { ok: true; rfc: string | null; razon: string | null; regimen: string | null; cp: string | null } | { ok: false; error: string } {
  const rfcCrudo = texto(f, 'rfc');
  let rfc: string | null = null;
  if (rfcCrudo) {
    const r = validarRfc(rfcCrudo, opciones);
    if (!r.ok) return { ok: false, error: r.error };
    rfc = r.rfc;
  }
  const razon = limpiarRazonSocial(texto(f, 'razon_social')) || null;
  if (razon && razon.length > 300) return { ok: false, error: 'La razón social es demasiado larga.' };
  const regimen = texto(f, 'regimen') || null;
  if (regimen && !esRegimen(regimen)) return { ok: false, error: 'Elige un régimen fiscal de la lista.' };
  const cpCrudo = texto(f, 'cp_fiscal');
  let cp: string | null = null;
  if (cpCrudo) {
    const c = validarCp(cpCrudo);
    if (!c.ok) return { ok: false, error: c.error };
    cp = c.cp;
  }
  return { ok: true, rfc, razon, regimen, cp };
}

// ── Emisor (Ajustes) ─────────────────────────────────────────────────────────

export async function guardarEmisorAction(formData: FormData): Promise<ResultadoFiscal> {
  const acceso = await exigirOficina();
  if ('error' in acceso) return { ok: false, error: acceso.error };
  const d = leerDatosBase(formData, { permitirGenerico: false });
  if (!d.ok) return { ok: false, error: d.error };
  const { error } = await guardarEmpresaFiscal({
    rfc: d.rfc,
    razon_social: d.razon,
    regimen: d.regimen,
    cp_fiscal: d.cp,
  });
  if (error) return { ok: false, error };
  revalidatePath('/admin/ajustes');
  revalidatePath('/admin/facturacion');
  return { ok: true, aviso: 'Listo. Estos datos salen en cada hoja para facturar.' };
}

// ── Receptor (ficha del cliente) ─────────────────────────────────────────────

export async function guardarClienteFiscalAction(
  clienteId: string,
  formData: FormData,
): Promise<ResultadoFiscal> {
  const acceso = await exigirOficina();
  if ('error' in acceso) return { ok: false, error: acceso.error };
  const d = leerDatosBase(formData, { permitirGenerico: true });
  if (!d.ok) return { ok: false, error: d.error };
  const uso = texto(formData, 'uso_cfdi') || null;
  if (uso && !esUsoCfdi(uso)) return { ok: false, error: 'Elige un uso del CFDI de la lista.' };
  const correoCrudo = texto(formData, 'correo_factura');
  let correo: string | null = null;
  if (correoCrudo) {
    const c = validarCorreo(correoCrudo);
    if (!c.ok) return { ok: false, error: c.error };
    correo = c.correo;
  }
  const { error } = await guardarClienteFiscal(clienteId, {
    rfc: d.rfc,
    razon_social: d.razon,
    regimen: d.regimen,
    cp_fiscal: d.cp,
    uso_cfdi: uso,
    correo_factura: correo,
  });
  if (error) return { ok: false, error };
  revalidatePath(`/admin/clientes/${clienteId}`);
  return { ok: true, aviso: 'Datos guardados.' };
}

// ── Estado fiscal de un cobro ────────────────────────────────────────────────

function rutaHoja(origen: OrigenCobro, id: string) {
  return `/admin/facturacion/hoja/${origen}/${id}`;
}

function revalidarCobro(origen: OrigenCobro, id: string) {
  revalidatePath(rutaHoja(origen, id));
  revalidatePath('/admin/facturacion');
}

function numeroOpcional(v: string, min: number, max: number): number | null | 'error' {
  if (v === '') return null;
  const n = Number(v.replace(',', '.'));
  if (!Number.isFinite(n) || n < min || n > max) return 'error';
  return n;
}

/** Ajustes de la hoja: IVA, retenciones, método, forma, uso y notas. */
export async function guardarAjustesCobroAction(
  origen: string,
  id: string,
  formData: FormData,
): Promise<ResultadoFiscal> {
  if (!esOrigenCobro(origen)) return { ok: false, error: 'Cobro no válido.' };
  const acceso = await exigirOficina();
  if ('error' in acceso) return { ok: false, error: acceso.error };

  const ivaModo = texto(formData, 'iva_modo');
  const metodo = texto(formData, 'metodo_pago');
  const forma = texto(formData, 'forma_pago');
  const uso = texto(formData, 'uso_cfdi');
  const retIsr = numeroOpcional(texto(formData, 'ret_isr_pct'), 0, 35);
  const retIva = numeroOpcional(texto(formData, 'ret_iva_pct'), 0, 16);
  const notas = texto(formData, 'notas').slice(0, 2000);

  if (ivaModo && !esIvaModo(ivaModo)) return { ok: false, error: 'Opción de IVA no válida.' };
  if (metodo && metodo !== 'PUE' && metodo !== 'PPD') return { ok: false, error: 'Método de pago no válido.' };
  if (forma && !esFormaPago(forma)) return { ok: false, error: 'Forma de pago no válida.' };
  if (metodo === 'PUE' && forma === '99') {
    return { ok: false, error: 'Con pago en una sola exhibición (PUE) la forma de pago no puede ser 99.' };
  }
  if (uso && !esUsoCfdi(uso)) return { ok: false, error: 'Uso del CFDI no válido.' };
  if (retIsr === 'error') return { ok: false, error: 'La retención de ISR va de 0 a 35%.' };
  if (retIva === 'error') return { ok: false, error: 'La retención de IVA va de 0 a 16%.' };

  const { error } = await guardarCobroFiscal(origen, id, {
    iva_modo: ivaModo ? (ivaModo as CambiosCobroFiscal['iva_modo']) : null,
    metodo_pago: (metodo || null) as CambiosCobroFiscal['metodo_pago'],
    forma_pago: forma || null,
    uso_cfdi: uso || null,
    ret_isr_pct: retIsr,
    ret_iva_pct: retIva,
    notas,
  });
  if (error) return { ok: false, error };
  revalidarCobro(origen, id);
  return { ok: true, aviso: 'Ajustes guardados. La hoja ya los usa.' };
}

/** "No requiere factura" o de vuelta a "por facturar". */
export async function cambiarEstadoCobroAction(
  origen: string,
  id: string,
  estado: string,
): Promise<ResultadoFiscal> {
  if (!esOrigenCobro(origen) || !esEstadoFiscal(estado) || estado === 'facturado') {
    return { ok: false, error: 'Cambio no válido.' };
  }
  const acceso = await exigirOficina();
  if ('error' in acceso) return { ok: false, error: acceso.error };
  const cambios: CambiosCobroFiscal =
    estado === 'por_facturar'
      ? {
          estado,
          uuid: null,
          fecha_factura: null,
          total_factura: null,
          xml_path: null,
          pdf_path: null,
          parcialidad: null,
          complemento_uuid: null,
          complemento_fecha: null,
          complemento_xml_path: null,
        }
      : { estado };
  const { error } = await guardarCobroFiscal(origen, id, cambios);
  if (error) return { ok: false, error };
  revalidarCobro(origen, id);
  return { ok: true };
}

/**
 * Cerrar el ciclo pegando el folio a mano (RF1b.6). Si la hoja dice que el cobro
 * es un abono a una PPD, lo que se pega es el folio del COMPLEMENTO.
 */
export async function registrarFolioAction(
  origen: string,
  id: string,
  formData: FormData,
): Promise<ResultadoFiscal> {
  if (!esOrigenCobro(origen)) return { ok: false, error: 'Cobro no válido.' };
  const acceso = await exigirOficina();
  if ('error' in acceso) return { ok: false, error: acceso.error };

  const uuid = normalizarUuid(texto(formData, 'uuid'));
  if (!uuid) {
    return {
      ok: false,
      error: 'El folio fiscal (UUID) son 32 letras y números en grupos: 8-4-4-4-12. Cópialo de la factura.',
    };
  }
  const entrada = await getEntradaHoja(origen, id);
  if (!entrada) return { ok: false, error: 'No encontramos ese cobro.' };
  const hoja = armarHoja(entrada);

  let cambios: CambiosCobroFiscal;
  if (hoja.tipo === 'complemento') {
    cambios = {
      estado: 'facturado',
      metodo_pago: 'PPD',
      uuid: hoja.facturaRelacionada,
      parcialidad: hoja.parcialidad?.numero ?? null,
      complemento_uuid: uuid,
      complemento_fecha: Date.now(),
    };
  } else {
    const metodo = (hoja.pago.find((c) => c.etiqueta === 'Método de pago')?.valor ?? 'PUE') as 'PUE' | 'PPD';
    if (metodo === 'PUE' && (await folioPueUsado(uuid, entrada.cobro.fiscal?.id ?? null))) {
      return { ok: false, error: 'Ese folio fiscal ya está registrado en otro cobro.' };
    }
    cambios = {
      estado: 'facturado',
      uuid,
      metodo_pago: metodo,
      forma_pago: hoja.pago.find((c) => c.etiqueta === 'Forma de pago')?.valor || null,
      fecha_factura: Date.now(),
      total_factura: hoja.desglose.total,
      parcialidad: metodo === 'PPD' ? 1 : null,
    };
  }
  const { error } = await guardarCobroFiscal(origen, id, cambios);
  if (error) return { ok: false, error };
  revalidarCobro(origen, id);
  return {
    ok: true,
    aviso: hoja.tipo === 'complemento' ? 'Complemento registrado.' : 'Listo: el cobro quedó facturado.',
  };
}

/**
 * Cerrar el ciclo subiendo el XML timbrado: la app lo lee, revisa que sea de
 * este cobro y llena folio, fecha, total y método. El texto del XML viaja en el
 * formulario (un CFDI pesa decenas de KB) y el servidor lo guarda en Storage.
 */
export async function subirXmlAction(
  origen: string,
  id: string,
  formData: FormData,
): Promise<ResultadoFiscal> {
  if (!esOrigenCobro(origen)) return { ok: false, error: 'Cobro no válido.' };
  const acceso = await exigirOficina();
  if ('error' in acceso) return { ok: false, error: acceso.error };

  const archivo = formData.get('xml');
  if (!(archivo instanceof File) || archivo.size === 0) return { ok: false, error: 'Elige el archivo XML.' };
  if (archivo.size > 900 * 1024) return { ok: false, error: 'El XML pasa de 900 KB; no parece una factura.' };
  const xml = await archivo.text();
  const leido = leerCfdi(xml);
  if (!leido.ok) return { ok: false, error: leido.error };
  const cfdi = leido.cfdi;

  const entrada = await getEntradaHoja(origen, id);
  if (!entrada) return { ok: false, error: 'No encontramos ese cobro.' };
  const hoja = armarHoja(entrada);
  const emisor = await getEmpresaFiscal();

  // La factura tiene que ser TUYA: el emisor del XML es tu RFC.
  if (emisor?.rfc && cfdi.emisor.rfc !== emisor.rfc.toUpperCase()) {
    return {
      ok: false,
      error: `Este XML lo emitió el RFC ${cfdi.emisor.rfc}, no el tuyo (${emisor.rfc}). ¿Es la factura correcta?`,
    };
  }
  const avisos: string[] = [];
  const rfcCliente = entrada.receptor?.rfc?.toUpperCase();
  if (rfcCliente && cfdi.receptor.rfc !== rfcCliente) {
    avisos.push(`Ojo: la factura es para el RFC ${cfdi.receptor.rfc} y tu cliente tiene ${rfcCliente}.`);
  }

  const { id: fiscalId, error: errFila } = await asegurarCobroFiscal(origen, id);
  if (errFila || !fiscalId) return { ok: false, error: errFila ?? 'No se pudo preparar el cobro.' };

  const supabase = await createClient();
  const ruta = `${acceso.empresaId}/cfdi/${fiscalId}/${cfdi.uuid}.xml`;
  const { error: errSubir } = await supabase.storage
    .from(BUCKET_FISCAL)
    .upload(ruta, new Blob([xml], { type: 'application/xml' }), { upsert: true, contentType: 'application/xml' });
  if (errSubir) return { ok: false, error: `No se pudo guardar el XML: ${errSubir.message}` };

  let cambios: CambiosCobroFiscal;
  if (cfdi.tipo === 'P') {
    if (hoja.tipo !== 'complemento' && entrada.cobro.fiscal?.metodo_pago !== 'PPD') {
      return { ok: false, error: 'Es un complemento de pago, pero este cobro no es un abono a una factura en parcialidades.' };
    }
    const folioPpd = (hoja.facturaRelacionada ?? entrada.cobro.fiscal?.uuid ?? '').toUpperCase();
    const doc = cfdi.pagos.flatMap((p) => p.documentos).find((d) => d.idDocumento === folioPpd);
    if (!doc) {
      return { ok: false, error: `Este complemento no paga la factura ${folioPpd}. Revisa que sea el correcto.` };
    }
    cambios = {
      estado: 'facturado',
      metodo_pago: 'PPD',
      uuid: folioPpd,
      parcialidad: doc.parcialidad ?? hoja.parcialidad?.numero ?? null,
      complemento_uuid: cfdi.uuid,
      complemento_fecha: fechaCfdiAMs(cfdi.fechaTimbrado ?? cfdi.fecha),
      complemento_xml_path: ruta,
    };
  } else if (cfdi.tipo === 'I') {
    if (cfdi.metodoPago !== 'PPD' && (await folioPueUsado(cfdi.uuid, entrada.cobro.fiscal?.id ?? null))) {
      await supabase.storage.from(BUCKET_FISCAL).remove([ruta]);
      return { ok: false, error: 'Esa factura ya está registrada en otro cobro.' };
    }
    const dif = Math.abs(cfdi.total - hoja.desglose.total);
    if (cfdi.metodoPago === 'PUE' && dif > 1) {
      avisos.push(
        `El total de la factura (${cfdi.total.toFixed(2)}) no coincide con el de la hoja (${hoja.desglose.total.toFixed(2)}).`,
      );
    }
    cambios = {
      estado: 'facturado',
      uuid: cfdi.uuid,
      metodo_pago: cfdi.metodoPago ?? 'PUE',
      forma_pago: cfdi.formaPago,
      fecha_factura: fechaCfdiAMs(cfdi.fechaTimbrado ?? cfdi.fecha),
      total_factura: cfdi.total,
      xml_path: ruta,
      parcialidad: cfdi.metodoPago === 'PPD' ? 1 : null,
      uso_cfdi: esUsoCfdi(cfdi.receptor.uso) ? cfdi.receptor.uso : null,
    };
  } else {
    await supabase.storage.from(BUCKET_FISCAL).remove([ruta]);
    return { ok: false, error: 'Solo se ligan facturas de ingreso (tipo I) o complementos de pago (tipo P).' };
  }

  const { error } = await guardarCobroFiscal(origen, id, cambios);
  if (error) {
    await supabase.storage.from(BUCKET_FISCAL).remove([ruta]);
    return { ok: false, error };
  }
  revalidarCobro(origen, id);
  return {
    ok: true,
    aviso: [`Leímos la factura ${cfdi.uuid}. El cobro quedó facturado.`, ...avisos].join(' '),
  };
}

/** Paso 1 para subir el PDF de la factura directo a Storage (puede pasar de 1 MB). */
export async function urlSubidaPdfAction(
  origen: string,
  id: string,
  tamano: number,
): Promise<{ ok: boolean; error?: string; ruta?: string; token?: string }> {
  if (!esOrigenCobro(origen)) return { ok: false, error: 'Cobro no válido.' };
  const acceso = await exigirOficina();
  if ('error' in acceso) return { ok: false, error: acceso.error };
  if (!tamano || tamano > 5 * 1024 * 1024) return { ok: false, error: 'El PDF debe pesar menos de 5 MB.' };
  const { id: fiscalId, error } = await asegurarCobroFiscal(origen, id);
  if (error || !fiscalId) return { ok: false, error: error ?? 'No se pudo preparar el cobro.' };
  const supabase = await createClient();
  const ruta = `${acceso.empresaId}/cfdi/${fiscalId}/factura-${crypto.randomUUID().slice(0, 8)}.pdf`;
  const { data, error: e } = await supabase.storage.from(BUCKET_FISCAL).createSignedUploadUrl(ruta);
  if (e || !data) return { ok: false, error: `No se pudo preparar la subida: ${e?.message ?? ''}` };
  return { ok: true, ruta: data.path, token: data.token };
}

/** Paso 2: liga el PDF ya subido al cobro. */
export async function registrarPdfAction(origen: string, id: string, ruta: string): Promise<ResultadoFiscal> {
  if (!esOrigenCobro(origen)) return { ok: false, error: 'Cobro no válido.' };
  const acceso = await exigirOficina();
  if ('error' in acceso) return { ok: false, error: acceso.error };
  if (!ruta.startsWith(`${acceso.empresaId}/cfdi/`) || !ruta.endsWith('.pdf')) {
    return { ok: false, error: 'Ruta no válida.' };
  }
  const { error } = await guardarCobroFiscal(origen, id, { pdf_path: ruta });
  if (error) return { ok: false, error };
  revalidarCobro(origen, id);
  return { ok: true, aviso: 'PDF guardado.' };
}

// ── Claves SAT de un concepto ────────────────────────────────────────────────

export async function guardarClavesSatAction(
  tabla: string,
  id: string,
  clave: string,
  unidad: string,
  volverA: string,
): Promise<ResultadoFiscal> {
  if (!['partidas', 'obra_presupuesto', 'catalogo_conceptos'].includes(tabla)) {
    return { ok: false, error: 'Concepto no válido.' };
  }
  const acceso = await exigirOficina();
  if ('error' in acceso) return { ok: false, error: acceso.error };
  const supabase = await createClient();
  const { data, error } = await supabase.rpc('guardar_claves_sat', {
    p_tabla: tabla,
    p_id: id,
    p_clave: clave,
    p_unidad: unidad,
  });
  if (error) return { ok: false, error: error.message };
  const r = data as { ok: boolean; error?: string };
  if (!r.ok) return { ok: false, error: r.error };

  // "Se captura una vez": si la partida vino del catálogo (misma clave interna) y
  // el concepto del catálogo aún no tiene clave SAT, se la ponemos también.
  if (tabla === 'partidas' && clave) {
    const { data: partida } = await supabase.from('partidas').select('clave').eq('id', id).maybeSingle();
    const claveInterna = (partida?.clave as string | undefined)?.trim();
    if (claveInterna) {
      const { data: cat } = await supabase
        .from('catalogo_conceptos')
        .select('id, clave_sat')
        .eq('clave', claveInterna)
        .is('deleted_at', null)
        .limit(1)
        .maybeSingle();
      if (cat && !cat.clave_sat) {
        await supabase.rpc('guardar_claves_sat', {
          p_tabla: 'catalogo_conceptos',
          p_id: cat.id,
          p_clave: clave,
          p_unidad: unidad,
        });
      }
    }
  }
  if (volverA.startsWith('/admin/')) revalidatePath(volverA);
  return { ok: true, aviso: 'Clave guardada.' };
}
