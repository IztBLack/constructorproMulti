/**
 * Catálogos del SAT (Anexo 20, CFDI 4.0) que usa el módulo `fiscal`.
 *
 * Son listas ESTÁTICAS a propósito (no tablas): cambian una vez al año como
 * mucho, y la app no factura; solo ayuda a copiar. Si el SAT agrega una clave,
 * se agrega aquí.
 *
 * ESPEJO EN LA BASE: `supabase/migrations/0037_datos_fiscales.sql` repite las
 * claves de régimen y de uso del CFDI en `fiscal_regimenes()` y
 * `fiscal_usos_cfdi()` (para los CHECK). `catalogos.test.ts` compara las dos.
 *
 * Módulo puro: lo importan componentes de cliente, de servidor y pruebas.
 */

export type TipoPersona = 'fisica' | 'moral';

export interface Regimen {
  clave: string;
  texto: string;
  /** Para quién aplica según el catálogo c_RegimenFiscal. */
  aplica: TipoPersona[];
}

/** c_RegimenFiscal. */
export const REGIMENES: readonly Regimen[] = [
  { clave: '601', texto: 'General de Ley Personas Morales', aplica: ['moral'] },
  { clave: '603', texto: 'Personas Morales con Fines no Lucrativos', aplica: ['moral'] },
  { clave: '605', texto: 'Sueldos y Salarios e Ingresos Asimilados a Salarios', aplica: ['fisica'] },
  { clave: '606', texto: 'Arrendamiento', aplica: ['fisica'] },
  { clave: '607', texto: 'Régimen de Enajenación o Adquisición de Bienes', aplica: ['fisica'] },
  { clave: '608', texto: 'Demás ingresos', aplica: ['fisica'] },
  { clave: '610', texto: 'Residentes en el Extranjero sin Establecimiento Permanente en México', aplica: ['fisica', 'moral'] },
  { clave: '611', texto: 'Ingresos por Dividendos (socios y accionistas)', aplica: ['fisica'] },
  { clave: '612', texto: 'Personas Físicas con Actividades Empresariales y Profesionales', aplica: ['fisica'] },
  { clave: '614', texto: 'Ingresos por intereses', aplica: ['fisica'] },
  { clave: '615', texto: 'Régimen de los ingresos por obtención de premios', aplica: ['fisica'] },
  { clave: '616', texto: 'Sin obligaciones fiscales', aplica: ['fisica'] },
  { clave: '620', texto: 'Sociedades Cooperativas de Producción que optan por diferir sus ingresos', aplica: ['moral'] },
  { clave: '621', texto: 'Incorporación Fiscal', aplica: ['fisica'] },
  { clave: '622', texto: 'Actividades Agrícolas, Ganaderas, Silvícolas y Pesqueras', aplica: ['moral'] },
  { clave: '623', texto: 'Opcional para Grupos de Sociedades', aplica: ['moral'] },
  { clave: '624', texto: 'Coordinados', aplica: ['moral'] },
  { clave: '625', texto: 'Régimen de las Actividades Empresariales con ingresos a través de Plataformas Tecnológicas', aplica: ['fisica'] },
  { clave: '626', texto: 'Régimen Simplificado de Confianza', aplica: ['fisica', 'moral'] },
];

export interface OpcionCatalogo {
  clave: string;
  texto: string;
}

/**
 * c_UsoCFDI — solo los que tienen sentido para un cliente de obra. El catálogo
 * completo trae deducciones personales y nómina, que aquí solo confunden.
 */
export const USOS_CFDI: readonly OpcionCatalogo[] = [
  { clave: 'G03', texto: 'Gastos en general' },
  { clave: 'I01', texto: 'Construcciones' },
  { clave: 'G01', texto: 'Adquisición de mercancías' },
  { clave: 'I08', texto: 'Otra maquinaria y equipo' },
  { clave: 'S01', texto: 'Sin efectos fiscales' },
];

/** c_FormaPago — las que se ven en una obra. */
export const FORMAS_PAGO: readonly OpcionCatalogo[] = [
  { clave: '01', texto: 'Efectivo' },
  { clave: '02', texto: 'Cheque nominativo' },
  { clave: '03', texto: 'Transferencia electrónica de fondos' },
  { clave: '04', texto: 'Tarjeta de crédito' },
  { clave: '28', texto: 'Tarjeta de débito' },
  { clave: '99', texto: 'Por definir' },
];

