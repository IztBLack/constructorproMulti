/**
 * Lee una nota de material pegada de WhatsApp y la convierte en renglones.
 *
 * Gemelo de `lib/domain/listas/leer_nota_material.dart`; los casos compartidos
 * están en `casos.json`. Reglas (docs/PLAN_LISTAS_MATERIAL.md §6):
 * - Una línea sin números es el NOMBRE DE UNA SECCIÓN («Través» → «Trabes»);
 *   una que termina en «:» también, aunque traiga números («Planta 2:»).
 * - `:`, `.` o `,` entre dígitos es el punto decimal: `10:45` = 10.45 m.
 * - Sufijo `m`/`mt`/`mts` = largo en metros; `cm` = largo en centímetros.
 * - De dos números, el LARGO es el que trae decimal o sufijo y la CANTIDAD el
 *   entero; así `4:10 1` es 1 pieza de 4.10 m.
 * - `estribo 25`, `@25` o `c/25` es la separación de estribos en cm.
 * - Las palabras sueltas de una pieza son su nota («chica»).
 * - Un solo número y palabras es material suelto (LIBRE): «30 bultos de cemento».
 *
 * Lo que no se entiende NO se descarta: sale con `duda` para revisarlo.
 */

import { numeroCorto, type TipoRenglonLista } from './calculo';

export interface RenglonLeido {
  linea: string;
  seccion: string;
  tipo: TipoRenglonLista;
  cantidad: number;
  largo: number | null;
  separacionCm: number | null;
  unidad: string;
  descripcion: string;
  nota: string;
  /** null si se entendió sin ambigüedad. */
  duda: string | null;
}

const SECCIONES_CONOCIDAS: Record<string, string> = {
  traves: 'Trabes',
  trabe: 'Trabes',
  trabes: 'Trabes',
  castillo: 'Castillos',
  castillos: 'Castillos',
  cadena: 'Cadenas',
  cadenas: 'Cadenas',
  dala: 'Dalas',
  dalas: 'Dalas',
};

const UNIDADES = new Set([
  'bulto', 'bultos', 'saco', 'sacos', 'pza', 'pzas', 'pieza', 'piezas',
  'kg', 'kilo', 'kilos', 'ton', 'm3', 'm2', 'ml', 'rollo', 'rollos',
  'viaje', 'viajes', 'tramo', 'tramos', 'lata', 'latas', 'cubeta',
  'cubetas', 'litro', 'litros', 'lt', 'lts', 'millar', 'millares',
]);

const PALABRAS_ESTRIBO = new Set(['estribo', 'estribos', 'est', 'estr']);

const NUMERO = /^(\d+(?:[:.,]\d+)?)(mts|mt|m|metros|metro|cm)?$/i;
const SEPARACION_PEGADA = /^(?:@|c\/)(\d+(?:[:.,]\d+)?)$/i;
const VINETA = /^[-*•·]+\s*/;

function sinAcentos(s: string): string {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '');
}

function aNumero(s: string): number {
  return Number(s.replace(/[:,]/g, '.'));
}

function nombreSeccion(crudo: string): string {
  const limpio = crudo.replace(/:\s*$/, '').trim();
  const conocido = SECCIONES_CONOCIDAS[sinAcentos(limpio).toLowerCase()];
  if (conocido) return conocido;
  if (!limpio) return '';
  return limpio[0].toUpperCase() + limpio.slice(1);
}

interface Num {
  valor: number;
  decimal: boolean;
  sufijo: 'm' | 'cm' | null;
}

const pareceLargo = (n: Num) => n.decimal || n.sufijo != null;
const comoLargo = (n: Num) => (n.sufijo === 'cm' ? n.valor / 100 : n.valor);

/** Lee todas las líneas. `seccionInicial` es la sección antes del primer encabezado. */
export function leerNotaMaterial(texto: string, seccionInicial = ''): RenglonLeido[] {
  const salida: RenglonLeido[] = [];
  let seccion = seccionInicial;
  for (const bruta of texto.split(/\r?\n/)) {
    const linea = bruta.trim().replace(VINETA, '').trim();
    if (!linea) continue;
    if (!/\d/.test(linea) || /:\s*$/.test(linea)) {
      seccion = nombreSeccion(linea);
      continue;
    }
    salida.push(leerLinea(linea, bruta.trim(), seccion));
  }
  return salida;
}

