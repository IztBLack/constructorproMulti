import type { PdfConfig } from '@/lib/data/empresa-config';
import { formatCurrency, formatDate } from '@/lib/data/format';
import { envolverDocumento, esc } from '@/lib/pdf/documento-base';
import { resolverTextoFinal } from '@/lib/pdf/textos-finales';
import { importeRenglon, totalesDe } from './calculo';
import { ETIQUETA_ESTADO_ORDEN, type OrdenConRenglones, type Proveedor } from './tipos';

/**
 * HTML de la ORDEN DE COMPRA para mandarla al proveedor (RF2.3), por WhatsApp o
 * impresa. Precios SIN IVA por renglón y el IVA desglosado al final, que es como
 * el proveedor la factura.
 *
 * Una orden emitida se imprime con sus totales CONGELADOS (los de la base), no
 * con una suma nueva: el PDF de hoy dice lo mismo que el que recibió el
 * proveedor. Un borrador sale marcado como tal.
 */
export function construirOrdenCompraHtml(p: {
  orden: OrdenConRenglones;
  proveedor: Pick<Proveedor, 'nombre' | 'rfc' | 'contacto' | 'telefono' | 'correo'> | null;
  obra: { nombre: string; ubicacion: string | null };
  nombreEmpresa: string;
  pdf: PdfConfig;
}): string {
  const { orden, proveedor, obra, nombreEmpresa, pdf } = p;
  const borrador = orden.estado === 'BORRADOR';
  const t = totalesDe(orden);

  const textoFinal = resolverTextoFinal({
    tipo: 'orden_compra',
    documento: orden.texto_final,
    empresa: pdf.textos,
    ctx: { nombreEmpresa },
  });

  const filas =
    orden.renglones.length === 0
      ? `<tr><td colspan="5" class="vacia">Esta orden todavía no tiene materiales.</td></tr>`
      : orden.renglones
          .map(
            (r) => `
              <tr>
                <td class="fuerte">${esc(r.descripcion)}</td>
                <td class="c">${esc(r.unidad) || '—'}</td>
                <td class="r">${Number(r.cantidad).toLocaleString('es-MX')}</td>
                <td class="r">${formatCurrency(r.precio_unitario)}</td>
                <td class="r fuerte">${formatCurrency(importeRenglon(r))}</td>
              </tr>`,
          )
          .join('');

  const datosProveedor = proveedor
    ? [
        proveedor.rfc ? `RFC ${esc(proveedor.rfc)}` : '',
        esc(proveedor.contacto),
        esc(proveedor.telefono),
        esc(proveedor.correo),
      ]
        .filter(Boolean)
        .join(' · ')
    : '';

  const credito =
    orden.dias_credito > 0 ? `${orden.dias_credito} días de crédito` : 'Pago de contado';

  const cancelada =
    orden.estado === 'CANCELADA'
      ? `<p class="sello gris-sello avoid">CANCELADA${orden.cancelada_at ? ` el ${formatDate(orden.cancelada_at)}` : ''}</p>`
      : '';

  const cuerpo = `
    <header class="doc-header avoid">
      <div>
        <p class="kicker">${borrador ? 'Orden de compra · borrador sin emitir' : 'Orden de compra'}</p>
        <h1 class="emisor">${esc(nombreEmpresa)}</h1>
        ${pdf.empresaContacto ? `<p class="contacto">${esc(pdf.empresaContacto)}</p>` : ''}
      </div>
      <div class="meta">
        <p class="etiqueta">Folio</p>
        <p class="folio">OC-${orden.folio}</p>
        <p class="etiqueta sep">Fecha</p>
        <p class="fecha">${formatDate(orden.emitida_at ?? orden.fecha)}</p>
      </div>
    </header>

    <section class="info-grid avoid">
      <div><p class="etiqueta">Proveedor</p><p class="dato">${esc(proveedor?.nombre) || '—'}</p>${
        datosProveedor ? `<p class="sub">${datosProveedor}</p>` : ''
      }</div>
      <div><p class="etiqueta">Entregar en</p><p class="dato">${esc(obra.nombre)}</p>${
        obra.ubicacion ? `<p class="sub">${esc(obra.ubicacion)}</p>` : ''
      }</div>
      <div><p class="etiqueta">Para cuándo</p><p class="dato">${
        orden.fecha_entrega ? formatDate(orden.fecha_entrega) : 'A convenir'
      }</p><p class="sub">${esc(credito)} · ${esc(ETIQUETA_ESTADO_ORDEN[orden.estado])}</p></div>
    </section>

    <div class="seccion avoid">
      <div class="seccion-titulo"><h2>Material</h2></div>
      <table>
        <thead>
          <tr>
            <th>Descripción</th>
            <th class="c">Unidad</th>
            <th class="r">Cantidad</th>
            <th class="r">P. unitario</th>
            <th class="r">Importe</th>
          </tr>
        </thead>
        <tbody>${filas}</tbody>
      </table>
    </div>

    <div class="totales avoid">
      <div class="totales-caja">
        <div class="tot-fila"><span>Subtotal</span><span class="r">${formatCurrency(t.subtotal)}</span></div>
        <div class="tot-fila"><span>IVA (${Number(orden.iva_pct).toLocaleString('es-MX')}%)</span><span class="r">${formatCurrency(t.iva)}</span></div>
        <div class="tot-total"><span class="lbl">TOTAL</span><span class="val">${formatCurrency(t.total)}</span></div>
      </div>
    </div>

    ${orden.condiciones ? `<div class="seccion avoid"><div class="seccion-titulo"><h2>Condiciones</h2></div><p class="notas-texto">${esc(orden.condiciones)}</p></div>` : ''}
    ${orden.notas ? `<div class="seccion avoid"><div class="seccion-titulo"><h2>Notas</h2></div><p class="notas-texto">${esc(orden.notas)}</p></div>` : ''}
    ${cancelada}

    <footer class="doc-footer avoid">
      <div class="vigencia">
        <p class="vigencia-texto">${esc(textoFinal)}</p>
        ${pdf.pieDePagina ? `<p class="pie-empresa">${esc(pdf.pieDePagina)}</p>` : ''}
      </div>
    </footer>`;

  return envolverDocumento({
    titulo: `OC-${orden.folio} · ${proveedor?.nombre ?? 'Proveedor'}`,
    pdf: borrador && !pdf.watermark ? { ...pdf, watermark: 'Borrador' } : pdf,
    cuerpo,
    estilos: `
      .sub { margin: 2px 0 0; font-size: 11px; color: #525252; }
      .sello {
        display: inline-block; border: 2px solid; border-radius: 6px;
        padding: 4px 14px; margin: 0 0 16px; font-size: 12px; font-weight: 700; letter-spacing: 0.08em;
      }
      .gris-sello { border-color: #737373; color: #737373; }
    `,
  });
}
