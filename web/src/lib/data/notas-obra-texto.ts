/**
 * De un mensaje suelto a la nota estructurada.
 *
 * Los tratos llegan por WhatsApp escritos de corrido, con la taquigrafía de
 * quien los manda:
 *
 *   «Terminación de módulo 2 y 3 — 120 000(60 y 60) retención del 4%(3k) final 117»
 *
 * Ahí dentro están las piezas que la nota necesita (0031): un CONCEPTO de
 * 120,000 con su desglose, una DEDUCCION de 3,000 que documenta un 4%, y un
 * total de 117,000. Este módulo las saca. Es el mismo trato que ya se le da al
 * texto pegado en cotizaciones (`lib/cotizacion/text-import-parser.ts`), con una
 * diferencia de fondo: aquel lee UNA PARTIDA POR LÍNEA, y aquí la nota entera
 * puede venir en un solo renglón de chat.
 *
 * REGLA CENTRAL, la misma de `notas-obra-calculo.ts`: la app SUGIERE, el dueño
 * DECIDE. Todo lo de aquí es una lectura probable del mensaje, no un dato. Por
 * eso nada se guarda sin que alguien vea antes la vista previa, y por eso el
 * resultado trae `advertencias`: donde el parser tuvo que adivinar, lo dice.
 *
 * Funciones puras, sin UI ni base de datos: se prueban solas
 * (`notas-obra-texto.test.ts`) y las usan igual la vista previa del navegador y
 * la server action que escribe.
 */

import { montoEfectivo, type TipoRenglon } from './notas-obra-calculo';
import { medianocheMx } from './tz';

// ── Lo que se entiende del mensaje ──────────────────────────────────────────

/** Un renglón leído del texto, en la forma que espera `RenglonInput`. */
export interface RenglonParseado {
  tipo: TipoRenglon;
  etiqueta: string;
  monto: number | null;
  monto_base: number | null;
  porcentaje: number | null;
  texto: string;
  fecha: number | null;
}

export interface NotaParseada {
  /** Solo si el mensaje empieza con una línea de encabezado sin importes. */
  destinatario: string;
  titulo: string;
  renglones: RenglonParseado[];
  /**
   * Lo que el mensaje declara como total y saldo, y SOLO cuando no coincide con
   * lo que dan los renglones: si la cuenta ya llega sola a ese número, fijarlo
   * a mano no agrega nada y congela la nota (ver `notas-obra-calculo.ts`).
   */
  total_override: number | null;
  saldo_override: number | null;
  /** Dónde hubo que adivinar. Se enseñan en la vista previa, nunca se guardan. */
  advertencias: string[];
}

/**
 * El papel que juega un pedazo del mensaje. Cuatro son renglones de la nota;
 * TOTAL y SALDO no lo son: acaban en los `override`, porque eso es lo que
 * significan («final 117» no es un trabajo más, es el número que manda).
 */
type Papel = TipoRenglon | 'TOTAL' | 'SALDO';

// ── Vocabulario ─────────────────────────────────────────────────────────────

/**
 * Las palabras que abren un pedazo nuevo del mensaje, y qué papel le dan.
 *
 * Se buscan sin acentos, sin distinguir mayúsculas y con frontera de palabra a
 * los dos lados: «retención» abre una deducción, pero «Terminación» no abre
 * nada.
 *
 * La lista es corta A PROPÓSITO. Cada palabra de más es una forma nueva de
 * partir en dos una frase que era una sola idea, y equivocarse partiendo sale
 * más caro que no partir: un renglón de más hay que borrarlo, uno mal
 * clasificado solo hay que cambiarle el tipo. Por eso no están aquí palabras
 * como «material», que lo mismo encabeza un descuento que un trabajo.
 */
const PALABRAS: ReadonlyArray<readonly [string, Papel]> = [
  // Se descuenta de lo acordado.
  ['retencion', 'DEDUCCION'],
  ['retenciones', 'DEDUCCION'],
  ['deduccion', 'DEDUCCION'],
  ['deducciones', 'DEDUCCION'],
  ['descuento', 'DEDUCCION'],
  ['descuentos', 'DEDUCCION'],
  ['descuenteme', 'DEDUCCION'],
  ['descuentame', 'DEDUCCION'],
  ['descontar', 'DEDUCCION'],
  ['menos', 'DEDUCCION'],
  ['multa', 'DEDUCCION'],
  ['prestamo', 'DEDUCCION'],
  ['preste', 'DEDUCCION'],
  ['herramienta', 'DEDUCCION'],

  // Ya se entregó, o se va a entregar.
  ['anticipo', 'PAGO'],
  ['anticipos', 'PAGO'],
  ['abono', 'PAGO'],
  ['abonos', 'PAGO'],
  ['adelanto', 'PAGO'],
  ['deposito', 'PAGO'],
  ['proyeccion', 'PAGO'],
  ['pago', 'PAGO'],
  ['pagos', 'PAGO'],
  ['pagado', 'PAGO'],
  ['pagados', 'PAGO'],
  ['entregado', 'PAGO'],
  ['a cuenta', 'PAGO'],
  // Como se dice de verdad en el mensaje. Van con el pronombre por delante para
  // no confundirlas con cualquier «di» o «dio» suelto.
  ['le di', 'PAGO'],
  ['me dio', 'PAGO'],
  ['le entregue', 'PAGO'],

  // El número que manda. «Subtotal» y «neto» también: son una cuenta que el
  // mensaje ya hizo, y tratarlos como un trabajo más los sumaría dos veces.
  ['total', 'TOTAL'],
  ['subtotal', 'TOTAL'],
  ['neto', 'TOTAL'],
  ['final', 'TOTAL'],
  ['queda en', 'TOTAL'],

  // Lo que falta por pagar.
  ['saldo', 'SALDO'],
  ['por pagar', 'SALDO'],
  ['pendiente', 'SALDO'],
  ['resta', 'SALDO'],
  ['restan', 'SALDO'],
  ['falta', 'SALDO'],
  ['faltan', 'SALDO'],
  ['queda', 'SALDO'],
  ['quedan', 'SALDO'],
  ['se debe', 'SALDO'],

  // Apuntes sin importe.
  ['liquidado', 'TEXTO'],
  ['liquidada', 'TEXTO'],
  ['nota', 'TEXTO'],
];

