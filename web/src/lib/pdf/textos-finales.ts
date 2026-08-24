/**
 * El PÁRRAFO FINAL de cada documento imprimible: el que hoy dice "vigencia de
 * 30 días naturales…" al pie de una cotización.
 *
 * Hasta ahora estaba escrito a mano dentro de cada builder de HTML, así que no
 * había forma de tocarlo desde la app. Aquí se resuelve en un solo lugar, con
 * tres niveles:
 *
 *   1. El texto del DOCUMENTO   (`texto_final` de esa cotización/nota/obra)
 *   2. El texto de la EMPRESA   (`pdf_config.textos[tipo]`, en Ajustes → PDF)
 *   3. El texto INTEGRADO       (el de siempre, que depende de datos vivos)
 *
 * Gana el más específico que exista. El integrado es el único que se arma con
 * datos del momento (nombre de la empresa, leyenda del IVA); en cuanto alguien
 * escribe el suyo, manda su texto literal — sin plantillas ni sustituciones,
 * porque un texto legal con huecos que se rellenan solos es justo la clase de
 * cosa que después nadie sabe explicar frente a un cliente.
 *
 * Módulo puro: lo usan el editor (para previsualizar) y el builder del PDF
 * (para imprimir). Si cada uno lo resolviera por su cuenta, un día enseñarían
 * cosas distintas.
 */

export type TipoDocumento = 'cotizacion' | 'nota' | 'estado_cuenta';

export const TIPOS_DOCUMENTO: TipoDocumento[] = ['cotizacion', 'nota', 'estado_cuenta'];

/** Cómo se llama cada tipo en la interfaz (Ajustes → PDF). */
export const NOMBRE_TIPO: Record<TipoDocumento, string> = {
  cotizacion: 'Cotización',
  nota: 'Nota de obra',
  estado_cuenta: 'Estado de cuenta del cliente',
};

/** Textos generales por tipo, tal como se guardan en `pdf_config.textos`. */
export type TextosEmpresa = Partial<Record<TipoDocumento, string>>;

/** Datos vivos que necesita el texto integrado para armarse. */
export interface ContextoTextoFinal {
  nombreEmpresa: string;
  /** Cotización: si lleva IVA y a qué tasa. */
  ivaEnabled?: boolean;
  ivaPct?: number;
  /** Nota de obra: a nombre de quién va. */
  destinatario?: string;
}

/**
 * El texto de siempre. Es el que se imprime mientras nadie escriba el suyo, y
 * también el que se propone como punto de partida al editar: nadie debería
 * empezar frente a un campo vacío teniendo que redactar condiciones de cero.
 */
export function textoIntegrado(tipo: TipoDocumento, ctx: ContextoTextoFinal): string {
  const empresa = ctx.nombreEmpresa.trim() || 'ConstructorPro';

  switch (tipo) {
    case 'cotizacion': {
      const iva = ctx.ivaEnabled
        ? ` Los precios incluyen IVA (${ctx.ivaPct ?? 16}%).`
        : ' Los precios no incluyen IVA.';
      return (
        'Esta cotización tiene una vigencia de 30 días naturales a partir de la fecha de emisión. ' +
        `Los precios están expresados en pesos mexicanos (MXN).${iva} ` +
        `Para consultas o aclaraciones comuníquese con ${empresa}.`
      );
    }

    case 'nota': {
      const quien = ctx.destinatario?.trim() || 'la parte indicada';
      return (
        `Relación de trabajos y pagos acordados entre ${empresa} y ${quien}. ` +
        'Montos en pesos mexicanos (MXN). ' +
        'Cualquier diferencia se aclara antes del siguiente pago.'
      );
    }

    case 'estado_cuenta':
      return (
        'Documento informativo del avance de pagos de su obra. Los montos están expresados en ' +
        `pesos mexicanos (MXN). Para cualquier aclaración comuníquese con ${empresa}.`
      );
  }
}

/**
 * Un texto guardado cuenta solo si tiene algo que imprimir. Acepta `unknown`
 * porque también filtra lo que sale del jsonb, donde puede venir cualquier cosa.
 */
function hayTexto(v: unknown): v is string {
  return typeof v === 'string' && v.trim() !== '';
}

/**
 * El texto que realmente se imprime. Documento → empresa → integrado.
 *
 * Devolver siempre algo (nunca cadena vacía) es deliberado: si alguien quiere
 * un documento SIN párrafo final, la forma de decirlo no puede ser dejar un
 * campo en blanco por descuido.
 */
export function resolverTextoFinal(p: {
  tipo: TipoDocumento;
  /** Lo escrito en este documento en particular. */
  documento?: string | null;
  /** Lo escrito en Ajustes → PDF para este tipo. */
  empresa?: TextosEmpresa | null;
  ctx: ContextoTextoFinal;
}): string {
  if (hayTexto(p.documento)) return p.documento.trim();

  const general = p.empresa?.[p.tipo];
  if (hayTexto(general)) return general.trim();

  return textoIntegrado(p.tipo, p.ctx);
}

/** De dónde salió el texto que se está imprimiendo. Alimenta la insignia. */
export type OrigenTexto = 'documento' | 'empresa' | 'integrado';

export function origenTextoFinal(p: {
  tipo: TipoDocumento;
  documento?: string | null;
  empresa?: TextosEmpresa | null;
}): OrigenTexto {
  if (hayTexto(p.documento)) return 'documento';
  if (hayTexto(p.empresa?.[p.tipo])) return 'empresa';
  return 'integrado';
}

/** Normaliza el jsonb `pdf_config.textos`: descarta claves y valores basura. */
export function leerTextosEmpresa(crudo: unknown): TextosEmpresa {
  if (!crudo || typeof crudo !== 'object') return {};
  const out: TextosEmpresa = {};
  for (const tipo of TIPOS_DOCUMENTO) {
    const v = (crudo as Record<string, unknown>)[tipo];
    if (hayTexto(v)) out[tipo] = v.trim();
  }
  return out;
}

/**
 * Tope de longitud. No es una regla de negocio: es que este texto se imprime
 * completo al pie de una hoja, y sin límite un pegado accidental de tres
 * páginas rompe el documento en silencio.
 */
export const LARGO_MAXIMO = 1200;

export function recortar(texto: string): string {
  return texto.trim().slice(0, LARGO_MAXIMO);
}
