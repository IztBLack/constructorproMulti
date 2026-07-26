import type { Obra } from '@/lib/data/types';
import type { NominaSummary } from '@/lib/data/nomina';
import type { PdfConfig } from '@/lib/data/empresa-config';
import { formatCurrency, formatDate } from '@/lib/data/format';
import { envolverDocumento, esc, folioCorto } from '@/lib/pdf/documento-base';

/**
 * HTML de la nómina semanal de una obra: total de la semana + detalle por
 * colaborador (por día o destajo). Espeja la pantalla de nómina.
 */
export function construirNominaDocumentoHtml(params: {
  obra: Obra;
  summary: NominaSummary;
  inicioMs: number;
  finMs: number;
  nombreEmpresa: string;
  pdf: PdfConfig;
}): string {
  const { obra, summary, inicioMs, finMs, nombreEmpresa, pdf } = params;
  const folio = folioCorto(obra.id);

  const filas =
    summary.items.length === 0
      ? `<tr><td colspan="6" class="vacia">Sin colaboradores activos en esta semana.</td></tr>`
      : summary.items
          .map((i) => {
            const esDestajo = i.colaborador.tipo_pago === 'DESTAJO';
            return `
              <tr>
                <td class="fuerte">${esc(i.colaborador.nombre)}</td>
                <td>${esc(i.puestoNombre)}</td>
                <td class="c">${esDestajo ? 'Destajo' : 'Por día'}</td>
                <td class="r">${esDestajo ? formatCurrency(i.totalDestajos) : i.totalDias.toFixed(2)}</td>
                <td class="r">${esDestajo ? '—' : formatCurrency(i.salarioBaseCalculado)}</td>
                <td class="r fuerte">${formatCurrency(i.totalPagar)}</td>
              </tr>`;
          })
          .join('');

  const cuerpo = `
    <header class="doc-header avoid">
      <div>
        <p class="kicker">Nómina semanal</p>
        <h1 class="emisor">${esc(nombreEmpresa)}</h1>
        ${pdf.empresaContacto ? `<p class="contacto">${esc(pdf.empresaContacto)}</p>` : ''}
      </div>
      <div class="meta">
        <p class="etiqueta">Folio obra</p>
        <p class="folio">#${folio}</p>
        <p class="etiqueta sep">Semana</p>
        <p class="fecha">${formatDate(inicioMs)} – ${formatDate(finMs)}</p>
      </div>
    </header>

    <section class="info-grid avoid">
      <div><p class="etiqueta">Obra</p><p class="dato">${esc(obra.nombre)}</p></div>
      <div><p class="etiqueta">Cliente</p><p class="dato">${esc(obra.cliente) || '—'}</p></div>
      <div><p class="etiqueta">Semana</p><p class="dato">${formatDate(inicioMs)} – ${formatDate(finMs)}</p></div>
    </section>

    <div class="stat-row avoid">
      <div class="stat-box acento"><p class="etiqueta">Total nómina</p><p class="valor chico">${formatCurrency(summary.totalNomina)}</p></div>
      <div class="stat-box"><p class="etiqueta">Por día</p><p class="valor chico">${formatCurrency(summary.totalDia)}</p></div>
      <div class="stat-box"><p class="etiqueta">Por destajo</p><p class="valor chico">${formatCurrency(summary.totalDestajo)}</p></div>
    </div>

    <div class="seccion">
      <div class="seccion-titulo"><h2>Detalle por colaborador</h2></div>
      <table>
        <thead>
          <tr>
            <th>Colaborador</th>
            <th>Puesto</th>
            <th class="c">Tipo</th>
            <th class="r">Días / Destajos</th>
            <th class="r">Salario base</th>
            <th class="r">Total a pagar</th>
          </tr>
        </thead>
        <tbody>${filas}</tbody>
      </table>
    </div>

    <div class="totales avoid">
      <div class="totales-caja">
        <div class="tot-fila"><span>Por día</span><span class="r">${formatCurrency(summary.totalDia)}</span></div>
        <div class="tot-fila"><span>Por destajo</span><span class="r">${formatCurrency(summary.totalDestajo)}</span></div>
        <div class="tot-total"><span class="lbl">TOTAL</span><span class="val">${formatCurrency(summary.totalNomina)}</span></div>
      </div>
    </div>

    ${
      pdf.pieDePagina
        ? `<footer class="doc-footer avoid"><div class="vigencia"><p class="pie-empresa">${esc(pdf.pieDePagina)}</p></div></footer>`
        : ''
    }`;

  return envolverDocumento({
    titulo: `Nómina ${obra.nombre} #${folio}`,
    pdf,
    cuerpo,
    estilos: '',
  });
}