/** Nombre del renglón cuando el mensaje no deja ninguna etiqueta que usar. */
const ETIQUETA_POR_DEFECTO: Record<TipoRenglon, string> = {
  CONCEPTO: 'Concepto',
  DEDUCCION: 'Deducción',
  PAGO: 'Pago',
  TEXTO: 'Apunte',
};

const MESES: Readonly<Record<string, number>> = {
  ene: 0, enero: 0,
  feb: 1, febrero: 1,
  mar: 2, marzo: 2,
  abr: 3, abril: 3,
  may: 4, mayo: 4,
  jun: 5, junio: 5,
  jul: 6, julio: 6,
  ago: 7, agost: 7, agosto: 7,
  sep: 8, sept: 8, septiembre: 8,
  oct: 9, octubre: 9,
  nov: 10, noviembre: 10,
  dic: 11, diciembre: 11,
};

// ── Normalización ───────────────────────────────────────────────────────────

function sinAcentos(s: string): string {
  const from = 'áéíóúüñÁÉÍÓÚÜÑ';
  const to = 'aeiouunAEIOUUN';
  let r = s;
  for (let i = 0; i < from.length; i++) r = r.split(from[i]).join(to[i]);
  return r;
}

/**
 * La versión del texto para BUSCAR, no para mostrar. Las dos sustituciones son
 * carácter a carácter, así que los índices siguen valiendo para cortar el texto
 * ORIGINAL — que es el que acaba en pantalla, con sus acentos y mayúsculas.
 */
function paraBuscar(s: string): string {
  return sinAcentos(s).toLowerCase();
}

/**
 * Junta los separadores de miles: «120 000» y «123,000» pasan a ser un número
 * de una sola pieza. Se hace antes que nada porque de eso depende todo lo
 * demás: sin esto «120 000» son dos números, y la coma de «123,000» parece un
 * separador de ideas.
 *
 * El número entero se toma de una vez —de una a tres cifras y luego todos los
 * grupos de tres que vengan— para que «4 000 000» quede junto sin necesidad de
 * repasar el texto. Repasarlo sería peor que no hacerlo: en la segunda pasada,
 * dos importes pegados («120000 600») se leerían como uno solo.
 *
 * Solo cuenta como separador un espacio o una coma seguidos de EXACTAMENTE tres
 * dígitos, que es lo que distingue los miles de una enumeración: «módulo 2 y 3»
 * no se toca.
 */
function juntarMiles(s: string): string {
  return s.replace(/(?<!\d)(\d{1,3})((?:[ ,]\d{3})+)(?!\d)/g, (_, primero, grupos) =>
    primero + (grupos as string).replace(/[ ,]/g, ''),
  );
}

const formateador = new Intl.NumberFormat('es-MX', { maximumFractionDigits: 2 });
const miles = (n: number) => formateador.format(n);

/** Redondeo a centavos, igual que en `notas-obra-calculo.ts`. */
const centavos = (n: number) => Math.round(n * 100) / 100;

// ── Números ─────────────────────────────────────────────────────────────────

interface Numero {
  valor: number;
  inicio: number;
  fin: number;
  /**
   * Dónde empiezan los DÍGITOS. `inicio` puede caer antes, sobre el «$» o sobre
   * los espacios que lo separan de la palabra anterior, y para comparar contra
   * la posición del porcentaje hace falta el sitio exacto del número.
   */
  inicioDigitos: number;
  /**
   * El mensaje dijo la magnitud con todas sus letras: traía `$`, separador de
   * miles, sufijo «k»/«mil», o de plano es mil o más. Los demás son cifras
   * sueltas y chicas («117»), candidatas a ser taquigrafía de miles.
   */
  explicito: boolean;
}

// `$` opcional, dígitos con decimales, y un sufijo k/mil opcional. El sufijo
// tiene que terminar palabra para que «85 kg» no se lea como 85,000.
const RE_NUMERO = /(\$)?\s*(\d+(?:\.\d+)?)(?:\s*(k|mil)(?![a-z]))?/gi;