function leerLinea(linea: string, original: string, seccion: string): RenglonLeido {
  const tokens = linea.split(/\s+/);
  const numeros: Num[] = [];
  const palabras: string[] = [];
  let separacion: number | null = null;

  for (let i = 0; i < tokens.length; i++) {
    const t = tokens[i];
    const tl = sinAcentos(t).toLowerCase();

    const pegada = SEPARACION_PEGADA.exec(t);
    if (pegada) {
      separacion = aNumero(pegada[1]);
      continue;
    }
    if (PALABRAS_ESTRIBO.has(tl) && i + 1 < tokens.length) {
      const sig = NUMERO.exec(tokens[i + 1]);
      if (sig) {
        separacion = aNumero(sig[1]);
        i++;
        continue;
      }
    }
    const m = NUMERO.exec(t);
    if (m) {
      const suf = m[2]?.toLowerCase();
      numeros.push({
        valor: aNumero(m[1]),
        decimal: /[:.,]/.test(m[1]),
        sufijo: suf == null ? null : suf === 'cm' ? 'cm' : 'm',
      });
      continue;
    }
    palabras.push(t);
  }

  const textoPalabras = palabras.join(' ');
  const base = { linea: original, seccion, separacionCm: separacion };

  if (numeros.length === 0) {
    return {
      ...base,
      tipo: 'LIBRE',
      cantidad: 0,
      largo: null,
      unidad: '',
      descripcion: linea,
      nota: '',
      duda: 'No encontré cantidad ni medida.',
    };
  }

  if (numeros.length === 1) {
    const n = numeros[0];
    if (pareceLargo(n)) {
      return {
        ...base,
        tipo: 'PIEZA',
        cantidad: 1,
        largo: comoLargo(n),
        unidad: '',
        descripcion: '',
        nota: textoPalabras,
        duda: 'No trae cantidad: se puso 1 pieza.',
      };
    }
    let unidad = '';
    let descripcion = textoPalabras;
    if (palabras.length > 0 && UNIDADES.has(sinAcentos(palabras[0]).toLowerCase())) {
      unidad = palabras[0].toLowerCase();
      const resto = palabras.slice(1);
      while (resto.length > 0 && resto[0].toLowerCase() === 'de') resto.shift();
      descripcion = resto.join(' ');
    }
    return {
      ...base,
      tipo: 'LIBRE',
      cantidad: n.valor,
      largo: null,
      unidad,
      descripcion,
      nota: '',
      duda: palabras.length === 0 ? 'Solo trae un número: ¿cantidad o medida?' : null,
    };
  }

  // Dos o más números: uno es la cantidad y otro el largo.
  const largos = numeros.filter(pareceLargo);
  const enteros = numeros.filter((n) => !pareceLargo(n));
  let cantidad: Num;
  let largo: Num;
  let duda: string | null = null;
  if (largos.length === 1 && enteros.length > 0) {
    largo = largos[0];
    cantidad = enteros[0];
  } else {
    cantidad = numeros[0];
    largo = numeros[1];
    duda = 'Revisa cuál es la cantidad y cuál el largo.';
  }
  const sobrantes = numeros.filter((n) => n !== cantidad && n !== largo).map((n) => numeroCorto(n.valor));
  if (sobrantes.length > 0) duda ??= 'Traía más números de los que se esperaban.';
  if (!Number.isInteger(cantidad.valor)) duda ??= 'La cantidad no es un número entero de piezas.';

  return {
    ...base,
    tipo: 'PIEZA',
    cantidad: cantidad.valor,
    largo: comoLargo(largo),
    unidad: '',
    descripcion: '',
    nota: [textoPalabras, ...sobrantes].filter(Boolean).join(' '),
    duda,
  };
}
