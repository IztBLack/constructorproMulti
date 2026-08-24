import type { PdfConfig } from '@/lib/data/empresa-config';
import { formatCurrency, formatDate } from '@/lib/data/format';
import { envolverDocumento, esc, folioCorto } from '@/lib/pdf/documento-base';
import { resolverTextoFinal } from '@/lib/pdf/textos-finales';

/**
 * HTML del documento de una cotización. Solo arma el CUERPO y sus estilos
 * propios; el esqueleto, la tipografía y las clases comunes vienen de
 * `documento-base.ts`, compartidas con los demás PDF.
 *
 * Los tipos de entrada son ESTRUCTURALES (solo lo que el documento pinta), para
 * que lo usen tanto la cotización de oficina (`CotizacionConDetalle`, con
 * `cliente` y `clave`) como la del portal del cliente (`CotizacionPortalConDetalle`,
 * sin esos campos) sin adaptadores ni casts.
 */

/** Lo mínimo que el documento necesita de una cotización. */
export interface CotizacionDocData {
  id: string;
  cliente?: string | null;
  nombre_proyecto: string;
  ubicacion: string | null;
  fecha: number;
  descuento: number;
  iva_enabled: boolean;
  notas: string | null;
  /** Párrafo final propio de esta cotización (0032). Null = el general. */
  texto_final?: string | null;
  secciones: {
    id: string;
    nombre: string;
    partidas: {
      id: string;
      clave?: string | null;
      descripcion: string;
      unidad: string | null;
      cantidad: number;
      precio_unitario: number;
    }[];
  }[];
}

/** Lo mínimo que el documento necesita de los totales. */
export interface TotalesDocData {
  subtotal: number;
  descuentoMonto: number;
  ivaPct: number;
  ivaMonto: number;
  total: number;
}

/** Estilos específicos de la cotización (anchos de columna del cuerpo). */
const ESTILOS = `
  .th-concepto { width: 42%; }
  .concepto { color: #0F172A; line-height: 1.35; }
  .importe { font-weight: 600; color: #0F172A; }
  .sub-fila td { border-top: 1px solid #d4d4d4; border-bottom: none; padding-top: 7px; background: #ffffff; }
  .sub-lbl { font-size: 9px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.06em; color: #737373; }
  .sub-val { font-weight: 700; color: #0F172A; font-variant-numeric: tabular-nums; }
`;