function numerosDe(s: string): Numero[] {
  const out: Numero[] = [];
  for (const m of s.matchAll(RE_NUMERO)) {
    const base = Number(m[2]);
    if (!Number.isFinite(base)) continue;
    const sufijo = (m[3] ?? '').toLowerCase();
    const valor = sufijo ? base * 1000 : base;
    out.push({
      valor,
      inicio: m.index,
      fin: m.index + m[0].length,
      inicioDigitos: m.index + m[0].indexOf(m[2]),
      explicito: Boolean(m[1]) || Boolean(sufijo) || valor >= 1000,
    });
  }
  return out;
}

const sumaDe = (ns: Numero[]) => ns.reduce((s, n) => s + n.valor, 0);

/** ¿Los números del paréntesis suman el importe de afuera, tal cual o en miles? */
function cuadra(ns: Numero[], monto: number): boolean {
  const suma = sumaDe(ns);
  return Math.abs(suma - monto) < 0.01 || Math.abs(suma * 1000 - monto) < 0.01;
}

// ── Fechas sueltas ──────────────────────────────────────────────────────────

// 11/AGOST/26, 11-08-2026, 11/8/26.
const RE_FECHA = /\b(\d{1,2})[/-]([a-z]{3,10}|\d{1,2})[/-](\d{2,4})\b/i;

/**
 * Saca la fecha del pedazo y la devuelve aparte. Se QUITA del texto en vez de
 * dejarla dentro de la etiqueta porque la nota ya tiene su columna de fecha:
 * dejarla en las dos partes la imprime dos veces, y guardarla solo como texto
 * la vuelve inservible para ordenar.
 */
function extraerFecha(s: string): { texto: string; fecha: number | null } {
  const m = RE_FECHA.exec(sinAcentos(s));
  if (!m) return { texto: s, fecha: null };

  const dia = Number(m[1]);
  const mesBruto = m[2].toLowerCase();
  const mes = /^\d+$/.test(mesBruto) ? Number(mesBruto) - 1 : MESES[mesBruto];
  if (mes === undefined || mes < 0 || mes > 11 || dia < 1 || dia > 31) {
    return { texto: s, fecha: null };
  }

  const anioBruto = Number(m[3]);
  const anio = anioBruto < 100 ? 2000 + anioBruto : anioBruto;

  return {
    texto: `${s.slice(0, m.index)} ${s.slice(m.index + m[0].length)}`,
    fecha: medianocheMx(anio, mes, dia),
  };
}

// ── Partir el mensaje ───────────────────────────────────────────────────────

interface Pedazo {
  texto: string;
  papel: Papel;
}

const RE_PALABRAS = new RegExp(
  `(?<![a-z0-9])(${[...PALABRAS]
    .sort((a, b) => b[0].length - a[0].length)
    .map(([p]) => p.replace(/ /g, '\\s+'))
    .join('|')})(?![a-z0-9])`,
  'g',
);

const PAPEL_DE = new Map<string, Papel>(PALABRAS);

/**
 * Una línea del mensaje, hecha pedazos y ya lista para leerse uno por uno.
 *
 * Las uniones se hacen DENTRO de cada trozo separado por comas, no sobre la
 * línea entera: la coma ya dijo dónde termina una idea, y unir por encima de
 * ella volvería a juntar lo que quien escribió separó a propósito.
 */
function partirLinea(linea: string): Pedazo[] {
  return partirEnComas(juntarMiles(linea)).flatMap((trozo) =>
    unirPedazosSinCifra(partirEnPalabras(trozo)),
  );
}

/**
 * Parte por comas y punto y coma, pero solo donde de verdad empieza otra idea:
 * lo que va a la derecha tiene que traer una cifra o una palabra del
 * vocabulario. Si no, la coma es parte de la frase y los dos lados se vuelven a
 * unir — «LIQUIDADO: bases, pretil y recorte de puertas» es UN apunte, no tres.
 *
 * Para entonces los miles ya están juntos, así que ninguna coma que sobrevive
 * aquí es la de «123,000».
 */
function partirEnComas(linea: string): string[] {
  const pedazos: string[] = [];
  for (const trozo of linea.split(/[,;]/)) {
    RE_PALABRAS.lastIndex = 0;
    const abreIdea = /\d/.test(trozo) || RE_PALABRAS.test(paraBuscar(trozo));
    if (pedazos.length > 0 && !abreIdea) pedazos[pedazos.length - 1] += `, ${trozo}`;
    else pedazos.push(trozo);
  }
  return pedazos.filter((p) => p.trim().length > 0);
}

/**
 * Corta justo DONDE empieza una palabra del vocabulario. Cada corte se lleva su
 * palabra consigo, para que «retención del 4%» conserve su nombre.
 *
 * Lo que va antes del primer corte es un CONCEPTO: en un mensaje lo primero es
 * siempre el trabajo, y los ajustes vienen después.
 */
