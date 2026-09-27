/**
 * Lector de facturas CFDI 4.0 (RF1b.6): del XML timbrado saca el folio fiscal
 * (UUID del Timbre Fiscal Digital), los montos, emisor, receptor, conceptos y, si
 * es un complemento de pago, los pagos y las facturas que liquida.
 *
 * POR QUÉ UN LECTOR PROPIO Y NO UNA LIBRERÍA
 * ──────────────────────────────────────────
 * En el runtime de Node de las Server Actions no hay `DOMParser` (es del
 * navegador), y un parser XML completo es una dependencia más para leer un
 * archivo cuya forma fija el SAT. Esto es un tokenizador pequeño que:
 *   · resuelve los NAMESPACES de verdad (no confía en los prefijos `cfdi:` /
 *     `tfd:`, que cada PAC puede nombrar distinto),
 *   · exige que las etiquetas cierren bien,
 *   · RECHAZA cualquier DOCTYPE: así no hay entidades externas ni "bombas" de
 *     expansión (XXE) que atender,
 *   · solo decodifica las 5 entidades de XML y las numéricas.
 *
 * No valida sello ni cadena original: eso es del SAT. Si el usuario quiere
 * saber si la factura es válida, la verifica en el portal del SAT.
 */

const NS_CFDI4 = 'http://www.sat.gob.mx/cfd/4';
const NS_CFDI3 = 'http://www.sat.gob.mx/cfd/3';
const NS_TFD = 'http://www.sat.gob.mx/TimbreFiscalDigital';
const NS_PAGOS20 = 'http://www.sat.gob.mx/Pagos20';

/** Un CFDI pesa decenas de KB; 2 MB ya es sospechoso. */
export const TAMANO_MAXIMO_XML = 2 * 1024 * 1024;

export interface NodoXml {
  ns: string;
  nombre: string;
  attrs: Record<string, string>;
  hijos: NodoXml[];
}

export interface ConceptoCfdi {
  claveProdServ: string;
  claveUnidad: string;
  cantidad: number;
  descripcion: string;
  valorUnitario: number;
  importe: number;
}

export interface PagoCfdi {
  fechaPago: string;
  formaPago: string;
  monto: number;
  documentos: { idDocumento: string; parcialidad: number | null; impPagado: number }[];
}

export type TipoComprobante = 'I' | 'E' | 'P' | 'T' | 'N';

export interface CfdiLeido {
  uuid: string;
  fechaTimbrado: string | null;
  fecha: string;
  tipo: TipoComprobante;
  serie: string | null;
  folio: string | null;
  metodoPago: 'PUE' | 'PPD' | null;
  formaPago: string | null;
  moneda: string;
  subtotal: number;
  descuento: number;
  total: number;
  ivaTrasladado: number;
  isrRetenido: number;
  ivaRetenido: number;
  emisor: { rfc: string; nombre: string; regimen: string };
  receptor: { rfc: string; nombre: string; regimen: string; cp: string; uso: string };
  conceptos: ConceptoCfdi[];
  /** Solo en complementos de pago (tipo P). */
  pagos: PagoCfdi[];
  /** CFDI relacionados (por ejemplo, el anticipo que se aplica). */
  relacionados: { tipoRelacion: string; uuids: string[] }[];
}

export type ResultadoCfdi = { ok: true; cfdi: CfdiLeido } | { ok: false; error: string };

// ── Tokenizador ──────────────────────────────────────────────────────────────

function decodificar(s: string): string {
  return s.replace(/&(#x[0-9a-fA-F]+|#[0-9]+|lt|gt|amp|quot|apos);/g, (_, e: string) => {
    switch (e) {
      case 'lt':
        return '<';
      case 'gt':
        return '>';
      case 'amp':
        return '&';
      case 'quot':
        return '"';
      case 'apos':
        return "'";
      default: {
        const n = e[1] === 'x' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
        return Number.isFinite(n) && n >= 0 && n <= 0x10ffff ? String.fromCodePoint(n) : '';
      }
    }
  });
}

