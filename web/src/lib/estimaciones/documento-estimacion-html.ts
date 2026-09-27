import type { PdfConfig } from '@/lib/data/empresa-config';
import { formatCurrency, formatDate } from '@/lib/data/format';
import { envolverDocumento, esc } from '@/lib/pdf/documento-base';
import { resolverTextoFinal } from '@/lib/pdf/textos-finales';
import type { FotoEstimacion } from './snapshot';
import { ETIQUETA_ESTADO_ESTIMACION, type Estimacion } from './tipos';

/**
 * HTML de la ESTIMACIÓN (RF3.6) con sus NÚMEROS GENERADORES como anexo.
 *
 * Sale SIEMPRE de la foto (`FotoEstimacion`): la guardada al enviar o, para un
 * borrador, la armada en vivo con la misma forma. Así el PDF que se descargue
 * hoy dice exactamente lo mismo que el que se le mandó al cliente.
 *
 * Estructura de una estimación de obra: carátula (obra, periodo, folio),
 * cuerpo por partida (contratado, anterior, este periodo, acumulado, precio,
 * importe), resumen con deducciones (amortización del anticipo, IVA, fondo de
 * garantía, retenciones → alcance líquido), acumulados del contrato, firmas, y
 * el anexo de generadores (lo medido en campo en el periodo).
 */

const cant = (n: number) => n.toLocaleString('es-MX', { maximumFractionDigits: 4 });
const pct = (n: number) => `${n.toLocaleString('es-MX', { maximumFractionDigits: 4 })} %`;