export function construirCotizacionDocumentoHtml(params: {
  cotizacion: CotizacionDocData;
  totales: TotalesDocData;
  nombreEmpresa: string;
  pdf: PdfConfig;
}): string {
  const { cotizacion, totales, nombreEmpresa, pdf } = params;
  const folio = folioCorto(cotizacion.id);

  // El párrafo final se resuelve AQUÍ y no en cada llamador: este builder tiene
  // cuatro (admin y cliente, vista previa y descarga) y resolverlo en cada uno
  // era garantía de que tarde o temprano imprimieran cosas distintas.
  const textoFinal = resolverTextoFinal({
    tipo: 'cotizacion',
    documento: cotizacion.texto_final,
    empresa: pdf.textos,
    ctx: {
      nombreEmpresa,
      ivaEnabled: cotizacion.iva_enabled,
      ivaPct: totales.ivaPct,
    },
  });

  const filasSecciones = cotizacion.secciones
    .map((seccion) => {
      const filas =
        seccion.partidas.length === 0
          ? `<tr><td colspan="5" class="vacia">Sin partidas.</td></tr>`
          : seccion.partidas
              .map((p) => {
                const importe = p.cantidad * p.precio_unitario;
                const clave = p.clave ? `<span class="clave">${esc(p.clave)}</span> ` : '';
                // Partida sin precio: se deja en blanco. Imprimir "$0.00" se lee
                // como "va gratis"; el hueco se lee como "falta cotizar" —que es
                // lo que significa— y sirve para listas de materiales o de
                // conceptos que suministra el cliente.
                const sinPrecio = p.precio_unitario === 0;
                return `
                <tr>
                  <td class="concepto">${clave}${esc(p.descripcion)}</td>
                  <td class="c">${esc(p.unidad) || '—'}</td>
                  <td class="r">${p.cantidad.toLocaleString('es-MX')}</td>
                  <td class="r">${sinPrecio ? '' : formatCurrency(p.precio_unitario)}</td>
                  <td class="r importe">${sinPrecio ? '' : formatCurrency(importe)}</td>
                </tr>`;
              })
              .join('');

      // Subtotal de la sección: lo que ya se ve en pantalla al editarla. Si la
      // sección no suma nada —una relación de materiales sin precios, por
      // ejemplo— no se imprime: un "$0.00" ahí se leería como "sale gratis".
      const subtotalSeccion = seccion.partidas.reduce(
        (acc, p) => acc + p.cantidad * p.precio_unitario,
        0,
      );
      const pieSeccion =
        subtotalSeccion > 0
          ? `<tfoot>
              <tr class="sub-fila">
                <td colspan="4" class="r sub-lbl">Subtotal de la sección</td>
                <td class="r sub-val">${formatCurrency(subtotalSeccion)}</td>
              </tr>
            </tfoot>`
          : '';

      return `
        <div class="seccion avoid">
          <div class="seccion-titulo"><h2>${esc(seccion.nombre)}</h2></div>
          <table>
            <thead>
              <tr>
                <th class="th-concepto">Concepto / Descripción</th>
                <th class="c">Unidad</th>
                <th class="r">Cantidad</th>
                <th class="r">P. Unitario</th>
                <th class="r">Importe</th>
              </tr>
            </thead>
            <tbody>${filas}</tbody>
            ${pieSeccion}
          </table>
        </div>`;
    })
    .join('');

  const sinPartidas =
    cotizacion.secciones.length === 0
      ? `<p class="nota-vacia">Esta cotización no tiene partidas registradas.</p>`
      : '';

  const bloqueCliente = cotizacion.cliente
    ? `<div><p class="etiqueta">Cliente</p><p class="dato">${esc(cotizacion.cliente)}</p></div>`
    : '';

  const bloqueProyecto = cotizacion.nombre_proyecto
    ? `<div><p class="etiqueta">Proyecto</p><p class="dato">${esc(cotizacion.nombre_proyecto)}</p></div>`
    : '';

  const bloqueUbicacion = cotizacion.ubicacion
    ? `<div><p class="etiqueta">Ubicación</p><p class="dato">${esc(cotizacion.ubicacion)}</p></div>`
    : '';

  const filaDescuento =
    cotizacion.descuento > 0
      ? `<div class="tot-fila"><span>Descuento (${cotizacion.descuento}%)</span><span class="r rojo">-${formatCurrency(totales.descuentoMonto)}</span></div>`
      : '';

  const filaIva = cotizacion.iva_enabled
    ? `<div class="tot-fila"><span>IVA (${totales.ivaPct}%)</span><span class="r">${formatCurrency(totales.ivaMonto)}</span></div>`
    : '';

  const bloqueNotas = cotizacion.notas
    ? `<div class="notas"><p class="etiqueta">Notas</p><p class="notas-texto">${esc(cotizacion.notas)}</p></div>`
    : '';

  const bloquePie = pdf.pieDePagina ? `<p class="pie-empresa">${esc(pdf.pieDePagina)}</p>` : '';
  const contacto = pdf.empresaContacto ? `<p class="contacto">${esc(pdf.empresaContacto)}</p>` : '';
  const cuerpo = `
    <header class="doc-header avoid">
      <div>
        <p class="kicker">Cotización / Presupuesto</p>
        <h1 class="emisor">${esc(nombreEmpresa)}</h1>
        ${contacto}
      </div>
      <div class="meta">
        <p class="etiqueta">Folio</p>
        <p class="folio">#${folio}</p>
        <p class="etiqueta sep">Fecha</p>
        <p class="fecha">${formatDate(cotizacion.fecha)}</p>
      </div>
    </header>

    <section class="info-grid avoid">
      ${bloqueCliente}
      ${bloqueProyecto}
      ${bloqueUbicacion}
    </section>

    ${sinPartidas}
    ${filasSecciones}

    <div class="totales avoid">
      <div class="totales-caja">
        <div class="tot-fila"><span>Subtotal</span><span class="r">${formatCurrency(totales.subtotal)}</span></div>
        ${filaDescuento}
        ${filaIva}
        <div class="tot-total"><span class="lbl">TOTAL</span><span class="val">${formatCurrency(totales.total)}</span></div>
      </div>
    </div>

    <footer class="doc-footer avoid">
      ${bloqueNotas}
      <div class="vigencia">
        <p class="vigencia-texto">${esc(textoFinal)}</p>
        ${bloquePie}
      </div>
    </footer>`;

  return envolverDocumento({
    titulo: `Cotización ${nombreEmpresa} #${folio}`,
    pdf,
    cuerpo,
    estilos: ESTILOS,
  });
}
