import type { Movimiento, Obra, PartidaPresupuesto } from '@/lib/data/types';
import type { PdfConfig } from '@/lib/data/empresa-config';
import { formatCurrency, formatDate } from '@/lib/data/format';
import { envolverDocumento, esc, folioCorto } from '@/lib/pdf/documento-base';

/**
 * HTML del "estado de cuenta / flujo de caja" de una obra: el mismo documento que
 * ya arma el Excel (`construirExcelEstadoCuenta`), en versión imprimible.
 *
 * Orden espejando al Excel: encabezado de obra → indicadores (costo/recibido/
 * pendiente) → presupuesto → movimientos (ledger cronológico) → pagado por
 * persona / recibido por tipo → nota de conciliación.
 */

const ESTILOS = `
  .led-fecha { width: 78px; white-space: nowrap; }
  .led-tipo { width: 64px; }
  .stat-box .valor.chico { font-size: 15px; }
`;

export function construirCajaDocumentoHtml(params: {
  obra: Obra;
  partidas: PartidaPresupuesto[];
  movimientos: Movimiento[];
  notaCaja?: string | null;
  nombreEmpresa: string;
  pdf: PdfConfig;
}): string {
  const { obra, partidas, movimientos, notaCaja, nombreEmpresa, pdf } = params;
  const folio = folioCorto(obra.id);

  const costoTotal = partidas.reduce((s, p) => s + p.cantidad * p.precio_unitario, 0);
  const recibido = movimientos
    .filter((m) => m.tipo === 'ENTRADA')
    .reduce((s, m) => s + m.monto, 0);
  const salidas = movimientos
    .filter((m) => m.tipo === 'SALIDA')
    .reduce((s, m) => s + m.monto, 0);
  const pendiente = costoTotal - recibido;
  const saldo = recibido - salidas;

  // Ledger en orden cronológico (como el apunte del Excel), sin mutar el arreglo.
  const ordenados = [...movimientos].sort((a, b) => a.fecha - b.fecha);

  // ── Bloque presupuesto ─────────────────────────────────────────────────────
  const filasPresupuesto =
    partidas.length === 0
      ? `<tr><td colspan="5" class="vacia">Sin presupuesto capturado.</td></tr>`
      : [...partidas]
          .sort((a, b) => a.orden - b.orden)
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

  // ── Ledger de movimientos ──────────────────────────────────────────────────
  const filasMovimientos =
    ordenados.length === 0
      ? `<tr><td colspan="7" class="vacia">Sin movimientos registrados.</td></tr>`
      : ordenados
          .map((m) => {
            const esEntrada = m.tipo === 'ENTRADA';
            return `
              <tr>
                <td class="led-fecha">${formatDate(m.fecha)}</td>
                <td>${esc(m.concepto) || '—'}</td>
                <td>${esc(m.nombre) || '—'}</td>
                <td class="c">${esc(m.metodo_pago) || '—'}</td>
                <td class="led-tipo ${esEntrada ? 'entrada' : 'salida'}">${esEntrada ? 'Entrada' : 'Salida'}</td>
                <td>${esc(m.referencia) || '—'}</td>
                <td class="r ${esEntrada ? 'entrada' : 'salida'}">${formatCurrency(m.monto)}</td>
              </tr>`;
          })
          .join('');

  // ── Resúmenes ──────────────────────────────────────────────────────────────
  const porPersona = new Map<string, number>();
  for (const m of movimientos) {
    if (m.tipo !== 'SALIDA') continue;
    const key = m.nombre?.trim() || 'Sin nombre';
    porPersona.set(key, (porPersona.get(key) ?? 0) + m.monto);
  }
  const porTipo = new Map<string, number>();
  for (const m of movimientos) {
    if (m.tipo !== 'ENTRADA') continue;
    const key = m.categoria?.trim() || m.concepto?.trim() || 'Sin categoría';
    porTipo.set(key, (porTipo.get(key) ?? 0) + m.monto);
  }
  const filasResumen = (m: Map<string, number>) =>
    m.size === 0
      ? `<p class="nota-vacia">Sin datos.</p>`
      : [...m.entries()]
          .sort((a, b) => b[1] - a[1])
          .map(
            ([k, v]) =>
              `<div class="resumen-fila"><span>${esc(k)}</span><span class="r">${formatCurrency(v)}</span></div>`,
          )
          .join('');

  const bloqueUbicacion = obra.ubicacion
    ? `<div><p class="etiqueta">Ubicación</p><p class="dato">${esc(obra.ubicacion)}</p></div>`
    : '';

  const bloqueNota = notaCaja?.trim()
    ? `<div class="notas"><p class="etiqueta">Nota de conciliación</p><p class="notas-texto">${esc(notaCaja)}</p></div>`
    : '';

  const cuerpo = `
    <header class="doc-header avoid">
      <div>
        <p class="kicker">Estado de cuenta · Flujo de caja</p>
        <h1 class="emisor">${esc(nombreEmpresa)}</h1>
        ${pdf.empresaContacto ? `<p class="contacto">${esc(pdf.empresaContacto)}</p>` : ''}
      </div>
      <div class="meta">
        <p class="etiqueta">Folio obra</p>
        <p class="folio">#${folio}</p>
        <p class="etiqueta sep">Corte</p>
        <p class="fecha">${formatDate(Date.now())}</p>
      </div>
    </header>

    <section class="info-grid avoid">
      <div><p class="etiqueta">Obra</p><p class="dato">${esc(obra.nombre)}</p></div>
      <div><p class="etiqueta">Cliente</p><p class="dato">${esc(obra.cliente) || '—'}</p></div>
      ${bloqueUbicacion}
    </section>

    <div class="stat-row avoid">
      <div class="stat-box"><p class="etiqueta">Costo total</p><p class="valor chico">${formatCurrency(costoTotal)}</p></div>
      <div class="stat-box verde"><p class="etiqueta">Recibido</p><p class="valor chico">${formatCurrency(recibido)}</p></div>
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
      <div class="seccion-titulo"><h2>Movimientos</h2></div>
      <table>
        <thead>
          <tr>
            <th class="led-fecha">Fecha</th>
            <th>Concepto</th>
            <th>Nombre</th>
            <th class="c">Canal</th>
            <th class="led-tipo">Tipo</th>
            <th>Observaciones</th>
            <th class="r">Cantidad</th>
          </tr>
        </thead>
        <tbody>${filasMovimientos}</tbody>
      </table>
    </div>

    <div class="totales avoid">
      <div class="totales-caja">
        <div class="tot-fila"><span>Total entradas</span><span class="r verde">${formatCurrency(recibido)}</span></div>
        <div class="tot-fila"><span>Total salidas</span><span class="r rojo">-${formatCurrency(salidas)}</span></div>
        <div class="tot-total"><span class="lbl">SALDO</span><span class="val">${formatCurrency(saldo)}</span></div>
      </div>
    </div>

    <div class="resumen-doble avoid">
      <div class="resumen-lista">
        <h3>Pagado por persona</h3>
        ${filasResumen(porPersona)}
      </div>
      <div class="resumen-lista">
        <h3>Recibido por tipo</h3>
        ${filasResumen(porTipo)}
      </div>
    </div>

    ${bloqueNota ? `<footer class="doc-footer avoid">${bloqueNota}</footer>` : ''}`;

  return envolverDocumento({
    titulo: `Estado de cuenta ${obra.nombre} #${folio}`,
    accent: pdf.colorHex,
    cuerpo,
    estilos: ESTILOS,
  });
}
