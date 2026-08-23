import type { Obra } from '@/lib/data/types';
import type { PdfConfig } from '@/lib/data/empresa-config';
import { formatCurrency, formatDate } from '@/lib/data/format';
import {
  calcularTotales,
  montoEfectivo,
  type NotaConRenglones,
  type RenglonNota,
} from '@/lib/data/notas-obra-calculo';
import { envolverDocumento, esc, folioCorto } from '@/lib/pdf/documento-base';

/**
 * HTML de una NOTA DE OBRA: la cuenta de un trato con un socio, para mandársela
 * por WhatsApp a alguien que no tiene acceso al sistema.
 *
 * Imita a propósito la tabla de dos columnas que el dueño hacía en Word — que es
 * lo que sus socios ya saben leer— pero heredando el encabezado, la tipografía y
 * los totales del resto de los documentos.
 *
 * Es un documento INTERNO entre las dos partes del trato: no lleva presupuesto
 * de la obra, ni movimientos de caja, ni nada del cliente final.
 */
export function construirNotaObraHtml(params: {
  obra: Obra;
  nota: NotaConRenglones;
  nombreEmpresa: string;
  pdf: PdfConfig;
}): string {
  const { obra, nota, nombreEmpresa, pdf } = params;
  const t = calcularTotales(nota, nota.renglones);
  const folio = folioCorto(nota.id);
  const liquidada = nota.estado === 'LIQUIDADA';

  const filas =
    nota.renglones.length === 0
      ? `<tr><td colspan="3" class="vacia">Esta nota todavía no tiene renglones.</td></tr>`
      : nota.renglones.map(filaRenglon).join('');

  const bloqueTitulo = nota.titulo
    ? `<div><p class="etiqueta">Referencia</p><p class="dato">${esc(nota.titulo)}</p></div>`
    : `<div><p class="etiqueta">Ubicación</p><p class="dato">${esc(obra.ubicacion ?? '') || '—'}</p></div>`;

  const filaDeducciones =
    t.deducciones > 0
      ? `<div class="tot-fila"><span>Deducciones</span><span class="r rojo">−${formatCurrency(t.deducciones)}</span></div>`
      : '';

  // Cuando un total se fijó a mano se imprime también el calculado. El socio
  // tiene derecho a ver de dónde sale el número, y en una cuenta de palabra esa
  // diferencia es justo lo que hay que poder explicar de frente.
  const notaTotalFijado = t.totalFijado
    ? `<div class="tot-fila sutil"><span>Suma de los renglones</span><span class="r">${formatCurrency(t.totalCalculado)}</span></div>`
    : '';
  const notaSaldoFijado = t.saldoFijado
    ? `<div class="tot-fila sutil"><span>Diferencia aritmética</span><span class="r">${formatCurrency(t.saldoCalculado)}</span></div>`
    : '';

  const pie = nota.notas
    ? `<div class="notas"><p class="etiqueta">Nota</p><p class="notas-texto">${esc(nota.notas)}</p></div>`
    : '';

  const cuerpo = `
    <header class="doc-header avoid">
      <div>
        <p class="kicker">Nota de trabajos</p>
        <h1 class="emisor">${esc(nombreEmpresa)}</h1>
        ${pdf.empresaContacto ? `<p class="contacto">${esc(pdf.empresaContacto)}</p>` : ''}
      </div>
      <div class="meta">
        <p class="etiqueta">Folio</p>
        <p class="folio">#${folio}</p>
        <p class="etiqueta sep">Fecha</p>
        <p class="fecha">${formatDate(nota.fecha)}</p>
      </div>
    </header>

    <section class="info-grid avoid">
      <div><p class="etiqueta">Para</p><p class="dato">${esc(nota.destinatario) || '—'}</p></div>
      <div><p class="etiqueta">Obra</p><p class="dato">${esc(obra.nombre)}</p></div>
      ${bloqueTitulo}
    </section>

    <div class="seccion">
      <table>
        <thead>
          <tr>
            <th>Concepto</th>
            <th>Detalle</th>
            <th class="r">Importe</th>
          </tr>
        </thead>
        <tbody>${filas}</tbody>
      </table>
    </div>

    <div class="totales avoid">
      <div class="totales-caja">
        <div class="tot-fila"><span>Suma de conceptos</span><span class="r">${formatCurrency(t.subtotal)}</span></div>
        ${filaDeducciones}
        ${notaTotalFijado}
        <div class="tot-fila fuerte-fila"><span>Total acordado</span><span class="r">${formatCurrency(t.total)}</span></div>
        <div class="tot-fila"><span>Pagado</span><span class="r verde">−${formatCurrency(t.pagado)}</span></div>
        ${notaSaldoFijado}
        <div class="tot-total"><span class="lbl">SALDO</span><span class="val">${formatCurrency(t.saldo)}</span></div>
      </div>
    </div>

    ${liquidada ? '<p class="sello avoid">LIQUIDADO</p>' : ''}

    <footer class="doc-footer avoid">
      ${pie}
      <div class="vigencia">
        <p class="vigencia-texto">
          Relación de trabajos y pagos acordados entre ${esc(nombreEmpresa)} y
          ${esc(nota.destinatario) || 'la parte indicada'}. Montos en pesos mexicanos (MXN).
          Cualquier diferencia se aclara antes del siguiente pago.
        </p>
        ${pdf.pieDePagina ? `<p class="pie-empresa">${esc(pdf.pieDePagina)}</p>` : ''}
      </div>
    </footer>`;

  return envolverDocumento({
    titulo: `Nota ${nota.destinatario || obra.nombre} #${folio}`,
    pdf,
    cuerpo,
    estilos: `
      .tot-fila.sutil span { color: #a3a3a3; font-size: 11px; }
      .tot-fila.fuerte-fila span { color: #0F172A; font-weight: 600; }
      .sello {
        display: inline-block; border: 2px solid #16a34a; color: #16a34a;
        border-radius: 6px; padding: 4px 14px; margin: 0 0 20px;
        font-size: 13px; font-weight: 700; letter-spacing: 0.12em;
      }
      .apunte td { background: #fafafa; }
      .apunte .detalle { font-weight: 600; color: #0F172A; }
      .cuenta { color: #737373; font-size: 10px; }
    `,
  });
}