export type MetodoPago = 'PUE' | 'PPD';

/** c_MetodoPago, en palabras de obra. */
export const METODOS_PAGO: readonly { clave: MetodoPago; texto: string; llano: string }[] = [
  { clave: 'PUE', texto: 'Pago en una sola exhibición', llano: 'Ya te pagaron todo lo que dice la factura' },
  { clave: 'PPD', texto: 'Pago en parcialidades o diferido', llano: 'Te van a pagar después o en partes' },
];

/** c_ClaveUnidad — las de uso común en obra. */
export const UNIDADES_SAT: readonly OpcionCatalogo[] = [
  { clave: 'E48', texto: 'Unidad de servicio' },
  { clave: 'ACT', texto: 'Actividad' },
  { clave: 'MTK', texto: 'Metro cuadrado' },
  { clave: 'MTQ', texto: 'Metro cúbico' },
  { clave: 'MTR', texto: 'Metro' },
  { clave: 'H87', texto: 'Pieza' },
  { clave: 'KGM', texto: 'Kilogramo' },
  { clave: 'LTR', texto: 'Litro' },
  { clave: 'XBX', texto: 'Caja' },
];

export interface ClaveSugerida {
  clave: string;
  /** Descripción del catálogo c_ClaveProdServ, tal cual. */
  texto: string;
  /** Para qué trabajo conviene, en palabras de obra. */
  uso: string;
  /** Unidad que suele acompañarla. */
  unidad: string;
  /** Dónde se verificó (ver docs/PROGRESO_ALCANCE.md, F1b). */
  fuente: 'sat' | 'anexo20';
}

/**
 * Sugerencias de c_ClaveProdServ para construcción (segmento 72).
 *
 * SOLO claves verificadas (2026-09-26):
 *   · `sat`: aparecen en la sugerencia oficial del SAT "Servicios de construcción
 *     y profesionales de arquitectura" (Sugerencia_PyS/Cosntruc_y_arquitec.pdf),
 *     con unidad E48.
 *   · `anexo20`: se confirmó que existen y están vigentes en el catálogo
 *     c_ClaveProdServ del Anexo 20 v4.0 (consulta por clave).
 *
 * Siempre se muestran con la leyenda `LEYENDA_SUGERENCIA`: la app sugiere, quien
 * factura decide.
 */
export const CLAVES_CONSTRUCCION: readonly ClaveSugerida[] = [
  { clave: '72111000', texto: 'Servicios de construcción de unidades unifamiliares', uso: 'Construcción de casa', unidad: 'E48', fuente: 'sat' },
  { clave: '72111001', texto: 'Servicios de reparación o ampliación por remodelación de viviendas unifamiliares', uso: 'Remodelación o ampliación de casa', unidad: 'E48', fuente: 'sat' },
  { clave: '72111100', texto: 'Servicios de construcción de unidades multifamiliares', uso: 'Construcción de edificio de departamentos', unidad: 'E48', fuente: 'sat' },
  { clave: '72121000', texto: 'Servicios de construcción de edificios industriales y bodegas nuevas', uso: 'Nave industrial o bodega', unidad: 'E48', fuente: 'sat' },
  { clave: '72121100', texto: 'Servicios de construcción de edificios comerciales y de oficina', uso: 'Local comercial u oficinas', unidad: 'E48', fuente: 'sat' },
  { clave: '80111618', texto: 'Servicios temporales de construcción', uso: 'Mano de obra por temporada', unidad: 'E48', fuente: 'sat' },
  { clave: '72101500', texto: 'Servicios de apoyo para la construcción', uso: 'Trabajos de apoyo en obra', unidad: 'E48', fuente: 'anexo20' },
  { clave: '72151900', texto: 'Servicios de albañilería y mampostería', uso: 'Albañilería', unidad: 'E48', fuente: 'anexo20' },
  { clave: '72151100', texto: 'Servicios de construcción de plomería', uso: 'Plomería e instalación hidrosanitaria', unidad: 'E48', fuente: 'anexo20' },
  { clave: '72151500', texto: 'Servicios de sistemas eléctricos', uso: 'Instalación eléctrica', unidad: 'E48', fuente: 'anexo20' },
  { clave: '72151300', texto: 'Servicios de pintura e instalación de papel de colgadura', uso: 'Pintura', unidad: 'E48', fuente: 'anexo20' },
  { clave: '72152300', texto: 'Servicios de carpintería', uso: 'Carpintería', unidad: 'E48', fuente: 'anexo20' },
  { clave: '72153204', texto: 'Servicio de impermeabilización', uso: 'Impermeabilización', unidad: 'E48', fuente: 'anexo20' },
  { clave: '72152600', texto: 'Servicios de techado y paredes externas y láminas de metal', uso: 'Techos y lámina', unidad: 'E48', fuente: 'anexo20' },
  { clave: '72141510', texto: 'Servicios de demolición', uso: 'Demolición', unidad: 'E48', fuente: 'anexo20' },
  { clave: '72141511', texto: 'Servicio de excavación', uso: 'Excavación', unidad: 'E48', fuente: 'anexo20' },
];