const RE_ETIQUETA = /<(\/?)([A-Za-z_][\w.-]*(?::[A-Za-z_][\w.-]*)?)((?:\s+[^\s=/>]+\s*=\s*(?:"[^"]*"|'[^']*'))*)\s*(\/?)>/g;
const RE_ATRIBUTO = /([^\s=/>]+)\s*=\s*(?:"([^"]*)"|'([^']*)')/g;

class ErrorXml extends Error {}

/**
 * Convierte el XML en un árbol con namespaces resueltos. Lanza `ErrorXml` si el
 * archivo no está bien formado o trae DOCTYPE.
 */
export function parsearXml(xml: string): NodoXml {
  let texto = xml.replace(/^﻿/, '');
  if (/<!DOCTYPE/i.test(texto)) throw new ErrorXml('El archivo trae una declaración DOCTYPE, que una factura no usa.');
  // Fuera comentarios, instrucciones de proceso y CDATA (una factura no los necesita).
  texto = texto
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/<\?[\s\S]*?\?>/g, '')
    .replace(/<!\[CDATA\[[\s\S]*?\]\]>/g, '');

  const raiz: NodoXml = { ns: '', nombre: '#documento', attrs: {}, hijos: [] };
  const pila: { nodo: NodoXml; qname: string; scope: Map<string, string> }[] = [
    { nodo: raiz, qname: '', scope: new Map([['xml', 'http://www.w3.org/XML/1998/namespace']]) },
  ];

  let ultimo = 0;
  for (const m of texto.matchAll(RE_ETIQUETA)) {
    // Entre etiquetas solo puede haber texto (que no usamos), nunca un "<" suelto.
    if (texto.slice(ultimo, m.index).includes('<')) throw new ErrorXml('Etiqueta mal formada.');
    ultimo = m.index + m[0].length;

    const [, cierre, qname, crudoAttrs, autocierre] = m;
    if (cierre) {
      if (crudoAttrs.trim() || autocierre) throw new ErrorXml('Etiqueta de cierre mal formada.');
      const tope = pila.pop();
      if (!tope || tope.qname !== qname || pila.length === 0) {
        throw new ErrorXml(`La etiqueta </${qname}> no cierra la que estaba abierta.`);
      }
      continue;
    }

    const padre = pila[pila.length - 1];
    const scope = new Map(padre.scope);
    const crudos: [string, string][] = [];
    for (const a of crudoAttrs.matchAll(RE_ATRIBUTO)) {
      const nombre = a[1];
      const valor = decodificar(a[2] ?? a[3] ?? '');
      if (nombre === 'xmlns') scope.set('', valor);
      else if (nombre.startsWith('xmlns:')) scope.set(nombre.slice(6), valor);
      else crudos.push([nombre, valor]);
    }

    const [prefijo, local] = qname.includes(':') ? qname.split(':') : ['', qname];
    const ns = scope.get(prefijo);
    if (ns === undefined && prefijo !== '') {
      throw new ErrorXml(`El prefijo "${prefijo}" no está declarado.`);
    }
    const attrs: Record<string, string> = {};
    for (const [nombre, valor] of crudos) {
      // Los atributos que usamos no llevan prefijo; los que sí (xsi:…) se guardan tal cual.
      attrs[nombre] = valor;
    }
    const nodo: NodoXml = { ns: ns ?? '', nombre: local, attrs, hijos: [] };
    padre.nodo.hijos.push(nodo);
    if (!autocierre) pila.push({ nodo, qname, scope });
  }
  if (texto.slice(ultimo).includes('<')) throw new ErrorXml('Etiqueta mal formada al final del archivo.');
  if (pila.length !== 1) throw new ErrorXml('El archivo terminó con etiquetas sin cerrar.');
  if (raiz.hijos.length !== 1) throw new ErrorXml('El archivo debe tener un solo elemento raíz.');
  return raiz.hijos[0];
}

// ── Consultas sobre el árbol ─────────────────────────────────────────────────

