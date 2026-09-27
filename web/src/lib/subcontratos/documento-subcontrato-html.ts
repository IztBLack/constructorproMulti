import type { Obra } from '@/lib/data/types';
import type { PdfConfig } from '@/lib/data/empresa-config';
import type { SubcontratoCompleto } from '@/lib/data/subcontratos';
import { formatCurrency, formatDate } from '@/lib/data/format';
import { envolverDocumento, esc, folioCorto } from '@/lib/pdf/documento-base';
import { resolverTextoFinal } from '@/lib/pdf/textos-finales';
import { resumenSubcontrato } from './calculo';
import { LEYENDA_LEGAL, resolverClausulas } from './clausulas';

/**
 * HTML del CONTRATO DE SUBCONTRATO (RF5.8), con la familia visual del resto de
 * los PDF (`documento-base`) y el párrafo final configurable (tipo
 * `subcontrato`, 0032/0033).
 *
 * Lleva el estado de cuenta del contrato (abonado, retenido, por abonar)
 * porque es lo que se discute cuando se firma una estimación o un finiquito.
 * La leyenda "no sustituye asesoría" va SIEMPRE, no es configurable.
 */
export function construirSubcontratoHtml(p: {
  contrato: SubcontratoCompleto;
  obra: Obra | null;
  nombreEmpresa: string;
  pdf: PdfConfig;
}): string {
  const { contrato: c, obra, nombreEmpresa, pdf } = p;
  const r = resumenSubcontrato(c, c.renglones, c.pagos);
  const folio = folioCorto(c.id);

  const clausulas = resolverClausulas(c.clausulas, {
    contratante: nombreEmpresa,
    subcontratista: c.subcontratista_nombre,
    obra: obra?.nombre ?? '',
    ubicacion: obra?.ubicacion ?? '',
    montoContratado: r.montoContratado,
    retencionPct: c.retencion_pct,
    formaPago: c.forma_pago,
  });
  const textoFinal = resolverTextoFinal({
    tipo: 'subcontrato',
    documento: c.texto_final,
    empresa: pdf.textos,
    ctx: { nombreEmpresa, destinatario: c.subcontratista_nombre },
  });

  const filas =
    c.renglones.length === 0
      ? '<tr><td colspan="4" class="vacia">Sin conceptos: el alcance se describe arriba.</td></tr>'
      : c.renglones
          .map(
            (x) => `
      <tr>
        <td class="fuerte">${esc(x.concepto)}</td>
        <td>${x.cantidad !== null ? `${x.cantidad} ${esc(x.unidad)}` : esc(x.unidad) || '—'}</td>
        <td class="r">${x.precio_unitario !== null ? formatCurrency(x.precio_unitario) : '—'}</td>
        <td class="r">${formatCurrency(x.importe)}</td>
      </tr>`,
          )
          .join('');

  const pagos =
    c.pagos.length === 0
      ? ''
      : `
    <div class="seccion avoid">
      <p class="etiqueta">Pagos registrados</p>
      <table>
        <thead><tr><th>Fecha</th><th class="r">Abonado</th><th class="r">Retenido</th><th class="r">Pagado</th></tr></thead>
        <tbody>${c.pagos
          .map(
            (x) =>
              `<tr><td>${formatDate(x.fecha)}</td><td class="r">${formatCurrency(x.monto)}</td><td class="r">${formatCurrency(x.retencion)}</td><td class="r">${formatCurrency(x.monto - x.retencion)}</td></tr>`,
          )
          .join('')}</tbody>
      </table>
    </div>`;

  const plazo =
    c.fecha_inicio || c.fecha_fin
      ? `${c.fecha_inicio ? formatDate(c.fecha_inicio) : '—'} al ${c.fecha_fin ? formatDate(c.fecha_fin) : '—'}`
      : 'Por definir';

  const cuerpo = `
    <header class="doc-header avoid">
      <div>
        <p class="kicker">Contrato de subcontrato</p>
        <h1 class="emisor">${esc(nombreEmpresa)}</h1>
        ${pdf.empresaContacto ? `<p class="contacto">${esc(pdf.empresaContacto)}</p>` : ''}
      </div>
      <div class="meta">
        <p class="etiqueta">Folio</p>
        <p class="folio">#${folio}</p>
        <p class="etiqueta sep">Fecha</p>
        <p class="fecha">${formatDate(c.fecha_firma ?? c.created_at)}</p>
      </div>
    </header>

    <section class="info-grid avoid">
      <div><p class="etiqueta">Subcontratista</p><p class="dato">${esc(c.subcontratista_nombre) || '—'}</p></div>
      <div><p class="etiqueta">Obra</p><p class="dato">${esc(obra?.nombre ?? '') || '—'}</p></div>
      <div><p class="etiqueta">Plazo</p><p class="dato">${plazo}</p></div>
    </section>

    <div class="seccion avoid">
      <p class="etiqueta">Alcance</p>
      <p class="texto">${esc(c.alcance) || '—'}</p>
    </div>

    <div class="seccion">
      <table>
        <thead><tr><th>Concepto</th><th>Cantidad</th><th class="r">P. U.</th><th class="r">Importe</th></tr></thead>
        <tbody>${filas}</tbody>
      </table>
    </div>

    <div class="totales avoid">
      <div class="totales-caja">
        ${r.montoFijado ? `<div class="tot-fila sutil"><span>Suma de conceptos</span><span class="r">${formatCurrency(r.sumaRenglones)}</span></div>` : ''}
        <div class="tot-fila"><span>Fondo de garantía</span><span class="r">${c.retencion_pct} %</span></div>
        <div class="tot-fila"><span>Abonado a la fecha</span><span class="r">${formatCurrency(r.pagadoBruto)}</span></div>
        <div class="tot-fila"><span>Retenido a la fecha</span><span class="r">${formatCurrency(r.retenido)}</span></div>
        <div class="tot-total"><span class="lbl">MONTO DEL CONTRATO</span><span class="val">${formatCurrency(r.montoContratado)}</span></div>
      </div>
    </div>

    ${c.forma_pago ? `<div class="seccion avoid"><p class="etiqueta">Forma de pago</p><p class="texto">${esc(c.forma_pago)}</p></div>` : ''}

    ${pagos}

    <div class="seccion">
      <p class="etiqueta">Cláusulas</p>
      <div class="clausulas">${clausulas
        .split(/\n{2,}/)
        .map((parrafo) => `<p>${esc(parrafo)}</p>`)
        .join('')}</div>
    </div>

    <footer class="doc-footer avoid">
      <div class="vigencia">
        <p class="vigencia-texto">${esc(textoFinal)}</p>
        <p class="leyenda">${esc(LEYENDA_LEGAL)}</p>
        ${pdf.pieDePagina ? `<p class="pie-empresa">${esc(pdf.pieDePagina)}</p>` : ''}
      </div>
    </footer>`;

  return envolverDocumento({
    titulo: `Contrato ${c.subcontratista_nombre || obra?.nombre || ''} #${folio}`,
    // Las firmas de un contrato son las de las dos partes, no las genéricas
    // de Ajustes → PDF.
    pdf: {
      ...pdf,
      firmaIzquierda: `Contratante · ${nombreEmpresa}`,
      firmaDerecha: `Subcontratista · ${c.subcontratista_nombre || ''}`,
    },
    cuerpo,
    estilos: `
      .texto { white-space: pre-line; font-size: 12px; color: #0F172A; margin: 4px 0 0; }
      .clausulas p { margin: 0 0 8px; font-size: 11px; line-height: 1.5; text-align: justify; white-space: pre-line; }
      .leyenda { margin-top: 8px; font-size: 10px; color: #525252; font-style: italic; }
      .tot-fila.sutil span { color: #a3a3a3; font-size: 11px; }
    `,
  });
}