export function construirEstimacionHtml(p: {
  obra: { nombre: string; cliente: string | null; ubicacion: string | null };
  estimacion: Pick<
    Estimacion,
    'folio' | 'estado' | 'texto_final' | 'respondido_at' | 'respondido_nombre' | 'respuesta_origen' | 'motivo_rechazo' | 'cobrado_at'
  >;
  foto: FotoEstimacion;
  nombreEmpresa: string;
  pdf: PdfConfig;
}): string {
  const { obra, estimacion: e, foto: f, nombreEmpresa, pdf } = p;
  const borrador = e.estado === 'BORRADOR';
  const i = f.importes;

  const textoFinal = resolverTextoFinal({
    tipo: 'estimacion',
    documento: e.texto_final,
    empresa: pdf.textos,
    ctx: { nombreEmpresa },
  });

  const filas =
    f.renglones.length === 0
      ? `<tr><td colspan="8" class="vacia">Esta estimación todavía no tiene partidas.</td></tr>`
      : f.renglones
          .map(
            (r) => `
          <tr>
            <td class="fuerte">${esc(r.concepto)}${r.seccion ? `<br><span class="sec">${esc(r.seccion)}</span>` : ''}</td>
            <td class="c">${esc(r.unidad) || '—'}</td>
            <td class="r">${cant(r.contratado)}</td>
            <td class="r">${cant(r.anterior)}</td>
            <td class="r fuerte">${cant(r.cantidad)}</td>
            <td class="r">${cant(r.acumulado)}</td>
            <td class="r">${formatCurrency(r.precioUnitario)}</td>
            <td class="r fuerte">${formatCurrency(r.importe)}</td>
          </tr>`,
          )
          .join('');

  const fila = (etq: string, valor: string, clase = '') =>
    `<div class="tot-fila ${clase}"><span>${etq}</span><span class="r">${valor}</span></div>`;
  const resumen = [
    fila('Importe de lo ejecutado', formatCurrency(i.bruto)),
    i.amortizacion > 0
      ? fila(`Amortización del anticipo (${pct(f.contrato.amortizacionPct)})`, `−${formatCurrency(i.amortizacion)}`, 'rojo-fila')
      : '',
    fila('Subtotal', formatCurrency(i.subtotal)),
    i.iva > 0 ? fila(`IVA (${pct(i.ivaPct)})`, formatCurrency(i.iva)) : '',
    fila('Total', formatCurrency(i.total)),
    i.fondoGarantia > 0
      ? fila(`Fondo de garantía (${pct(i.fondoGarantiaPct)})`, `−${formatCurrency(i.fondoGarantia)}`, 'rojo-fila')
      : '',
    ...i.retenciones
      .filter((r) => r.importe > 0)
      .map((r) =>
        fila(
          `${esc(r.concepto)}${r.tipo === 'PORCENTAJE' ? ` (${pct(r.valor)})` : ''}`,
          `−${formatCurrency(r.importe)}`,
          'rojo-fila',
        ),
      ),
  ].join('');

  const acumulados = `
    <div class="seccion avoid">
      <div class="seccion-titulo"><h2>Acumulados del contrato</h2></div>
      <table class="acum">
        <tbody>
          <tr><td>Estimado anterior</td><td class="r">${formatCurrency(f.acumulados.brutoPrevio)}</td>
              <td>Estimado acumulado</td><td class="r fuerte">${formatCurrency(f.acumulados.brutoAcumulado)}</td></tr>
          ${
            f.contrato.anticipo > 0
              ? `<tr><td>Anticipo</td><td class="r">${formatCurrency(f.contrato.anticipo)}</td>
                 <td>Anticipo por amortizar</td><td class="r fuerte">${formatCurrency(f.contrato.anticipoPorAmortizar)}</td></tr>`
              : ''
          }
          ${
            f.acumulados.fondoAcumulado > 0
              ? `<tr><td>Fondo de garantía anterior</td><td class="r">${formatCurrency(f.acumulados.fondoPrevio)}</td>
                 <td>Fondo de garantía acumulado</td><td class="r fuerte">${formatCurrency(f.acumulados.fondoAcumulado)}</td></tr>`
              : ''
          }
        </tbody>
      </table>
    </div>`;

  const generadores = f.renglones
    .map((r) => {
      const lineas =
        r.generadores.length === 0
          ? `<tr><td colspan="3" class="vacia">Sin capturas en el periodo${r.anterior + r.cantidad > 0 ? ' (lo estimado viene de avance anterior sin estimar)' : ''}.</td></tr>`
          : r.generadores
              .map(
                (g) => `<tr><td>${formatDate(g.fecha)}</td><td>${esc(g.nota) || '—'}</td><td class="r">${cant(g.cantidad)} ${esc(r.unidad)}</td></tr>`,
              )
              .join('');
      return `
        <div class="gen avoid">
          <p class="gen-titulo">${esc(r.concepto)} · esta estimación: ${cant(r.cantidad)} ${esc(r.unidad)}</p>
          <table><thead><tr><th>Día</th><th>Cómo se midió</th><th class="r">Cantidad</th></tr></thead><tbody>${lineas}</tbody></table>
        </div>`;
    })
    .join('');

  let sello = '';
  const quien = e.respondido_nombre ? ` por ${esc(e.respondido_nombre)}` : '';
  const via = e.respuesta_origen === 'OFICINA' ? ' (registrada por la oficina)' : '';
  if (e.estado === 'AUTORIZADA' || e.estado === 'COBRADA') {
    sello = `<p class="sello verde-sello avoid">AUTORIZADA${quien} el ${formatDate(e.respondido_at)}${via}${
      e.estado === 'COBRADA' ? ` · COBRADA el ${formatDate(e.cobrado_at)}` : ''
    }</p>`;
  } else if (e.estado === 'RECHAZADA') {
    sello = `<div class="avoid"><p class="sello rojo-sello">RECHAZADA${quien} el ${formatDate(e.respondido_at)}${via}</p>${
      e.motivo_rechazo ? `<p class="notas-texto">Motivo: ${esc(e.motivo_rechazo)}</p>` : ''
    }</div>`;
  }

  const cuerpo = `
    <header class="doc-header avoid">
      <div>
        <p class="kicker">${borrador ? 'Estimación · borrador sin enviar' : `Estimación${f.esFiniquito ? ' de finiquito' : ''}`}</p>
        <h1 class="emisor">${esc(nombreEmpresa)}</h1>
        ${pdf.empresaContacto ? `<p class="contacto">${esc(pdf.empresaContacto)}</p>` : ''}
      </div>
      <div class="meta">
        <p class="etiqueta">Estimación</p>
        <p class="folio">#${e.folio}</p>
        <p class="etiqueta sep">Periodo</p>
        <p class="fecha">${formatDate(f.periodoInicio)} al ${formatDate(f.periodoFin)}</p>
      </div>
    </header>

    <section class="info-grid avoid">
      <div><p class="etiqueta">Obra</p><p class="dato">${esc(obra.nombre)}</p></div>
      <div><p class="etiqueta">Cliente</p><p class="dato">${esc(obra.cliente) || '—'}</p></div>
      <div><p class="etiqueta">Estado</p><p class="dato">${esc(ETIQUETA_ESTADO_ESTIMACION[e.estado])}</p></div>
    </section>

    ${f.notas ? `<p class="notas-texto">${esc(f.notas)}</p>` : ''}

    <div class="seccion">
      <div class="seccion-titulo"><h2>Trabajos ejecutados</h2></div>
      <table class="est">
        <thead>
          <tr>
            <th>Partida</th>
            <th class="c">Unidad</th>
            <th class="r">Contratado</th>
            <th class="r">Anterior</th>
            <th class="r">Esta</th>
            <th class="r">Acumulado</th>
            <th class="r">P. Unitario</th>
            <th class="r">Importe</th>
          </tr>
        </thead>
        <tbody>${filas}</tbody>
      </table>
    </div>

    <div class="totales avoid">
      <div class="totales-caja">
        ${resumen}
        <div class="tot-total"><span class="lbl">A PAGAR</span><span class="val">${formatCurrency(i.neto)}</span></div>
      </div>
    </div>

    ${acumulados}
    ${sello}

    <footer class="doc-footer avoid">
      <div class="vigencia">
        <p class="vigencia-texto">${esc(textoFinal)}</p>
        ${pdf.pieDePagina ? `<p class="pie-empresa">${esc(pdf.pieDePagina)}</p>` : ''}
      </div>
    </footer>

    <div class="salto seccion">
      <div class="seccion-titulo"><h2>Números generadores</h2></div>
      <p class="notas-texto">Lo medido en campo dentro del periodo, partida por partida.</p>
      ${generadores}
    </div>`;

  return envolverDocumento({
    titulo: `Estimación ${e.folio} · ${obra.nombre}`,
    pdf: borrador && !pdf.watermark ? { ...pdf, watermark: 'Borrador' } : pdf,
    cuerpo,
    estilos: `
      table.est th, table.est td { font-size: 10px; padding: 5px 4px; }
      .sec { color: #737373; font-size: 9px; font-weight: 400; }
      .rojo-fila .r { color: #b91c1c; }
      table.acum td { font-size: 11px; padding: 4px 6px; }
      .sello {
        display: inline-block; border: 2px solid; border-radius: 6px;
        padding: 4px 14px; margin: 0 0 16px; font-size: 12px; font-weight: 700; letter-spacing: 0.06em;
      }
      .verde-sello { border-color: #16a34a; color: #15803d; }
      .rojo-sello { border-color: #dc2626; color: #b91c1c; }
      .salto { break-before: page; page-break-before: always; }
      .gen { margin: 0 0 12px; }
      .gen-titulo { font-size: 11px; font-weight: 600; margin: 0 0 4px; color: #0F172A; }
      .gen td, .gen th { font-size: 10px; padding: 4px 6px; }
    `,
  });
}