function partirEnPalabras(trozo: string): Pedazo[] {
  const enParentesis = rangosDeParentesis(trozo);
  const cortes: { indice: number; papel: Papel }[] = [];
  for (const m of paraBuscar(trozo).matchAll(RE_PALABRAS)) {
    // Lo que va entre paréntesis es una aclaración del renglón, no un renglón
    // nuevo: en «62,000 − 4%(RETENCIÓN) = 60 000» la palabra solo dice de qué
    // es el 4%. Cortar ahí partía en dos un pago y lo contaba dos veces.
    if (enParentesis(m.index)) continue;
    const papel = PAPEL_DE.get(m[1].replace(/\s+/g, ' '));
    if (papel) cortes.push({ indice: m.index, papel });
  }

  if (cortes.length === 0) return [{ texto: trozo, papel: 'CONCEPTO' }];

  const pedazos: Pedazo[] = [];
  if (cortes[0].indice > 0) {
    pedazos.push({ texto: trozo.slice(0, cortes[0].indice), papel: 'CONCEPTO' });
  }
  for (let i = 0; i < cortes.length; i++) {
    const hasta = i + 1 < cortes.length ? cortes[i + 1].indice : trozo.length;
    pedazos.push({ texto: trozo.slice(cortes[i].indice, hasta), papel: cortes[i].papel });
  }
  return pedazos.filter((p) => p.texto.trim().length > 0);
}

/**
 * Un pedazo sin ninguna cifra casi nunca es un renglón: es la mitad de uno.
 * Cortar por palabras parte de más, y estas dos uniones lo enmiendan.
 *
 *   «descuento por herramienta 1 200» → cortó en las dos palabras y dejó
 *     «descuento por» sin importe. Se junta con lo que sigue: una DEDUCCION.
 *
 *   «le di 20k de anticipo» → la palabra va DESPUÉS del importe, y el corte
 *     dejó «anticipo» solo al final. Se junta con lo de atrás y le presta su
 *     papel: un PAGO de 20,000.
 *
 * La unión hacia atrás la hacen siempre PAGO y DEDUCCION, que son las palabras
 * que NOMBRAN un renglón. TOTAL y SALDO solo cuando lo de atrás es un número
 * pelón: «17,000 en total» es el total, pero «Losa 100 000 total» es la losa.
 */
function unirPedazosSinCifra(pedazos: Pedazo[]): Pedazo[] {
  const traeCifra = (p: Pedazo) => /\d/.test(p.texto);

  // De derecha a izquierda, para que una cadena de pedazos sin cifra acabe toda
  // en el mismo renglón.
  const haciaAdelante = [...pedazos];
  for (let i = haciaAdelante.length - 2; i >= 0; i--) {
    if (traeCifra(haciaAdelante[i])) continue;
    const siguiente = haciaAdelante[i + 1];
    haciaAdelante.splice(i, 2, {
      texto: `${haciaAdelante[i].texto} ${siguiente.texto}`,
      // El papel lo pone el pedazo que dice algo: si el de la derecha es un
      // CONCEPTO (el papel por defecto), manda el de la izquierda.
      papel: siguiente.papel !== 'CONCEPTO' ? siguiente.papel : haciaAdelante[i].papel,
    });
  }

  const ultimo = haciaAdelante.at(-1);
  const previo = haciaAdelante.at(-2);
  if (
    ultimo &&
    previo &&
    !traeCifra(ultimo) &&
    (ultimo.papel === 'PAGO' || ultimo.papel === 'DEDUCCION' || !tieneNombre(previo.texto))
  ) {
    haciaAdelante.splice(haciaAdelante.length - 2, 2, {
      texto: `${previo.texto} ${ultimo.texto}`,
      papel: ultimo.papel,
    });
  }

  return haciaAdelante;
}

/**
 * ¿Queda algo que pueda ser el nombre de un renglón, quitando cifras, signos y
 * palabras de enlace? «Losa 100 000» sí («Losa»); «17,000 en» no.
 */
function tieneNombre(texto: string): boolean {
  return texto
    .replace(/[\d$%.,:;=+*·•—–()-]/g, ' ')
    .split(/\s+/)
    .some((p) => p.length > 0 && !RE_ENLACE.test(p));
}

// ── Limpiar una etiqueta ────────────────────────────────────────────────────

/** Los tramos `(…)` del texto, para no cortar dentro de una aclaración. */
function rangosDeParentesis(s: string): (i: number) => boolean {
  const rangos: [number, number][] = [];
  for (const m of s.matchAll(/\([^)]*\)/g)) rangos.push([m.index, m.index + m[0].length]);
  return (i) => rangos.some(([a, b]) => i >= a && i < b);
}

/** Palabras de enlace que quedan colgando cuando se saca el número del medio. */
const RE_ENLACE = /^(?:de|del|la|el|los|las|en|por|a|al|y|con|un|una|es|son)$/i;

