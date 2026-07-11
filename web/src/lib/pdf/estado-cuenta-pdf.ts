/**
 * Importar el "estado de cuenta" de una obra desde un PDF (la plantilla de
 * ConstructorPro exportada/impresa a PDF).
 *
 * A diferencia del .xlsx/.csv, un PDF no trae una grilla de celdas: solo texto
 * con posición (x, y). Este módulo reconstruye la tabla de MOVIMIENTOS a partir
 * de esas posiciones:
 *   1. Localiza la fila de encabezados (FECHA CONCEPTO CANTIDAD NOMBRE CANAL
 *      TIPO OBSERVACIONES) y toma la x de cada encabezado como ancla de columna.
 *   2. Define fronteras de columna en los puntos medios entre anclas.
 *   3. Agrupa los items de texto en líneas visuales (misma y ± tolerancia) y
 *      asigna cada item a una columna por su x.
 *   4. Una "línea ancla" es la que tiene una FECHA válida en su columna FECHA;
 *      cada movimiento nace de una línea ancla. Las líneas de continuación
 *      (texto envuelto de CONCEPTO/OBSERVACIONES) se adjuntan a la línea ancla
 *      más cercana dentro de un margen vertical. Esto excluye por construcción
 *      las partidas (arriba del encabezado) y los resúmenes (nombres sin fecha).
 *
 * Solo se importan MOVIMIENTOS (igual que el CSV). Las partidas de presupuesto,
 * que en la plantilla viven arriba del encabezado, NO se extraen del PDF en esta
 * versión (su layout es demasiado variable para hacerlo con confianza).
 */

import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs';
import {
  type ParsedObraData,
  type ExcelMovimiento,
  normalizarTipo,
  normalizarMetodoPago,
  parseFechaCsv,
  parseMontoCsv,
} from '@/lib/excel/estado-cuenta-excel';

// Un fragmento de texto posicionado dentro de una página.
interface Item {
  x: number;
  y: number;
  str: string;
}

const COLUMNAS = [
  'FECHA',
  'CONCEPTO',
  'CANTIDAD',
  'NOMBRE',
  'CANAL',
  'TIPO',
  'OBSERVACIONES',
] as const;

// Tolerancia (en unidades PDF) para considerar dos items en la misma línea.
const TOL_LINEA = 3;
// Margen vertical máximo para adjuntar una línea de continuación a su ancla.
const MARGEN_CONTINUACION = 14;

/** Agrupa items de una página en líneas visuales por su coordenada y. */
function agruparEnLineas(items: Item[]): { y: number; items: Item[] }[] {
  const lineas: { y: number; items: Item[] }[] = [];
  for (const it of items) {
    let l = lineas.find((L) => Math.abs(L.y - it.y) <= TOL_LINEA);
    if (!l) {
      l = { y: it.y, items: [] };
      lineas.push(l);
    }
    l.items.push(it);
  }
  // De arriba hacia abajo (y descendente en coordenadas PDF).
  lineas.sort((a, b) => b.y - a.y);
  for (const l of lineas) l.items.sort((a, b) => a.x - b.x);
  return lineas;
}

/** Busca la línea de encabezados y devuelve las fronteras de columna (por x). */
function detectarFronteras(
  lineas: { y: number; items: Item[] }[],
): number[] | null {
  for (const l of lineas) {
    const textos = l.items.map((i) => i.str.trim().toUpperCase());
    if (!textos.includes('FECHA') || !textos.includes('CONCEPTO')) continue;

    const anclas: number[] = [];
    for (const nombre of COLUMNAS) {
      const it = l.items.find((i) => i.str.trim().toUpperCase() === nombre);
      if (!it) return null; // encabezado incompleto → no confiable
      anclas.push(it.x);
    }
    const fronteras: number[] = [];
    for (let i = 0; i < anclas.length - 1; i++) {
      fronteras.push((anclas[i] + anclas[i + 1]) / 2);
    }
    return fronteras;
  }
  return null;
}

/** Índice de columna (0..6) para una x dada, según las fronteras. */
function columnaDeX(x: number, fronteras: number[]): number {
  let col = 0;
  while (col < fronteras.length && x >= fronteras[col]) col++;
  return col;
}

/** Convierte los items de una línea en 7 columnas de texto usando las fronteras. */
function lineaEnColumnas(items: Item[], fronteras: number[]): string[] {
  const cols: string[] = ['', '', '', '', '', '', ''];
  for (const it of items) {
    const c = columnaDeX(it.x, fronteras);
    const txt = it.str.trim();
    cols[c] = cols[c] ? `${cols[c]} ${txt}` : txt;
  }
  return cols;
}

interface MovParcial {
  fechaMs: number;
  montoRaw: string;
  nombre: string;
  canal: string;
  tipo: string;
  conceptoLineas: { y: number; txt: string }[];
  obsLineas: { y: number; txt: string }[];
  anclaY: number;
}

