/**
 * PDF de la hoja para facturar: el mismo contenido de la página, para
 * imprimirlo o mandárselo al contador por WhatsApp. Reusa la base común de los
 * documentos (`lib/pdf/documento-base.ts`).
 */

import { envolverDocumento, esc, type OpcionesDocumento } from '@/lib/pdf/documento-base';
import { LEYENDA_NO_ES_FACTURA, LEYENDA_SUGERENCIA } from './catalogos';
import type { CampoHoja, HojaFacturar } from './hoja';

const ESTILOS = `
  .leyenda { border: 2px solid #0F172A; border-radius: 8px; padding: 8px 12px; font-weight: 700; font-size: 12px; margin-bottom: 18px; text-align: center; }
  .paso { margin-bottom: 16px; }
  .paso h2 { font-size: 13px; margin: 0 0 6px; }
  .paso h2 .n { display: inline-block; width: 20px; height: 20px; border-radius: 10px; background: var(--accent); color: #fff; text-align: center; line-height: 20px; margin-right: 6px; font-size: 11px; }
  .campo td.etq { width: 40%; color: #525252; }
  .campo td.val { font-family: ui-monospace, Menlo, Consolas, monospace; color: #0F172A; font-weight: 600; }
  .falta { color: #dc2626 !important; }
  .sug { font-size: 9px; background: #fef3c7; color: #92400e; border-radius: 4px; padding: 1px 4px; margin-left: 4px; font-family: ui-sans-serif, system-ui, sans-serif; }
  .avisos li, .notas-lista li { margin-bottom: 4px; }
`;

function tablaCampos(campos: CampoHoja[]): string {
  return `<table class="campo"><tbody>${campos
    .map(
      (c) =>
        `<tr><td class="etq">${esc(c.etiqueta)}</td><td class="val ${c.falta ? 'falta' : ''}">${esc(c.valor || 'FALTA')}${
          c.sugerido ? '<span class="sug">sugerida</span>' : ''
        }${c.ayuda ? ` <span style="font-family:sans-serif;font-weight:400;color:#737373">${esc(c.ayuda)}</span>` : ''}</td></tr>`,
    )
    .join('')}</tbody></table>`;
}

export function construirHojaHtml(p: {
  hoja: HojaFacturar;
  nombreEmpresa: string;
  documento: string;
  cobroTexto: string;
  pdf: OpcionesDocumento;
}): string {
  const { hoja } = p;
  const conceptos = `<table><thead><tr><th>Clave</th><th>Unidad</th><th class="r">Cant.</th><th>Descripción</th><th class="r">V. unitario</th><th class="r">Importe</th><th class="c">Obj. imp.</th></tr></thead><tbody>${hoja.conceptos
    .map(
      (c) =>
        `<tr><td>${esc(c.claveProdServ)}${c.claveSugerida ? '<span class="sug">sugerida</span>' : ''}</td><td>${esc(c.claveUnidad)}${
          c.unidadSugerida ? '<span class="sug">sugerida</span>' : ''
        }</td><td class="r">${c.cantidad}</td><td>${esc(c.descripcion)}</td><td class="r">${c.valorUnitario.toFixed(2)}</td><td class="r">${c.importe.toFixed(2)}</td><td class="c">${esc(c.objetoImpuesto)}</td></tr>`,
    )
    .join('')}</tbody></table>`;

  const cuerpo = `
  <header class="doc-header">
    <div>
      <p class="kicker">${esc(hoja.titulo)}</p>
      <p class="emisor">${esc(p.nombreEmpresa)}</p>
      <p class="contacto">${esc(p.documento)} · ${esc(p.cobroTexto)}</p>
    </div>
  </header>
  <p class="leyenda">${esc(LEYENDA_NO_ES_FACTURA)}</p>
  ${
    hoja.faltantes.length
      ? `<p class="falta" style="font-weight:700">Falta: ${esc(hoja.faltantes.join(', '))}</p>`
      : ''
  }
  <section class="paso avoid"><h2><span class="n">1</span>Emisor</h2>${tablaCampos(hoja.emisor)}</section>
  <section class="paso avoid"><h2><span class="n">2</span>Receptor</h2>${tablaCampos(hoja.receptor)}</section>
  <section class="paso"><h2><span class="n">3</span>Conceptos</h2>${conceptos}
    ${hoja.conceptos.some((c) => c.claveSugerida || c.unidadSugerida) ? `<p style="font-size:10px;color:#737373">${esc(LEYENDA_SUGERENCIA)}</p>` : ''}
  </section>
  <section class="paso avoid"><h2><span class="n">4</span>Pago</h2>${tablaCampos(hoja.pago)}</section>
  ${
    hoja.avisos.length
      ? `<section class="seccion avoid"><div class="seccion-titulo"><h2>Avisos</h2></div><ul class="avisos">${hoja.avisos
          .map((a) => `<li>${esc(a.texto)}</li>`)
          .join('')}</ul></section>`
      : ''
  }
  ${
    hoja.notas.length
      ? `<section class="seccion avoid"><div class="seccion-titulo"><h2>Para que no te la rechacen</h2></div><ul class="notas-lista">${hoja.notas
          .map((n) => `<li>${esc(n)}</li>`)
          .join('')}</ul></section>`
      : ''
  }
  <footer class="doc-footer"><p class="vigencia-texto">${esc(LEYENDA_NO_ES_FACTURA)} Generado por ConstructorPro, que no emite facturas ni se conecta al SAT.</p></footer>`;

  return envolverDocumento({ titulo: hoja.titulo, pdf: p.pdf, cuerpo, estilos: ESTILOS });
}
