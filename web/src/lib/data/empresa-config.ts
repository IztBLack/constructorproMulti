import { createClient } from '@/lib/supabase/server';
import { getEmpresaUsuario } from './empresa';
import { leerTextosEmpresa, recortar, type TextosEmpresa } from '@/lib/pdf/textos-finales';

/** Tasa con la que operó siempre la app antes de que fuera configurable. */
export const IVA_POR_DEFECTO = 16;

/**
 * Personalización de documentos (PDF).
 *
 * Las claves son las MISMAS que usa `PdfConfig` en la app móvil
 * (`lib/core/pdf/pdf_config.dart`), a propósito: cuando toque la paridad, el
 * móvil podrá leer y escribir este JSON sin traducir nombres.
 *
 * Faltan a propósito los campos de imagen (`logoPath`, `firmaPath`): son
 * archivos y van al bucket de Storage, no a un jsonb. El resto usa las MISMAS
 * claves que el móvil.
 */
export interface PdfConfig {
  /** Teléfono, correo o dirección que se imprime bajo el nombre de la empresa. */
  empresaContacto: string;
  /** Color de acento del documento, en hexadecimal (#rrggbb). */
  colorHex: string;
  /** Línea libre al pie de cada documento. */
  pieDePagina: string;
  /** Texto de marca de agua en diagonal (vacío = sin marca). */
  watermark: string;
  /** Imprimir todo el documento en MAYÚSCULAS. */
  mayusculas: boolean;
  /** Márgenes reducidos (más contenido por hoja). */
  modoCompacto: boolean;
  /** Rótulo de la firma izquierda (vacío = sin firmas). */
  firmaIzquierda: string;
  /** Rótulo de la firma derecha (vacío = sin firmas). */
  firmaDerecha: string;
  /**
   * Párrafo final por tipo de documento (cotización, nota, estado de cuenta).
   * Vacío o ausente = se imprime el texto integrado. Cada documento puede a su
   * vez pisar el suyo con su columna `texto_final` (0032).
   *
   * OJO: se PERSISTE en su propia columna `empresa_config.pdf_textos` (0033),
   * no dentro del jsonb `pdf_config`. Viaja aquí solo por comodidad, porque
   * todos los builders ya reciben un `PdfConfig`. La columna aparte existe
   * porque el móvil también escribe este texto y guarda su copia del resto del
   * aspecto en SharedPreferences: si subiera el jsonb entero, borraría el color
   * y el contacto que se configuraron desde la web.
   */
  textos: TextosEmpresa;
}

/**
 * Valores por defecto. Ojo: a diferencia del móvil (que trae firmas con texto),
 * en web las firmas nacen VACÍAS para no cambiar en silencio los PDF actuales;
 * el admin las activa desde Ajustes → PDF si las quiere.
 */
export const PDF_CONFIG_POR_DEFECTO: PdfConfig = {
  empresaContacto: '',
  colorHex: '#0369A1',
  pieDePagina: '',
  watermark: '',
  mayusculas: false,
  modoCompacto: false,
  firmaIzquierda: '',
  firmaDerecha: '',
  textos: {},
};

export interface EmpresaConfig {
  ivaPorcentaje: number;
  pdf: PdfConfig;
}

// Los modos y sus etiquetas viven en `orden-modos.ts` (módulo puro, importable
// desde componentes cliente). Se re-exportan aquí por comodidad del servidor.
export {
  ORDEN_MODOS,
  ORDEN_BASE_LABEL,
  esModoPersonalizado,
  etiquetaModo,
  leerModo,
  type OrdenModo,
} from './orden-modos';
import { ORDEN_MODOS, type OrdenModo } from './orden-modos';

/**
 * Modo de orden por lista, guardado en `empresa_config.ui_orden` (jsonb). Es
 * GLOBAL por empresa: el modo elegido en cualquier dispositivo (web o móvil) se
 * ve en todos. Las claves coinciden con `OrdenLista` del móvil
 * (`lib/data/orden_personalizado.dart`).
 */
export type UiOrden = Record<string, OrdenModo>;

/** Normaliza el jsonb: descarta claves/valores que no sean un modo válido. */
function leerUiOrden(crudo: unknown): UiOrden {
  if (!crudo || typeof crudo !== 'object') return {};
  const out: UiOrden = {};
  for (const [k, v] of Object.entries(crudo as Record<string, unknown>)) {
    if (ORDEN_MODOS.includes(v as OrdenModo)) out[k] = v as OrdenModo;
  }
  return out;
}

