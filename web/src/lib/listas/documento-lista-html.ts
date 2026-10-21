import type { PdfConfig } from '@/lib/data/empresa-config';
import { formatDate } from '@/lib/data/format';
import type { ListaConRenglones, RenglonLista } from '@/lib/data/listas';
import { envolverDocumento, esc } from '@/lib/pdf/documento-base';
import {
  agruparPorSeccion,
  estribosPorPieza,
  metros2,
  metrosLineales,
  numeroCorto,
  resumenTotales,
  tipoRenglonLista,
  totalesDe,
  type RenglonCalc,
} from './calculo';

/**
 * HTML de una LISTA DE MATERIAL con su checklist, para imprimir y palomear en
 * obra (docs/PLAN_LISTAS_MATERIAL.md §8). Gemelo de `PdfService.listaMaterial`
 * del móvil: una tabla por sección con casilla, cantidad, largo, nota y metros
 * lineales; totales; renglones para observaciones y firmas «Elaboró» /
 * «Revisó / recibió».
 *
 * `conMarcas` imprime rellenas las casillas ya palomeadas; sin ella sale toda en
 * blanco, para palomear a mano.
 */
export function construirListaHtml(params: {
  obraNombre: string;
  lista: ListaConRenglones;
  nombreEmpresa: string;
  pdf: PdfConfig;
  conMarcas: boolean;
}): string {
  const { obraNombre, lista, nombreEmpresa, pdf, conMarcas } = params;
  const secciones = agruparPorSeccion(lista.renglones, (r) => r.seccion);
  const total = totalesDe(lista.renglones.map(calc));
  const nombreDe = (s: string) => (s === '' ? 'Sin sección' : s);

  const tablas = secciones
    .map(([seccion, renglones]) => {
      const t = totalesDe(renglones.map(calc));
      return `
    <div class="seccion">
      <div class="seccion-titulo"><h2>${esc(nombreDe(seccion))}</h2></div>
      <table>
        <thead>
          <tr>
            <th class="c ok">OK</th>
            <th class="r">Cant.</th>
            <th class="r">Largo (m)</th>
            <th>Nota</th>
            <th class="r">Metros lin.</th>
          </tr>
        </thead>
        <tbody>${renglones.map((r) => fila(r, conMarcas)).join('')}</tbody>
        <tfoot>
          <tr>
            <td></td>
            <td class="r fuerte">${numeroCorto(t.piezas)}</td>
            <td class="piezas">piezas</td>
            <td></td>
            <td class="r fuerte">${t.metros > 0 ? `${metros2(t.metros)} m` : ''}</td>
          </tr>
        </tfoot>
      </table>
    </div>`;
    })
    .join('');

  const subtotales =
    secciones.length > 1
      ? secciones
          .map(
            ([s, rs]) =>
              `<div class="tot-fila"><span>${esc(nombreDe(s))}</span><span class="r">${esc(resumenTotales(totalesDe(rs.map(calc))))}</span></div>`,
          )
          .join('')
      : '';

  const datos = [
    `<div><p class="etiqueta">Obra</p><p class="dato">${esc(obraNombre) || '—'}</p></div>`,
    `<div><p class="etiqueta">Lista</p><p class="dato">${esc(lista.titulo) || '—'}</p></div>`,
    `<div><p class="etiqueta">Plano</p><p class="dato">${esc(lista.plano) || '—'}</p></div>`,
  ].join('');

  const cuerpo = `
    <header class="doc-header avoid">
      <div>
        <p class="kicker">Lista de material</p>
        <h1 class="emisor">${esc(nombreEmpresa)}</h1>
        ${pdf.empresaContacto ? `<p class="contacto">${esc(pdf.empresaContacto)}</p>` : ''}
      </div>
      <div class="meta">
        <p class="etiqueta">Fecha</p>
        <p class="fecha">${formatDate(lista.fecha)}</p>
        <p class="etiqueta sep">Medidas</p>
        <p class="fecha">en metros</p>
      </div>
    </header>

    <section class="info-grid avoid">${datos}</section>

    ${lista.renglones.length === 0 ? '<p class="nota-vacia">Esta lista todavía no tiene renglones.</p>' : tablas}

    ${
      lista.renglones.length > 0
        ? `<div class="totales avoid">
      <div class="totales-caja">
        ${subtotales}
        <div class="tot-total"><span class="lbl">TOTAL</span><span class="val">${esc(resumenTotales(total))}</span></div>
      </div>
    </div>`
        : ''
    }

    ${lista.notas ? `<div class="notas avoid"><p class="etiqueta">Notas</p><p class="notas-texto">${esc(lista.notas)}</p></div>` : ''}

    <div class="observaciones avoid">
      <div class="seccion-titulo"><h2>Observaciones</h2></div>
      <div class="raya"></div><div class="raya"></div><div class="raya"></div>
    </div>`;

  return envolverDocumento({
    titulo: `Lista de material ${lista.titulo || obraNombre}`,
    // Las firmas de este documento son de obra, no las del presupuesto.
    pdf: { ...pdf, firmaIzquierda: 'Elaboró', firmaDerecha: 'Revisó / recibió' },
    cuerpo,
    estilos: `
      th.ok, td.ok { width: 34px; }
      .casilla {
        display: inline-block; width: 11px; height: 11px; border: 1px solid #0F172A;
        border-radius: 2px; vertical-align: middle;
      }
      .casilla.marcada { background: #0F172A; }
      tbody tr:nth-child(even) td { background: transparent; }
      tfoot td { border-bottom: 1px solid #f1f1f1; }
      .piezas { color: #737373; font-size: 9px; }
      .observaciones { margin-top: 18px; }
      .raya { height: 24px; border-bottom: 1px solid #e5e5e5; }
    `,
  });
}

function calc(r: RenglonLista): RenglonCalc {
  return {
    tipo: tipoRenglonLista(r.tipo),
    cantidad: r.cantidad,
    largo: r.largo,
    separacion_cm: r.separacion_cm,
    marcado: r.marcado,
  };
}

/** Lo que va en la columna «Nota»: igual que `_notaRenglon` del móvil. */
export function notaDeRenglon(r: RenglonLista): string {
  const esPieza = tipoRenglonLista(r.tipo) === 'PIEZA';
  const estribos = estribosPorPieza(r.largo, r.separacion_cm);
  return [
    !esPieza ? [r.unidad, r.descripcion].filter(Boolean).join(' ') : '',
    r.separacion_cm != null
      ? `Estribo @${numeroCorto(r.separacion_cm)} cm${estribos != null ? ` (~${estribos} por pieza)` : ''}`
      : '',
    r.nota,
    esPieza && r.largo == null ? 'Falta el largo' : '',
  ]
    .filter(Boolean)
    .join(' · ');
}

function fila(r: RenglonLista, conMarcas: boolean): string {
  const metros = metrosLineales(calc(r));
  return `
          <tr>
            <td class="c ok"><span class="casilla${conMarcas && r.marcado ? ' marcada' : ''}"></span></td>
            <td class="r fuerte">${numeroCorto(r.cantidad)}</td>
            <td class="r">${r.largo != null ? metros2(r.largo) : '-'}</td>
            <td>${esc(notaDeRenglon(r))}</td>
            <td class="r">${metros != null ? metros2(metros) : ''}</td>
          </tr>`;
}
