import type { CotizacionConDetalle } from '@/lib/data/types';
import type { TotalesCotizacion } from '@/lib/data/cotizaciones';
import type { PdfConfig } from '@/lib/data/empresa-config';
import { formatCurrency, formatDate } from '@/lib/data/format';

/**
 * HTML autocontenido del documento de una cotización.
 *
 * Es la ÚNICA fuente de verdad del diseño del PDF: lo consume tanto el preview en
 * la web (dentro de un <iframe srcDoc>) como la ruta que lo imprime a PDF con
 * Chromium headless. Al ser el mismo HTML, lo que se ve en pantalla y lo que se
 * descarga son idénticos por construcción.
 *
 * Todo el CSS va inline (nada de Tailwind) para que el archivo se baste solo:
 * Chromium lo renderiza sin cargar la hoja de estilos de la app, y el <iframe> no
 * hereda ni filtra estilos. El `@page` y los `break-inside: avoid` mantienen cada
 * bloque (encabezado, cada sección, totales, pie) entero: nunca se parte a media
 * sección entre dos hojas.
 */

/** Escapa texto de usuario para meterlo seguro en el HTML. */
function esc(v: string | null | undefined): string {
  return String(v ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/** Folio corto: últimos 8 caracteres del UUID. */
function folioCorto(id: string): string {
  return id.replace(/-/g, '').slice(-8).toUpperCase();
}

export function construirCotizacionDocumentoHtml(params: {
  cotizacion: CotizacionConDetalle;
  totales: TotalesCotizacion;
  nombreEmpresa: string;
  pdf: PdfConfig;
}): string {
  const { cotizacion, totales, nombreEmpresa, pdf } = params;
  const accent = pdf.colorHex; // validado como #RRGGBB en empresa-config
  const folio = folioCorto(cotizacion.id);

  const filasSecciones = cotizacion.secciones
    .map((seccion) => {
      const filas =
        seccion.partidas.length === 0
          ? `<tr><td colspan="5" class="vacia">Sin partidas.</td></tr>`
          : seccion.partidas
              .map((p) => {
                const importe = p.cantidad * p.precio_unitario;
                const clave = p.clave
                  ? `<span class="clave">${esc(p.clave)}</span> `
                  : '';
                return `
                <tr>
                  <td class="concepto">${clave}${esc(p.descripcion)}</td>
                  <td class="c">${esc(p.unidad) || '—'}</td>
                  <td class="r">${p.cantidad.toLocaleString('es-MX')}</td>
                  <td class="r">${formatCurrency(p.precio_unitario)}</td>
                  <td class="r importe">${formatCurrency(importe)}</td>
                </tr>`;
              })
              .join('');

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
          </table>
        </div>`;
    })
    .join('');

  const sinPartidas =
    cotizacion.secciones.length === 0
      ? `<p class="nota-vacia">Esta cotización no tiene partidas registradas.</p>`
      : '';

  const bloqueUbicacion = cotizacion.ubicacion
    ? `<div>
         <p class="etiqueta">Ubicación</p>
         <p class="dato">${esc(cotizacion.ubicacion)}</p>
       </div>`
    : '';

  const filaDescuento =
    cotizacion.descuento > 0
      ? `<div class="tot-fila">
           <span>Descuento (${cotizacion.descuento}%)</span>
           <span class="r rojo">-${formatCurrency(totales.descuentoMonto)}</span>
         </div>`
      : '';

  const filaIva = cotizacion.iva_enabled
    ? `<div class="tot-fila">
         <span>IVA (${totales.ivaPct}%)</span>
         <span class="r">${formatCurrency(totales.ivaMonto)}</span>
       </div>`
    : '';

  const bloqueNotas = cotizacion.notas
    ? `<div class="notas">
         <p class="etiqueta">Notas</p>
         <p class="notas-texto">${esc(cotizacion.notas)}</p>
       </div>`
    : '';

  const bloquePie = pdf.pieDePagina
    ? `<p class="pie-empresa">${esc(pdf.pieDePagina)}</p>`
    : '';

  const contacto = pdf.empresaContacto
    ? `<p class="contacto">${esc(pdf.empresaContacto)}</p>`
    : '';

  const leyendaIva = cotizacion.iva_enabled
    ? ` Los precios incluyen IVA (${totales.ivaPct}%).`
    : ' Los precios no incluyen IVA.';

  return `<!doctype html>
<html lang="es">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Cotización ${esc(nombreEmpresa)} #${folio}</title>
<style>
  * { box-sizing: border-box; }
  html, body { margin: 0; padding: 0; }
  body {
    font-family: ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
    color: #0F172A;
    background: #ffffff;
    font-size: 12px;
    line-height: 1.45;
    -webkit-print-color-adjust: exact;
    print-color-adjust: exact;
  }
  @page { size: Letter; margin: 16mm 18mm; }

  .doc { max-width: 780px; margin: 0 auto; padding: 24px; }
  @media print { .doc { padding: 0; max-width: none; } }

  .avoid { break-inside: avoid; page-break-inside: avoid; }

  /* Encabezado */
  .doc-header {
    display: flex; align-items: flex-start; justify-content: space-between; gap: 16px;
    border-bottom: 2px solid #0F172A; padding-bottom: 18px; margin-bottom: 22px;
  }
  .kicker { font-size: 10px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.14em; color: ${accent}; margin: 0; }
  .emisor { font-size: 22px; font-weight: 700; color: #0F172A; margin: 4px 0 0; line-height: 1.15; }
  .contacto { font-size: 11px; color: #525252; margin: 2px 0 0; }
  .meta { text-align: right; white-space: nowrap; }
  .meta .etiqueta { margin: 0; }
  .meta .folio { font-family: ui-monospace, "SFMono-Regular", Menlo, Consolas, monospace; font-size: 15px; font-weight: 600; color: #0F172A; margin: 0; font-variant-numeric: tabular-nums; }
  .meta .fecha { font-size: 13px; font-weight: 500; color: #0F172A; margin: 0; }
  .meta .sep { margin-top: 6px; }

  /* Datos del cliente */
  .cliente-info {
    display: grid; grid-template-columns: repeat(3, 1fr); gap: 12px;
    border: 1px solid #e5e5e5; border-radius: 8px; background: #fafafa;
    padding: 14px 18px; margin-bottom: 22px;
  }
  .etiqueta { font-size: 9px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.12em; color: #737373; margin: 0 0 2px; }
  .dato { font-size: 12px; font-weight: 600; color: #0F172A; margin: 0; }

  /* Secciones */
  .seccion { margin-bottom: 20px; }
  .seccion-titulo { border-left: 4px solid ${accent}; padding-left: 12px; margin-bottom: 6px; }
  .seccion-titulo h2 { font-size: 12px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.06em; color: #0F172A; margin: 0; }

  table { width: 100%; border-collapse: collapse; font-size: 11px; }
  thead tr { border-bottom: 1px solid #e5e5e5; }
  th { font-size: 9px; text-transform: uppercase; letter-spacing: 0.06em; color: #737373; font-weight: 700; padding: 5px 6px; text-align: left; }
  td { padding: 5px 6px; border-bottom: 1px solid #f1f1f1; vertical-align: top; }
  tbody tr:nth-child(even) td { background: #fafafa; }
  .th-concepto { width: 42%; }
  th.c, td.c { text-align: center; }
  th.r, td.r { text-align: right; font-variant-numeric: tabular-nums; }
  td.c { color: #525252; }
  td.r { color: #404040; }
  .concepto { color: #0F172A; line-height: 1.35; }
  .clave { font-weight: 600; color: #a3a3a3; margin-right: 2px; }
  .importe { font-weight: 600; color: #0F172A; }
  .vacia { color: #a3a3a3; font-style: italic; padding-left: 12px; }
  .nota-vacia { font-size: 12px; color: #737373; font-style: italic; }

  /* Totales */
  .totales { display: flex; justify-content: flex-end; margin: 4px 0 26px; }
  .totales-caja { width: 100%; max-width: 300px; }
  .tot-fila { display: flex; justify-content: space-between; padding: 6px 0; border-bottom: 1px solid #f1f1f1; color: #525252; font-size: 12px; }
  .tot-fila .r { color: #0F172A; font-weight: 500; font-variant-numeric: tabular-nums; }
  .rojo { color: #dc2626 !important; }
  .tot-total { display: flex; justify-content: space-between; border-top: 2px solid #0F172A; padding-top: 8px; margin-top: 4px; }
  .tot-total .lbl { font-size: 14px; font-weight: 700; color: #0F172A; }
  .tot-total .val { font-size: 14px; font-weight: 700; color: #0F172A; font-variant-numeric: tabular-nums; }

  /* Pie */
  .doc-footer { border-top: 1px solid #e5e5e5; padding-top: 18px; }
  .notas { margin-bottom: 14px; }
  .notas-texto { font-size: 11px; color: #404040; white-space: pre-wrap; line-height: 1.5; margin: 0; }
  .vigencia { border-top: 1px dashed #e5e5e5; padding-top: 14px; }
  .vigencia-texto { font-size: 10px; color: #a3a3a3; line-height: 1.6; margin: 0; }
  .pie-empresa { font-size: 10px; font-weight: 500; color: #0F172A; margin: 8px 0 0; }
</style>
</head>
<body>
  <div class="doc">
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

    <section class="cliente-info avoid">
      <div>
        <p class="etiqueta">Cliente</p>
        <p class="dato">${esc(cotizacion.cliente)}</p>
      </div>
      <div>
        <p class="etiqueta">Proyecto</p>
        <p class="dato">${esc(cotizacion.nombre_proyecto)}</p>
      </div>
      ${bloqueUbicacion}
    </section>

    ${sinPartidas}
    ${filasSecciones}

    <div class="totales avoid">
      <div class="totales-caja">
        <div class="tot-fila">
          <span>Subtotal</span>
          <span class="r">${formatCurrency(totales.subtotal)}</span>
        </div>
        ${filaDescuento}
        ${filaIva}
        <div class="tot-total">
          <span class="lbl">TOTAL</span>
          <span class="val">${formatCurrency(totales.total)}</span>
        </div>
      </div>
    </div>

    <footer class="doc-footer avoid">
      ${bloqueNotas}
      <div class="vigencia">
        <p class="vigencia-texto">
          Esta cotización tiene una vigencia de 30 días naturales a partir de la fecha de emisión.
          Los precios están expresados en pesos mexicanos (MXN).${leyendaIva}
          Para consultas o aclaraciones comuníquese con ${esc(nombreEmpresa)}.
        </p>
        ${bloquePie}
      </div>
    </footer>
  </div>
</body>
</html>`;
}
