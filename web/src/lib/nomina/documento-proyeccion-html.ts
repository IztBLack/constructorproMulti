/// El PDF de la proyección.
///
/// Espeja `lib/presentation/nomina/proyeccion_pdf.dart` y
/// `PdfService.proyeccionNomina` del móvil: mismas columnas, mismos totales y
/// el mismo aviso. Si cambia allá, cámbialo aquí.
///
/// La regla que NO se negocia: este documento estampa «PROYECCIÓN» en diagonal
/// **ignorando** la marca de agua que la empresa tenga configurada, y repite el
/// aviso en el cuerpo. Es el único PDF de la app que desobedece esa preferencia,
/// y es a propósito: el riesgo real del módulo es que un escenario circule como
/// si fuera la raya buena y alguien pague con él.

import { esc, envolverDocumento, type OpcionesDocumento } from '@/lib/pdf/documento-base';
import { ETIQUETA_AJUSTE, type ProyeccionResultado } from '@/lib/data/proyeccion-nomina';
import type { VistaRedondeada } from '@/lib/data/redondeo';

const DIAS = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'];

const ESTILOS = `
  .cabecera { display: flex; justify-content: space-between; align-items: flex-start; gap: 16px; margin-bottom: 4px; }
  .aviso { border: 1.5px solid var(--accent); border-radius: 6px; padding: 8px 12px; margin: 10px 0 16px; font-size: 11px; font-weight: 700; }
  .resumen { display: flex; gap: 18px; flex-wrap: wrap; margin-bottom: 14px; }
  .resumen div { font-size: 11px; }
  .resumen b { display: block; font-size: 15px; }
  table.proy { width: 100%; border-collapse: collapse; font-size: 10px; }
  table.proy th, table.proy td { border: 0.5px solid #cbd5e1; padding: 3px 5px; }
  table.proy th { background: #f1f5f9; font-size: 9px; text-transform: uppercase; letter-spacing: .04em; }
  table.proy td.n, table.proy th.n { text-align: right; font-variant-numeric: tabular-nums; }
  table.proy td.c, table.proy th.c { text-align: center; }
  table.proy tr.grupo td { background: #f8fafc; font-weight: 700; }
  table.proy tfoot td { background: #f1f5f9; font-weight: 700; }
  .nota { font-size: 9px; color: #475569; margin-top: 10px; }
`;

/// Cómo se dibuja cada celda de día.
///
/// Sin guion largo ni símbolos raros: el PDF del MÓVIL usa la Helvetica base,
/// que es Latin-1, y ahí un «—» sale como hueco en blanco — que en una tabla de
/// días se lee como «no trabajó». Aquí el renderizador es Chromium y aguantaría
/// Unicode, pero se conserva el mismo vocabulario para que los dos documentos
/// se lean igual.
function celda(origen: string, fraccion: number, prestado: boolean): string {
  if (prestado) return 'P';
  if (origen === 'REAL') return fraccion > 0 ? 'X' : 'F';
  if (origen === 'PROYECTADA') return 'o';
  return '.';
}

