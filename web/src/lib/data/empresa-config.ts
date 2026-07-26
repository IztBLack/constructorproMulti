import { createClient } from '@/lib/supabase/server';
import { getEmpresaUsuario } from './empresa';

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
};

export interface EmpresaConfig {
  ivaPorcentaje: number;
  pdf: PdfConfig;
}

/** Normaliza lo que venga del jsonb: puede ser null, incompleto o basura. */
function leerPdfConfig(crudo: unknown): PdfConfig {
  if (!crudo || typeof crudo !== 'object') return PDF_CONFIG_POR_DEFECTO;
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
    .select('iva_porcentaje, pdf_config')
    .maybeSingle();

  if (error || !data) {
    return { ivaPorcentaje: IVA_POR_DEFECTO, pdf: PDF_CONFIG_POR_DEFECTO };
  }

  return {
    ivaPorcentaje: Number(data.iva_porcentaje ?? IVA_POR_DEFECTO),
    pdf: leerPdfConfig(data.pdf_config),
  };
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

  const { error } = await supabase
    .from('empresa_config')
    .update({ pdf_config: pdf, updated_at: Date.now() })
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
