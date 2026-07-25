/**
 * Convierte texto pegado (una partida por línea) en conceptos estructurados,
 * detectando unidad, cantidad y precio heurísticamente. Port 1:1 del móvil
 * (`lib/domain/text_import_parser.dart`) para que pegue igual en web y móvil.
 *
 * Formato libre, una partida por línea. Ejemplos:
 *   "Muro de block 85 m2 $201.34"  →  Muro de block · m2 · 85 · 201.34
 *   "Aplanado interior 120 m2 91.68"
 */

export interface ParsedConcepto {
  nombre: string;
  unidad: string;
  cantidad: number;
  precioUnitario: number;
}

const UNIDADES = ['m2', 'm3', 'ml', 'm', 'pza', 'lote', 'kg', 'ton', 'dia', 'hr', 'jornada'];

function sinAcentos(s: string): string {
  const from = 'áéíóúüñÁÉÍÓÚÜÑ';
  const to = 'aeiouunAEIOUUN';
  let r = s;
  for (let i = 0; i < from.length; i++) {
    r = r.split(from[i]).join(to[i]);
  }
  return r;
}

export function parseImportText(text: string): ParsedConcepto[] {
  return text
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l.length > 0)
    .map(parseLine)
    .filter((p): p is ParsedConcepto => p !== null && p.nombre.trim().length > 0);
}

function parseLine(line: string): ParsedConcepto | null {
  let remaining = line;
  let unidad = 'pza';
  let precio = 0;
  let cantidad = 1;

  // 1. Unidad
  const words = line.split(/\s+/);
  for (let i = 0; i < words.length; i++) {
    const w = sinAcentos(words[i]).toLowerCase().replace(/[^a-z0-9]/g, '');
    if (UNIDADES.includes(w)) {
      unidad = w;
      remaining = remaining.replace(words[i], '');
      break;
    }
  }

  // 2. Números (admite $ y comas de miles)
  const numberRegex =
    /(?<=\s|^)[$]?([0-9]{1,3}(?:,[0-9]{3})*(?:\.[0-9]+)?|[0-9]+(?:\.[0-9]+)?)(?=\s|$)/g;
  const numeros: { original: string; valor: number }[] = [];
  for (const m of remaining.matchAll(numberRegex)) {
    const original = m[0];
    const valor = parseFloat(original.replace(/\$/g, '').replace(/,/g, ''));
    if (!Number.isNaN(valor)) numeros.push({ original, valor });
  }

  if (numeros.length > 0) {
    if (numeros.length === 1) {
      precio = numeros[0].valor;
      remaining = remaining.replace(numeros[0].original, '');
    } else {
      const dollar = numeros.filter((n) => n.original.includes('$'));
      if (dollar.length > 0) {
        precio = dollar[0].valor;
        remaining = remaining.replace(dollar[0].original, '');
        const qList = numeros.filter((n) => n !== dollar[0]);
        if (qList.length > 0) {
          cantidad = qList[0].valor;
          remaining = remaining.replace(qList[0].original, '');
        }
      } else {
        // primero = cantidad, último = precio
        cantidad = numeros[0].valor;
        precio = numeros[numeros.length - 1].valor;
        remaining = remaining.replace(numeros[0].original, '');
        if (numeros[0] !== numeros[numeros.length - 1]) {
          remaining = remaining.replace(numeros[numeros.length - 1].original, '');
        }
      }
    }
  }

  let nombre = remaining
    .replace(/^[\s\-*.]+|[\s\-*.]+$/g, '')
    .replace(/\s{2,}/g, ' ')
    .trim();
  if (nombre.length > 0) {
    nombre = nombre[0].toUpperCase() + nombre.slice(1);
  }

  return { nombre, unidad, cantidad, precioUnitario: precio };
}