function limpiarEtiqueta(s: string): string {
  const limpio = s
    .replace(/[=+*·•—–]/g, ' ')
    // Los puntos de relleno de una nota de papel («PRETIL......25 000») y el
    // guion que solo separa el concepto de su cuenta.
    .replace(/\.{2,}/g, ' ')
    .replace(/\s-\s/g, ' ')
    .replace(/\s{2,}/g, ' ')
    .trim()
    .replace(/^[\s\-.,:;$]+|[\s\-.,:;$]+$/g, '');

  // Se caen las palabras de enlace de las puntas («retención del» →
  // «retención»), y solo esas: cortar más se comería conceptos que de verdad
  // terminan en palabra corta.
  const partes = limpio.split(/\s+/).filter(Boolean);
  while (partes.length > 0 && RE_ENLACE.test(partes[partes.length - 1])) partes.pop();
  while (partes.length > 0 && RE_ENLACE.test(partes[0])) partes.shift();

  const r = partes.join(' ');
  return r.length > 0 ? r[0].toUpperCase() + r.slice(1) : r;
}

// ── Leer un pedazo ──────────────────────────────────────────────────────────

interface PedazoLeido {
  papel: Papel;
  etiqueta: string;
  monto: number | null;
  /** El importe vino con su magnitud escrita; ver `Numero.explicito`. */
  montoExplicito: boolean;
  monto_base: number | null;
  porcentaje: number | null;
  texto: string;
  fecha: number | null;
  /**
   * El total que declara este mismo pedazo además de su renglón. Pasa en la
   * forma «MENOS RETENCIÓN 4% = 71,520»: el número no es el bruto de la
   * retención, es lo que queda DESPUÉS de aplicarla.
   */
  totalAparte: number | null;
}

/** Reemplaza un tramo por espacios, para que los índices del resto no se muevan. */
function blanquear(s: string, inicio: number, largo: number): string {
  return s.slice(0, inicio) + ' '.repeat(largo) + s.slice(inicio + largo);
}

/**
 * Saca de un pedazo su importe, su porcentaje y su nombre.
 *
 * El orden importa: primero se apartan fecha, porcentaje y paréntesis, y solo
 * después se buscan números en lo que queda. Si no, el «4» de «4%» y el «26» de
 * «11/AGOST/26» competirían por ser el importe del renglón.
 */
