import type { Obra } from '@/lib/data/types';
import type { PdfConfig } from '@/lib/data/empresa-config';
import { formatDate, formatDateTime } from '@/lib/data/format';
import {
  ETIQUETA_CLIMA,
  ETIQUETA_TIPO,
  agruparPorDia,
  type EntradaBitacora,
} from '@/lib/bitacora/bitacora';
import { envolverDocumento, esc } from '@/lib/pdf/documento-base';

/** Fotos por entrada que entran al PDF (miniaturas). Las demás se cuentan. */
export const FOTOS_POR_ENTRADA_PDF = 6;

const fmtDia = new Intl.DateTimeFormat('es-MX', {
  timeZone: 'America/Mexico_City',
  weekday: 'long',
  day: 'numeric',
  month: 'long',
  year: 'numeric',
});

/**
 * HTML del PDF de BITÁCORA de una obra por periodo (RF4.5).
 *
 * Imprime lo mismo que la pantalla, día por día: tipo, clima, personal, texto,
 * miniaturas de las fotos, quién registró y cuándo, y las aclaraciones. Con
 * `paraCliente` salen solo las entradas publicadas en el portal: es la versión
 * para mandarle al cliente, que no debe incluir las notas internas.
 *
 * Las fotos van como `<img>` con su URL firmada: Chromium espera a que carguen
 * (`waitUntil: 'load'`) antes de imprimir.
 */
export function construirBitacoraHtml(params: {
  obra: Pick<Obra, 'nombre' | 'ubicacion'>;
  entradas: EntradaBitacora[];
  desde: number;
  hasta: number;
  nombreEmpresa: string;
  pdf: PdfConfig;
  paraCliente?: boolean;
}): string {
  const { obra, desde, hasta, nombreEmpresa, pdf, paraCliente = false } = params;
  const entradas = paraCliente ? params.entradas.filter((e) => e.visible_cliente) : params.entradas;
  const dias = agruparPorDia(entradas);
  const fotos = entradas.reduce((s, e) => s + e.fotos.length, 0);
  const incidencias = entradas.filter((e) => e.tipo === 'INCIDENCIA').length;

  const cuerpoDias =
    dias.length === 0
      ? `<p class="nota-vacia">No hay entradas${paraCliente ? ' publicadas' : ''} en este periodo.</p>`
      : dias
          .map(
            (d) => `
    <section class="dia">
      <div class="seccion-titulo"><h2>${esc(fmtDia.format(new Date(d.fecha)))}</h2></div>
      ${d.entradas.map((e) => entradaHtml(e, paraCliente)).join('')}
    </section>`,
          )
          .join('');

  const cuerpo = `
    <header class="doc-header avoid">
      <div>
        <p class="kicker">Bitácora de obra</p>
        <h1 class="emisor">${esc(nombreEmpresa)}</h1>
        ${pdf.empresaContacto ? `<p class="contacto">${esc(pdf.empresaContacto)}</p>` : ''}
      </div>
      <div class="meta">
        <p class="etiqueta">Periodo</p>
        <p class="fecha">${formatDate(desde)} – ${formatDate(hasta)}</p>
      </div>
    </header>

    <section class="info-grid avoid">
      <div><p class="etiqueta">Obra</p><p class="dato">${esc(obra.nombre)}</p></div>
      <div><p class="etiqueta">Ubicación</p><p class="dato">${esc(obra.ubicacion ?? '') || '—'}</p></div>
      <div><p class="etiqueta">Versión</p><p class="dato">${paraCliente ? 'Para el cliente' : 'Completa (interna)'}</p></div>
    </section>

    <div class="stat-row avoid">
      <div class="stat-box"><p class="etiqueta">Días con registro</p><p class="valor">${dias.length}</p></div>
      <div class="stat-box"><p class="etiqueta">Entradas</p><p class="valor">${entradas.length}</p></div>
      <div class="stat-box"><p class="etiqueta">Fotos</p><p class="valor">${fotos}</p></div>
      <div class="stat-box ${incidencias > 0 ? 'rojo' : ''}"><p class="etiqueta">Incidencias</p><p class="valor">${incidencias}</p></div>
    </div>

    ${cuerpoDias}

    <footer class="doc-footer avoid">
      <div class="vigencia">
        <p class="vigencia-texto">Cada entrada se cierra 24 horas después de registrarse; las correcciones posteriores aparecen como aclaraciones con su fecha.</p>
        ${pdf.pieDePagina ? `<p class="pie-empresa">${esc(pdf.pieDePagina)}</p>` : ''}
      </div>
    </footer>`;

  return envolverDocumento({
    titulo: `Bitácora ${obra.nombre} ${formatDate(desde)} – ${formatDate(hasta)}`,
    pdf,
    cuerpo,
    estilos: `
      .dia { margin-bottom: 18px; }
      .dia .seccion-titulo h2 { text-transform: none; font-size: 13px; letter-spacing: 0; }
      .entrada { border: 1px solid #e5e5e5; border-radius: 8px; padding: 10px 12px; margin: 8px 0; }
      .entrada-cab { display: flex; flex-wrap: wrap; gap: 8px; align-items: baseline; margin-bottom: 4px; }
      .tipo { font-size: 10px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.08em; color: var(--accent); }
      .tipo.incidencia { color: #b91c1c; }
      .muted { color: #525252; font-size: 10px; }
      .texto { white-space: pre-wrap; margin: 4px 0; font-size: 12px; }
      .fotos { display: grid; grid-template-columns: repeat(3, 1fr); gap: 6px; margin: 6px 0; }
      .fotos img { width: 100%; height: 120px; object-fit: cover; border-radius: 6px; border: 1px solid #e5e5e5; }
      .aclaraciones { background: #fffbeb; border-radius: 6px; padding: 6px 10px; margin-top: 6px; }
      .aclaraciones p { margin: 2px 0; }
    `,
  });
}