export async function parsearPdfObra(buffer: ArrayBuffer): Promise<ParsedObraData> {
  const advertencias: string[] = [];
  const movimientos: ExcelMovimiento[] = [];

  const data = new Uint8Array(buffer);
  let doc;
  try {
    doc = await getDocument({ data, useSystemFonts: true, isEvalSupported: false }).promise;
  } catch (err) {
    throw new Error(
      `No se pudo leer el PDF: ${err instanceof Error ? err.message : 'archivo inválido'}.`,
    );
  }

  // Columnas: se detectan una vez (en la página donde esté el encabezado) y se
  // reutilizan en todas las páginas (la plantilla no repite el encabezado).
  let fronteras: number[] | null = null;
  let obraNombre = '';
  const paginas: { y: number; items: Item[] }[][] = [];

  for (let p = 1; p <= doc.numPages; p++) {
    const page = await doc.getPage(p);
    const tc = await page.getTextContent();
    const items: Item[] = [];
    for (const raw of tc.items) {
      const it = raw as { str?: string; transform?: number[] };
      if (!it.str || !it.str.trim() || !it.transform) continue;
      items.push({ x: it.transform[4], y: it.transform[5], str: it.str });
    }
    const lineas = agruparEnLineas(items);
    paginas.push(lineas);

    // Nombre de obra: primera línea que empiece con "OBRA".
    if (!obraNombre) {
      for (const l of lineas) {
        const idx = l.items.findIndex((i) => i.str.trim().toUpperCase().startsWith('OBRA'));
        if (idx >= 0 && l.items[idx + 1]) {
          obraNombre = l.items
            .slice(idx + 1)
            .map((i) => i.str.trim())
            .join(' ')
            .trim();
          break;
        }
      }
    }

    if (!fronteras) fronteras = detectarFronteras(lineas);
  }

  if (!fronteras) {
    return {
      obraNombre,
      partidas: [],
      movimientos,
      advertencias: [
        'No se encontró la tabla de movimientos (encabezados FECHA | CONCEPTO | …) en el PDF. No se importó nada.',
      ],
    };
  }

  for (const lineas of paginas) {
    const enColumnas = lineas.map((l) => ({ y: l.y, cols: lineaEnColumnas(l.items, fronteras!) }));

    // Líneas ancla: tienen una fecha válida en la columna FECHA.
    const movs: MovParcial[] = [];
    for (const l of enColumnas) {
      const fechaMs = parseFechaCsv(l.cols[0]);
      if (fechaMs === undefined) continue;
      movs.push({
        fechaMs,
        montoRaw: l.cols[2],
        nombre: l.cols[3],
        canal: l.cols[4],
        tipo: l.cols[5],
        conceptoLineas: l.cols[1] ? [{ y: l.y, txt: l.cols[1] }] : [],
        obsLineas: l.cols[6] ? [{ y: l.y, txt: l.cols[6] }] : [],
        anclaY: l.y,
      });
    }
    if (movs.length === 0) continue;

    // Adjuntar continuaciones (líneas sin fecha) al ancla más cercana en y.
    for (const l of enColumnas) {
      if (parseFechaCsv(l.cols[0]) !== undefined) continue; // es ancla
      const concepto = l.cols[1].trim();
      const obs = l.cols[6].trim();
      if (!concepto && !obs) continue;

      let mejor: MovParcial | null = null;
      let mejorDist = Infinity;
      for (const m of movs) {
        const d = Math.abs(m.anclaY - l.y);
        if (d < mejorDist) {
          mejorDist = d;
          mejor = m;
        }
      }
      if (!mejor || mejorDist > MARGEN_CONTINUACION) continue;
      if (concepto) mejor.conceptoLineas.push({ y: l.y, txt: concepto });
      if (obs) mejor.obsLineas.push({ y: l.y, txt: obs });
    }

    for (const m of movs) {
      const monto = parseMontoCsv(m.montoRaw);
      const fechaIso = new Date(m.fechaMs).toISOString().slice(0, 10);
      if (monto === undefined || monto <= 0) {
        advertencias.push(`Movimiento del ${fechaIso}: se omitió (monto inválido o cero).`);
        continue;
      }
      const tipo = normalizarTipo(m.tipo);
      if (!tipo) {
        advertencias.push(`Movimiento del ${fechaIso}: TIPO "${m.tipo}" no reconocido, se omitió.`);
        continue;
      }
      const categoria = m.conceptoLineas
        .sort((a, b) => b.y - a.y)
        .map((c) => c.txt)
        .join(' ')
        .trim();
      const referencia = m.obsLineas
        .sort((a, b) => b.y - a.y)
        .map((o) => o.txt)
        .join(' ')
        .trim();

      movimientos.push({
        fecha: m.fechaMs,
        categoria,
        monto,
        nombre: m.nombre.trim(),
        metodoPago: normalizarMetodoPago(m.canal),
        tipo,
        referencia,
      });
    }
  }

  if (movimientos.length === 0 && advertencias.length === 0) {
    advertencias.push('El PDF no contiene filas de movimientos reconocibles.');
  }
  advertencias.push(
    'Importación desde PDF: solo se importan movimientos. Las partidas de presupuesto no se leen del PDF; las existentes de la obra no se modifican.',
  );

  return { obraNombre, partidas: [], movimientos, advertencias };
}