function leerPedazo(pedazo: Pedazo): PedazoLeido {
  const conFecha = extraerFecha(juntarMiles(pedazo.texto));
  let resto = conFecha.texto;

  // Lo que se va sacando se sustituye por espacios en vez de borrarse: así los
  // índices siguen valiendo y se puede leer QUÉ hay entre el porcentaje y el
  // número, que es lo que distingue «4% de 120 000» de «30% 220,500».
  let porcentaje: number | null = null;
  let pctInicio = -1;
  let pctFin = -1;
  const mPct = /(\d+(?:\.\d+)?)\s*%/.exec(resto);
  if (mPct) {
    porcentaje = Number(mPct[1]);
    pctInicio = mPct.index;
    pctFin = mPct.index + mPct[0].length;
    resto = blanquear(resto, pctInicio, mPct[0].length);
  }

  // Los paréntesis se apartan enteros. Adentro puede venir el importe de verdad
  // («retención del 4%(3k)»), el desglose de lo de afuera («120 000(60 y 60)»)
  // o una aclaración que no es número («RECORTE DE PUERTAS (26)»).
  const parentesis: string[] = [];
  for (const m of [...resto.matchAll(/\(([^)]*)\)/g)].reverse()) {
    parentesis.unshift(m[1].trim());
    resto = blanquear(resto, m.index, m[0].length);
  }

  const fuera = numerosDe(resto);
  const explicitos = fuera.filter((n) => n.explicito);
  // Las cifras sueltas solo se miran cuando no hay ninguna explícita: así, en
  // «Terminación de módulo 2 y 3 — 120 000», el 2 y el 3 se quedan donde están,
  // que es en el nombre del trabajo.
  const candidatos = explicitos.length > 0 ? explicitos : fuera;
  const dentro = parentesis.flatMap((p) => numerosDe(juntarMiles(p)));

  let monto: number | null = null;
  let montoExplicito = false;
  let base: number | null = null;
  let totalAparte: number | null = null;
  const usados: Numero[] = [];
  // Cierto cuando el importe salió del paréntesis: entonces ese paréntesis ya
  // no es una aclaración que deba volver al nombre.
  let parentesisUsado = false;

  if (candidatos.length >= 2) {
    // El último es lo que entra en la cuenta: «62,000 − 4% = 60 000» cobra
    // 60,000, «9 casas a 4,500 = 40,500» cobra 40,500.
    const ultimo = candidatos[candidatos.length - 1];
    monto = ultimo.valor;
    montoExplicito = ultimo.explicito;
    usados.push(ultimo);

    // El primero es el BRUTO solo si hay un porcentaje de por medio. Sin
    // porcentaje es otra cosa —un precio unitario, una medida— y guardarlo como
    // bruto hacía que la nota imprimiera «4,500 = 40,500», que no significa
    // nada. Se queda donde estaba: dentro del nombre del trabajo.
    if (porcentaje !== null) {
      base = candidatos[0].valor;
      usados.push(candidatos[0]);
    }
  } else if (candidatos.length === 1) {
    const unico = candidatos[0];
    if (porcentaje !== null && dentro.length === 1) {
      // «retención del 4% de 120 000 (3k)»: afuera la base, en el paréntesis lo
      // que se descontó de verdad.
      base = unico.valor;
      monto = dentro[0].valor;
      montoExplicito = dentro[0].explicito;
      parentesisUsado = true;
    } else if (porcentaje !== null) {
      switch (papelDelNumero(resto, pctInicio, pctFin, unico)) {
        case 'resultado':
          // «MENOS RETENCIÓN 4% = 71,520»: el número es lo que QUEDA. No es el
          // bruto de la retención ni su importe; es el total de la nota. La
          // base la pone después lo acordado hasta ahí.
          totalAparte = unico.valor;
          break;
        case 'importe':
          // «ANTICIPO 30% 220,500»: el porcentaje solo describe el pago; lo que
          // se entregó son los 220,500. Tomarlo como base cobraría el 30% de
          // 220,500.
          monto = unico.valor;
          montoExplicito = unico.explicito;
          break;
        default:
          // «retención del 4% de 120 000»: el importe lo pone la cuenta.
          base = unico.valor;
      }
    } else {
      monto = unico.valor;
      montoExplicito = unico.explicito;
    }
    usados.push(unico);
  } else if (dentro.length === 1) {
    // «retención del 4%(3k)», «anticipo (60 000)».
    monto = dentro[0].valor;
    montoExplicito = dentro[0].explicito;
    parentesisUsado = true;
  }

  // Qué hacer con cada paréntesis: el que ya se usó como importe desaparece; el
  // que desglosa el importe pasa a ser la aclaración del renglón; el resto
  // vuelve al nombre tal como venía.
  let texto = '';
  const sobrantes: string[] = [];
  for (const p of parentesis) {
    const nums = numerosDe(juntarMiles(p));
    if (parentesisUsado && nums.length === 1) {
      parentesisUsado = false;
      continue;
    }
    if (monto !== null && nums.length >= 2 && cuadra(nums, monto)) {
      const factor = Math.abs(sumaDe(nums) - monto) < 0.01 ? 1 : 1000;
      texto = nums.map((n) => miles(n.valor * factor)).join(' + ');
    } else {
      sobrantes.push(`(${p})`);
    }
  }

  // El nombre es lo que sobra después de quitar los números que SÍ se usaron.
  let etiquetaBruta = resto;
  for (const n of [...usados].sort((a, b) => b.inicio - a.inicio)) {
    etiquetaBruta = `${etiquetaBruta.slice(0, n.inicio)} ${etiquetaBruta.slice(n.fin)}`;
  }

  // El nombre se limpia ANTES de pegarle los paréntesis que sobraron: si no,
  // los puntos de relleno de «RECORTE DE PUERTAS(26)..8 400» dejarían de estar
  // al final y se quedarían en medio del nombre.
  const etiqueta = [limpiarEtiqueta(etiquetaBruta), ...sobrantes]
    .filter((p) => p.length > 0)
    .join(' ');

  return {
    papel: pedazo.papel,
    etiqueta,
    monto,
    montoExplicito,
    monto_base: base,
    porcentaje,
    texto,
    fecha: conFecha.fecha,
    totalAparte,
  };
}

/**
 * Cuando el pedazo trae un porcentaje y UN solo número, ¿qué es ese número?
 *
 *   'base'      → el bruto sobre el que se aplica: «4% DE 120 000».
 *   'importe'   → el número que el porcentaje solo describe: «ANTICIPO 30% 220,500».
 *   'resultado' → lo que queda después de aplicarlo: «RETENCIÓN 4% = 71,520».
 *
 * La pista es lo que hay ENTRE los dos: un «de» o un «sobre» convierten al
 * número en base, un «=» en resultado. Sin ninguno de los dos manda el orden,
 * porque en español el porcentaje va antes de lo que califica y después de lo
 * que mide: «30% 220,500» describe; «120 000 al 4%» mide.
 */
function papelDelNumero(
  texto: string,
  pctInicio: number,
  pctFin: number,
  numero: Numero,
): 'base' | 'importe' | 'resultado' {
  const pctVaPrimero = pctInicio < numero.inicioDigitos;
  const entre = pctVaPrimero
    ? texto.slice(pctFin, numero.inicioDigitos)
    : texto.slice(numero.fin, pctInicio);

  if (entre.includes('=')) return 'resultado';
  if (/(?<![a-z])(de|del|sobre)(?![a-z])/.test(paraBuscar(entre))) return 'base';
  return pctVaPrimero ? 'importe' : 'base';
}

// ── Encabezado ──────────────────────────────────────────────────────────────

/**
 * ¿Esta primera línea es el encabezado de la nota («ORLANDO RAMOZ · CASAS
 * BIENESTAR – MZ 2 LT 1») y no un trabajo?
 *
 * Lo es cuando no nombra ningún papel y no trae ninguna cifra con magnitud. El
 * «2» y el «1» de un lote no cuentan: por eso se pide una cifra EXPLÍCITA y no
 * cualquier número, o toda dirección con número acabaría de concepto.
 */