/** Leyenda obligatoria junto a cualquier clave sugerida (decisión D3). */
export const LEYENDA_SUGERENCIA = 'Sugerencia; confírmala con tu contador.';

/**
 * Clave y unidad que pide el SAT para facturar un ANTICIPO (guía de llenado del
 * Anexo 20, apéndice "anticipos recibidos"): un solo concepto, cantidad 1,
 * descripción "Anticipo del bien o servicio".
 */
export const ANTICIPO_SAT = {
  clave: '84111506',
  unidad: 'ACT',
  descripcion: 'Anticipo del bien o servicio',
} as const;

/** Leyenda de la hoja: no es un documento fiscal. */
export const LEYENDA_NO_ES_FACTURA = 'Este documento no es una factura ni un comprobante fiscal.';

const POR_CLAVE_REGIMEN = new Map(REGIMENES.map((r) => [r.clave, r]));
const POR_CLAVE_USO = new Map(USOS_CFDI.map((u) => [u.clave, u]));
const POR_CLAVE_FORMA = new Map(FORMAS_PAGO.map((f) => [f.clave, f]));
const POR_CLAVE_UNIDAD = new Map(UNIDADES_SAT.map((u) => [u.clave, u]));
const POR_CLAVE_PS = new Map(CLAVES_CONSTRUCCION.map((c) => [c.clave, c]));

export const textoRegimen = (c: string | null | undefined) =>
  (c && POR_CLAVE_REGIMEN.get(c)?.texto) || '';
export const textoUso = (c: string | null | undefined) => (c && POR_CLAVE_USO.get(c)?.texto) || '';
export const textoForma = (c: string | null | undefined) =>
  (c && POR_CLAVE_FORMA.get(c)?.texto) || '';
export const textoUnidad = (c: string | null | undefined) =>
  (c && POR_CLAVE_UNIDAD.get(c)?.texto) || '';
export const claveSugerida = (c: string | null | undefined) => (c ? POR_CLAVE_PS.get(c) : undefined);

export const esRegimen = (x: unknown): x is string => typeof x === 'string' && POR_CLAVE_REGIMEN.has(x);
export const esUsoCfdi = (x: unknown): x is string => typeof x === 'string' && POR_CLAVE_USO.has(x);
export const esFormaPago = (x: unknown): x is string => typeof x === 'string' && POR_CLAVE_FORMA.has(x);

/** Regímenes que puede tener una persona física o moral. */
export function regimenesPara(tipo: TipoPersona | null): Regimen[] {
  return tipo ? REGIMENES.filter((r) => r.aplica.includes(tipo)) : [...REGIMENES];
}

/**
 * Forma de pago del SAT a partir del método que se capturó en la app
 * (`pagos.metodo` / `movimientos.metodo_pago`). `TARJETA` no dice si fue de
 * crédito o débito: se sugiere crédito y la hoja lo avisa.
 */
export function formaPagoDeMetodo(metodo: string | null | undefined): string {
  switch ((metodo ?? '').trim().toUpperCase()) {
    case 'EFECTIVO':
      return '01';
    case 'CHEQUE':
      return '02';
    case 'TRANSFERENCIA':
    case 'SPEI':
    case 'DEPOSITO':
    case 'DEPÓSITO':
      return '03';
    case 'TARJETA':
      return '04';
    default:
      return '99';
  }
}