const hijo = (n: NodoXml | undefined, ns: string, nombre: string) =>
  n?.hijos.find((h) => h.ns === ns && h.nombre === nombre);
const hijos = (n: NodoXml | undefined, ns: string, nombre: string) =>
  n?.hijos.filter((h) => h.ns === ns && h.nombre === nombre) ?? [];

function buscar(n: NodoXml, ns: string, nombre: string): NodoXml | undefined {
  for (const h of n.hijos) {
    if (h.ns === ns && h.nombre === nombre) return h;
    const r = buscar(h, ns, nombre);
    if (r) return r;
  }
  return undefined;
}

const num = (v: string | undefined): number => {
  const n = Number(v ?? '');
  return Number.isFinite(n) ? n : 0;
};
const texto = (v: string | undefined): string => (v ?? '').trim();
const opcional = (v: string | undefined): string | null => (v && v.trim() ? v.trim() : null);

// ── API ──────────────────────────────────────────────────────────────────────

/** Lee un CFDI 4.0 timbrado. Nunca lanza: los problemas vuelven como `error`. */
export function leerCfdi(xml: string): ResultadoCfdi {
  if (xml.length === 0) return { ok: false, error: 'El archivo está vacío.' };
  if (xml.length > TAMANO_MAXIMO_XML) return { ok: false, error: 'El archivo es demasiado grande para ser una factura.' };

  let raiz: NodoXml;
  try {
    raiz = parsearXml(xml);
  } catch (e) {
    const detalle = e instanceof ErrorXml ? ` (${e.message})` : '';
    return { ok: false, error: `El archivo no es un XML válido${detalle}.` };
  }

  if (raiz.nombre !== 'Comprobante') {
    return { ok: false, error: 'El archivo no es una factura (CFDI): no empieza con un Comprobante.' };
  }
  if (raiz.ns === NS_CFDI3) {
    return { ok: false, error: 'Es una factura versión 3.3. Solo se leen facturas CFDI 4.0.' };
  }
  if (raiz.ns !== NS_CFDI4 || raiz.attrs.Version !== '4.0') {
    return { ok: false, error: 'Solo se leen facturas CFDI 4.0.' };
  }

  const complemento = hijo(raiz, NS_CFDI4, 'Complemento');
  const timbre = complemento ? buscar(complemento, NS_TFD, 'TimbreFiscalDigital') : undefined;
  const uuid = texto(timbre?.attrs.UUID).toUpperCase();
  if (!/^[0-9A-F]{8}-[0-9A-F]{4}-[0-9A-F]{4}-[0-9A-F]{4}-[0-9A-F]{12}$/.test(uuid)) {
    return {
      ok: false,
      error: 'La factura no está timbrada: no trae folio fiscal (UUID). Descarga el XML ya timbrado.',
    };
  }

  const tipo = texto(raiz.attrs.TipoDeComprobante) as TipoComprobante;
  if (!['I', 'E', 'P', 'T', 'N'].includes(tipo)) {
    return { ok: false, error: 'La factura no dice qué tipo de comprobante es.' };
  }

  const emisor = hijo(raiz, NS_CFDI4, 'Emisor');
  const receptor = hijo(raiz, NS_CFDI4, 'Receptor');
  const impuestos = hijo(raiz, NS_CFDI4, 'Impuestos');

  let ivaTrasladado = 0;
  for (const t of hijos(hijo(impuestos, NS_CFDI4, 'Traslados'), NS_CFDI4, 'Traslado')) {
    if (t.attrs.Impuesto === '002') ivaTrasladado += num(t.attrs.Importe);
  }
  let isrRetenido = 0;
  let ivaRetenido = 0;
  for (const r of hijos(hijo(impuestos, NS_CFDI4, 'Retenciones'), NS_CFDI4, 'Retencion')) {
    if (r.attrs.Impuesto === '001') isrRetenido += num(r.attrs.Importe);
    if (r.attrs.Impuesto === '002') ivaRetenido += num(r.attrs.Importe);
  }

  const conceptos: ConceptoCfdi[] = hijos(hijo(raiz, NS_CFDI4, 'Conceptos'), NS_CFDI4, 'Concepto').map(
    (c) => ({
      claveProdServ: texto(c.attrs.ClaveProdServ),
      claveUnidad: texto(c.attrs.ClaveUnidad),
      cantidad: num(c.attrs.Cantidad),
      descripcion: texto(c.attrs.Descripcion),
      valorUnitario: num(c.attrs.ValorUnitario),
      importe: num(c.attrs.Importe),
    }),
  );

  const nodoPagos = complemento ? buscar(complemento, NS_PAGOS20, 'Pagos') : undefined;
  const pagos: PagoCfdi[] = hijos(nodoPagos, NS_PAGOS20, 'Pago').map((p) => ({
    fechaPago: texto(p.attrs.FechaPago),
    formaPago: texto(p.attrs.FormaDePagoP),
    monto: num(p.attrs.Monto),
    documentos: hijos(p, NS_PAGOS20, 'DoctoRelacionado').map((d) => ({
      idDocumento: texto(d.attrs.IdDocumento).toUpperCase(),
      parcialidad: d.attrs.NumParcialidad ? num(d.attrs.NumParcialidad) : null,
      impPagado: num(d.attrs.ImpPagado),
    })),
  }));

  const relacionados = hijos(raiz, NS_CFDI4, 'CfdiRelacionados').map((r) => ({
    tipoRelacion: texto(r.attrs.TipoRelacion),
    uuids: hijos(r, NS_CFDI4, 'CfdiRelacionado').map((x) => texto(x.attrs.UUID).toUpperCase()),
  }));

  const metodo = texto(raiz.attrs.MetodoPago);

  return {
    ok: true,
    cfdi: {
      uuid,
      fechaTimbrado: opcional(timbre?.attrs.FechaTimbrado),
      fecha: texto(raiz.attrs.Fecha),
      tipo,
      serie: opcional(raiz.attrs.Serie),
      folio: opcional(raiz.attrs.Folio),
      metodoPago: metodo === 'PUE' || metodo === 'PPD' ? metodo : null,
      formaPago: opcional(raiz.attrs.FormaPago),
      moneda: texto(raiz.attrs.Moneda) || 'MXN',
      subtotal: num(raiz.attrs.SubTotal),
      descuento: num(raiz.attrs.Descuento),
      total: num(raiz.attrs.Total),
      ivaTrasladado,
      isrRetenido,
      ivaRetenido,
      emisor: {
        rfc: texto(emisor?.attrs.Rfc).toUpperCase(),
        nombre: texto(emisor?.attrs.Nombre),
        regimen: texto(emisor?.attrs.RegimenFiscal),
      },
      receptor: {
        rfc: texto(receptor?.attrs.Rfc).toUpperCase(),
        nombre: texto(receptor?.attrs.Nombre),
        regimen: texto(receptor?.attrs.RegimenFiscalReceptor),
        cp: texto(receptor?.attrs.DomicilioFiscalReceptor),
        uso: texto(receptor?.attrs.UsoCFDI),
      },
      conceptos,
      pagos,
      relacionados,
    },
  };
}

/**
 * Fecha del CFDI ("2026-09-15T10:30:00", hora local de quien timbra, sin zona)
 * a epoch ms, tomándola como hora del centro de México. `null` si no se entiende.
 */
export function fechaCfdiAMs(fecha: string | null | undefined): number | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})/.exec(fecha ?? '');
  if (!m) return null;
  // El centro de México no tiene horario de verano desde 2022: UTC−6 fijo.
  const ms = Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4] + 6, +m[5], +m[6]);
  return Number.isFinite(ms) ? ms : null;
}

/** Normaliza un folio fiscal pegado a mano. `null` si no tiene forma de UUID. */
export function normalizarUuid(crudo: string): string | null {
  const u = crudo.trim().toUpperCase();
  return /^[0-9A-F]{8}-[0-9A-F]{4}-[0-9A-F]{4}-[0-9A-F]{4}-[0-9A-F]{12}$/.test(u) ? u : null;
}
