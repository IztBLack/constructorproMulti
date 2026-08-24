import type { EstadoCuentaObra, ObraPortal } from '@/lib/data/portal-cliente';
import type { PdfConfig } from '@/lib/data/empresa-config';
import { formatCurrency, formatDate } from '@/lib/data/format';
import { envolverDocumento, esc, folioCorto } from '@/lib/pdf/documento-base';
import { resolverTextoFinal } from '@/lib/pdf/textos-finales';

/**
 * HTML del estado de cuenta que ve el CLIENTE de una obra. A diferencia del de
 * oficina, aquí NUNCA aparecen SALIDAS: solo el presupuesto (costo) y los pagos
 * recibidos (ENTRADAS). Lo garantiza la RLS + el filtro de `getEstadoCuentaObra`;
 * este builder solo recibe `entradas`, así que no puede filtrar de más ni de menos.
 */
export function construirEstadoCuentaClienteHtml(params: {
  obra: ObraPortal;
  estado: EstadoCuentaObra;
  nombreEmpresa: string;
  pdf: PdfConfig;
  hoy: number;
}): string {
  const { obra, estado, nombreEmpresa, pdf, hoy } = params;

  // El texto propio vive en la OBRA: el estado de cuenta no es una entidad con
  // fila propia, se emite de una obra.
  const textoFinal = resolverTextoFinal({
    tipo: 'estado_cuenta',
    documento: obra.texto_final,
    empresa: pdf.textos,
    ctx: { nombreEmpresa },
  });
  const { costoTotal, recibido, pendiente, pagadoPct, partidas, entradas } = estado;
  const folio = folioCorto(obra.id);

  const filasPresupuesto =
    partidas.length === 0
      ? `<tr><td colspan="5" class="vacia">Sin presupuesto capturado.</td></tr>`
      : partidas
          .map((p) => {
            const importe = p.cantidad * p.precio_unitario;
            return `
              <tr>
                <td class="fuerte">${esc(p.concepto)}</td>
                <td class="c">${esc(p.unidad) || '—'}</td>
                <td class="r">${p.cantidad.toLocaleString('es-MX')}</td>
                <td class="r">${formatCurrency(p.precio_unitario)}</td>
                <td class="r fuerte">${formatCurrency(importe)}</td>
              </tr>`;
          })
          .join('');

  const filasPagos =
    entradas.length === 0
      ? `<tr><td colspan="4" class="vacia">Aún no hay pagos registrados.</td></tr>`
      : entradas
          .map(
            (e) => `
              <tr>
                <td class="led-fecha">${formatDate(e.fecha)}</td>
                <td>${esc(e.concepto) || esc(e.categoria) || '—'}</td>
                <td class="c">${esc(e.metodo_pago) || '—'}</td>
                <td class="r entrada">${formatCurrency(e.monto)}</td>
              </tr>`,
          )
          .join('');

  const bloqueUbicacion = obra.ubicacion
    ? `<div><p class="etiqueta">Ubicación</p><p class="dato">${esc(obra.ubicacion)}</p></div>`
    : '';

  const cuerpo = `
    <header class="doc-header avoid">
      <div>
        <p class="kicker">Estado de cuenta</p>
        <h1 class="emisor">${esc(nombreEmpresa)}</h1>
        ${pdf.empresaContacto ? `<p class="contacto">${esc(pdf.empresaContacto)}</p>` : ''}
      </div>
      <div class="meta">
        <p class="etiqueta">Folio obra</p>
        <p class="folio">#${folio}</p>
        <p class="etiqueta sep">Al</p>
        <p class="fecha">${formatDate(hoy)}</p>
      </div>
    </header>

    <section class="info-grid avoid">
      <div><p class="etiqueta">Obra</p><p class="dato">${esc(obra.nombre)}</p></div>
      <div><p class="etiqueta">Cliente</p><p class="dato">${esc(obra.cliente) || '—'}</p></div>
      ${bloqueUbicacion}
    </section>

    <div class="stat-row avoid">
      <div class="stat-box"><p class="etiqueta">Costo total</p><p class="valor chico">${formatCurrency(costoTotal)}</p></div>
      <div class="stat-box verde"><p class="etiqueta">Pagado (${pagadoPct}%)</p><p class="valor chico">${formatCurrency(recibido)}</p></div>
      <div class="stat-box rojo"><p class="etiqueta">Pendiente</p><p class="valor chico">${formatCurrency(pendiente)}</p></div>
    </div>

    <div class="seccion avoid">
      <div class="seccion-titulo"><h2>Presupuesto</h2></div>
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
        <tbody>${filasPresupuesto}</tbody>
      </table>
    </div>

    <div class="seccion">
      <div class="seccion-titulo"><h2>Pagos recibidos</h2></div>
      <table>
        <thead>
          <tr>
            <th class="led-fecha">Fecha</th>
            <th>Concepto</th>
            <th class="c">Canal</th>
            <th class="r">Monto</th>
          </tr>
        </thead>
        <tbody>${filasPagos}</tbody>
      </table>
    </div>

    <div class="totales avoid">
      <div class="totales-caja">
        <div class="tot-fila"><span>Costo total</span><span class="r">${formatCurrency(costoTotal)}</span></div>
        <div class="tot-fila"><span>Pagado</span><span class="r verde">${formatCurrency(recibido)}</span></div>
        <div class="tot-total"><span class="lbl">PENDIENTE</span><span class="val">${formatCurrency(pendiente)}</span></div>
      </div>
    </div>

    <footer class="doc-footer avoid">
      <div class="vigencia">
        <p class="vigencia-texto">${esc(textoFinal)}</p>
        ${pdf.pieDePagina ? `<p class="pie-empresa">${esc(pdf.pieDePagina)}</p>` : ''}
      </div>
    </footer>`;

  return envolverDocumento({
    titulo: `Estado de cuenta ${obra.nombre} #${folio}`,
    pdf,
    cuerpo,
    estilos: `.led-fecha { width: 84px; white-space: nowrap; }`,
  });
}