/** Normaliza lo que venga del jsonb: puede ser null, incompleto o basura. */
function leerPdfConfig(crudo: unknown, textos: unknown): PdfConfig {
  if (!crudo || typeof crudo !== 'object') {
    return { ...PDF_CONFIG_POR_DEFECTO, textos: leerTextosEmpresa(textos) };
  }
  const o = crudo as Record<string, unknown>;
  const color = typeof o.colorHex === 'string' ? o.colorHex : '';

  const str = (v: unknown) => (typeof v === 'string' ? v : '');
  return {
    empresaContacto: str(o.empresaContacto),
    // Se valida el formato antes de usarlo: este valor termina dentro de un
    // atributo `style`, y aceptar cualquier cadena sería meter texto libre en
    // el CSS del documento.
    colorHex: /^#[0-9a-fA-F]{6}$/.test(color) ? color : PDF_CONFIG_POR_DEFECTO.colorHex,
    pieDePagina: str(o.pieDePagina),
    watermark: str(o.watermark),
    mayusculas: o.mayusculas === true,
    modoCompacto: o.modoCompacto === true,
    firmaIzquierda: str(o.firmaIzquierda),
    firmaDerecha: str(o.firmaDerecha),
    // De la columna `pdf_textos`, no de este jsonb (ver 0033).
    textos: leerTextosEmpresa(textos),
  };
}

/**
 * Configuración de la empresa del usuario actual.
 *
 * La migración 0017 siembra una fila por empresa, así que en la práctica
 * siempre existe. Aun así se cae al valor por defecto en vez de lanzar: esta
 * configuración se lee al crear cotizaciones, y es preferible cotizar con el 16%
 * de siempre a que la pantalla reviente porque falta una fila.
 */
export async function getEmpresaConfig(): Promise<EmpresaConfig> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from('empresa_config')
    .select('iva_porcentaje, pdf_config, pdf_textos')
    .maybeSingle();

  if (error || !data) {
    return { ivaPorcentaje: IVA_POR_DEFECTO, pdf: PDF_CONFIG_POR_DEFECTO };
  }

  return {
    ivaPorcentaje: Number(data.iva_porcentaje ?? IVA_POR_DEFECTO),
    pdf: leerPdfConfig(data.pdf_config, data.pdf_textos),
  };
}

/** Lee el modo de orden por lista (jsonb `ui_orden`). Cae a `{}` si falta. */
export async function getUiOrden(): Promise<UiOrden> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('empresa_config')
    .select('ui_orden')
    .maybeSingle();
  if (error || !data) return {};
  return leerUiOrden(data.ui_orden);
}

/**
 * Fija el modo de orden de UNA lista y devuelve el mapa resultante. Hace un
 * merge (no pisa las otras claves). Solo admin/supervisor (policy de 0017).
 */
export async function setOrdenModo(
  listKey: string,
  modo: OrdenModo,
): Promise<{ ok: boolean; error?: string; ui?: UiOrden }> {
  const { empresaId } = await getEmpresaUsuario();
  const supabase = await createClient();

  const actual = await getUiOrden();
  const ui: UiOrden = { ...actual, [listKey]: modo };

  const { error } = await supabase
    .from('empresa_config')
    .update({ ui_orden: ui, updated_at: Date.now() })
    .eq('empresa_id', empresaId);

  if (error) return { ok: false, error: error.message };
  return { ok: true, ui };
}

/** Guarda la personalización del PDF. Admin y supervisor (policy de 0017). */
export async function guardarPdfConfig(
  pdf: PdfConfig,
): Promise<{ ok: boolean; error?: string }> {
  if (!/^#[0-9a-fA-F]{6}$/.test(pdf.colorHex)) {
    return { ok: false, error: 'El color debe ser hexadecimal, por ejemplo #0369A1.' };
  }

  const { empresaId } = await getEmpresaUsuario();
  const supabase = await createClient();

  // Los textos se recortan aquí y no en la UI: este es el único camino a la
  // base, y el tope existe para que un pegado accidental no rompa la hoja.
  const textos = Object.fromEntries(
    Object.entries(pdf.textos ?? {})
      .map(([k, v]) => [k, recortar(String(v ?? ''))])
      .filter(([, v]) => v !== ''),
  );

  // `textos` sale del jsonb a propósito: su casa es la columna `pdf_textos`
  // (0033) y dejarlo también aquí crearía dos fuentes de verdad.
  const { textos: _fuera, ...aspecto } = pdf;
  void _fuera;

  const { error } = await supabase
    .from('empresa_config')
    .update({ pdf_config: aspecto, pdf_textos: textos, updated_at: Date.now() })
    .eq('empresa_id', empresaId);

  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

/**
 * Guarda el IVA por defecto. Solo admin y supervisor (policy de 0017).
 *
 * Cambiar este valor NO toca ninguna cotización existente: cada una guarda la
 * tasa con la que se hizo. Esto es solo el valor de arranque de las nuevas.
 */
export async function guardarIvaPorDefecto(
  ivaPorcentaje: number,
): Promise<{ ok: boolean; error?: string }> {
  if (!Number.isFinite(ivaPorcentaje) || ivaPorcentaje < 0 || ivaPorcentaje > 100) {
    return { ok: false, error: 'El IVA debe ser un número entre 0 y 100.' };
  }

  const { empresaId } = await getEmpresaUsuario();
  const supabase = await createClient();

  const { error } = await supabase
    .from('empresa_config')
    .update({ iva_porcentaje: ivaPorcentaje, updated_at: Date.now() })
    .eq('empresa_id', empresaId);

  if (error) {
    return { ok: false, error: error.message };
  }
  return { ok: true };
}