function esEncabezado(linea: string): boolean {
  RE_PALABRAS.lastIndex = 0;
  if (RE_PALABRAS.test(paraBuscar(linea))) return false;
  return !numerosDe(juntarMiles(linea)).some((n) => n.explicito);
}

/**
 * Saca de `lineas` —modificándola— las que forman el encabezado, y devuelve a
 * quién va dirigida la nota y de qué es.
 *
 * Son todas las de arriba que no traigan importes, no solo la primera: un
 * mensaje empieza igual de seguido con «Cuadrilla de Beto / semana del 1 al 7».
 * La última línea nunca se toma como encabezado, porque un mensaje de una sola
 * línea es el trato, no su título.
 */
function arrancarEncabezado(lineas: string[]): { destinatario: string; titulo: string } {
  const cabeza: string[] = [];
  while (lineas.length > 1 && esEncabezado(lineas[0])) cabeza.push(lineas.shift()!);
  if (cabeza.length === 0) return { destinatario: '', titulo: '' };

  const m = /\s[·|]\s|\s[—–-]\s/.exec(cabeza[0]);
  const destinatario = m ? cabeza[0].slice(0, m.index).trim() : cabeza[0].trim();
  const resto = m ? [cabeza[0].slice(m.index + m[0].length).trim()] : [];

  return { destinatario, titulo: [...resto, ...cabeza.slice(1)].join(' · ').trim() };
}

// ── El parser ───────────────────────────────────────────────────────────────

/**
 * Lee el mensaje entero. Nunca lanza y nunca devuelve `null`: un texto que no
 * se entiende devuelve una nota vacía con su advertencia, que es justo lo que
 * la vista previa tiene que enseñar.
 */
export function parsearNotaTexto(entrada: string): NotaParseada {
  const advertencias: string[] = [];
  const lineas = entrada
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l.length > 0);

  const { destinatario, titulo } = arrancarEncabezado(lineas);

  const leidos = lineas.flatMap((l) => partirLinea(l).map(leerPedazo));

  aplicarTaquigrafiaDeMiles(leidos, advertencias);

  // ── Renglones ─────────────────────────────────────────────────────────────
  const renglones: RenglonParseado[] = [];
  let totalDeclarado: number | null = null;
  let saldoDeclarado: number | null = null;
  let subtotal = 0;

  for (const p of leidos) {
    if ((p.papel === 'TOTAL' || p.papel === 'SALDO') && p.monto !== null) {
      if (p.papel === 'TOTAL') totalDeclarado = p.monto;
      else saldoDeclarado = p.monto;
      continue;
    }

    // Sin importe y sin porcentaje no hay nada que sumar: es un apunte. Así una
    // frase suelta del mensaje se conserva en la nota en vez de perderse —
    // incluso si traía una palabra del vocabulario, como «quedó PENDIENTE el
    // azulejo del baño», que antes desaparecía por completo.
    const papelSumable =
      p.papel === 'CONCEPTO' || p.papel === 'DEDUCCION' || p.papel === 'PAGO' ? p.papel : null;
    const tipo: TipoRenglon =
      papelSumable !== null && (p.monto !== null || p.porcentaje !== null)
        ? papelSumable
        : 'TEXTO';

    if (tipo === 'TEXTO') {
      const { etiqueta, texto } = partirApunte(p);
      // Una palabra sola («Total», «Anticipo») que se quedó sin su número no es
      // un apunte, es basura del corte: no dice nada que valga un renglón.
      if (!texto && etiqueta.split(/\s+/).filter(Boolean).length < 2) continue;
      renglones.push({
        tipo: 'TEXTO',
        etiqueta: etiqueta || ETIQUETA_POR_DEFECTO.TEXTO,
        monto: null,
        monto_base: null,
        porcentaje: null,
        texto,
        fecha: p.fecha,
      });
      continue;
    }

    // Una retención en porcentaje sin bruto se mide contra lo acordado HASTA
    // AQUÍ, que es lo que quiso decir quien escribió «retención del 4%» después
    // de los conceptos. Documenta la cuenta; el importe, si vino en el mensaje,
    // sigue mandando (`montoEfectivo`).
    const base =
      tipo === 'DEDUCCION' && p.porcentaje !== null && p.monto_base === null && subtotal > 0
        ? subtotal
        : p.monto_base;

    const renglon: RenglonParseado = {
      tipo,
      etiqueta: p.etiqueta || ETIQUETA_POR_DEFECTO[tipo],
      monto: p.monto,
      monto_base: base,
      porcentaje: p.porcentaje,
      texto: p.texto,
      fecha: p.fecha,
    };
    renglones.push(renglon);

    if (tipo === 'CONCEPTO') subtotal = centavos(subtotal + montoEfectivo(renglon));

    // Un total declarado ANTES de otro trabajo o de otro descuento era un
    // subtotal («TOTAL 74,500 / MENOS RETENCIÓN 4%»): la cuenta sigue, así que
    // ese número ya no es el final y se olvida. Los pagos no cuentan, que no
    // cambian el total — solo el saldo.
    if (tipo === 'CONCEPTO' || tipo === 'DEDUCCION') totalDeclarado = null;

    // «MENOS RETENCIÓN 4% = 71,520»: el mismo pedazo trae el descuento y dice
    // en cuánto queda la nota.
    if (p.totalAparte !== null) totalDeclarado = p.totalAparte;
  }

  if (renglones.length === 0 && totalDeclarado === null && saldoDeclarado === null) {
    advertencias.push('No se reconoció ningún trabajo ni importe en el mensaje.');
  }

  return {
    destinatario,
    titulo,
    renglones,
    ...resolverOverrides(renglones, totalDeclarado, saldoDeclarado, advertencias),
    advertencias,
  };
}