export function construirProyeccionDocumentoHtml(p: {
  empresa: string | null;
  rangoSemana: string;
  obraNombre: string | null;
  resultado: ProyeccionResultado;
  /// El mismo resultado visto a través del redondeo. El papel imprime lo que
  /// enseña la pantalla: un PDF que redondea distinto son dos cifras para la
  /// misma semana, y la que se lleva la gente es la del papel.
  vista: VistaRedondeada;
  nombreObra: Record<string, string>;
  pdf: OpcionesDocumento;
  moneda: (v: number) => string;
}): string {
  const { resultado: r, vista, moneda } = p;

  const filas = r.renglones
    .map((ren) => {
      const dias = ren.esDestajista
        ? `<td class="c" colspan="7">a destajo</td>`
        : ren.celdas
            .map(
              (c) =>
                `<td class="c">${celda(c.origen, c.fraccion, c.prestado)}</td>`,
            )
            .join('');
      return `<tr>
        <td>${esc(ren.colaborador.nombre)}</td>
        <td>${esc(ren.esDestajista ? 'A destajo' : ren.puestoNombre)}</td>
        <td class="n">${ren.esDestajista ? '' : moneda(vista.salarioDia(ren).mostrado)}</td>
        ${dias}
        <td class="n">${ren.esDestajista ? '' : ren.diasTotales}</td>
        <td class="n">${ren.ajustes !== 0 ? moneda(ren.ajustes) : ''}</td>
        <td class="n">${moneda(vista.raya(ren).mostrado)}</td>
      </tr>`;
    })
    .join('\n');

  // Los ajustes de cuadrilla que NO se repartieron son parte del total: sin
  // ellos la suma de los renglones no daría el gran total y el documento se
  // vería mal cuadrado.
  const filasCuadrilla = r.lineasCuadrilla
    .filter((l) => !l.repartido)
    .map(
      (l) => `<tr>
        <td colspan="10">${esc(ETIQUETA_AJUSTE[l.ajuste.tipo])} · cuadrilla${
          l.ajuste.nota ? ` — ${esc(l.ajuste.nota)}` : ''
        }</td>
        <td class="n"></td>
        <td class="n">${moneda(l.montoConSigno)}</td>
      </tr>`,
    )
    .join('\n');

  const cuerpo = `
  <div class="cabecera">
    <div>
      <h1>Proyección de nómina</h1>
      <p>${esc(p.empresa ?? '')}</p>
    </div>
    <div style="text-align:right">
      <p><strong>Semana:</strong> ${esc(p.rangoSemana)}</p>
      <p><strong>Obra:</strong> ${esc(p.obraNombre ?? 'Todas las obras')}</p>
    </div>
  </div>

  <div class="aviso">
    ESTO NO ES LA NÓMINA. Es una proyección: cifras esperadas, no pagadas.
    No la uses para pagar ni para comprobar un pago.
  </div>

  <div class="resumen">
    <div>Raya proyectada<b>${moneda(vista.total.mostrado)}</b></div>
    <div>En firme<b>${moneda(vista.totalCapturado.mostrado)}</b></div>
    <div>Estimado<b>${moneda(vista.totalProyectado.mostrado)}</b></div>
    <div>Días-hombre<b>${r.diasHombre}</b></div>
    <div>Personas<b>${r.personas}</b></div>
  </div>

  <table class="proy">
    <thead>
      <tr>
        <th>Colaborador</th>
        <th>Puesto</th>
        <th class="n">$/día</th>
        ${DIAS.map((d) => `<th class="c">${d}</th>`).join('')}
        <th class="n">Días</th>
        <th class="n">Ajustes</th>
        <th class="n">Subtotal</th>
      </tr>
    </thead>
    <tbody>
      ${filas}
      ${filasCuadrilla}
    </tbody>
    <tfoot>
      <tr>
        <td colspan="3">Total por día</td>
        ${r.totalPorDia
          .map(
            (m, i) =>
              `<td class="c">${r.personasPorDia[i] === 0 ? '' : moneda(vista.costoDia(i).mostrado)}</td>`,
          )
          .join('')}
        <td class="n">${r.diasHombre}</td>
        <td class="n">${r.totalAjustes !== 0 ? moneda(r.totalAjustes) : ''}</td>
        <td class="n">${moneda(vista.total.mostrado)}</td>
      </tr>
    </tfoot>
  </table>

  <p class="nota">
    X = asistió (ya capturado) · F = faltó (ya capturado) · o = se espera que asista
    · P = ese día se va prestado a otra obra · . = no cuenta.
    Los días prestados no suman a la obra de este documento.
  </p>
  ${
    // Con redondeo, el papel DICE con qué regla. Un documento que enseña cifras
    // ajustadas sin declararlo invita a que alguien las sume por su cuenta y no
    // le cuadren.
    vista.activo
      ? `<p class="nota">${esc(vista.leyenda)}${
          vista.totalCuadra
            ? ''
            : ' El total se redondea por encima de rayas ya redondeadas, así que no es exactamente su suma.'
        }</p>`
      : ''
  }`;

  return envolverDocumento({
    titulo: 'Proyección de nómina',
    // Se pisa la marca de agua configurada. Ver el encabezado del archivo.
    pdf: { ...p.pdf, watermark: 'PROYECCIÓN' },
    cuerpo,
    estilos: ESTILOS,
  });
}
