/**
 * Base compartida de los documentos imprimibles (cotización, flujo de caja,
 * estado de cuenta, nómina…).
 *
 * Cada documento aporta solo su CUERPO (HTML) y, si acaso, unos estilos extra;
 * el esqueleto (`<html>`, reset, tipografía, `@page` Letter, tablas, totales,
 * pie) vive aquí una sola vez, así todos los PDF se ven como la misma familia y
 * comparten los arreglos. El color de acento de la empresa entra por la variable
 * CSS `--accent`, para no repetirlo por todo el CSS.
 */

/** Escapa texto de usuario para meterlo seguro en el HTML. */
export function esc(v: string | null | undefined): string {
  return String(v ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/** Folio corto: últimos 8 caracteres del UUID en mayúsculas. */
export function folioCorto(id: string): string {
  return id.replace(/-/g, '').slice(-8).toUpperCase();
}

/**
 * CSS común a todos los documentos. Usa `var(--accent)` para el color de la
 * empresa. Las clases (`.doc`, `.avoid`, `.doc-header`, `.etiqueta`, `.dato`,
 * tablas, `.totales`, `.doc-footer`, `.stat-box`, `.resumen-lista`…) son el
 * vocabulario que cada builder reutiliza.
 */
const BASE_CSS = `
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
  .kicker { font-size: 10px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.14em; color: var(--accent); margin: 0; }
  .emisor { font-size: 22px; font-weight: 700; color: #0F172A; margin: 4px 0 0; line-height: 1.15; }
  .contacto { font-size: 11px; color: #525252; margin: 2px 0 0; }
  .meta { text-align: right; white-space: nowrap; }
  .meta .etiqueta { margin: 0; }
  .meta .folio { font-family: ui-monospace, "SFMono-Regular", Menlo, Consolas, monospace; font-size: 15px; font-weight: 600; color: #0F172A; margin: 0; font-variant-numeric: tabular-nums; }
  .meta .fecha { font-size: 13px; font-weight: 500; color: #0F172A; margin: 0; }
  .meta .sep { margin-top: 6px; }

  /* Rejilla de datos (cliente / obra) */
  .info-grid {
    display: grid; grid-template-columns: repeat(3, 1fr); gap: 12px;
    border: 1px solid #e5e5e5; border-radius: 8px; background: #fafafa;
    padding: 14px 18px; margin-bottom: 22px;
  }
  .etiqueta { font-size: 9px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.12em; color: #737373; margin: 0 0 2px; }
  .dato { font-size: 12px; font-weight: 600; color: #0F172A; margin: 0; }

  /* Cajas de indicadores (costo / recibido / pendiente, totales de semana) */
  .stat-row { display: flex; gap: 10px; margin-bottom: 22px; }
  .stat-box { flex: 1; border: 1px solid #e5e5e5; border-radius: 8px; padding: 10px 14px; background: #fafafa; }
  .stat-box .etiqueta { margin-bottom: 4px; }
  .stat-box .valor { font-size: 16px; font-weight: 700; color: #0F172A; font-variant-numeric: tabular-nums; }
  .stat-box.acento .valor { color: var(--accent); }
  .stat-box.rojo .valor { color: #dc2626; }
  .stat-box.verde .valor { color: #16a34a; }

  /* Secciones + tablas */
  .seccion { margin-bottom: 20px; }
  .seccion-titulo { border-left: 4px solid var(--accent); padding-left: 12px; margin-bottom: 6px; }
  .seccion-titulo h2 { font-size: 12px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.06em; color: #0F172A; margin: 0; }

  table { width: 100%; border-collapse: collapse; font-size: 11px; }
  thead tr { border-bottom: 1px solid #e5e5e5; }
  th { font-size: 9px; text-transform: uppercase; letter-spacing: 0.06em; color: #737373; font-weight: 700; padding: 5px 6px; text-align: left; }
  td { padding: 5px 6px; border-bottom: 1px solid #f1f1f1; vertical-align: top; }
  tbody tr:nth-child(even) td { background: #fafafa; }
  th.c, td.c { text-align: center; }
  th.r, td.r { text-align: right; font-variant-numeric: tabular-nums; }
  td.c { color: #525252; }
  td.r { color: #404040; }
  .clave { font-weight: 600; color: #a3a3a3; margin-right: 2px; }
  .fuerte { font-weight: 600; color: #0F172A; }
  .entrada { color: #16a34a; font-weight: 600; }
  .salida { color: #dc2626; font-weight: 600; }
  .vacia { color: #a3a3a3; font-style: italic; padding-left: 12px; }
  .nota-vacia { font-size: 12px; color: #737373; font-style: italic; }

  /* Totales alineados a la derecha */
  .totales { display: flex; justify-content: flex-end; margin: 4px 0 26px; }
  .totales-caja { width: 100%; max-width: 320px; }
  .tot-fila { display: flex; justify-content: space-between; padding: 6px 0; border-bottom: 1px solid #f1f1f1; color: #525252; font-size: 12px; }
  .tot-fila .r { color: #0F172A; font-weight: 500; font-variant-numeric: tabular-nums; }
  .rojo { color: #dc2626 !important; }
  .verde { color: #16a34a !important; }
  .tot-total { display: flex; justify-content: space-between; border-top: 2px solid #0F172A; padding-top: 8px; margin-top: 4px; }
  .tot-total .lbl { font-size: 14px; font-weight: 700; color: #0F172A; }
  .tot-total .val { font-size: 14px; font-weight: 700; color: #0F172A; font-variant-numeric: tabular-nums; }

  /* Listas de resumen (pagado por persona / recibido por tipo) */
  .resumen-doble { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; margin-bottom: 22px; }
  .resumen-lista { border: 1px solid #e5e5e5; border-radius: 8px; padding: 12px 14px; }
  .resumen-lista h3 { font-size: 10px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.08em; color: #737373; margin: 0 0 8px; }
  .resumen-fila { display: flex; justify-content: space-between; gap: 8px; padding: 3px 0; font-size: 11px; }
  .resumen-fila .r { font-variant-numeric: tabular-nums; color: #0F172A; font-weight: 500; }

  /* Pie */
  .doc-footer { border-top: 1px solid #e5e5e5; padding-top: 18px; }
  .notas { margin-bottom: 14px; }
  .notas-texto { font-size: 11px; color: #404040; white-space: pre-wrap; line-height: 1.5; margin: 0; }
  .vigencia { border-top: 1px dashed #e5e5e5; padding-top: 14px; }
  /* pre-line porque este párrafo ahora es editable (0032): si alguien lo
     escribe en varios renglones, se imprime en varios renglones. */
  .vigencia-texto { font-size: 10px; color: #a3a3a3; line-height: 1.6; margin: 0; white-space: pre-line; }
  .pie-empresa { font-size: 10px; font-weight: 500; color: #0F172A; margin: 8px 0 0; }
`;

// CSS de las opciones de personalización (marca de agua y firmas). Inofensivo
// cuando no se usan: los elementos simplemente no se renderizan.
const EXTRAS_CSS = `
  .marca-agua { position: fixed; inset: 0; display: flex; align-items: center; justify-content: center; transform: rotate(-30deg); font-size: 92px; font-weight: 800; letter-spacing: .05em; color: rgba(15,23,42,0.07); z-index: 0; pointer-events: none; text-transform: uppercase; }
  .doc { position: relative; z-index: 1; }
  .firmas { display: flex; gap: 48px; justify-content: space-between; margin-top: 44px; }
  .firma { flex: 1; }
  .firma .linea { display: block; height: 40px; border-bottom: 1px solid #0F172A; }
  .firma .rotulo { display: block; margin-top: 6px; text-align: center; font-size: 10px; color: #525252; text-transform: uppercase; letter-spacing: 0.06em; }
`;

/** Config mínima de personalización que aplica el envoltorio (subconjunto de PdfConfig). */
export interface OpcionesDocumento {
  colorHex: string;
  watermark?: string;
  mayusculas?: boolean;
  modoCompacto?: boolean;
  firmaIzquierda?: string;
  firmaDerecha?: string;
}

/**
 * Envuelve el cuerpo de un documento en el HTML autocontenido completo, con el
 * CSS base, el color de acento y las opciones de personalización (marca de agua,
 * MAYÚSCULAS, modo compacto y firmas). Compartido por todos los PDF.
 */
export function envolverDocumento(p: {
  titulo: string;
  pdf: OpcionesDocumento;
  cuerpo: string;
  estilos?: string;
}): string {
  const { pdf } = p;

  const opcionesCss = [
    pdf.modoCompacto ? '@page { margin: 10mm 12mm; }' : '',
    pdf.mayusculas ? '.doc { text-transform: uppercase; }' : '',
  ].join('\n');

  const marcaAgua = pdf.watermark
    ? `<div class="marca-agua" aria-hidden="true">${esc(pdf.watermark)}</div>`
    : '';

  const firmas =
    pdf.firmaIzquierda || pdf.firmaDerecha
      ? `<div class="firmas avoid">
      <div class="firma"><span class="linea"></span><span class="rotulo">${esc(pdf.firmaIzquierda) || '&nbsp;'}</span></div>
      <div class="firma"><span class="linea"></span><span class="rotulo">${esc(pdf.firmaDerecha) || '&nbsp;'}</span></div>
    </div>`
      : '';

  return `<!doctype html>
<html lang="es">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(p.titulo)}</title>
<style>
  :root { --accent: ${pdf.colorHex}; }
${BASE_CSS}
${EXTRAS_CSS}
${opcionesCss}
${p.estilos ?? ''}
</style>
</head>
<body>
  ${marcaAgua}
  <div class="doc">
${p.cuerpo}
${firmas}
  </div>
</body>
</html>`;
}