/**
 * «final 117» en una nota que habla de 120,000 son 117,000.
 *
 * Se resuelve sobre el mensaje YA LEÍDO y no pedazo por pedazo porque la pista
 * está en el conjunto: la magnitud de las cifras que sí vinieron completas. Un
 * número suelto solo se multiplica si el resultado cabe en esa nota; de otro
 * modo un concepto que de verdad es chico («limpieza 500») se volvería medio
 * millón. Y se avisa siempre: es la adivinanza más grande que hace el parser.
 *
 * Solo se aplica al total, al saldo y a los pagos. Son los tres sitios donde
 * una cifra suelta casi siempre es dinero abreviado («final 117», «falta 65»,
 * «le di 20»); en el nombre de un trabajo lo más común es que sea otra cosa —
 * un conteo, una semana, un número de casa— y multiplicarla por mil inventaba
 * renglones de miles de pesos a partir de «semana del 1 al 7».
 */
function aplicarTaquigrafiaDeMiles(leidos: PedazoLeido[], advertencias: string[]): void {
  const mayor = leidos.reduce(
    (max, p) => (p.montoExplicito && p.monto !== null ? Math.max(max, p.monto) : max),
    0,
  );
  if (mayor <= 0) return;

  const abreviable = (p: PedazoLeido) =>
    p.papel === 'TOTAL' || p.papel === 'SALDO' || p.papel === 'PAGO';

  for (const p of leidos) {
    if (p.monto === null || p.montoExplicito || !abreviable(p)) continue;
    const escalado = p.monto * 1000;
    if (escalado > mayor * 2 || escalado < mayor / 100) continue;
    advertencias.push(`Se leyó «${miles(p.monto)}» como ${miles(escalado)}.`);
    p.monto = escalado;
  }
}

/**
 * Qué hacer con el total y el saldo que declara el mensaje.
 *
 * Si la cuenta de los renglones ya llega a ese número, no se fija nada: un
 * override que repite el cálculo no aporta y congela la nota, que después no
 * se movería al corregir un renglón. Solo cuando el mensaje dice otra cosa se
 * fija el valor —el trato manda sobre la aritmética (0031)— y se avisa.
 */
function resolverOverrides(
  renglones: RenglonParseado[],
  totalDeclarado: number | null,
  saldoDeclarado: number | null,
  advertencias: string[],
): { total_override: number | null; saldo_override: number | null } {
  let subtotal = 0;
  let deducciones = 0;
  let pagado = 0;
  for (const r of renglones) {
    const v = montoEfectivo(r);
    if (r.tipo === 'CONCEPTO') subtotal += v;
    else if (r.tipo === 'DEDUCCION') deducciones += v;
    else if (r.tipo === 'PAGO') pagado += v;
  }

  const totalCalculado = centavos(centavos(subtotal) - centavos(deducciones));
  const total = totalDeclarado ?? totalCalculado;
  const saldoCalculado = centavos(total - centavos(pagado));

  const fijaTotal = totalDeclarado !== null && Math.abs(totalDeclarado - totalCalculado) >= 0.01;
  const fijaSaldo = saldoDeclarado !== null && Math.abs(saldoDeclarado - saldoCalculado) >= 0.01;

  if (fijaTotal) {
    advertencias.push(
      `El mensaje dice un total de ${miles(totalDeclarado)} y los renglones suman ` +
        `${miles(totalCalculado)}: se fija el total en ${miles(totalDeclarado)}.`,
    );
  }
  if (fijaSaldo) {
    advertencias.push(
      `El mensaje dice un saldo de ${miles(saldoDeclarado)} y la cuenta da ` +
        `${miles(saldoCalculado)}: se fija el saldo en ${miles(saldoDeclarado)}.`,
    );
  }

  return {
    total_override: fijaTotal ? totalDeclarado : null,
    saldo_override: fijaSaldo ? saldoDeclarado : null,
  };
}

/** «LIQUIDADO: bases, pretil» → etiqueta «LIQUIDADO», texto «bases, pretil». */
function partirApunte(p: PedazoLeido): { etiqueta: string; texto: string } {
  const crudo = [p.etiqueta, p.texto].filter(Boolean).join(' ');
  const i = crudo.indexOf(':');
  if (i < 0) return { etiqueta: crudo, texto: '' };
  return { etiqueta: crudo.slice(0, i).trim(), texto: crudo.slice(i + 1).trim() };
}
