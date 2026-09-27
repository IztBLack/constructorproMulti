import type { PdfConfig } from '@/lib/data/empresa-config';
import { formatCurrency, formatDate } from '@/lib/data/format';
import { envolverDocumento, esc } from '@/lib/pdf/documento-base';
import { resolverTextoFinal } from '@/lib/pdf/textos-finales';
import {
  ETIQUETA_ESTADO_EXTRA,
  importeRenglon,
  leerSnapshot,
  totalRenglones,
  type OrdenCambioConRenglones,
  type RenglonSnapshot,
} from './extras';

/**
 * HTML del EXTRA (orden de cambio) para mandarlo por WhatsApp (RF1.5).
 *
 * Si ya se envió, el documento se arma con la FOTO (lo que vio el cliente), no
 * con los renglones vivos: así el PDF que se descargue hoy dice lo mismo que el
 * que se mandó el día del envío. Un borrador se imprime marcado como tal.
 *
 * Sin IVA, igual que el presupuesto de la obra: el extra se suma a ese total.
 */
export function construirExtraHtml(p: {
  obra: { nombre: string; cliente: string | null; ubicacion: string | null };
  extra: OrdenCambioConRenglones;
  nombreEmpresa: string;
  pdf: PdfConfig;
  /** URL firmada de la foto, si hay y se quiere imprimir. */
  fotoUrl?: string | null;
}): string {
  const { obra, extra, nombreEmpresa, pdf } = p;
  const foto = leerSnapshot(extra.snapshot_json);

  const renglones: RenglonSnapshot[] = foto
    ? foto.renglones
    : extra.renglones.map((r) => ({
        concepto: r.concepto,
        unidad: r.unidad,
        cantidad: r.cantidad,
        precio_unitario: r.precio_unitario,
        importe: importeRenglon(r),
      }));
  const total = foto ? Number(extra.total_enviado ?? foto.total) : totalRenglones(extra.renglones);
  const titulo = foto?.titulo ?? extra.titulo;
  const motivo = foto?.motivo ?? extra.motivo;
  const fecha = foto?.fecha ?? extra.fecha;
  const borrador = extra.estado === 'BORRADOR';

  const textoFinal = resolverTextoFinal({
    tipo: 'extra',
    documento: extra.texto_final,
    empresa: pdf.textos,
    ctx: { nombreEmpresa },
  });

  const filas =
    renglones.length === 0
      ? `<tr><td colspan="5" class="vacia">Este extra todavía no tiene conceptos.</td></tr>`
      : renglones
          .map(
            (r) => `
              <tr>
                <td class="fuerte">${esc(r.concepto)}</td>
                <td class="c">${esc(r.unidad) || '—'}</td>
                <td class="r">${r.cantidad.toLocaleString('es-MX')}</td>
                <td class="r">${formatCurrency(r.precio_unitario)}</td>
                <td class="r fuerte">${formatCurrency(r.importe)}</td>
              </tr>`,
          )
          .join('');

  let respuesta = '';
  if (extra.estado === 'APROBADA') {
    respuesta = `<p class="sello verde-sello avoid">APROBADO${extra.respondido_nombre ? ` por ${esc(extra.respondido_nombre)}` : ''} el ${formatDate(extra.respondido_at)}</p>`;
  } else if (extra.estado === 'RECHAZADA') {
    respuesta = `<div class="avoid"><p class="sello rojo-sello">RECHAZADO el ${formatDate(extra.respondido_at)}</p>${
      extra.motivo_rechazo ? `<p class="notas-texto">Motivo: ${esc(extra.motivo_rechazo)}</p>` : ''
    }</div>`;
  } else if (extra.estado === 'CANCELADA') {
    respuesta = `<p class="sello gris-sello avoid">CANCELADO</p>`;
  }

  const bloqueFoto = p.fotoUrl
    ? `<div class="seccion avoid"><div class="seccion-titulo"><h2>Foto</h2></div><img class="foto" src="${esc(p.fotoUrl)}" alt="Foto del extra"></div>`
    : '';

  const cuerpo = `
    <header class="doc-header avoid">
      <div>
        <p class="kicker">${borrador ? 'Extra · borrador sin enviar' : 'Extra · trabajo adicional'}</p>
        <h1 class="emisor">${esc(nombreEmpresa)}</h1>
        ${pdf.empresaContacto ? `<p class="contacto">${esc(pdf.empresaContacto)}</p>` : ''}
      </div>
      <div class="meta">
        <p class="etiqueta">Extra</p>
        <p class="folio">#${extra.folio}</p>
        <p class="etiqueta sep">Fecha</p>
        <p class="fecha">${formatDate(fecha)}</p>
      </div>
    </header>

    <section class="info-grid avoid">
      <div><p class="etiqueta">Obra</p><p class="dato">${esc(obra.nombre)}</p></div>
      <div><p class="etiqueta">Cliente</p><p class="dato">${esc(obra.cliente) || '—'}</p></div>
      <div><p class="etiqueta">Estado</p><p class="dato">${esc(ETIQUETA_ESTADO_EXTRA[extra.estado])}</p></div>
    </section>

    <div class="seccion avoid">
      <div class="seccion-titulo"><h2>${esc(titulo) || 'Trabajo adicional'}</h2></div>
      ${motivo ? `<p class="notas-texto motivo">${esc(motivo)}</p>` : ''}
      <table>
        <thead>
          <tr>
            <th>Concepto</th>
            <th class="c">Unidad</th>
            <th class="r">Cantidad</th>
            <th class="r">P. Unitario</th>
            <th class="r">Importe</th>
          </tr>
        </thead>
        <tbody>${filas}</tbody>
      </table>
    </div>

    <div class="totales avoid">
      <div class="totales-caja">
        <div class="tot-total"><span class="lbl">TOTAL DEL EXTRA</span><span class="val">${formatCurrency(total)}</span></div>
      </div>
    </div>

    ${respuesta}
    ${bloqueFoto}

    <footer class="doc-footer avoid">
      <div class="vigencia">
        <p class="vigencia-texto">${esc(textoFinal)}</p>
        ${pdf.pieDePagina ? `<p class="pie-empresa">${esc(pdf.pieDePagina)}</p>` : ''}
      </div>
    </footer>`;

  return envolverDocumento({
    titulo: `Extra ${extra.folio} · ${obra.nombre}`,
    pdf: borrador && !pdf.watermark ? { ...pdf, watermark: 'Borrador' } : pdf,
    cuerpo,
    estilos: `
      .motivo { margin: 0 0 8px; }
      .sello {
        display: inline-block; border: 2px solid; border-radius: 6px;
        padding: 4px 14px; margin: 0 0 16px; font-size: 12px; font-weight: 700; letter-spacing: 0.08em;
      }
      .verde-sello { border-color: #16a34a; color: #16a34a; }
      .rojo-sello { border-color: #dc2626; color: #dc2626; }
      .gris-sello { border-color: #737373; color: #737373; }
      .foto { max-width: 100%; max-height: 360px; border-radius: 8px; border: 1px solid #e5e5e5; }
    `,
  });
}