function entradaHtml(e: EntradaBitacora, paraCliente: boolean): string {
  const personal =
    e.personal_presente !== null || e.personal_nombres.length > 0
      ? `<p class="muted">Personal: ${e.personal_presente ?? e.personal_nombres.length}${
          e.personal_nombres.length > 0 ? ` · ${esc(e.personal_nombres.join(', '))}` : ''
        }</p>`
      : '';

  const conUrl = e.fotos.filter((f) => f.url);
  const mostradas = conUrl.slice(0, FOTOS_POR_ENTRADA_PDF);
  const resto = e.fotos.length - mostradas.length;
  const fotos =
    mostradas.length > 0
      ? `<div class="fotos">${mostradas
          .map((f, i) => `<img src="${esc(f.url)}" alt="Foto ${i + 1}">`)
          .join('')}</div>${resto > 0 ? `<p class="muted">+ ${resto} foto${resto === 1 ? '' : 's'} más en el sistema</p>` : ''}`
      : '';

  const aclaraciones =
    e.aclaraciones.length > 0
      ? `<div class="aclaraciones"><p class="etiqueta">Aclaraciones</p>${e.aclaraciones
          .map(
            (a) =>
              `<p>${esc(a.texto)} <span class="muted">— ${esc(a.autor_nombre || 'Equipo')}, ${formatDateTime(a.registrada_en)}</span></p>`,
          )
          .join('')}</div>`
      : '';

  const autor = paraCliente ? '' : ` · ${esc(e.autor_nombre || 'Equipo')}`;

  return `
      <div class="entrada avoid">
        <div class="entrada-cab">
          <span class="tipo ${e.tipo === 'INCIDENCIA' ? 'incidencia' : ''}">${esc(ETIQUETA_TIPO[e.tipo])}</span>
          ${e.clima ? `<span class="muted">Clima: ${esc(ETIQUETA_CLIMA[e.clima])}</span>` : ''}
          <span class="muted">Registrada ${formatDateTime(e.registrada_en)}${autor}</span>
        </div>
        <p class="texto">${esc(e.texto)}</p>
        ${personal}
        ${fotos}
        ${aclaraciones}
      </div>`;
}