/**
 * Una fila de la tabla. Los renglones de tipo TEXTO no llevan importe: son los
 * apuntes de la nota de papel ("LIQUIDADO: bases de tinacos, pretil…").
 */
function filaRenglon(r: RenglonNota): string {
  const detalle: string[] = [];
  if (r.fecha !== null) detalle.push(`<span class="cuenta">${formatDate(r.fecha)}</span>`);
  if (r.texto) detalle.push(esc(r.texto));
  if (r.monto_base !== null) {
    const cuenta =
      r.porcentaje !== null
        ? `${formatCurrency(r.monto_base)} − ${r.porcentaje}% = ${formatCurrency(montoEfectivo(r))}`
        : formatCurrency(r.monto_base);
    detalle.push(`<span class="cuenta">${cuenta}</span>`);
  }

  if (r.tipo === 'TEXTO') {
    return `
      <tr class="apunte">
        <td class="fuerte">${esc(r.etiqueta)}</td>
        <td class="detalle" colspan="2">${detalle.join(' · ') || '—'}</td>
      </tr>`;
  }

  const negativo = r.tipo === 'DEDUCCION' || r.tipo === 'PAGO';
  const clase = negativo ? 'salida' : 'fuerte';
  const signo = negativo ? '−' : '';

  return `
    <tr>
      <td class="fuerte">${esc(r.etiqueta)}</td>
      <td>${detalle.join(' · ')}</td>
      <td class="r ${clase}">${signo}${formatCurrency(montoEfectivo(r))}</td>
    </tr>`;
}
