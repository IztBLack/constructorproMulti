/**
 * DATOS DEMO — seis meses de una constructora mediana (2026-03-27 → 2026-09-27).
 *
 * `generarSqlDemo({ userId, empresaId })` devuelve UN script SQL (una sola
 * transacción) que llena una empresa YA EXISTENTE con la historia ficticia de
 * "Edificaciones Valle del Norte": cuatro obras con historias distintas, una
 * cotización en borrador, raya, caja, compras, estimaciones, extras, notas,
 * subcontratos, cumplimiento, bitácora, programa, seguridad, herramienta,
 * garantías y datos fiscales. Todo inventado; ver `README.md` de esta carpeta.
 *
 * Reglas de diseño (el porqué de cada una está en el README):
 *
 *  · DETERMINISTA: mismos parámetros → mismo SQL, byte por byte. Los ids son
 *    UUID derivados de (empresa, etiqueta) con SHA-1 y el azar sale de un PRNG
 *    con semilla. Así la prueba y el archivo que se carga en producción son
 *    exactamente lo mismo.
 *  · NO SE SIEMBRA DOS VECES: el script entero es un bloque `do` que primero
 *    busca la obra marca (id determinista) y, si ya existe, termina sin tocar
 *    nada. Borrar y volver a sembrar no es opción: los triggers de evidencia
 *    inmutable (0036–0045) lo impiden, a propósito, y no se desactivan.
 *  · SE ACTÚA COMO EL DUEÑO: `set local role authenticated` + los claims del
 *    JWT, igual que PostgREST. Así pasan por la RLS y por las RPC reales
 *    (`enviar_orden_cambio`, `enviar_estimacion`, `registrar_respuesta_estimacion`,
 *    `marcar_estimacion_cobrada`, `emitir_orden_compra`, `pagar_orden_compra`,
 *    `cancelar_orden_compra`). Lo que en la vida real haría OTRA persona sin
 *    cuenta en la demo (el cliente que aprueba un extra, el cliente que
 *    confirma sus datos fiscales, el de compras que pide un visto bueno) va
 *    "como sistema" (`reset role`, sin JWT), lo mínimo y marcado en el SQL.
 *  · FECHAS: `fecha`, `created_at` y `updated_at` se reparten en los seis
 *    meses. Lo que la base sella con `now()` (bitácora `registrada_en`, envío y
 *    respuesta de extras y estimaciones, emisión de órdenes, sellos de F7) queda
 *    con la fecha en que se CARGA el script: se respeta y se documenta.
 *
 * Sin dependencias fuera de `node:crypto`: el script de línea de comandos lo
 * importa con el soporte de TypeScript de Node (sin tsx ni bundler).
 */

import { createHash } from 'node:crypto';

// ═════════════════════════════════════════════════════════════════════════════
// Opciones y resultado
// ═════════════════════════════════════════════════════════════════════════════

export interface OpcionesDemo {
  /** Usuario de Supabase Auth que es ADMIN de la empresa (el dueño). */
  userId: string;
  /** Empresa ya creada (con `empresa_config`). */
  empresaId: string;
  /** Último día de la historia, 'YYYY-MM-DD'. El guion está escrito para 2026-09-27. */
  hoy?: string;
  /** Semilla del azar (faltas, cantidades, horas). Mismo valor → mismo SQL. */
  semilla?: string | number;
  /** Envolver en `begin; … commit;` (por defecto sí). */
  transaccion?: boolean;
}

export interface ResumenObraDemo {
  clave: string;
  id: string;
  nombre: string;
  /** Presupuesto + extras aprobados, sin IVA. */
  contratado: number;
  /** % físico por partida, como `lib/estimaciones/avance.ts` (un decimal). */
  avanceFisico: number;
  /** Margen proyectado que el guion busca (%). */
  margenBuscado: number;
  /** Costo real que el guion armó (salidas + raya sin caja). */
  costoReal: number;
  rayaTotal: number;
  rayaEnCaja: number;
}

export interface DemoGenerado {
  sql: string;
  /** Lo que el script va a crear, para que la prueba compare contra la base. */
  resumen: {
    marcaObraId: string;
    obras: ResumenObraDemo[];
    conteos: Record<string, number>;
    nombreEmpresa: string;
  };
}

/** El guion empieza aquí (seis meses antes de `HOY_GUION`). */
export const INICIO_GUION = '2026-03-27';
export const HOY_GUION = '2026-09-27';
export const NOMBRE_EMPRESA_DEMO = 'Edificaciones Valle del Norte';

// ═════════════════════════════════════════════════════════════════════════════
// Utilidades: ids, azar, fechas, literales SQL
// ═════════════════════════════════════════════════════════════════════════════

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const FECHA_RE = /^\d{4}-\d{2}-\d{2}$/;

/** UUID (formato v5) derivado de la empresa y una etiqueta: estable entre corridas. */
function uuidDe(espacio: string, etiqueta: string): string {
  const h = createHash('sha1').update(`constructorpro-demo:${espacio}:${etiqueta}`).digest();
  h[6] = (h[6] & 0x0f) | 0x50;
  h[8] = (h[8] & 0x3f) | 0x80;
  const x = h.subarray(0, 16).toString('hex');
  return `${x.slice(0, 8)}-${x.slice(8, 12)}-${x.slice(12, 16)}-${x.slice(16, 20)}-${x.slice(20, 32)}`;
}

/** PRNG mulberry32: rápido, determinista, suficiente para una demo. */
function mulberry32(semilla: number): () => number {
  let a = semilla >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function hash32(s: string): number {
  return createHash('sha1').update(s).digest().readUInt32BE(0);
}

const DIA_MS = 86_400_000;

/** Medianoche de México (UTC−6 todo el año desde 2022) del día 'YYYY-MM-DD'. */
function ms(fecha: string, hh = 0, mm = 0): number {
  const [y, m, d] = fecha.split('-').map(Number);
  return Date.UTC(y, m - 1, d, 6 + hh, mm);
}

function sumarDias(fecha: string, n: number): string {
  const [y, m, d] = fecha.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10);
}

/** 0 = domingo … 6 = sábado. */
function diaSemana(fecha: string): number {
  const [y, m, d] = fecha.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay();
}

function diasEntre(a: string, b: string): number {
  return Math.round((ms(b) - ms(a)) / DIA_MS);
}

function rangoDias(a: string, b: string): string[] {
  const out: string[] = [];
  for (let f = a; f <= b; f = sumarDias(f, 1)) out.push(f);
  return out;
}

/** Lunes de la semana (lunes a domingo) que contiene `fecha`. */
function lunesDe(fecha: string): string {
  const dw = diaSemana(fecha);
  return sumarDias(fecha, dw === 0 ? -6 : 1 - dw);
}

const FMT_FECHA = new Intl.DateTimeFormat('es-MX', {
  timeZone: 'America/Mexico_City',
  year: 'numeric',
  month: 'short',
  day: 'numeric',
});
/** Igual que `formatDate` de la web (el concepto "Nómina …" lo arma así). */
function fechaCorta(fecha: string): string {
  return FMT_FECHA.format(new Date(ms(fecha, 12)));
}

/** Días sin trabajo en obra dentro de la ventana (jueves/viernes santo, 1.º de mayo, 16 de septiembre). */
const FERIADOS = new Set(['2026-04-02', '2026-04-03', '2026-05-01', '2026-09-16']);

const r2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;

/** División de enteros no negativos redondeando a la mitad hacia arriba. */
function divRedondeo(n: number, d: number): number {
  return Math.floor((2 * n + d) / (2 * d));
}
/** round(cantidad × precio, 2) en centavos, con cantidades y precios de hasta 2 decimales. */
function importeC(cantidad: number, precio: number): number {
  return divRedondeo(Math.round(cantidad * 100) * Math.round(precio * 100), 100);
}
/** `pct` % de una base en centavos (pct con hasta 4 decimales). */
function pctC(baseC: number, pct: number): number {
  return divRedondeo(baseC * Math.round(pct * 10_000), 1_000_000);
}

// ── Literales SQL ────────────────────────────────────────────────────────────

class Crudo {
  readonly sql: string;
  constructor(sql: string) {
    this.sql = sql;
  }
}
type Valor = string | number | boolean | null | undefined | Crudo;

const crudo = (sql: string) => new Crudo(sql);

function lit(v: Valor): string {
  if (v === null || v === undefined) return 'null';
  if (v instanceof Crudo) return v.sql;
  if (typeof v === 'boolean') return v ? 'true' : 'false';
  if (typeof v === 'number') {
    if (!Number.isFinite(v)) throw new Error(`Número inválido en el guion: ${v}`);
    const s = String(v);
    return /e/i.test(s) ? v.toFixed(6) : s;
  }
  return `'${v.replace(/'/g, "''")}'`;
}
/** Dinero con dos decimales exactos (numeric). */
const dinero = (n: number) => crudo(n.toFixed(2));
const jsonb = (o: unknown) => crudo(`${lit(JSON.stringify(o))}::jsonb`);
const arrTexto = (xs: string[]) => crudo(xs.length ? `array[${xs.map(lit).join(', ')}]::text[]` : `'{}'::text[]`);

type Fila = Record<string, Valor>;

// ═════════════════════════════════════════════════════════════════════════════
// El guion
// ═════════════════════════════════════════════════════════════════════════════

type ClaveObra = 'A' | 'B' | 'C' | 'D';

interface PlanPartida {
  clave: string;
  seccion: string;
  concepto: string;
  unidad: string;
  cantidad: number;
  precio: number;
  claveSat: string;
  unidadSat: string;
  /** Lo que dice el programa. */
  plan: [string, string];
  /** Lo que de verdad pasó (si difiere del plan). `tope` = fracción alcanzada al final del tramo. */
  real?: [string, string, number?];
}

interface ObraGuion {
  clave: ClaveObra;
  nombre: string;
  clienteKey: string;
  ubicacion: string;
  inicio: string;
  /** Último día de trabajo (si ya terminó). */
  fin?: string;
  margenBuscado: number;
  margenObjetivoObra?: number;
  partidas: PlanPartida[];
  /** % de indirectos sobre el costo buscado. */
  pctIndirectos: number;
}

// ── Empresa, clientes ────────────────────────────────────────────────────────

const CLIENTES: {
  key: string;
  nombre: string;
  email: string;
  telefono: string;
  fiscal?: { rfc: string; razon: string; regimen: string; cp: string; uso: string; correo: string; confirmado?: string };
}[] = [
  {
    key: 'cumbres',
    nombre: 'Desarrollos Habitacionales Cumbres del Valle, S.A. de C.V.',
    email: 'l.benavides@example.com',
    telefono: '81 4410 2375',
    fiscal: {
      rfc: 'DHC150923KT4',
      razon: 'DESARROLLOS HABITACIONALES CUMBRES DEL VALLE',
      regimen: '601',
      cp: '64349',
      uso: 'I01',
      correo: 'facturas.cumbres@example.com',
      confirmado: '2026-04-08',
    },
  },
  {
    key: 'garza',
    nombre: 'Patricia Garza Leal',
    email: 'paty.garza@example.net',
    telefono: '81 1873 5520',
    fiscal: { rfc: 'GALP780514HX2', razon: 'PATRICIA GARZA LEAL', regimen: '612', cp: '64610', uso: 'G03', correo: 'paty.garza@example.net' },
  },
  {
    key: 'sendero',
    nombre: 'Operadora de Farmacias Sendero, S.A. de C.V.',
    email: 'proyectos@example.org',
    telefono: '81 8395 1044',
    fiscal: {
      rfc: 'OFS190207MQ1',
      razon: 'OPERADORA DE FARMACIAS SENDERO',
      regimen: '601',
      cp: '66490',
      uso: 'I01',
      correo: 'cxp.sendero@example.org',
    },
  },
  {
    key: 'mitras',
    nombre: 'Logística Integral Mitras, S.A. de C.V.',
    email: 'mantenimiento@example.com',
    telefono: '81 8120 6631',
    fiscal: {
      rfc: 'LIM120618RB9',
      razon: 'LOGISTICA INTEGRAL MITRAS',
      regimen: '601',
      cp: '66050',
      uso: 'I01',
      correo: 'facturacion.mitras@example.com',
      confirmado: '2026-03-31',
    },
  },
  { key: 'salinas', nombre: 'Dr. Arturo Salinas Villarreal', email: 'dr.salinas@example.net', telefono: '81 1622 4079' },
  { key: 'elizondo', nombre: 'Rosa María Elizondo Cantú', email: 'rosy.elizondo@example.net', telefono: '81 2037 6614' },
  { key: 'cantu', nombre: 'Héctor Cantú Garza', email: 'hcantu@example.net', telefono: '81 1450 9983' },
  { key: 'lozano', nombre: 'Despacho Lozano y Asociados, S.C.', email: 'administracion@example.org', telefono: '81 8333 7210' },
];

// ── Puestos y gente ──────────────────────────────────────────────────────────

const PUESTOS: [key: string, nombre: string, salario: number][] = [
  ['maestro', 'Maestro de obra', 950],
  ['oficial', 'Oficial albañil', 680],
  ['albanil', 'Albañil', 620],
  ['ayudante', 'Ayudante general', 430],
  ['fierrero', 'Fierrero', 640],
  ['carpintero', 'Carpintero cimbrero', 660],
  ['electricista', 'Electricista', 720],
  ['plomero', 'Plomero', 700],
  ['yesero', 'Yesero', 600],
  ['azulejero', 'Azulejero', 650],
  ['velador', 'Velador', 400],
];

interface Persona {
  key: string;
  nombre: string;
  puesto: string;
  tipo: 'DIA' | 'DESTAJO';
  /** Salario diario propio (va a `colaborador_sueldo`). */
  sueldo?: number;
  /** Tarifa por día para calcular el destajo semanal. */
  tarifaDestajo?: number;
  baja?: string;
  contacto: [nombre: string, parentesco: string];
  /** Para `colaborador_datos_imss`: nacimiento y entidad (dos letras). */
  imss?: [nacimiento: string, entidad: string];
}

const GENTE: Persona[] = [
  // Cuadrilla Morales (albañilería) — fraccionamiento
  { key: 'enrique', nombre: 'Enrique Morales Garza', puesto: 'maestro', tipo: 'DIA', sueldo: 1000, contacto: ['Lucía Morales', 'Esposa'], imss: ['1979-03-12', 'NL'] },
  { key: 'ruben', nombre: 'Rubén Castillo Méndez', puesto: 'oficial', tipo: 'DIA', contacto: ['Andrea Castillo', 'Hija'], imss: ['1984-07-02', 'NL'] },
  { key: 'hugo', nombre: 'Hugo Rentería Salinas', puesto: 'albanil', tipo: 'DIA', contacto: ['María Salinas', 'Mamá'], imss: ['1990-11-23', 'SP'] },
  { key: 'oscar', nombre: 'Óscar Villarreal Treviño', puesto: 'albanil', tipo: 'DIA', contacto: ['Karla Treviño', 'Esposa'] },
  { key: 'alfredo', nombre: 'Alfredo Cárdenas Leal', puesto: 'albanil', tipo: 'DIA', contacto: ['Juana Leal', 'Mamá'], imss: ['1987-01-30', 'CL'] },
  { key: 'chuy', nombre: 'Jesús Olvera Ríos', puesto: 'ayudante', tipo: 'DIA', contacto: ['Martha Ríos', 'Mamá'] },
  { key: 'brandon', nombre: 'Brandon Esquivel Cantú', puesto: 'ayudante', tipo: 'DIA', contacto: ['Rocío Cantú', 'Mamá'] },
  { key: 'kevin', nombre: 'Kevin Alanís Guerra', puesto: 'ayudante', tipo: 'DIA', contacto: ['José Alanís', 'Papá'] },
  // Cuadrilla Treviño (albañilería) — bodega y luego local comercial
  { key: 'martin', nombre: 'Martín Treviño Solís', puesto: 'maestro', tipo: 'DIA', sueldo: 980, contacto: ['Norma Solís', 'Esposa'], imss: ['1976-05-18', 'NL'] },
  { key: 'gerardo', nombre: 'Gerardo Sepúlveda Lara', puesto: 'oficial', tipo: 'DIA', contacto: ['Ana Lara', 'Esposa'], imss: ['1983-09-09', 'NL'] },
  { key: 'ramiro', nombre: 'Ramiro Guajardo Peña', puesto: 'albanil', tipo: 'DIA', contacto: ['Elsa Peña', 'Hermana'] },
  { key: 'eduardo', nombre: 'Eduardo Zamora Ibarra', puesto: 'albanil', tipo: 'DIA', contacto: ['Silvia Ibarra', 'Mamá'], imss: ['1992-04-14', 'TS'] },
  { key: 'luisangel', nombre: 'Luis Ángel Montemayor Ruiz', puesto: 'ayudante', tipo: 'DIA', contacto: ['Graciela Ruiz', 'Mamá'] },
  { key: 'ivan', nombre: 'Iván Garza Quiroga', puesto: 'ayudante', tipo: 'DIA', contacto: ['Pedro Garza', 'Papá'] },
  { key: 'marcos', nombre: 'Marcos Rodríguez Elizondo', puesto: 'ayudante', tipo: 'DIA', baja: '2026-07-17', contacto: ['Irma Elizondo', 'Mamá'] },
  // Acero y cimbra Salazar (se les paga a destajo)
  { key: 'rogelio', nombre: 'Rogelio Salazar Benavides', puesto: 'fierrero', tipo: 'DESTAJO', tarifaDestajo: 880, contacto: ['Laura Benavides', 'Esposa'], imss: ['1980-12-01', 'NL'] },
  { key: 'fernando', nombre: 'Fernando Cavazos Tijerina', puesto: 'fierrero', tipo: 'DESTAJO', tarifaDestajo: 720, contacto: ['Blanca Tijerina', 'Mamá'] },
  { key: 'samuel', nombre: 'Samuel de la Garza Lozano', puesto: 'carpintero', tipo: 'DESTAJO', tarifaDestajo: 740, contacto: ['Mirna Lozano', 'Esposa'], imss: ['1985-06-27', 'CH'] },
  { key: 'julian', nombre: 'Julián Hinojosa Barrera', puesto: 'carpintero', tipo: 'DESTAJO', tarifaDestajo: 720, contacto: ['Rosa Barrera', 'Mamá'] },
  { key: 'daniel', nombre: 'Daniel Longoria Chapa', puesto: 'ayudante', tipo: 'DESTAJO', tarifaDestajo: 480, contacto: ['Carmen Chapa', 'Mamá'] },
  // Acabados Ibarra — remodelación y acabados de la bodega
  { key: 'javier', nombre: 'Javier Ibarra Rocha', puesto: 'maestro', tipo: 'DIA', sueldo: 900, contacto: ['Leticia Rocha', 'Esposa'], imss: ['1981-02-08', 'NL'] },
  { key: 'alejandro', nombre: 'Alejandro Mata Pérez', puesto: 'oficial', tipo: 'DIA', contacto: ['Sandra Pérez', 'Esposa'] },
  { key: 'tomas', nombre: 'Tomás Garza Villanueva', puesto: 'albanil', tipo: 'DIA', contacto: ['Irene Villanueva', 'Mamá'] },
  { key: 'emilio', nombre: 'Emilio Sandoval Reyna', puesto: 'ayudante', tipo: 'DIA', contacto: ['Julia Reyna', 'Mamá'] },
  // Por su cuenta
  { key: 'julio', nombre: 'Julio César Medina Orta', puesto: 'electricista', tipo: 'DIA', contacto: ['Patricia Orta', 'Esposa'], imss: ['1986-08-15', 'NL'] },
  { key: 'ernesto', nombre: 'Ernesto Cantú Aguirre', puesto: 'plomero', tipo: 'DIA', contacto: ['Alma Aguirre', 'Esposa'] },
  { key: 'ismael', nombre: 'Ismael Hernández Robles', puesto: 'yesero', tipo: 'DESTAJO', tarifaDestajo: 900, contacto: ['Rosalba Robles', 'Esposa'], imss: ['1988-10-03', 'SP'] },
  { key: 'raul', nombre: 'Raúl Pérez Maldonado', puesto: 'azulejero', tipo: 'DESTAJO', tarifaDestajo: 780, contacto: ['Esther Maldonado', 'Mamá'] },
  { key: 'anselmo', nombre: 'Anselmo Tamez Luna', puesto: 'velador', tipo: 'DIA', contacto: ['Guadalupe Luna', 'Esposa'], imss: ['1968-04-21', 'NL'] },
  { key: 'porfirio', nombre: 'Porfirio Zúñiga Cruz', puesto: 'ayudante', tipo: 'DIA', contacto: ['Teresa Cruz', 'Mamá'], imss: ['1998-01-19', 'VZ'] },
];

const CUADRILLAS: {
  key: string;
  nombre: string;
  especialidad: string;
  jefe: string;
  miembros: [persona: string, desde?: string, hasta?: string][];
  /** [obra, desde, hasta (inclusive), fase] */
  obras: [ClaveObra, string, string, string][];
}[] = [
  {
    key: 'morales',
    nombre: 'Cuadrilla Morales',
    especialidad: 'ALBANILERIA',
    jefe: 'enrique',
    miembros: [['enrique'], ['ruben'], ['hugo'], ['oscar'], ['alfredo'], ['chuy'], ['brandon'], ['kevin']],
    obras: [['A', '2026-04-06', HOY_GUION, 'Obra negra y albañilería de las seis casas']],
  },
  {
    key: 'trevino',
    nombre: 'Cuadrilla Treviño',
    especialidad: 'ALBANILERIA',
    jefe: 'martin',
    miembros: [
      ['martin'],
      ['gerardo'],
      ['ramiro'],
      ['eduardo'],
      ['luisangel'],
      ['ivan'],
      ['marcos', undefined, '2026-07-17'],
      ['porfirio', '2026-08-03'],
    ],
    obras: [
      ['D', '2026-03-30', '2026-06-12', 'Cimentación, muros y firmes de la nave'],
      ['C', '2026-06-15', HOY_GUION, 'Obra negra del local'],
    ],
  },
  {
    key: 'salazar',
    nombre: 'Acero y cimbra Salazar',
    especialidad: 'ACERO',
    jefe: 'rogelio',
    miembros: [['rogelio'], ['fernando'], ['samuel'], ['julian'], ['daniel']],
    obras: [
      ['D', '2026-03-30', '2026-05-08', 'Zapatas y dados'],
      ['A', '2026-05-11', '2026-07-31', 'Castillos, dalas y losas'],
      ['C', '2026-08-03', HOY_GUION, 'Zapatas, contratrabes y columnas'],
    ],
  },
  {
    key: 'ibarra',
    nombre: 'Acabados Ibarra',
    especialidad: 'ACABADOS',
    jefe: 'javier',
    miembros: [['javier'], ['alejandro'], ['tomas'], ['emilio']],
    obras: [
      ['B', '2026-04-20', '2026-06-12', 'Demoliciones y ampliación'],
      ['D', '2026-06-15', '2026-07-24', 'Acabados de la nave'],
      ['B', '2026-07-27', HOY_GUION, 'Acabados de la casa'],
    ],
  },
];

/** Gente que no va en cuadrilla: [persona, obra, desde, hasta, solo lunes a viernes]. */
const SUELTOS: [string, ClaveObra, string, string, boolean][] = [
  ['julio', 'B', '2026-05-18', '2026-06-05', true],
  ['julio', 'C', '2026-08-17', '2026-09-25', true],
  ['ernesto', 'B', '2026-05-04', '2026-05-22', true],
  ['ernesto', 'B', '2026-08-03', '2026-08-14', true],
  ['ernesto', 'C', '2026-08-24', '2026-09-11', true],
  ['ismael', 'A', '2026-06-01', HOY_GUION, false],
  ['raul', 'B', '2026-07-27', '2026-09-25', false],
  ['anselmo', 'A', '2026-04-06', HOY_GUION, false],
];

/** Días de incapacidad (no se pasa lista). */
const INCAPACIDAD: Record<string, [string, string]> = { porfirio: ['2026-08-20', '2026-08-22'] };

// ── Obras ────────────────────────────────────────────────────────────────────

const SAT = {
  apoyo: '72101500',
  excavacion: '72141511',
  demolicion: '72141510',
  albanileria: '72151900',
  plomeria: '72151100',
  electrica: '72151500',
  pintura: '72151300',
  carpinteria: '72152300',
  impermeabilizacion: '72153204',
  techado: '72152600',
  remodelacion: '72111001',
};

function p(
  clave: string,
  seccion: string,
  concepto: string,
  unidad: string,
  cantidad: number,
  precio: number,
  claveSat: string,
  plan: [string, string],
  real?: [string, string, number?],
): PlanPartida {
  const unidadSat =
    unidad === 'm²' ? 'MTK' : unidad === 'm³' ? 'MTQ' : unidad === 'ml' ? 'MTR' : unidad === 'pza' ? 'H87' : 'E48';
  return { clave, seccion, concepto, unidad, cantidad, precio, claveSat, unidadSat, plan, real };
}

const OBRAS: ObraGuion[] = [
  {
    clave: 'A',
    nombre: 'Los Encinos Etapa 2 — 6 casas',
    clienteKey: 'cumbres',
    ubicacion: 'Fracc. Los Encinos, lotes 7 al 12, Gral. Escobedo, N.L.',
    inicio: '2026-04-06',
    margenBuscado: 12.4,
    margenObjetivoObra: 15,
    pctIndirectos: 0.08,
    partidas: [
      p('ENC-01', 'Preliminares y cimentación', 'Trazo y nivelación del terreno', 'm²', 630, 33, SAT.apoyo, ['2026-04-06', '2026-04-17']),
      p('ENC-02', 'Preliminares y cimentación', 'Excavación para cimentación', 'm³', 228, 215, SAT.excavacion, ['2026-04-08', '2026-05-08']),
      p('ENC-03', 'Preliminares y cimentación', "Losa de cimentación de concreto f'c 250 armada", 'm³', 96, 5650, SAT.albanileria, ['2026-04-13', '2026-05-29']),
      p('ENC-04', 'Estructura', 'Muros de block 15x20x40 junteado con mortero', 'm²', 1260, 610, SAT.albanileria, ['2026-05-04', '2026-07-24']),
      p('ENC-05', 'Estructura', 'Castillos y dalas de concreto armado', 'ml', 1080, 360, SAT.albanileria, ['2026-05-04', '2026-07-31']),
      p('ENC-06', 'Estructura', 'Losa de entrepiso de vigueta y bovedilla', 'm²', 348, 1340, SAT.albanileria, ['2026-06-15', '2026-08-14']),
      p('ENC-07', 'Estructura', 'Losa de azotea de vigueta y bovedilla', 'm²', 372, 1380, SAT.albanileria, ['2026-07-27', '2026-10-09']),
      p('ENC-08', 'Instalaciones', 'Instalación hidrosanitaria completa', 'casa', 6, 56000, SAT.plomeria, ['2026-06-08', '2026-10-23']),
      p('ENC-09', 'Instalaciones', 'Instalación eléctrica completa', 'casa', 6, 49000, SAT.electrica, ['2026-06-22', '2026-10-30']),
      p('ENC-10', 'Acabados', 'Aplanado de yeso en muros interiores', 'm²', 2520, 190, SAT.albanileria, ['2026-07-06', '2026-10-16']),
      p('ENC-11', 'Acabados', 'Piso cerámico 60x60 con zoclo', 'm²', 570, 560, SAT.albanileria, ['2026-08-24', '2026-10-30']),
      p('ENC-12', 'Acabados', 'Impermeabilización de azoteas', 'm²', 372, 245, SAT.impermeabilizacion, ['2026-09-07', '2026-10-16']),
      p('ENC-13', 'Acabados', 'Pintura vinílica interior y exterior', 'm²', 2880, 99, SAT.pintura, ['2026-09-14', '2026-11-13']),
      p('ENC-14', 'Acabados', 'Cancelería de aluminio y puertas', 'casa', 6, 44000, SAT.carpinteria, ['2026-10-05', '2026-11-20']),
      p('ENC-15', 'Acabados', 'Limpieza final y entrega', 'casa', 6, 7500, SAT.apoyo, ['2026-11-16', '2026-11-27']),
    ],
  },
  {
    clave: 'B',
    nombre: 'Remodelación casa Garza Leal',
    clienteKey: 'garza',
    ubicacion: 'Cumbres 5.º Sector, Monterrey, N.L.',
    inicio: '2026-04-20',
    margenBuscado: 19,
    pctIndirectos: 0.07,
    partidas: [
      p('DEM-01', 'Demoliciones y preliminares', 'Demolición de muros y retiro de escombro', 'm²', 42, 310, SAT.demolicion, ['2026-04-20', '2026-04-30']),
      p('DEM-02', 'Demoliciones y preliminares', 'Desmontaje de cocina y muebles de baño', 'lote', 1, 9500, SAT.demolicion, ['2026-04-20', '2026-04-24']),
      p('ALB-01', 'Ampliación de recámara', 'Cimentación corrida de piedra con dala', 'ml', 18, 1450, SAT.albanileria, ['2026-04-27', '2026-05-15']),
      p('ALB-02', 'Ampliación de recámara', 'Muros de block de 15 cm', 'm²', 52, 540, SAT.albanileria, ['2026-05-11', '2026-06-05']),
      p('ALB-03', 'Ampliación de recámara', 'Losa de vigueta y bovedilla', 'm²', 20, 1250, SAT.albanileria, ['2026-06-01', '2026-06-12']),
      p('COC-01', 'Cocina', 'Cocina integral con cubierta de granito', 'lote', 1, 118000, SAT.carpinteria, ['2026-08-24', '2026-10-09']),
      p('COC-02', 'Cocina', 'Instalación hidráulica y de gas en cocina', 'lote', 1, 16500, SAT.plomeria, ['2026-05-04', '2026-05-22']),
      p('BAN-01', 'Baños', 'Remodelación completa de baño', 'pza', 2, 58000, SAT.remodelacion, ['2026-08-03', '2026-09-30']),
      p('ELE-01', 'Instalación eléctrica', 'Recableado y centro de carga nuevo', 'lote', 1, 38500, SAT.electrica, ['2026-05-18', '2026-06-05']),
      p('ACA-01', 'Acabados', 'Piso cerámico 60x60', 'm²', 128, 520, SAT.albanileria, ['2026-07-27', '2026-09-04']),
      p('ACA-02', 'Acabados', 'Aplanado y pasta en muros', 'm²', 310, 175, SAT.albanileria, ['2026-07-27', '2026-08-28']),
      p('ACA-03', 'Acabados', 'Pintura vinílica interior y exterior', 'm²', 520, 88, SAT.pintura, ['2026-09-07', '2026-10-02']),
      p('ACA-04', 'Acabados', 'Impermeabilización de azotea', 'm²', 140, 230, SAT.impermeabilizacion, ['2026-06-01', '2026-06-12']),
      p('ACA-05', 'Acabados', 'Carpintería: puertas y clósets', 'lote', 1, 48000, SAT.carpinteria, ['2026-09-14', '2026-10-09']),
    ],
  },
  {
    clave: 'C',
    nombre: 'Local comercial Sendero — farmacia',
    clienteKey: 'sendero',
    ubicacion: 'Av. Sendero Divisorio 1180, San Nicolás de los Garza, N.L.',
    inicio: '2026-06-15',
    margenBuscado: -2.4,
    pctIndirectos: 0.1,
    partidas: [
      p('LC-01', 'Preliminares y cimentación', 'Trazo y nivelación', 'm²', 380, 32, SAT.apoyo, ['2026-06-15', '2026-06-19']),
      p('LC-02', 'Preliminares y cimentación', 'Excavación para cimentación', 'm³', 95, 210, SAT.excavacion, ['2026-06-17', '2026-06-30']),
      p('LC-03', 'Preliminares y cimentación', 'Zapatas y contratrabes de concreto armado', 'm³', 42, 5200, SAT.albanileria, ['2026-06-24', '2026-07-24'], ['2026-06-24', '2026-08-07']),
      p('LC-04', 'Estructura', 'Estructura metálica y cubierta de multitecho', 'm²', 380, 1650, SAT.techado, ['2026-07-20', '2026-09-11'], ['2026-08-03', '2026-11-06']),
      p('LC-05', 'Estructura', 'Muros de block de 15 cm', 'm²', 420, 560, SAT.albanileria, ['2026-08-10', '2026-10-02']),
      p('LC-06', 'Estructura', 'Firme de concreto pulido', 'm²', 380, 420, SAT.albanileria, ['2026-09-21', '2026-10-09']),
      p('LC-07', 'Instalaciones', 'Instalación eléctrica y alumbrado', 'lote', 1, 185000, SAT.electrica, ['2026-08-17', '2026-10-16']),
      p('LC-08', 'Instalaciones', 'Instalación hidrosanitaria', 'lote', 1, 72000, SAT.plomeria, ['2026-08-24', '2026-10-02']),
      p('LC-09', 'Instalaciones', 'Preparación para aire acondicionado', 'lote', 1, 48000, SAT.apoyo, ['2026-10-05', '2026-10-23']),
      p('LC-10', 'Acabados', 'Muros de tablaroca y plafón reticular', 'm²', 320, 395, SAT.albanileria, ['2026-08-24', '2026-10-16']),
      p('LC-11', 'Acabados', 'Pintura vinílica', 'm²', 900, 92, SAT.pintura, ['2026-10-12', '2026-10-30']),
      p('LC-12', 'Acabados', 'Fachada y cancelería de aluminio', 'lote', 1, 165000, SAT.apoyo, ['2026-10-19', '2026-11-13']),
      p('LC-13', 'Acabados', 'Piso de porcelanato 60x120', 'm²', 360, 610, SAT.albanileria, ['2026-10-12', '2026-11-06']),
    ],
  },
  {
    clave: 'D',
    nombre: 'Bodega Mitras — Nave 4',
    clienteKey: 'mitras',
    ubicacion: 'Parque Industrial Mitras Norte, nave 4, García, N.L.',
    inicio: '2026-03-30',
    fin: '2026-07-24',
    margenBuscado: 20.6,
    pctIndirectos: 0.08,
    partidas: [
      p('BOD-01', 'Terracerías y cimentación', 'Despalme y nivelación', 'm²', 1100, 45, SAT.apoyo, ['2026-03-30', '2026-04-08']),
      p('BOD-02', 'Terracerías y cimentación', 'Excavación y relleno compactado', 'm³', 420, 260, SAT.excavacion, ['2026-04-06', '2026-04-24']),
      p('BOD-03', 'Terracerías y cimentación', 'Zapatas aisladas y dados de concreto armado', 'm³', 68, 5400, SAT.albanileria, ['2026-04-13', '2026-05-08']),
      p('BOD-04', 'Estructura y cubierta', 'Estructura metálica de marcos rígidos', 'ton', 32, 46000, SAT.techado, ['2026-04-27', '2026-06-05']),
      p('BOD-05', 'Estructura y cubierta', 'Cubierta de lámina KR-18', 'm²', 950, 420, SAT.techado, ['2026-05-25', '2026-06-19']),
      p('BOD-06', 'Muros y firmes', 'Muros de block de 15 cm', 'm²', 480, 540, SAT.albanileria, ['2026-05-04', '2026-06-12']),
      p('BOD-07', 'Muros y firmes', "Firme de concreto f'c 250 con malla", 'm²', 900, 520, SAT.albanileria, ['2026-05-18', '2026-06-26']),
      p('BOD-08', 'Instalaciones', 'Instalación eléctrica industrial', 'lote', 1, 210000, SAT.electrica, ['2026-06-08', '2026-07-10']),
      p('BOD-09', 'Instalaciones', 'Instalación hidrosanitaria y pluvial', 'lote', 1, 95000, SAT.plomeria, ['2026-06-15', '2026-07-03']),
      p('BOD-10', 'Acabados y exteriores', 'Pintura de muros y estructura', 'm²', 1300, 75, SAT.pintura, ['2026-06-29', '2026-07-17']),
      p('BOD-11', 'Acabados y exteriores', 'Portón de acceso y cancelería', 'lote', 1, 138000, SAT.apoyo, ['2026-07-06', '2026-07-22']),
      p('BOD-12', 'Acabados y exteriores', 'Banquetas y patio de maniobras', 'm²', 380, 480, SAT.albanileria, ['2026-06-22', '2026-07-24']),
    ],
  },
];

// ── Extras (órdenes de cambio) ───────────────────────────────────────────────

interface ExtraGuion {
  key: string;
  obra: ClaveObra;
  titulo: string;
  motivo: string;
  fecha: string;
  /** Cómo termina: el cliente aprueba o rechaza (por oficina), queda enviado o en borrador. */
  final: 'APROBADA' | 'RECHAZADA' | 'ENVIADA' | 'BORRADOR';
  quien?: string;
  motivoRechazo?: string;
  renglones: [concepto: string, unidad: string, cantidad: number, precio: number, plan?: [string, string]][];
}

const EXTRAS: ExtraGuion[] = [
  {
    key: 'A1',
    obra: 'A',
    titulo: 'Barda de colindancia en el lote 12',
    motivo: 'El vecino del lote 13 no construyó su barda; la desarrolladora pidió levantarla para cerrar el conjunto.',
    fecha: '2026-07-06',
    final: 'APROBADA',
    quien: 'Ing. Laura Benavides (Desarrollos Cumbres del Valle)',
    renglones: [['Barda de block de 2.5 m de altura con castillos', 'm²', 48, 590, ['2026-07-20', '2026-08-07']]],
  },
  {
    key: 'B1',
    obra: 'B',
    titulo: 'Cambio de piso cerámico a porcelanato en planta baja',
    motivo: 'La señora Garza eligió porcelanato 60x120 en lugar del cerámico cotizado.',
    fecha: '2026-05-12',
    final: 'APROBADA',
    quien: 'Patricia Garza Leal (por WhatsApp)',
    renglones: [
      ['Diferencia de precio a porcelanato 60x120', 'm²', 62, 260, ['2026-08-10', '2026-09-04']],
      ['Zoclo de porcelanato', 'ml', 45, 95, ['2026-08-24', '2026-09-04']],
    ],
  },
  {
    key: 'B2',
    obra: 'B',
    titulo: 'Ventana adicional en la recámara nueva',
    motivo: 'Se pidió más luz natural en la recámara de la ampliación.',
    fecha: '2026-06-02',
    final: 'APROBADA',
    quien: 'Patricia Garza Leal (por WhatsApp)',
    renglones: [
      ['Ventana de aluminio 1.20 x 1.00 m con vidrio de 6 mm', 'pza', 1, 8900, ['2026-06-22', '2026-06-26']],
      ['Apertura de vano y cerramiento en muro', 'lote', 1, 3200, ['2026-06-15', '2026-06-19']],
    ],
  },
  {
    key: 'B3',
    obra: 'B',
    titulo: 'Pérgola de madera en la terraza',
    motivo: 'Propuesta para cubrir la terraza del patio trasero.',
    fecha: '2026-07-08',
    final: 'RECHAZADA',
    motivoRechazo: 'Por ahora no; lo vemos cuando se termine la casa.',
    renglones: [
      ['Pérgola de madera de pino tratada 4 x 3 m', 'lote', 1, 38500],
      ['Barniz marino y herrajes', 'lote', 1, 8300],
    ],
  },
  {
    key: 'B4',
    obra: 'B',
    titulo: 'Calentador de paso y reubicación de tubería de gas',
    motivo: 'El boiler actual no cabe en el nuevo cuarto de lavado.',
    fecha: '2026-09-18',
    final: 'ENVIADA',
    renglones: [
      ['Calentador de paso a gas de 16 L/min instalado', 'pza', 1, 14500],
      ['Reubicación de tubería de gas', 'lote', 1, 3800],
    ],
  },
  {
    key: 'C1',
    obra: 'C',
    titulo: 'Refuerzo de estructura para equipos de aire acondicionado',
    motivo: 'El proyecto de clima de la farmacia pide dos equipos de 5 t sobre la cubierta.',
    fecha: '2026-09-23',
    final: 'BORRADOR',
    renglones: [['Bastidor de PTR para equipos sobre cubierta', 'pza', 2, 16800]],
  },
];

// ── Proveedores y materiales ─────────────────────────────────────────────────

const PROVEEDORES: [key: string, nombre: string, rfc: string, contacto: string, tel: string, credito: number][] = [
  ['aceros', 'Aceros y Materiales del Norte, S.A. de C.V.', 'AMN090415QW2', 'Lic. Mónica Garza', '81 8352 1180', 30],
  ['cementos', 'Cementos y Agregados La Silla, S.A. de C.V.', 'CAS110822JK5', 'Sr. Rodolfo Leal', '81 8317 4402', 15],
  ['concretos', 'Concretos Premezclados Regios, S.A. de C.V.', 'CPR080130LM8', 'Ing. Alma Treviño', '81 8190 7735', 30],
  ['blocks', 'Blocks y Prefabricados Apodaca, S.A. de C.V.', 'BPA130506RS1', 'Sr. Gilberto Peña', '81 8386 2291', 15],
  ['ferreteria', 'Ferretería y Eléctrico Linda Vista, S.A. de C.V.', 'FEL100914TU3', 'Sra. Diana Salazar', '81 8377 6048', 0],
  ['hidraulica', 'Hidráulica y PVC Guadalupe, S.A. de C.V.', 'HPG140303VX6', 'Sr. Omar Rangel', '81 8364 5530', 15],
  ['maderas', 'Maderas y Cimbras Santa Catarina, S.A. de C.V.', 'MCS070719YZ4', 'Sr. Arnoldo Quiroga', '81 8336 0912', 15],
  ['pinturas', 'Pinturas y Recubrimientos Monterrey, S.A. de C.V.', 'PRM120227AB9', 'Lic. Verónica Lozano', '81 8345 7780', 30],
  ['maquinaria', 'Renta de Maquinaria Escobedo, S.A. de C.V.', 'RME150611CD2', 'Sr. Humberto Chapa', '81 8397 1156', 0],
];

const MATERIALES: [key: string, nombre: string, unidad: string, precio: number, proveedor: string][] = [
  ['var38', 'Varilla corrugada 3/8" (12 m)', 'pza', 178, 'aceros'],
  ['var12', 'Varilla corrugada 1/2" (12 m)', 'pza', 312, 'aceros'],
  ['alambre', 'Alambre recocido cal. 18', 'kg', 38, 'aceros'],
  ['malla', 'Malla electrosoldada 6x6-10/10 (rollo)', 'rollo', 3450, 'aceros'],
  ['armex', 'Armex 15x20-4 (6 m)', 'pza', 285, 'aceros'],
  ['ptr', 'PTR 4" x 4" cal. 11 (6 m)', 'pza', 2150, 'aceros'],
  ['lamina', 'Lámina KR-18 cal. 24', 'm²', 265, 'aceros'],
  ['cemento', 'Cemento gris CPC 30R (saco 50 kg)', 'saco', 268, 'cementos'],
  ['mortero', 'Mortero (saco 50 kg)', 'saco', 215, 'cementos'],
  ['cal', 'Cal hidratada (saco 25 kg)', 'saco', 98, 'cementos'],
  ['arena', 'Arena de río', 'm³', 450, 'cementos'],
  ['grava', 'Grava de 3/4"', 'm³', 510, 'cementos'],
  ['base', 'Material de base (caliche)', 'm³', 320, 'cementos'],
  ['yeso', 'Yeso (saco 40 kg)', 'saco', 145, 'cementos'],
  ['pegazulejo', 'Pegazulejo (saco 20 kg)', 'saco', 135, 'cementos'],
  ['c200', "Concreto premezclado f'c 200", 'm³', 2350, 'concretos'],
  ['c250', "Concreto premezclado f'c 250", 'm³', 2520, 'concretos'],
  ['bombeo', 'Servicio de bombeo de concreto', 'servicio', 3800, 'concretos'],
  ['block15', 'Block hueco 15x20x40 cm', 'pza', 15, 'blocks'],
  ['block12', 'Block hueco 12x20x40 cm', 'pza', 13, 'blocks'],
  ['vigueta', 'Vigueta pretensada 12-4', 'ml', 118, 'blocks'],
  ['bovedilla', 'Bovedilla de poliestireno', 'pza', 24, 'blocks'],
  ['thw12', 'Cable THW-LS cal. 12 (rollo 100 m)', 'rollo', 1450, 'ferreteria'],
  ['thw10', 'Cable THW-LS cal. 10 (rollo 100 m)', 'rollo', 2280, 'ferreteria'],
  ['poliducto', 'Poliducto naranja 1/2" (rollo 100 m)', 'rollo', 520, 'ferreteria'],
  ['chalupa', 'Chalupa galvanizada', 'pza', 18, 'ferreteria'],
  ['contacto', 'Contacto dúplex con placa', 'pza', 65, 'ferreteria'],
  ['centro', 'Centro de carga 8 polos', 'pza', 1280, 'ferreteria'],
  ['disco', 'Disco de corte para metal 4½"', 'pza', 32, 'ferreteria'],
  ['clavo', 'Clavo para madera 2½"', 'kg', 42, 'ferreteria'],
  ['pvc4', 'Tubo PVC sanitario 4" (6 m)', 'pza', 395, 'hidraulica'],
  ['pvc2', 'Tubo PVC sanitario 2" (6 m)', 'pza', 165, 'hidraulica'],
  ['cpvc', 'Tubo CPVC 1/2" (6 m)', 'pza', 118, 'hidraulica'],
  ['codo', 'Codo CPVC 1/2" x 90°', 'pza', 9, 'hidraulica'],
  ['tinaco', 'Tinaco 1,100 L', 'pza', 2450, 'hidraulica'],
  ['wc', 'Sanitario (WC) completo', 'pza', 2150, 'hidraulica'],
  ['triplay', 'Triplay de pino 16 mm', 'hoja', 520, 'maderas'],
  ['polin', 'Polín de pino 4" x 4" x 8\'', 'pza', 145, 'maderas'],
  ['barrote', 'Barrote de pino 2" x 4" x 8\'', 'pza', 82, 'maderas'],
  ['desmoldante', 'Desmoldante (cubeta 19 L)', 'cubeta', 690, 'maderas'],
  ['pintura', 'Pintura vinílica (cubeta 19 L)', 'cubeta', 1650, 'pinturas'],
  ['sellador', 'Sellador vinílico (cubeta 19 L)', 'cubeta', 980, 'pinturas'],
  ['imper', 'Impermeabilizante acrílico 5 años (cubeta 19 L)', 'cubeta', 1850, 'pinturas'],
  ['piso', 'Piso cerámico 60x60', 'm²', 245, 'pinturas'],
  ['porcelanato', 'Porcelanato 60x120', 'm²', 520, 'pinturas'],
  ['boquilla', 'Boquilla sin arena (saco 5 kg)', 'saco', 85, 'pinturas'],
];

/**
 * Órdenes de compra. `peso` reparte el presupuesto de material pagado de la obra
 * (se calibra para que la utilidad caiga donde dice el guion). `final`:
 *  · PAGADA: se emite, se recibe completa y se paga completa;
 *  · POR_PAGAR: recibida, sin pago (vence a crédito);
 *  · PARCIAL: se recibe el 60 % y se paga lo recibido;
 *  · ANTICIPO: emitida, sin entrega, con 50 % pagado;
 *  · BORRADOR_VB: en borrador esperando el visto bueno (> $50,000);
 *  · CANCELADA: se armó y se canceló.
 */
interface OrdenGuion {
  key: string;
  obra: ClaveObra;
  prov: string;
  fecha: string;
  peso: number;
  items: [material: string, parte: number][];
  final: 'PAGADA' | 'POR_PAGAR' | 'PARCIAL' | 'ANTICIPO' | 'BORRADOR_VB' | 'CANCELADA';
  /** Subtotal fijo (para las que no son costo pagado). */
  subtotal?: number;
  /** La requisición pidió más de lo que se compró (queda PARCIAL). */
  reqDeMas?: boolean;
  /** Pide visto bueno (se registra aprobada). */
  vistoBueno?: boolean;
  /** Recepción en dos partes. */
  dosEntregas?: boolean;
}

const ORDENES: OrdenGuion[] = [
  { key: 'D1', obra: 'D', prov: 'cementos', fecha: '2026-03-31', peso: 95, items: [['cemento', 0.4], ['arena', 0.2], ['grava', 0.25], ['base', 0.15]], final: 'PAGADA' },
  { key: 'D2', obra: 'D', prov: 'concretos', fecha: '2026-04-13', peso: 185, items: [['c250', 0.92], ['bombeo', 0.08]], final: 'PAGADA' },
  { key: 'D3', obra: 'D', prov: 'aceros', fecha: '2026-04-08', peso: 120, items: [['var12', 0.5], ['var38', 0.3], ['alambre', 0.1], ['armex', 0.1]], final: 'PAGADA' },
  { key: 'D4', obra: 'D', prov: 'blocks', fecha: '2026-05-04', peso: 62, items: [['block15', 1]], final: 'PAGADA' },
  { key: 'D5', obra: 'D', prov: 'concretos', fecha: '2026-05-18', peso: 230, items: [['c250', 0.88], ['bombeo', 0.12]], final: 'PAGADA', vistoBueno: true },
  { key: 'D6', obra: 'D', prov: 'aceros', fecha: '2026-05-20', peso: 48, items: [['malla', 1]], final: 'PAGADA' },
  { key: 'D7', obra: 'D', prov: 'ferreteria', fecha: '2026-06-10', peso: 72, items: [['thw10', 0.4], ['thw12', 0.3], ['poliducto', 0.15], ['centro', 0.15]], final: 'PAGADA' },
  { key: 'D8', obra: 'D', prov: 'pinturas', fecha: '2026-06-29', peso: 38, items: [['pintura', 0.7], ['sellador', 0.3]], final: 'PAGADA' },
  { key: 'D9', obra: 'D', prov: 'hidraulica', fecha: '2026-06-15', peso: 26, items: [['pvc4', 0.5], ['pvc2', 0.3], ['cpvc', 0.2]], final: 'PAGADA' },
  { key: 'A1', obra: 'A', prov: 'cementos', fecha: '2026-04-07', peso: 110, items: [['cemento', 0.35], ['arena', 0.25], ['grava', 0.25], ['base', 0.15]], final: 'PAGADA' },
  { key: 'A2', obra: 'A', prov: 'concretos', fecha: '2026-04-20', peso: 210, items: [['c250', 0.92], ['bombeo', 0.08]], final: 'PAGADA' },
  { key: 'A3', obra: 'A', prov: 'aceros', fecha: '2026-04-14', peso: 135, items: [['var38', 0.5], ['var12', 0.2], ['alambre', 0.1], ['malla', 0.2]], final: 'PAGADA' },
  { key: 'A4', obra: 'A', prov: 'blocks', fecha: '2026-05-06', peso: 85, items: [['block15', 1]], final: 'PAGADA', dosEntregas: true },
  { key: 'A5', obra: 'A', prov: 'concretos', fecha: '2026-05-12', peso: 190, items: [['c250', 0.92], ['bombeo', 0.08]], final: 'PAGADA' },
  { key: 'A6', obra: 'A', prov: 'blocks', fecha: '2026-06-10', peso: 120, items: [['vigueta', 0.6], ['bovedilla', 0.4]], final: 'PAGADA', reqDeMas: true },
  { key: 'A7', obra: 'A', prov: 'maderas', fecha: '2026-06-03', peso: 58, items: [['triplay', 0.5], ['polin', 0.3], ['barrote', 0.15], ['desmoldante', 0.05]], final: 'PAGADA' },
  { key: 'A8', obra: 'A', prov: 'concretos', fecha: '2026-06-24', peso: 160, items: [['c200', 0.9], ['bombeo', 0.1]], final: 'PAGADA' },
  { key: 'A9', obra: 'A', prov: 'cementos', fecha: '2026-07-15', peso: 64, items: [['yeso', 0.4], ['mortero', 0.3], ['cal', 0.3]], final: 'PAGADA' },
  { key: 'A10', obra: 'A', prov: 'concretos', fecha: '2026-08-05', peso: 150, items: [['c200', 0.9], ['bombeo', 0.1]], final: 'PAGADA' },
  { key: 'A11', obra: 'A', prov: 'pinturas', fecha: '2026-08-26', peso: 58, items: [['imper', 1]], final: 'PAGADA' },
  { key: 'A12', obra: 'A', prov: 'pinturas', fecha: '2026-09-08', peso: 0, subtotal: 96000, items: [['piso', 0.8], ['boquilla', 0.2]], final: 'POR_PAGAR', vistoBueno: true },
  { key: 'A13', obra: 'A', prov: 'aceros', fecha: '2026-09-22', peso: 0, subtotal: 62000, items: [['var38', 0.6], ['alambre', 0.4]], final: 'BORRADOR_VB' },
  { key: 'B1', obra: 'B', prov: 'cementos', fecha: '2026-04-22', peso: 22, items: [['cemento', 0.5], ['arena', 0.3], ['grava', 0.2]], final: 'PAGADA' },
  { key: 'B2', obra: 'B', prov: 'blocks', fecha: '2026-05-05', peso: 24, items: [['block15', 0.6], ['vigueta', 0.25], ['bovedilla', 0.15]], final: 'PAGADA' },
  { key: 'B3', obra: 'B', prov: 'hidraulica', fecha: '2026-06-01', peso: 18, items: [['cpvc', 0.3], ['codo', 0.1], ['pvc2', 0.2], ['wc', 0.4]], final: 'PAGADA' },
  { key: 'B4', obra: 'B', prov: 'pinturas', fecha: '2026-07-28', peso: 52, items: [['piso', 0.55], ['porcelanato', 0.3], ['boquilla', 0.05], ['pintura', 0.1]], final: 'PAGADA' },
  { key: 'C1', obra: 'C', prov: 'cementos', fecha: '2026-06-16', peso: 45, items: [['cemento', 0.5], ['arena', 0.25], ['grava', 0.25]], final: 'PAGADA' },
  { key: 'C2', obra: 'C', prov: 'concretos', fecha: '2026-06-29', peso: 150, items: [['c250', 0.9], ['bombeo', 0.1]], final: 'PAGADA' },
  { key: 'C3', obra: 'C', prov: 'aceros', fecha: '2026-06-24', peso: 70, items: [['var12', 0.6], ['var38', 0.3], ['alambre', 0.1]], final: 'PAGADA' },
  { key: 'C4', obra: 'C', prov: 'aceros', fecha: '2026-07-27', peso: 95, items: [['ptr', 0.7], ['lamina', 0.3]], final: 'PAGADA' },
  { key: 'C5', obra: 'C', prov: 'blocks', fecha: '2026-08-05', peso: 48, items: [['block15', 1]], final: 'PARCIAL' },
  { key: 'C6', obra: 'C', prov: 'ferreteria', fecha: '2026-09-02', peso: 30, items: [['thw12', 0.5], ['poliducto', 0.2], ['chalupa', 0.1], ['contacto', 0.2]], final: 'ANTICIPO' },
  { key: 'C7', obra: 'C', prov: 'maderas', fecha: '2026-07-01', peso: 0, subtotal: 34000, items: [['triplay', 0.6], ['polin', 0.4]], final: 'CANCELADA' },
];

// ── Notas de obra ────────────────────────────────────────────────────────────

interface NotaGuion {
  key: string;
  obra: ClaveObra;
  destinatario: string;
  colaborador?: string;
  titulo: string;
  fecha: string;
  estado: 'ABIERTA' | 'LIQUIDADA';
  notas: string;
  /** [tipo, etiqueta, monto|null, monto_base|null, porcentaje|null, texto, fecha|null, mostrar%] */
  renglones: ['CONCEPTO' | 'DEDUCCION' | 'PAGO' | 'TEXTO', string, number | null, number | null, number | null, string, string | null, boolean?][];
  /** Los PAGO de la nota ya salieron de caja como SUBCONTRATO. */
  pagosEnCaja: boolean;
}

const NOTAS: NotaGuion[] = [
  {
    key: 'herreria',
    obra: 'B',
    destinatario: 'Jesús Ávila (herrero)',
    titulo: 'Herrería: barandal, protecciones y puerta de servicio',
    fecha: '2026-05-26',
    estado: 'ABIERTA',
    notas: 'Trato de palabra con Don Chuy; material por su cuenta.',
    renglones: [
      ['CONCEPTO', 'Barandal de escalera (6 ml)', 10800, null, null, '', null],
      ['CONCEPTO', 'Protecciones de ventana (6 pzas)', 13800, null, null, '', null],
      ['CONCEPTO', 'Puerta de servicio con chapa', 13400, null, null, '', null],
      ['PAGO', 'Anticipo', 15000, null, null, '', '2026-05-30'],
      ['PAGO', 'Abono', 5000, null, null, '', '2026-07-03'],
      ['TEXTO', 'Pendiente', null, null, null, 'Falta colocar la puerta de servicio; se liquida al terminar.', null],
    ],
    pagosEnCaja: true,
  },
  {
    key: 'estructura',
    obra: 'D',
    destinatario: 'Estructuras Metálicas Garza',
    titulo: 'Fabricación y montaje de estructura metálica de la nave',
    fecha: '2026-04-16',
    estado: 'LIQUIDADA',
    notas: 'Incluye material, fabricación, pintura primario y montaje con grúa.',
    renglones: [
      ['CONCEPTO', 'Fabricación y montaje de marcos rígidos (32 t)', 960000, null, null, '', null],
      ['PAGO', 'Anticipo 40 %', 384000, null, null, '', '2026-04-20'],
      ['PAGO', 'Avance de montaje', 336000, null, null, '', '2026-05-22'],
      ['PAGO', 'Finiquito', 240000, null, null, '', '2026-06-19'],
      ['TEXTO', 'Liquidado', null, null, null, 'LIQUIDADO: estructura recibida el 19 de junio.', null],
    ],
    pagosEnCaja: true,
  },
  {
    key: 'tablaroca',
    obra: 'C',
    destinatario: 'José Luis Ruiz Tamez (Tablaroca Ruiz)',
    titulo: 'Muros de tablaroca y plafón reticular',
    fecha: '2026-08-12',
    estado: 'ABIERTA',
    notas: 'Se convirtió en contrato de subcontrato.',
    renglones: [
      ['CONCEPTO', 'Muros de tablaroca (180 m²)', 68400, null, null, '', null],
      ['CONCEPTO', 'Plafón reticular (95 m²)', 27550, null, null, '', null],
      ['DEDUCCION', 'Fondo de garantía 5 %', null, 95950, 5, '', null, true],
      ['PAGO', 'Anticipo', 30000, 31578.95, 5, '', '2026-08-15'],
    ],
    pagosEnCaja: true,
  },
  {
    key: 'limpieza',
    obra: 'A',
    destinatario: 'Margarita Olvera (limpieza)',
    titulo: 'Limpieza gruesa de casas 1 a 3',
    fecha: '2026-09-21',
    estado: 'ABIERTA',
    notas: '',
    renglones: [
      ['CONCEPTO', 'Casa 1', 3200, null, null, '', null],
      ['CONCEPTO', 'Casa 2', 3200, null, null, '', null],
      ['CONCEPTO', 'Casa 3', 3200, null, null, '', null],
      ['TEXTO', 'Forma de pago', null, null, null, 'Se paga al terminar cada casa.', null],
    ],
    pagosEnCaja: false,
  },
];

// ── Bitácora (texto a mano; el personal se toma del pase de lista del día) ────

type TipoBitacora = 'AVANCE' | 'INCIDENCIA' | 'INSTRUCCION' | 'VISITA' | 'CLIMA' | 'OTRO';
const BITACORA: [ClaveObra, string, TipoBitacora, string, boolean, string][] = [
  ['D', '2026-03-30', 'AVANCE', 'SOLEADO', true, 'Arranque de obra. Se instaló bodega provisional, sanitario portátil y toma de agua. Inicia despalme del terreno.'],
  ['D', '2026-04-09', 'AVANCE', 'SOLEADO', true, 'Despalme y nivelación terminados en todo el terreno (1,100 m²). Se trazaron ejes de la nave.'],
  ['D', '2026-04-15', 'VISITA', 'NUBLADO', false, 'Visita del Ing. Salvador Rico (supervisión de Logística Mitras). Revisó trazo y armado de las primeras zapatas; sin observaciones.'],
  ['D', '2026-04-24', 'INCIDENCIA', 'LLUVIA', false, 'Lluvia desde las 14:00. Se suspendió el colado de dados del eje 3; se cubrió el acero con plástico.'],
  ['D', '2026-05-08', 'AVANCE', 'SOLEADO', true, 'Terminan zapatas y dados (68 m³). Se entregan pruebas de laboratorio de la primera semana: resistencia dentro de especificación.'],
  ['D', '2026-05-22', 'AVANCE', 'CALOR', true, 'Estructuras Metálicas Garza montó los marcos de los ejes 1 al 5 con grúa de 30 t.'],
  ['D', '2026-06-05', 'INSTRUCCION', 'SOLEADO', false, 'Se indica al maestro Martín dejar pasos para tubería pluvial en muros del eje A antes de cerrar.'],
  ['D', '2026-06-19', 'AVANCE', 'CALOR', true, 'Cubierta de lámina KR-18 terminada. Se recibió la estructura del subcontratista.'],
  ['D', '2026-06-26', 'AVANCE', 'SOLEADO', true, 'Colado del firme terminado (900 m²) en cuatro tableros con juntas de control.'],
  ['D', '2026-07-10', 'AVANCE', 'NUBLADO', true, 'Instalación eléctrica probada con carga. Se energizó el tablero general.'],
  ['D', '2026-07-24', 'AVANCE', 'SOLEADO', true, 'Fin de obra. Recorrido de entrega con el cliente; queda lista de detalles menores (sellar un canalón).'],
  ['A', '2026-04-06', 'AVANCE', 'SOLEADO', true, 'Arranque de la etapa 2 (lotes 7 al 12). Trazo general y bodega de obra.'],
  ['A', '2026-04-17', 'AVANCE', 'VIENTO', false, 'Excavación de cimentación en lotes 7, 8 y 9. Vientos fuertes en la tarde; se aseguraron lonas.'],
  ['A', '2026-04-29', 'AVANCE', 'SOLEADO', true, 'Colado de la losa de cimentación de la casa 1 (16 m³, bombeo).'],
  ['A', '2026-05-13', 'VISITA', 'SOLEADO', true, 'Visita de la Ing. Laura Benavides (desarrolladora). Aprobó el armado de la losa de las casas 3 y 4.'],
  ['A', '2026-05-27', 'INCIDENCIA', 'TORMENTA', false, 'Tormenta en la noche; se inundó la excavación del lote 12. Se bombeó en la mañana y se perdió medio día.'],
  ['A', '2026-06-10', 'INCIDENCIA', 'SOLEADO', false, 'Casi accidente: cayó una pieza de block desde el andamio de la casa 3. Nadie resultó lesionado. Se puso rodapié y se delimitó el paso.'],
  ['A', '2026-06-24', 'AVANCE', 'CALOR', true, 'Muros de planta baja terminados en casas 1 a 4. Inicia cimbra de entrepiso en casa 1.'],
  ['A', '2026-07-08', 'INSTRUCCION', 'NUBLADO', false, 'Se instruye al subcontratista de instalaciones dejar las preparaciones de minisplit en las recámaras, según plano IE-03 rev. 2.'],
  ['A', '2026-07-22', 'AVANCE', 'CALOR', true, 'Colado de entrepiso de casas 1, 2 y 3. Se inicia la barda de colindancia del lote 12 (extra aprobado).'],
  ['A', '2026-08-06', 'CLIMA', 'CALOR', false, 'Temperatura arriba de 40 °C. Se recorrió la jornada: de 7:00 a 15:00, con pausas para hidratarse.'],
  ['A', '2026-08-19', 'AVANCE', 'SOLEADO', true, 'Entrepiso colado en las seis casas. Arranca la losa de azotea en casas 1 y 2.'],
  ['A', '2026-09-02', 'VISITA', 'NUBLADO', true, 'Visita de la desarrolladora con dos compradores. Se mostró la casa 1 con yeso y preparaciones terminadas.'],
  ['A', '2026-09-15', 'AVANCE', 'LLUVIA', true, 'Impermeabilización de azotea en casas 1 y 2. Lluvia ligera en la tarde sin afectar.'],
  ['A', '2026-09-25', 'AVANCE', 'SOLEADO', true, 'Piso cerámico en casas 1 y 2 al 60 %. Inicia pintura de fachada en casa 1.'],
  ['B', '2026-04-20', 'AVANCE', 'SOLEADO', true, 'Inicia la remodelación. Se protegieron muebles y pisos que se conservan; demolición del muro de la cocina.'],
  ['B', '2026-05-06', 'INCIDENCIA', 'SOLEADO', false, 'Al demoler apareció una tubería de gas no marcada en el plano. Se cerró la llave general y se reubicó ese mismo día.'],
  ['B', '2026-05-15', 'VISITA', 'NUBLADO', true, 'La señora Garza revisó la cimentación de la ampliación y eligió el porcelanato para la planta baja.'],
  ['B', '2026-06-12', 'AVANCE', 'CALOR', true, 'Losa de la recámara nueva colada. Impermeabilización de la azotea terminada.'],
  ['B', '2026-07-29', 'AVANCE', 'SOLEADO', true, 'Regresa la cuadrilla de acabados. Aplanados en la ampliación y en la sala.'],
  ['B', '2026-08-26', 'AVANCE', 'NUBLADO', true, 'Porcelanato de planta baja terminado. Inicia la instalación de la cocina integral.'],
  ['B', '2026-09-18', 'INSTRUCCION', 'SOLEADO', false, 'Se deja pendiente la conexión del calentador hasta que la clienta responda el extra 4.'],
  ['B', '2026-09-25', 'AVANCE', 'SOLEADO', true, 'Baños al 90 %: falta colocar mamparas. Pintura interior al 50 %.'],
  ['C', '2026-06-15', 'AVANCE', 'SOLEADO', true, 'Arranque del local. Trazo y nivelación; se instaló el tapial perimetral.'],
  ['C', '2026-06-30', 'INCIDENCIA', 'LLUVIA', false, 'Lluvias de tres días. La excavación se derrumbó en la esquina norponiente; se reexcavó y se ademó.'],
  ['C', '2026-07-24', 'INCIDENCIA', 'NUBLADO', false, 'El proveedor avisa que el PTR llega hasta el 10 de agosto. La estructura va a arrancar tarde.'],
  ['C', '2026-08-07', 'AVANCE', 'CALOR', true, 'Zapatas y contratrabes terminadas. Arranca el levantamiento de muros.'],
  ['C', '2026-08-19', 'INCIDENCIA', 'CALOR', false, 'Accidente: a un ayudante se le atoró el disco de la esmeriladora y se cortó la mano. Se le llevó al IMSS. Se retiraron discos dañados.'],
  ['C', '2026-09-04', 'VISITA', 'SOLEADO', true, 'Visita de proyectos de la farmacia. Se confirmó la ubicación de los equipos de clima sobre la cubierta.'],
  ['C', '2026-09-18', 'AVANCE', 'NUBLADO', true, 'Estructura metálica al 60 %. Se reprograma el firme para el 21 de septiembre.'],
  ['C', '2026-09-26', 'AVANCE', 'SOLEADO', false, 'Muros de block al 85 %. Tablaroca en el área de mostrador.'],
];

/** Aclaraciones: [índice de la entrada en BITACORA, texto]. */
const ACLARACIONES: [number, string][] = [
  [3, 'Corrección: el colado de dados del eje 3 se hizo el lunes 27 de abril, no el sábado.'],
  [15, 'Se confirmó con topografía que el agua no afectó el nivel de la losa del lote 12.'],
  [34, 'El derrumbe fue de aproximadamente 2 m³; no hubo personal dentro de la excavación.'],
  [37, 'El aviso al IMSS (ST-7) se entregó el 20 de agosto.'],
];

// ── Herramienta ──────────────────────────────────────────────────────────────

const HERRAMIENTA: [clave: string, nombre: string, tipo: string, costo: number, estado?: string, serie?: string][] = [
  ['H-001', 'Revolvedora de 1 saco', 'MAQUINARIA', 28500, undefined, 'RV-21-0873'],
  ['H-002', 'Revolvedora de 1 saco', 'MAQUINARIA', 28500, undefined, 'RV-22-1140'],
  ['H-003', 'Vibrador para concreto a gasolina', 'MAQUINARIA', 14800],
  ['H-004', 'Compactador tipo bailarina', 'MAQUINARIA', 46000],
  ['H-005', 'Cortadora de concreto', 'MAQUINARIA', 32000],
  ['H-006', 'Rotomartillo SDS Max', 'ELECTRICA', 9800],
  ['H-007', 'Rotomartillo SDS Plus', 'ELECTRICA', 4200],
  ['H-008', 'Esmeriladora angular 4½"', 'ELECTRICA', 1650],
  ['H-009', 'Esmeriladora angular 4½"', 'ELECTRICA', 1650],
  ['H-010', 'Sierra circular 7¼"', 'ELECTRICA', 3400],
  ['H-011', 'Taladro inalámbrico 20 V', 'ELECTRICA', 3900],
  ['H-012', 'Nivel láser autonivelante', 'MEDICION', 7500, undefined, 'NL-5591'],
  ['H-013', 'Nivel automático con tripié y estadal', 'MEDICION', 12800],
  ['H-014', 'Cinta métrica de 50 m', 'MEDICION', 650],
  ['H-015', 'Andamio tubular (juego de 10 cuerpos)', 'ANDAMIO_CIMBRA', 38000],
  ['H-016', 'Puntales metálicos (lote de 40)', 'ANDAMIO_CIMBRA', 22000],
  ['H-017', 'Escalera de tijera de 3 m', 'HERRAMIENTA', 3200],
  ['H-018', 'Escalera de extensión de 6 m', 'HERRAMIENTA', 5900],
  ['H-019', 'Carretilla reforzada', 'HERRAMIENTA', 1850],
  ['H-020', 'Carretilla reforzada', 'HERRAMIENTA', 1850],
  ['H-021', 'Generador eléctrico de 5.5 kW', 'MAQUINARIA', 18900],
  ['H-022', 'Bomba sumergible de 1 HP', 'MAQUINARIA', 4300],
  ['H-023', 'Arnés con línea de vida (juego de 4)', 'SEGURIDAD', 7200],
  ['H-024', 'Extintor PQS de 6 kg', 'SEGURIDAD', 950],
  ['H-025', 'Camioneta de redilas 3.5 t', 'VEHICULO', 385000, undefined, 'Placas RK-41-208'],
  ['H-026', 'Soldadora inversora 200 A', 'ELECTRICA', 6800, 'BAJA'],
];

/** Préstamos: [herramienta, obra|null, persona|null, desde, devolver_antes|null, hasta|null, estado_regreso|null, notas]. */
const PRESTAMOS: [string, ClaveObra | null, string | null, string, string | null, string | null, string | null, string][] = [
  ['H-001', 'A', 'enrique', '2026-04-06', null, null, null, ''],
  ['H-002', 'D', 'martin', '2026-03-30', null, '2026-07-24', 'BUENO', ''],
  ['H-002', 'C', 'martin', '2026-07-27', null, null, null, ''],
  ['H-003', 'D', 'rogelio', '2026-04-13', '2026-05-08', '2026-05-08', 'BUENO', ''],
  ['H-003', 'A', 'rogelio', '2026-05-11', '2026-07-31', '2026-07-31', 'BUENO', ''],
  ['H-003', 'C', 'rogelio', '2026-08-03', '2026-09-25', null, null, 'Se pidió de vuelta para el colado del firme.'],
  ['H-004', 'D', 'martin', '2026-04-06', '2026-04-24', '2026-04-24', 'REPARACION', 'Regresó con el pisón flojo; se mandó a taller.'],
  ['H-005', 'A', 'enrique', '2026-06-01', '2026-10-15', null, null, ''],
  ['H-006', 'C', 'julio', '2026-08-17', '2026-10-02', null, null, ''],
  ['H-008', 'B', 'javier', '2026-04-20', null, null, null, ''],
  ['H-009', 'C', 'martin', '2026-06-15', null, '2026-08-19', 'BUENO', 'Se retiró el disco dañado después del accidente.'],
  ['H-012', 'A', 'enrique', '2026-04-06', '2026-05-08', '2026-05-08', 'BUENO', ''],
  ['H-012', 'C', 'martin', '2026-06-15', '2026-07-10', '2026-07-10', 'BUENO', ''],
  ['H-012', 'A', 'enrique', '2026-07-13', null, null, null, ''],
  ['H-015', 'A', null, '2026-07-06', '2026-11-30', null, null, 'Para losas y aplanados exteriores.'],
  ['H-016', 'A', null, '2026-06-15', '2026-10-30', null, null, ''],
  ['H-017', 'B', 'javier', '2026-04-20', null, null, null, ''],
  ['H-021', 'C', 'martin', '2026-06-15', null, null, null, 'Mientras CFE conecta la acometida.'],
  ['H-022', 'A', 'enrique', '2026-05-27', '2026-05-29', '2026-05-29', 'BUENO', 'Para desaguar la excavación del lote 12.'],
  ['H-023', 'C', 'rogelio', '2026-08-03', null, null, null, ''],
  ['H-025', null, 'martin', '2026-03-30', null, null, null, 'Camioneta asignada al maestro Martín.'],
];

// ═════════════════════════════════════════════════════════════════════════════
// Generador
// ═════════════════════════════════════════════════════════════════════════════

export function generarSqlDemo(op: OpcionesDemo): string {
  return generarDemo(op).sql;
}

export function generarDemo(op: OpcionesDemo): DemoGenerado {
  if (!UUID_RE.test(op.userId)) throw new Error('userId no es un UUID.');
  if (!UUID_RE.test(op.empresaId)) throw new Error('empresaId no es un UUID.');
  const hoy = op.hoy ?? HOY_GUION;
  if (!FECHA_RE.test(hoy)) throw new Error('hoy debe ser YYYY-MM-DD.');
  if (hoy < HOY_GUION) {
    throw new Error(`El guion termina el ${HOY_GUION}; "hoy" no puede ser anterior.`);
  }
  return new Guion(op.userId.toLowerCase(), op.empresaId.toLowerCase(), hoy, String(op.semilla ?? 'valle-del-norte'), op.transaccion ?? true).armar();
}

interface Captura {
  clave: string; // 'p:<id>' | 'x:<id>'
  presupuestoId: string | null;
  extraRenglonId: string | null;
  fecha: string;
  cantidad: number;
}

interface ConceptoObra {
  clave: string;
  presupuestoId: string | null;
  extraRenglonId: string | null;
  concepto: string;
  unidad: string;
  seccion: string | null;
  cantidad: number;
  precio: number;
  orden: number;
}

interface AsistenciaG {
  id: string;
  persona: string;
  obra: ClaveObra;
  fecha: string;
  fraccion: number;
  cuadrilla: string | null;
}

interface DestajoG {
  id: string;
  persona: string;
  obra: ClaveObra;
  fecha: string;
  concepto: string;
  monto: number;
  cuadrilla: string | null;
}

interface MovG {
  id: string;
  obra: ClaveObra;
  fecha: string;
  tipo: 'ENTRADA' | 'SALIDA';
  categoria: string;
  concepto: string;
  monto: number;
  metodo: string;
  referencia?: string;
  nombre?: string;
  categoriaCosto?: 'MANO_OBRA' | 'MATERIAL' | 'SUBCONTRATO' | 'INDIRECTO' | 'OTRO' | null;
  cotizacionId?: string | null;
}

class Guion {
  private readonly L: string[] = [];
  private readonly conteos: Record<string, number> = {};
  private readonly salidasPorObra = new Map<ClaveObra, number>();
  private readonly nominaEnCaja = new Map<ClaveObra, number>();
  private readonly rayaTotal = new Map<ClaveObra, number>();
  // Campos explícitos (no "parameter properties"): Node solo quita tipos que se
  // pueden borrar, y el script de línea de comandos importa este archivo tal cual.
  private readonly userId: string;
  private readonly empresaId: string;
  private readonly hoy: string;
  private readonly semilla: string;
  private readonly transaccion: boolean;

  constructor(userId: string, empresaId: string, hoy: string, semilla: string, transaccion: boolean) {
    this.userId = userId;
    this.empresaId = empresaId;
    this.hoy = hoy;
    this.semilla = semilla;
    this.transaccion = transaccion;
  }

  // ── herramientas de armado ────────────────────────────────────────────────

  private id(etiqueta: string): string {
    return uuidDe(this.empresaId, etiqueta);
  }

  private azar(etiqueta: string): () => number {
    return mulberry32(hash32(`${this.semilla}:${etiqueta}`));
  }

  private sql(s: string): void {
    this.L.push(s);
  }

  private comentario(s: string): void {
    this.L.push('', `-- ── ${s} ${'─'.repeat(Math.max(3, 70 - s.length))}`);
  }

  private contar(tabla: string, n = 1): void {
    this.conteos[tabla] = (this.conteos[tabla] ?? 0) + n;
  }

  private insertar(tabla: string, filas: Fila[], porLote = 150): void {
    if (filas.length === 0) return;
    this.contar(tabla, filas.length);
    const grupos = new Map<string, Fila[]>();
    for (const f of filas) {
      const firma = Object.keys(f).join(',');
      const g = grupos.get(firma);
      if (g) g.push(f);
      else grupos.set(firma, [f]);
    }
    for (const [firma, g] of grupos) {
      for (let i = 0; i < g.length; i += porLote) {
        const lote = g.slice(i, i + porLote);
        const valores = lote.map((f) => `(${Object.values(f).map(lit).join(', ')})`).join(',\n    ');
        this.sql(`insert into public.${tabla} (${firma}) values\n    ${valores};`);
      }
    }
  }

  /** Llama una RPC que devuelve `{ ok }` y detiene todo si no salió bien. */
  private rpc(llamada: string, contexto: string): void {
    this.sql(`_r := ${llamada};`);
    this.sql(
      `if coalesce((_r ->> 'ok')::boolean, false) is not true then raise exception 'DEMO: % falló: %', ${lit(contexto)}, _r::text; end if;`,
    );
  }

  private comoDueno(): void {
    this.sql(
      `perform set_config('request.jwt.claims', json_build_object('sub', _uid::text, 'role', 'authenticated')::text, true);`,
      );
    this.sql(`perform set_config('request.jwt.claim.sub', _uid::text, true);`);
    this.sql(`perform set_config('request.jwt.claim.role', 'authenticated', true);`);
    this.sql('set local role authenticated;');
  }

  /** Solo para lo que haría alguien SIN cuenta en la demo. Siempre se regresa con `comoDueno()`. */
  private comoSistema(motivo: string): void {
    this.sql(`-- COMO SISTEMA: ${motivo}`);
    this.sql('reset role;');
    this.sql(`perform set_config('request.jwt.claims', '', true);`);
    this.sql(`perform set_config('request.jwt.claim.sub', '', true);`);
    this.sql(`perform set_config('request.jwt.claim.role', '', true);`);
  }

  private uuidTexto(id: string): Crudo {
    return crudo(`'${id}'::uuid`);
  }

  /** Hora de captura "realista" dentro del día. */
  private sello(fecha: string, r: () => number, desde = 8, hasta = 18): number {
    const minutos = Math.floor(r() * (hasta - desde) * 60);
    return ms(fecha, desde) + minutos * 60_000;
  }

  private movimiento(m: MovG, r: () => number): Fila {
    if (m.fecha > this.hoy) throw new Error(`Movimiento con fecha futura: ${m.concepto} ${m.fecha}`);
    if (m.tipo === 'SALIDA') {
      this.salidasPorObra.set(m.obra, r2((this.salidasPorObra.get(m.obra) ?? 0) + m.monto));
      if (m.categoria === 'NOMINA') this.nominaEnCaja.set(m.obra, r2((this.nominaEnCaja.get(m.obra) ?? 0) + m.monto));
    }
    const t = this.sello(m.fecha, r, 9, 19);
    return {
      id: m.id,
      empresa_id: this.empresaId,
      obra_id: this.obraId(m.obra),
      fecha: ms(m.fecha, 12),
      tipo: m.tipo,
      categoria: m.categoria,
      concepto: m.concepto,
      monto: dinero(m.monto),
      metodo_pago: m.metodo,
      referencia: m.referencia ?? '',
      nombre: m.nombre ?? '',
      categoria_costo: m.categoriaCosto ?? null,
      cotizacion_id: m.cotizacionId ?? null,
      created_at: t,
      updated_at: t,
    };
  }

  private obraId(k: ClaveObra): string {
    return this.id(`obra:${k}`);
  }
  private personaId(k: string): string {
    return this.id(`colaborador:${k}`);
  }
  private cuadrillaId(k: string): string {
    return this.id(`cuadrilla:${k}`);
  }
  private clienteId(k: string): string {
    return this.id(`cliente:${k}`);
  }
  private partidaId(obra: ClaveObra, clave: string): string {
    return this.id(`presupuesto:${obra}:${clave}`);
  }
  private extraRenglonId(extra: string, i: number): string {
    return this.id(`extra:${extra}:renglon:${i}`);
  }

  private persona(k: string): Persona {
    const x = GENTE.find((g) => g.key === k);
    if (!x) throw new Error(`Persona desconocida en el guion: ${k}`);
    return x;
  }

  private salarioDia(k: string): number {
    const g = this.persona(k);
    if (g.sueldo) return g.sueldo;
    const pu = PUESTOS.find((x) => x[0] === g.puesto);
    return pu ? pu[2] : 0;
  }

  private obra(k: ClaveObra): ObraGuion {
    const o = OBRAS.find((x) => x.clave === k);
    if (!o) throw new Error(`Obra desconocida: ${k}`);
    return o;
  }

  private finObra(k: ClaveObra): string {
    return this.obra(k).fin ?? this.hoy;
  }

  // ── armado ────────────────────────────────────────────────────────────────

  armar(): DemoGenerado {
    const marca = this.obraId('A');

    // Todo lo que depende del azar se calcula antes de escribir SQL, porque la
    // calibración del costo necesita la raya, el avance y las compras juntos.
    const asistencias = this.planAsistencias();
    const destajos = this.planDestajos(asistencias);
    const captura = this.planAvance();
    for (const o of OBRAS) this.avanceFisicoFinal.set(o.clave, this.avanceFisico(o.clave, captura));

    this.encabezado(marca);
    this.empresa();
    this.catalogo();
    this.clientesYFiscal();
    this.gente();
    this.cotizaciones();
    this.obras();
    this.pasesDeLista(asistencias, destajos);
    this.raya(asistencias, destajos);
    this.extras();
    this.avance(captura);
    this.estimaciones(captura);
    this.cobrosObra();
    this.notasYSubcontratos();
    this.compras(captura);
    this.costosDeCierre(captura);
    this.cumplimiento();
    this.bitacoraYPrograma(asistencias, captura);
    this.seguridad(asistencias);
    this.herramienta();
    this.postventa();
    this.fiscalCobros();
    this.cierre();

    const resumenObras = OBRAS.map((o) => this.resumenObra(o.clave, captura));
    return {
      sql: this.L.join('\n'),
      resumen: {
        marcaObraId: marca,
        obras: resumenObras,
        conteos: { ...this.conteos },
        nombreEmpresa: NOMBRE_EMPRESA_DEMO,
      },
    };
  }

  // ── 0. Encabezado y candado ──────────────────────────────────────────────

  private encabezado(marca: string): void {
    this.L.push(
      '-- ════════════════════════════════════════════════════════════════════════',
      `-- DATOS DEMO: "${NOMBRE_EMPRESA_DEMO}" — seis meses (${INICIO_GUION} → ${this.hoy})`,
      `-- Generado por web/src/db/seed/demo-seis-meses.ts (semilla: ${this.semilla.replace(/[^\w.-]/g, '_')})`,
      `-- Empresa: ${this.empresaId} · Dueño (admin): ${this.userId}`,
      '-- Todo es ficticio. Seguro de re-ejecutar: si la obra marca ya existe, no hace nada.',
      '-- ════════════════════════════════════════════════════════════════════════',
    );
    if (this.transaccion) this.L.push('begin;');
    this.L.push('do $demo$', 'declare', '  _r jsonb;', `  _uid uuid := '${this.userId}';`, `  _emp uuid := '${this.empresaId}';`, 'begin');
    this.sql(`if exists (select 1 from public.obras where id = '${marca}') then`);
    this.sql(`  raise notice 'Demo ya sembrado en la empresa %: no se vuelve a sembrar.', _emp;`);
    this.sql('  return;');
    this.sql('end if;');
    this.sql(
      `if not exists (select 1 from public.usuarios_empresa where user_id = _uid and empresa_id = _emp and rol = 'admin') then`,
    );
    this.sql(`  raise exception 'DEMO: el usuario % no es admin de la empresa %', _uid, _emp;`);
    this.sql('end if;');
    this.comentario('empresa_config existe (la crean crear_empresa y el backfill de 0035)');
    this.comoSistema('asegurar la fila de configuración antes de actuar como el dueño');
    this.sql('insert into public.empresa_config (empresa_id) values (_emp) on conflict (empresa_id) do nothing;');
    this.comoDueno();
  }

  // ── 1. Empresa ───────────────────────────────────────────────────────────

  private empresa(): void {
    this.comentario('Empresa: nombre, IVA, PDF, módulos, margen y emisor fiscal');
    const t = ms(INICIO_GUION, 10);
    this.sql(`update public.empresas set nombre = ${lit(NOMBRE_EMPRESA_DEMO)} where id = _emp;`);
    const pdf = {
      empresaContacto: 'Av. Miguel Alemán 1450, Apodaca, N.L. · Tel. 81 8354 2210',
      colorHex: '#1E5B8C',
      pieDePagina: 'Edificaciones Valle del Norte, S.A. de C.V. · Construimos con orden.',
      watermark: '',
      mayusculas: false,
      modoCompacto: false,
      firmaIzquierda: 'Dirección de obra',
      firmaDerecha: 'Recibí de conformidad',
    };
    const textos = {
      cotizacion:
        'Precios en pesos mexicanos, vigentes por 30 días. Incluye materiales y mano de obra descritos; no incluye permisos, licencias ni trabajos no indicados.',
    };
    this.sql(
      `update public.empresa_config set iva_porcentaje = 16, pdf_config = ${lit(JSON.stringify(pdf))}::jsonb, pdf_textos = ${lit(JSON.stringify(textos))}::jsonb, modulos = public.modulos_catalogo(), perfil = coalesce(perfil, '{}'::jsonb) || jsonb_build_object('demo', jsonb_build_object('guion', 'seis-meses', 'desde', ${lit(INICIO_GUION)}, 'hasta', ${lit(this.hoy)})), updated_at = ${t} where empresa_id = _emp;`,
    );
    this.sql(
      `insert into public.empresa_margen (empresa_id, margen_objetivo, created_at, updated_at) values (_emp, 15, ${t}, ${t}) on conflict (empresa_id) do update set margen_objetivo = 15, deleted_at = null, updated_at = ${t};`,
    );
    this.sql(
      `insert into public.empresa_fiscal (empresa_id, rfc, razon_social, regimen, cp_fiscal, created_at, updated_at) values (_emp, 'EVN180614QK3', 'EDIFICACIONES VALLE DEL NORTE', '601', '66600', ${t}, ${t}) on conflict (empresa_id) do update set rfc = excluded.rfc, razon_social = excluded.razon_social, regimen = excluded.regimen, cp_fiscal = excluded.cp_fiscal, deleted_at = null, updated_at = excluded.updated_at;`,
    );
    this.contar('empresa_fiscal');
  }

  // ── 2. Catálogo de conceptos ─────────────────────────────────────────────

  private catalogo(): void {
    this.comentario('Catálogo de conceptos (precios 2026 y claves SAT sugeridas)');
    const t = ms(INICIO_GUION, 11);
    // Los 10 conceptos que siembra crear_empresa traen precios de hace años.
    const al2026: [string, number][] = [
      ['MAT-001', 268],
      ['MAT-002', 178],
      ['MAT-003', 450],
      ['MAT-004', 510],
      ['MAT-005', 15],
      ['MO-001', 620],
      ['MO-002', 430],
      ['SER-001', 215],
      ['SER-002', 260],
      ['SER-003', 950],
    ];
    for (const [clave, precio] of al2026) {
      this.sql(
        `update public.catalogo_conceptos set precio_unitario_default = ${precio}, updated_at = ${t} where empresa_id = _emp and clave = ${lit(clave)} and deleted_at is null;`,
      );
    }
    const propios: [string, string, string, number, string, string, string][] = [
      ['PRE-01', 'Trazo y nivelación del terreno', 'M2', 33, 'Preliminares', SAT.apoyo, 'MTK'],
      ['PRE-02', 'Demolición de muros y retiro de escombro', 'M2', 310, 'Preliminares', SAT.demolicion, 'MTK'],
      ['PRE-03', 'Excavación para cimentación', 'M3', 215, 'Preliminares', SAT.excavacion, 'MTQ'],
      ['CIM-01', "Losa de cimentación f'c 250 armada", 'M3', 5650, 'Cimentación', SAT.albanileria, 'MTQ'],
      ['CIM-02', 'Zapatas y contratrabes de concreto armado', 'M3', 5200, 'Cimentación', SAT.albanileria, 'MTQ'],
      ['EST-01', 'Muro de block 15x20x40 junteado', 'M2', 610, 'Estructura', SAT.albanileria, 'MTK'],
      ['EST-02', 'Castillos y dalas de concreto armado', 'ML', 360, 'Estructura', SAT.albanileria, 'MTR'],
      ['EST-03', 'Losa de vigueta y bovedilla', 'M2', 1340, 'Estructura', SAT.albanileria, 'MTK'],
      ['EST-04', 'Estructura metálica y cubierta', 'M2', 1650, 'Estructura', SAT.techado, 'MTK'],
      ['EST-05', "Firme de concreto f'c 250 con malla", 'M2', 520, 'Estructura', SAT.albanileria, 'MTK'],
      ['INS-01', 'Instalación hidrosanitaria por casa', 'LOTE', 56000, 'Instalaciones', SAT.plomeria, 'E48'],
      ['INS-02', 'Instalación eléctrica por casa', 'LOTE', 49000, 'Instalaciones', SAT.electrica, 'E48'],
      ['ACA-01', 'Aplanado de yeso en muros', 'M2', 190, 'Acabados', SAT.albanileria, 'MTK'],
      ['ACA-02', 'Piso cerámico 60x60 con zoclo', 'M2', 560, 'Acabados', SAT.albanileria, 'MTK'],
      ['ACA-03', 'Pintura vinílica interior y exterior', 'M2', 99, 'Acabados', SAT.pintura, 'MTK'],
      ['ACA-04', 'Impermeabilización acrílica 5 años', 'M2', 245, 'Acabados', SAT.impermeabilizacion, 'MTK'],
      ['ACA-05', 'Carpintería: puertas y clósets', 'LOTE', 48000, 'Acabados', SAT.carpinteria, 'E48'],
      ['ACA-06', 'Remodelación completa de baño', 'PIEZA', 58000, 'Acabados', SAT.remodelacion, 'H87'],
    ];
    this.insertar(
      'catalogo_conceptos',
      propios.map(([clave, descripcion, unidad, precio, categoria, claveSat, unidadSat], i) => ({
        id: this.id(`catalogo:${clave}`),
        empresa_id: this.empresaId,
        clave,
        descripcion,
        unidad,
        precio_unitario_default: precio,
        categoria,
        es_personalizado: true,
        clave_sat: claveSat,
        unidad_sat: unidadSat,
        orden: (i + 1) * 100,
        created_at: t,
        updated_at: t,
      })),
    );
  }

  // ── 3. Clientes y sus datos fiscales ─────────────────────────────────────

  private clientesYFiscal(): void {
    this.comentario('Clientes (solo registros: sin cuenta en el portal)');
    const r = this.azar('clientes');
    this.insertar(
      'clientes',
      CLIENTES.map((c, i) => {
        const t = this.sello(sumarDias(INICIO_GUION, i * 3), r);
        return {
          id: this.clienteId(c.key),
          empresa_id: this.empresaId,
          nombre: c.nombre,
          email: c.email,
          telefono: c.telefono,
          created_at: t,
          updated_at: t,
        };
      }),
    );
    const sinConfirmar = CLIENTES.filter((c) => c.fiscal && !c.fiscal.confirmado);
    const confirmados = CLIENTES.filter((c) => c.fiscal?.confirmado);
    const fila = (c: (typeof CLIENTES)[number]): Fila => {
      const f = c.fiscal!;
      const t = ms(f.confirmado ?? '2026-04-10', 16);
      return {
        cliente_id: this.clienteId(c.key),
        empresa_id: this.empresaId,
        rfc: f.rfc,
        razon_social: f.razon,
        regimen: f.regimen,
        cp_fiscal: f.cp,
        uso_cfdi: f.uso,
        correo_factura: f.correo,
        ...(f.confirmado ? { fiscales_confirmados_at: t } : {}),
        created_at: t,
        updated_at: t,
      };
    };
    this.insertar('cliente_fiscal', sinConfirmar.map(fila));
    // Confirmar los datos es algo que hace el CLIENTE desde el portal; en la
    // demo no tienen cuenta. Se inserta sin JWT para que el trigger de 0037
    // conserve la confirmación (con JWT de la oficina la borraría, a propósito).
    this.comoSistema('datos fiscales que el cliente confirmó desde el portal (sin cuenta en la demo)');
    this.insertar('cliente_fiscal', confirmados.map(fila));
    this.comoDueno();
  }

  // ── 4. Puestos, colaboradores, sueldos, cuadrillas ──────────────────────

  private gente(): void {
    this.comentario('Puestos, colaboradores, sueldos y cuadrillas');
    const r = this.azar('gente');
    const t0 = ms(INICIO_GUION, 9);
    this.insertar(
      'puestos',
      PUESTOS.map(([key, nombre, salario], i) => ({
        id: this.id(`puesto:${key}`),
        empresa_id: this.empresaId,
        nombre,
        salario_dia_default: salario,
        orden: (i + 1) * 100,
        created_at: t0,
        updated_at: t0,
      })),
    );
    const ingreso = this.ingresos();
    const tel = () => `81 ${1000 + Math.floor(r() * 8999)} ${1000 + Math.floor(r() * 8999)}`;
    this.insertar(
      'colaboradores',
      GENTE.map((g, i) => {
        const t = this.sello(ingreso.get(g.key) ?? INICIO_GUION, r, 7, 9);
        return {
          id: this.personaId(g.key),
          empresa_id: this.empresaId,
          nombre: g.nombre,
          puesto_id: this.id(`puesto:${g.puesto}`),
          tipo_pago: g.tipo,
          telefono: tel(),
          contacto_nombre: g.contacto[0],
          contacto_telefono: tel(),
          contacto_parentesco: g.contacto[1],
          activo: !g.baja,
          orden: (i + 1) * 100,
          created_at: t,
          updated_at: g.baja ? ms(g.baja, 18) : t,
        };
      }),
    );
    // El sueldo vive SOLO en `colaborador_sueldo` (0027): en producción la 0029
    // ya quitó esas columnas de `colaboradores`. Lo escribe el dueño por RLS.
    // Quien no tiene fila cobra el salario de su puesto (así calcula la raya).
    this.insertar(
      'colaborador_sueldo',
      GENTE.filter((g) => g.sueldo).map((g) => {
        const t = ms(ingreso.get(g.key) ?? INICIO_GUION, 9);
        return {
          colaborador_id: this.personaId(g.key),
          empresa_id: this.empresaId,
          salario_personalizado: g.sueldo!,
          periodo_pago: 'SEMANAL',
          salario_periodo: g.sueldo! * 6,
          dias_semana: 6,
          created_at: t,
          updated_at: t,
        };
      }),
    );
    // La cuadrilla nace sin jefe (FK diferible, pero así no depende del orden).
    this.insertar(
      'cuadrillas',
      CUADRILLAS.map((c, i) => ({
        id: this.cuadrillaId(c.key),
        empresa_id: this.empresaId,
        nombre: c.nombre,
        especialidad: c.especialidad,
        jefe_colaborador_id: this.personaId(c.jefe),
        activa: true,
        orden: (i + 1) * 100,
        created_at: ms(c.obras[0][1], 8),
        updated_at: ms(c.obras[0][1], 8),
      })),
    );
    const miembros: Fila[] = [];
    for (const c of CUADRILLAS) {
      c.miembros.forEach(([k, desde, hasta], i) => {
        const d = desde ?? c.obras[0][1];
        miembros.push({
          cuadrilla_id: this.cuadrillaId(c.key),
          colaborador_id: this.personaId(k),
          empresa_id: this.empresaId,
          fecha_ingreso: ms(d),
          fecha_salida: hasta ? ms(hasta) : null,
          orden: (i + 1) * 100,
          created_at: ms(d, 8),
          updated_at: ms(hasta ?? d, 8),
        });
      });
    }
    this.insertar('cuadrilla_miembro', miembros);
  }

  /** Primer día de trabajo de cada persona (para fechas de alta). */
  private ingresos(): Map<string, string> {
    const m = new Map<string, string>();
    const ver = (k: string, f: string) => {
      const a = m.get(k);
      if (!a || f < a) m.set(k, f);
    };
    for (const c of CUADRILLAS) {
      for (const [k, desde] of c.miembros) ver(k, desde ?? c.obras[0][1]);
    }
    for (const [k, , desde] of SUELTOS) ver(k, desde);
    return m;
  }

  // ── 5. Cotizaciones (incluye las que dieron origen a obras) ─────────────

  private cotizaciones(): void {
    this.comentario('Cotizaciones: convertidas, aceptada con pagos, rechazada, enviada y una en borrador');
    const r = this.azar('cotizaciones');
    interface Cot {
      key: string;
      cliente: string;
      proyecto: string;
      ubicacion: string;
      fecha: string;
      estado: string;
      obra?: ClaveObra;
      notas: string;
      secciones: [string, [clave: string, desc: string, unidad: string, cant: number, precio: number, sat: string, unidadSat: string][]][];
      pagos?: [fecha: string, monto: number, metodo: string, concepto: string][];
      ultimo: string;
    }
    const deObra = (k: ClaveObra): Cot['secciones'] => {
      const secs: Cot['secciones'] = [];
      for (const pa of this.obra(k).partidas) {
        let s = secs.find((x) => x[0] === pa.seccion);
        if (!s) {
          s = [pa.seccion, []];
          secs.push(s);
        }
        s[1].push([pa.clave, pa.concepto, pa.unidad, pa.cantidad, pa.precio, pa.claveSat, pa.unidadSat]);
      }
      return secs;
    };
    const cots: Cot[] = [
      {
        key: 'garza',
        cliente: 'garza',
        proyecto: 'Remodelación y ampliación casa Garza Leal',
        ubicacion: this.obra('B').ubicacion,
        fecha: '2026-03-30',
        estado: 'CONVERTIDA',
        obra: 'B',
        notas: 'Tiempo estimado: 5 meses. Anticipo del 40 % y pagos contra avance.',
        secciones: deObra('B'),
        ultimo: '2026-04-15',
      },
      {
        key: 'sendero',
        cliente: 'sendero',
        proyecto: 'Local comercial para farmacia — Av. Sendero',
        ubicacion: this.obra('C').ubicacion,
        fecha: '2026-05-18',
        estado: 'CONVERTIDA',
        obra: 'C',
        notas: 'Obra llave en mano sin mobiliario de farmacia. Anticipo del 35 %.',
        secciones: deObra('C'),
        ultimo: '2026-06-12',
      },
      {
        key: 'elizondo',
        cliente: 'elizondo',
        proyecto: 'Impermeabilización de azotea',
        ubicacion: 'Col. Contry, Monterrey, N.L.',
        fecha: '2026-04-27',
        estado: 'ACEPTADA',
        notas: 'Trabajo de una semana; se realizó con personal de la cuadrilla Ibarra.',
        secciones: [
          [
            'Impermeabilización',
            [
              ['IMP-01', 'Limpieza y resane de azotea', 'm²', 115, 38, SAT.impermeabilizacion, 'MTK'],
              ['IMP-02', 'Impermeabilizante acrílico 5 años con malla de refuerzo', 'm²', 115, 235, SAT.impermeabilizacion, 'MTK'],
              ['IMP-03', 'Chaflanes y sellado de bajantes', 'lote', 1, 2800, SAT.impermeabilizacion, 'E48'],
            ],
          ],
        ],
        pagos: [
          ['2026-05-06', 0, 'TRANSFERENCIA', 'Anticipo 50 %'],
          ['2026-05-16', 0, 'EFECTIVO', 'Liquidación'],
        ],
        ultimo: '2026-05-16',
      },
      {
        key: 'cantu',
        cliente: 'cantu',
        proyecto: 'Barda perimetral y portón',
        ubicacion: 'Col. Anáhuac, San Nicolás de los Garza, N.L.',
        fecha: '2026-06-08',
        estado: 'RECHAZADA',
        notas: 'El cliente decidió esperar al próximo año.',
        secciones: [
          [
            'Barda',
            [
              ['BAR-01', 'Cimentación corrida de concreto', 'ml', 42, 980, SAT.albanileria, 'MTR'],
              ['BAR-02', 'Muro de block de 2.4 m de altura con castillos', 'm²', 101, 620, SAT.albanileria, 'MTK'],
              ['BAR-03', 'Portón corredizo de herrería con motor', 'pza', 1, 42000, SAT.apoyo, 'H87'],
            ],
          ],
        ],
        ultimo: '2026-06-20',
      },
      {
        key: 'lozano',
        cliente: 'lozano',
        proyecto: 'Remodelación de oficinas del despacho',
        ubicacion: 'Col. del Valle, San Pedro Garza García, N.L.',
        fecha: '2026-09-07',
        estado: 'ENVIADA',
        notas: 'Trabajo en fines de semana para no interrumpir al despacho.',
        secciones: [
          [
            'Oficinas',
            [
              ['OF-01', 'Muros divisorios de tablaroca', 'm²', 86, 420, SAT.albanileria, 'MTK'],
              ['OF-02', 'Plafón reticular con lámparas LED', 'm²', 140, 380, SAT.apoyo, 'MTK'],
              ['OF-03', 'Piso vinílico tipo madera', 'm²', 140, 460, SAT.albanileria, 'MTK'],
              ['OF-04', 'Pintura vinílica', 'm²', 390, 92, SAT.pintura, 'MTK'],
            ],
          ],
        ],
        ultimo: '2026-09-10',
      },
      {
        key: 'salinas',
        cliente: 'salinas',
        proyecto: 'Ampliación de consultorio dental',
        ubicacion: 'Col. Mitras Centro, Monterrey, N.L.',
        fecha: '2026-09-24',
        estado: 'BORRADOR',
        notas: 'Pendiente confirmar medidas del cubículo de rayos X.',
        secciones: [
          [
            'Ampliación',
            [
              ['CD-01', 'Muros de block de 15 cm', 'm²', 38, 560, SAT.albanileria, 'MTK'],
              ['CD-02', 'Losa de vigueta y bovedilla', 'm²', 24, 1340, SAT.albanileria, 'MTK'],
              ['CD-03', 'Instalación eléctrica y datos', 'lote', 1, 28500, SAT.electrica, 'E48'],
            ],
          ],
          ['Acabados', [['CD-04', 'Piso vinílico sanitario', 'm²', 24, 690, SAT.albanileria, 'MTK']]],
        ],
        ultimo: '2026-09-24',
      },
    ];

    const secciones: Fila[] = [];
    const partidas: Fila[] = [];
    const pagos: Fila[] = [];
    const cotFilas: Fila[] = [];
    cots.forEach((c, ci) => {
      const id = this.id(`cotizacion:${c.key}`);
      const t = this.sello(c.fecha, r);
      const tu = this.sello(c.ultimo, r);
      let subtotal = 0;
      c.secciones.forEach(([nombre, ps], si) => {
        const sid = this.id(`cotizacion:${c.key}:seccion:${si}`);
        secciones.push({ id: sid, empresa_id: this.empresaId, cotizacion_id: id, nombre, orden: si, created_at: t, updated_at: t });
        ps.forEach(([clave, desc, unidad, cant, precio, sat, usat], pi) => {
          subtotal += cant * precio;
          partidas.push({
            id: this.id(`cotizacion:${c.key}:partida:${clave}`),
            empresa_id: this.empresaId,
            seccion_id: sid,
            clave,
            descripcion: desc,
            unidad,
            cantidad: cant,
            precio_unitario: precio,
            orden: pi,
            clave_sat: sat,
            unidad_sat: usat,
            created_at: t,
            updated_at: t,
          });
        });
      });
      const totalConIva = r2(subtotal * 1.16);
      cotFilas.push({
        id,
        empresa_id: this.empresaId,
        cliente: this.clienteNombre(c.cliente),
        cliente_id: this.clienteId(c.cliente),
        nombre_proyecto: c.proyecto,
        ubicacion: c.ubicacion,
        fecha: ms(c.fecha, 12),
        estado: 'BORRADOR',
        iva_enabled: true,
        iva_porcentaje: 16,
        descuento: 0,
        notas: c.notas,
        orden: (ci + 1) * 100,
        created_at: t,
        updated_at: tu,
      });
      (c.pagos ?? []).forEach(([f, , metodo, concepto], i, arr) => {
        const monto = i < arr.length - 1 ? r2(totalConIva / 2) : r2(totalConIva - r2(totalConIva / 2));
        const tp = this.sello(f, r);
        pagos.push({
          id: this.id(`pago:${c.key}:${i}`),
          empresa_id: this.empresaId,
          cotizacion_id: id,
          fecha: ms(f, 12),
          monto,
          metodo,
          concepto,
          referencia: metodo === 'TRANSFERENCIA' ? `SPEI ${Math.floor(1e6 + r() * 8e6)}` : null,
          created_at: tp,
          updated_at: tp,
        });
      });
    });
    this.insertar('cotizaciones', cotFilas);
    this.insertar('secciones', secciones);
    this.insertar('partidas', partidas);
    // Estados finales (la web hace estos cambios uno por uno; aquí de una vez).
    const aceptadas: { id: string; tu: number }[] = [];
    for (const c of cots) {
      const id = this.id(`cotizacion:${c.key}`);
      const tu = ms(c.ultimo, 13);
      if (c.estado === 'BORRADOR') continue;
      const aceptada = c.estado === 'ACEPTADA' || c.estado === 'CONVERTIDA';
      this.sql(
        `update public.cotizaciones set estado = ${lit(aceptada ? 'ACEPTADA' : c.estado)}, updated_at = ${tu} where id = '${id}';`,
      );
      if (aceptada) aceptadas.push({ id, tu });
    }
    // La foto de lo aprobado: en producción `_cotizacion_snapshot` NO se puede
    // ejecutar con la sesión de un usuario (se revocó a mano el 2026-07-20 y
    // 0046 lo registra); la web arma la misma foto en TS. Aquí se toma como
    // sistema, solo esa columna, y se regresa enseguida a actuar como el dueño.
    if (aceptadas.length > 0) {
      this.comoSistema('foto de lo aprobado en cotizaciones aceptadas (_cotizacion_snapshot está revocada a usuarios)');
      for (const { id, tu } of aceptadas) {
        this.sql(
          `update public.cotizaciones set aprobado_snapshot_json = public._cotizacion_snapshot('${id}')::text, updated_at = ${tu} where id = '${id}';`,
        );
      }
      this.comoDueno();
    }
    this.pendientesConversion = cots.filter((c) => c.obra).map((c) => ({ id: this.id(`cotizacion:${c.key}`), obra: c.obra!, fecha: c.ultimo }));
    this.insertar('pagos', pagos);
  }

  private pendientesConversion: { id: string; obra: ClaveObra; fecha: string }[] = [];

  private clienteNombre(k: string): string {
    const c = CLIENTES.find((x) => x.key === k);
    if (!c) throw new Error(`Cliente desconocido: ${k}`);
    return c.nombre;
  }

  // ── 6. Obras, presupuesto, contrato, equipo ─────────────────────────────

  private obras(): void {
    this.comentario('Obras, presupuesto, margen objetivo, contrato y equipo asignado');
    const r = this.azar('obras');
    const origen = new Map(this.pendientesConversion.map((x) => [x.obra, x.id]));
    this.insertar(
      'obras',
      OBRAS.map((o, i) => {
        const t = this.sello(sumarDias(o.inicio, -3), r);
        return {
          id: this.obraId(o.clave),
          empresa_id: this.empresaId,
          nombre: o.nombre,
          cliente: this.clienteNombre(o.clienteKey),
          cliente_id: this.clienteId(o.clienteKey),
          ubicacion: o.ubicacion,
          fecha_inicio: ms(o.inicio),
          activa: true,
          avance: 0,
          cotizacion_origen_id: origen.get(o.clave) ?? null,
          orden: (i + 1) * 100,
          created_at: t,
          updated_at: t,
        };
      }),
    );
    for (const x of this.pendientesConversion) {
      this.sql(
        `update public.cotizaciones set estado = 'CONVERTIDA', obra_id = '${this.obraId(x.obra)}', updated_at = ${ms(x.fecha, 14)} where id = '${x.id}';`,
      );
    }
    const pres: Fila[] = [];
    for (const o of OBRAS) {
      const t = ms(sumarDias(o.inicio, -2), 11);
      o.partidas.forEach((pa, i) => {
        pres.push({
          id: this.partidaId(o.clave, pa.clave),
          empresa_id: this.empresaId,
          obra_id: this.obraId(o.clave),
          seccion: pa.seccion,
          // Como `convertirCotizacionEnObra`: "clave descripción".
          concepto: `${pa.clave} ${pa.concepto}`,
          unidad: pa.unidad,
          cantidad: pa.cantidad,
          precio_unitario: pa.precio,
          orden: i,
          clave_sat: pa.claveSat,
          unidad_sat: pa.unidadSat,
          created_at: t,
          updated_at: t,
        });
      });
    }
    this.insertar('obra_presupuesto', pres);
    this.insertar(
      'obra_margen_objetivo',
      OBRAS.filter((o) => o.margenObjetivoObra !== undefined).map((o) => ({
        obra_id: this.obraId(o.clave),
        empresa_id: this.empresaId,
        margen_objetivo: o.margenObjetivoObra!,
        created_at: ms(o.inicio, 9),
        updated_at: ms(o.inicio, 9),
      })),
    );
    this.sql(
      `insert into public.obra_caja_nota (obra_id, empresa_id, nota, updated_at) values ('${this.obraId('A')}', _emp, ${lit(
        'Anticipo depositado en la cuenta terminación 4471. Las estimaciones se cobran por transferencia a 10 días de autorizadas; la desarrolladora retiene 5 % de fondo de garantía.',
      )}, ${ms('2026-04-03', 17)});`,
    );
    this.contar('obra_caja_nota');

    // Asignaciones de cuadrilla a obra y el equipo de cada obra.
    const asig: Fila[] = [];
    const equipo = new Map<string, { obra: ClaveObra; persona: string; desde: string; hasta: string }>();
    const anotar = (obra: ClaveObra, persona: string, desde: string, hasta: string) => {
      const k = `${obra}:${persona}`;
      const a = equipo.get(k);
      if (!a) equipo.set(k, { obra, persona, desde, hasta });
      else {
        if (desde < a.desde) a.desde = desde;
        if (hasta > a.hasta) a.hasta = hasta;
      }
    };
    for (const c of CUADRILLAS) {
      c.obras.forEach(([obra, desde, hasta, fase], i) => {
        const fin = hasta >= this.hoy ? null : hasta;
        asig.push({
          id: this.id(`asignacion:${c.key}:${i}`),
          empresa_id: this.empresaId,
          cuadrilla_id: this.cuadrillaId(c.key),
          obra_id: this.obraId(obra),
          fecha_inicio: ms(desde),
          fecha_fin: fin ? ms(fin) : null,
          fase,
          created_at: ms(desde, 7),
          updated_at: ms(fin ?? desde, 7),
        });
        for (const [k, md, mh] of c.miembros) {
          const d = md && md > desde ? md : desde;
          const h = mh && mh < hasta ? mh : hasta;
          if (d <= h) anotar(obra, k, d, h);
        }
      });
    }
    for (const [k, obra, desde, hasta] of SUELTOS) anotar(obra, k, desde, hasta);
    this.insertar('asignacion_cuadrilla_obra', asig);
    this.insertar(
      'obra_colaborador',
      [...equipo.values()].map((e) => {
        const salida = e.hasta >= this.finObra(e.obra) && !this.obra(e.obra).fin ? null : e.hasta;
        return {
          obra_id: this.obraId(e.obra),
          colaborador_id: this.personaId(e.persona),
          empresa_id: this.empresaId,
          fecha_ingreso: ms(e.desde),
          fecha_salida: salida ? ms(salida) : null,
          created_at: ms(e.desde, 7),
          updated_at: ms(salida ?? e.desde, 7),
        };
      }),
    );
  }

  // ── 7. Pase de lista (asistencias) y destajos ───────────────────────────

  private planAsistencias(): AsistenciaG[] {
    const r = this.azar('asistencias');
    const out: AsistenciaG[] = [];
    const ocupado = new Set<string>();
    const pasar = (persona: string, obra: ClaveObra, desde: string, hasta: string, cuadrilla: string | null, soloLV: boolean) => {
      const fin = hasta > this.finObra(obra) ? this.finObra(obra) : hasta;
      const ultimo = fin > this.hoy ? this.hoy : fin;
      const inc = INCAPACIDAD[persona];
      const baja = this.persona(persona).baja;
      for (const f of rangoDias(desde, ultimo)) {
        const dw = diaSemana(f);
        if (dw === 0 || (soloLV && dw === 6) || FERIADOS.has(f)) continue;
        if (inc && f >= inc[0] && f <= inc[1]) continue;
        if (baja && f > baja) continue;
        const k = `${persona}:${f}`;
        if (ocupado.has(k)) throw new Error(`El guion pone a ${persona} en dos obras el ${f}`);
        ocupado.add(k);
        const x = r();
        if (x < 0.062) continue; // falta
        const fraccion = dw === 6 ? 0.5 : x > 0.985 ? 0.5 : 1;
        out.push({ id: this.id(`asistencia:${persona}:${f}`), persona, obra, fecha: f, fraccion, cuadrilla });
      }
    };
    for (const c of CUADRILLAS) {
      for (const [obra, desde, hasta] of c.obras) {
        for (const [k, md, mh] of c.miembros) {
          const d = md && md > desde ? md : desde;
          const h = mh && mh < hasta ? mh : hasta;
          if (d <= h) pasar(k, obra, d, h, c.key, false);
        }
      }
    }
    for (const [k, obra, desde, hasta, soloLV] of SUELTOS) pasar(k, obra, desde, hasta, null, soloLV);
    return out;
  }

  private planDestajos(asis: AsistenciaG[]): DestajoG[] {
    const r = this.azar('destajos');
    const conceptos: Record<string, Partial<Record<ClaveObra, string>>> = {
      salazar: {
        D: 'Armado de acero y cimbra en zapatas y dados',
        A: 'Armado y cimbrado de castillos, dalas y losas',
        C: 'Armado de zapatas, contratrabes y columnas',
      },
    };
    // Semana (lunes) → obra → persona → días trabajados.
    const semanas = new Map<string, Map<string, number>>();
    for (const a of asis) {
      if (this.persona(a.persona).tipo !== 'DESTAJO') continue;
      const k = `${lunesDe(a.fecha)}|${a.obra}|${a.persona}|${a.cuadrilla ?? ''}`;
      const m = semanas.get(k) ?? new Map<string, number>();
      m.set('dias', (m.get('dias') ?? 0) + a.fraccion);
      semanas.set(k, m);
    }
    const out: DestajoG[] = [];
    for (const [k, m] of [...semanas.entries()].sort((a, b) => a[0].localeCompare(b[0]))) {
      const [lunes, obra, persona, cuadrilla] = k.split('|') as [string, ClaveObra, string, string];
      const dias = m.get('dias') ?? 0;
      if (dias <= 0) continue;
      const g = this.persona(persona);
      const factor = 0.95 + r() * 0.17;
      let concepto: string;
      let monto: number;
      if (persona === 'ismael') {
        const m2 = Math.round(dias * (14 + r() * 4));
        concepto = `Yeso en muros interiores: ${m2} m² × $62`;
        monto = m2 * 62;
      } else if (persona === 'raul') {
        const m2 = Math.round(dias * (9 + r() * 3));
        concepto = `Colocación de piso y azulejo: ${m2} m² × $85`;
        monto = m2 * 85;
      } else {
        concepto = conceptos[cuadrilla]?.[obra] ?? 'Destajo';
        monto = Math.round((dias * (g.tarifaDestajo ?? 0) * factor) / 50) * 50;
      }
      // Se paga el sábado (o el último día trabajado si la obra ya terminó).
      let fecha = sumarDias(lunes, 5);
      const fin = this.finObra(obra);
      if (fecha > fin) fecha = fin;
      if (fecha > this.hoy) fecha = this.hoy;
      out.push({
        id: this.id(`destajo:${persona}:${obra}:${lunes}`),
        persona,
        obra,
        fecha,
        concepto,
        monto,
        cuadrilla: cuadrilla || null,
      });
    }
    return out;
  }

  private pasesDeLista(asis: AsistenciaG[], dest: DestajoG[]): void {
    this.comentario(`Pase de lista: ${asis.length} asistencias y ${dest.length} destajos`);
    const r = this.azar('asistencias:sello');
    this.insertar(
      'asistencias',
      asis.map((a) => {
        const t = this.sello(a.fecha, r, 7, 9);
        return {
          id: a.id,
          empresa_id: this.empresaId,
          colaborador_id: this.personaId(a.persona),
          obra_id: this.obraId(a.obra),
          cuadrilla_id: a.cuadrilla ? this.cuadrillaId(a.cuadrilla) : null,
          fecha: ms(a.fecha),
          fraccion: a.fraccion,
          created_at: t,
          updated_at: t,
        };
      }),
      400,
    );
    this.insertar(
      'destajos',
      dest.map((d) => {
        const t = this.sello(d.fecha, r, 13, 17);
        return {
          id: d.id,
          empresa_id: this.empresaId,
          colaborador_id: this.personaId(d.persona),
          obra_id: this.obraId(d.obra),
          cuadrilla_id: d.cuadrilla ? this.cuadrillaId(d.cuadrilla) : null,
          fecha: ms(d.fecha),
          concepto: d.concepto,
          monto: d.monto,
          created_at: t,
          updated_at: t,
        };
      }),
    );
  }

  // ── 8. Raya semanal pasada a caja ───────────────────────────────────────

  private raya(asis: AsistenciaG[], dest: DestajoG[]): void {
    this.comentario('Raya semanal: una SALIDA "NOMINA" por obra y semana (como el botón "Registrar en caja")');
    const r = this.azar('raya');
    const porSemana = new Map<string, number>();
    const sumar = (obra: ClaveObra, lunes: string, monto: number) => {
      const k = `${obra}|${lunes}`;
      porSemana.set(k, (porSemana.get(k) ?? 0) + monto);
    };
    for (const a of asis) {
      if (this.persona(a.persona).tipo !== 'DIA') continue;
      sumar(a.obra, lunesDe(a.fecha), a.fraccion * this.salarioDia(a.persona));
    }
    for (const d of dest) sumar(d.obra, lunesDe(d.fecha), d.monto);
    const movs: Fila[] = [];
    for (const [k, total] of [...porSemana.entries()].sort((a, b) => a[0].localeCompare(b[0]))) {
      const [obra, lunes] = k.split('|') as [ClaveObra, string];
      const monto = r2(total);
      this.rayaTotal.set(obra, r2((this.rayaTotal.get(obra) ?? 0) + monto));
      // La raya de la última semana del local todavía no se pasa a caja: así se
      // ve la "raya sin caja" en la utilidad.
      if (obra === 'C' && lunes === lunesDe(this.hoy)) continue;
      let fecha = sumarDias(lunes, 5);
      const fin = this.finObra(obra);
      if (fecha > fin) fecha = fin;
      if (fecha > this.hoy) fecha = this.hoy;
      movs.push(
        this.movimiento(
          {
            id: this.id(`nomina:${obra}:${lunes}`),
            obra,
            fecha,
            tipo: 'SALIDA',
            categoria: 'NOMINA',
            concepto: `Nómina ${fechaCorta(lunes)} – ${fechaCorta(sumarDias(lunes, 6))}`,
            monto,
            metodo: 'EFECTIVO',
            categoriaCosto: 'MANO_OBRA',
          },
          r,
        ),
      );
    }
    this.insertar('movimientos', movs);
  }

  // ── 9. Extras ────────────────────────────────────────────────────────────

  private extras(): void {
    this.comentario('Extras: se capturan en borrador, se envían con la RPC y el cliente responde (por oficina)');
    const r = this.azar('extras');
    for (const e of EXTRAS) {
      const id = this.id(`extra:${e.key}`);
      const t = this.sello(e.fecha, r);
      this.insertar('orden_cambio', [
        {
          id,
          empresa_id: this.empresaId,
          obra_id: this.obraId(e.obra),
          titulo: e.titulo,
          motivo: e.motivo,
          fecha: ms(e.fecha, 12),
          created_at: t,
          updated_at: t,
        },
      ]);
      this.insertar(
        'orden_cambio_renglon',
        e.renglones.map(([concepto, unidad, cantidad, precio], i) => ({
          id: this.extraRenglonId(e.key, i),
          empresa_id: this.empresaId,
          orden_cambio_id: id,
          concepto,
          unidad,
          cantidad,
          precio_unitario: precio,
          orden: (i + 1) * 100,
          created_at: t,
          updated_at: t,
        })),
      );
      if (e.final === 'BORRADOR') continue;
      this.rpc(`public.enviar_orden_cambio('${id}'::uuid)`, `enviar extra ${e.key}`);
      if (e.final === 'ENVIADA') continue;
      // No hay RPC "por oficina" para responder un extra: la respuesta del
      // cliente (que no tiene cuenta en la demo) se registra sin JWT, con los
      // mismos campos que llena `responder_orden_cambio`.
      this.comoSistema(`respuesta del cliente al extra ${e.key} (sin cuenta en el portal)`);
      this.sql(
        `update public.orden_cambio set estado = ${lit(e.final)}, respondido_at = (extract(epoch from now()) * 1000)::bigint, respondido_por = null, respondido_nombre = ${lit(e.quien ?? this.clienteNombre(this.obra(e.obra).clienteKey))}, motivo_rechazo = ${lit(e.motivoRechazo ?? null)} where id = '${id}';`,
      );
      this.comoDueno();
    }
  }

  // ── 10. Avance por partida ──────────────────────────────────────────────

  /** Conceptos del contrato de cada obra: presupuesto + renglones de extras aprobados. */
  private conceptosDe(k: ClaveObra): ConceptoObra[] {
    const o = this.obra(k);
    const out: ConceptoObra[] = o.partidas.map((pa, i) => ({
      clave: `p:${this.partidaId(k, pa.clave)}`,
      presupuestoId: this.partidaId(k, pa.clave),
      extraRenglonId: null,
      concepto: `${pa.clave} ${pa.concepto}`,
      unidad: pa.unidad,
      seccion: pa.seccion,
      cantidad: pa.cantidad,
      precio: pa.precio,
      orden: i,
    }));
    const folios = EXTRAS.filter((e) => e.obra === k);
    folios.forEach((e, fi) => {
      if (e.final !== 'APROBADA') return;
      e.renglones.forEach(([concepto, unidad, cantidad, precio], i) => {
        const id = this.extraRenglonId(e.key, i);
        out.push({
          clave: `x:${id}`,
          presupuestoId: null,
          extraRenglonId: id,
          concepto,
          unidad,
          seccion: `Extra ${fi + 1}`,
          cantidad,
          precio,
          orden: 1_000_000 + (fi + 1) * 1000 + i,
        });
      });
    });
    return out;
  }

  private planAvance(): Map<ClaveObra, Captura[]> {
    const out = new Map<ClaveObra, Captura[]>();
    for (const o of OBRAS) {
      const caps: Captura[] = [];
      const fin = this.finObra(o.clave);
      // Días de captura: cada viernes y el último día de la obra.
      const dias = rangoDias(o.inicio, fin).filter((f) => diaSemana(f) === 5 || (!!o.fin && f === fin));
      const tramos: { clave: string; pres: string | null; ext: string | null; cantidad: number; ini: string; fin: string; tope: number }[] = [];
      for (const pa of o.partidas) {
        const [ri, rf, tope] = pa.real ?? [pa.plan[0], pa.plan[1], 1];
        const id = this.partidaId(o.clave, pa.clave);
        tramos.push({ clave: `p:${id}`, pres: id, ext: null, cantidad: pa.cantidad, ini: ri, fin: rf, tope: tope ?? 1 });
      }
      for (const e of EXTRAS.filter((x) => x.obra === o.clave && x.final === 'APROBADA')) {
        e.renglones.forEach(([, , cantidad, , plan], i) => {
          if (!plan) return;
          const id = this.extraRenglonId(e.key, i);
          tramos.push({ clave: `x:${id}`, pres: null, ext: id, cantidad, ini: plan[0], fin: plan[1], tope: 1 });
        });
      }
      for (const tr of tramos) {
        let previo = 0;
        const total = diasEntre(tr.ini, tr.fin) + 1;
        for (const f of dias) {
          if (f < tr.ini) continue;
          const frac = Math.min(1, (diasEntre(tr.ini, f) + 1) / total) * tr.tope;
          const acum = r2(tr.cantidad * frac);
          const delta = r2(acum - previo);
          if (delta <= 0) continue;
          caps.push({ clave: tr.clave, presupuestoId: tr.pres, extraRenglonId: tr.ext, fecha: f, cantidad: delta });
          previo = acum;
        }
      }
      out.set(o.clave, caps);
    }
    return out;
  }

  private avance(capturas: Map<ClaveObra, Captura[]>): void {
    this.comentario('Avance por partida: capturas semanales (los viernes) del supervisor');
    const r = this.azar('avance');
    const notas = ['', '', '', 'Medido con cinta en campo.', 'Según croquis del maestro.', 'Levantamiento conjunto con la supervisión.'];
    for (const o of OBRAS) {
      const caps = capturas.get(o.clave) ?? [];
      this.insertar(
        'avance_partida',
        caps.map((c, i) => {
          const t = this.sello(c.fecha, r, 16, 19);
          return {
            id: this.id(`avance:${o.clave}:${i}`),
            empresa_id: this.empresaId,
            obra_id: this.obraId(o.clave),
            presupuesto_id: c.presupuestoId,
            orden_cambio_renglon_id: c.extraRenglonId,
            fecha: ms(c.fecha),
            cantidad: c.cantidad,
            nota: notas[Math.floor(r() * notas.length)],
            created_at: t,
            updated_at: t,
          };
        }),
      );
    }
  }

  /** % físico como `lib/estimaciones/avance.ts`: ponderado por dinero, un decimal. */
  private avanceFisico(k: ClaveObra, capturas: Map<ClaveObra, Captura[]>, hasta?: string): number {
    const ej = new Map<string, number>();
    for (const c of capturas.get(k) ?? []) {
      if (hasta && c.fecha > hasta) continue;
      ej.set(c.clave, r2((ej.get(c.clave) ?? 0) + c.cantidad));
    }
    let contC = 0;
    let ejC = 0;
    for (const c of this.conceptosDe(k)) {
      const hecho = Math.min(ej.get(c.clave) ?? 0, c.cantidad);
      contC += importeC(c.cantidad, c.precio);
      ejC += importeC(hecho, c.precio);
    }
    return Math.min(100, Math.max(0, Math.round((ejC / contC) * 100 * 10) / 10));
  }

  private contratado(k: ClaveObra): number {
    let s = 0;
    for (const pa of this.obra(k).partidas) s += pa.cantidad * pa.precio;
    for (const e of EXTRAS.filter((x) => x.obra === k && x.final === 'APROBADA')) {
      s += e.renglones.reduce((a, [, , c, pr]) => a + importeC(c, pr), 0) / 100;
    }
    return r2(s);
  }

  // ── 11. Estimaciones ────────────────────────────────────────────────────

  private estimaciones(capturas: Map<ClaveObra, Captura[]>): void {
    this.comentario('Contratos y estimaciones (RPC: enviar, respuesta por oficina, cobro ligado a caja)');
    const r = this.azar('estimaciones');
    interface Contrato {
      obra: ClaveObra;
      anticipoPct: number;
      amortPct: number;
      fondoPct: number;
      ivaPct: number;
      anticipoFecha: string;
      retenciones: { concepto: string; tipo: 'PORCENTAJE'; valor: number }[];
      notas: string;
      quien: string;
      periodos: { ini: string; fin: string; estado: 'COBRADA' | 'AUTORIZADA' | 'ENVIADA' | 'BORRADOR' | 'RECHAZADA'; finiquito?: boolean; inflar?: string; motivo?: string }[];
    }
    const quincenas = (desde: string, n: number) => {
      const out: { ini: string; fin: string }[] = [];
      let [y, m] = desde.split('-').map(Number);
      for (let i = 0; i < n; i++) {
        const mes = `${y}-${String(m).padStart(2, '0')}`;
        const ultimo = new Date(Date.UTC(y, m, 0)).getUTCDate();
        out.push(i % 2 === 0 ? { ini: `${mes}-01`, fin: `${mes}-15` } : { ini: `${mes}-16`, fin: `${mes}-${ultimo}` });
        if (i % 2 === 1) {
          m += 1;
          if (m > 12) {
            m = 1;
            y += 1;
          }
        }
      }
      return out;
    };
    const qA = quincenas('2026-04-01', 12);
    const periodosA: Contrato['periodos'] = [];
    qA.forEach((q, i) => {
      if (i === 5) {
        periodosA.push({
          ...q,
          estado: 'RECHAZADA',
          inflar: 'ENC-04',
          motivo: 'La medición de muros de block no cuadra con lo levantado en campo en las casas 5 y 6. Favor de corregir y volver a enviar.',
        });
      }
      const estado = i <= 8 ? 'COBRADA' : i === 9 ? 'AUTORIZADA' : i === 10 ? 'ENVIADA' : 'BORRADOR';
      periodosA.push({ ...q, estado });
    });
    const contratos: Contrato[] = [
      {
        obra: 'A',
        anticipoPct: 30,
        amortPct: 30,
        fondoPct: 5,
        ivaPct: 16,
        anticipoFecha: '2026-04-03',
        retenciones: [{ concepto: 'Supervisión externa (0.5 %)', tipo: 'PORCENTAJE', valor: 0.5 }],
        notas: 'Contrato de obra a precio unitario. Estimaciones quincenales; pago a 10 días de autorizadas.',
        quien: 'Ing. Laura Benavides (Desarrollos Cumbres del Valle)',
        periodos: periodosA,
      },
      {
        obra: 'D',
        anticipoPct: 20,
        amortPct: 20,
        fondoPct: 5,
        ivaPct: 16,
        anticipoFecha: '2026-03-31',
        retenciones: [],
        notas: 'Contrato a precio alzado por partidas. Estimaciones mensuales.',
        quien: 'Ing. Salvador Rico (Logística Integral Mitras)',
        periodos: [
          { ini: '2026-03-30', fin: '2026-04-30', estado: 'COBRADA' },
          { ini: '2026-05-01', fin: '2026-05-31', estado: 'COBRADA' },
          { ini: '2026-06-01', fin: '2026-06-30', estado: 'COBRADA' },
          { ini: '2026-07-01', fin: '2026-07-24', estado: 'COBRADA', finiquito: true },
        ],
      },
    ];

    for (const c of contratos) {
      const conceptos = this.conceptosDe(c.obra);
      const presupuestoC = this.obra(c.obra).partidas.reduce((a, pa) => a + importeC(pa.cantidad, pa.precio), 0);
      const anticipo = pctC(presupuestoC, c.anticipoPct) / 100;
      const movAnt = this.id(`anticipo:${c.obra}`);
      this.insertar('movimientos', [
        this.movimiento(
          {
            id: movAnt,
            obra: c.obra,
            fecha: c.anticipoFecha,
            tipo: 'ENTRADA',
            categoria: 'Anticipo',
            concepto: `Anticipo del ${c.anticipoPct} % (más IVA)`,
            monto: r2(anticipo * (1 + c.ivaPct / 100)),
            metodo: 'TRANSFERENCIA',
            referencia: `SPEI ${Math.floor(10_000_000 + r() * 80_000_000)}`,
            nombre: this.clienteNombre(this.obra(c.obra).clienteKey),
          },
          r,
        ),
      ]);
      const tc = ms(c.anticipoFecha, 10);
      this.insertar('obra_contrato', [
        {
          obra_id: this.obraId(c.obra),
          empresa_id: this.empresaId,
          anticipo_monto: dinero(anticipo),
          anticipo_movimiento_id: movAnt,
          amortizacion_pct: c.amortPct,
          fondo_garantia_pct: c.fondoPct,
          iva_pct: c.ivaPct,
          notas: c.notas,
          created_at: tc,
          updated_at: tc,
        },
      ]);
      this.insertar(
        'obra_retencion',
        c.retenciones.map((x, i) => ({
          id: this.id(`retencion:${c.obra}:${i}`),
          empresa_id: this.empresaId,
          obra_id: this.obraId(c.obra),
          concepto: x.concepto,
          tipo: x.tipo,
          valor: x.valor,
          orden: i,
          created_at: tc,
          updated_at: tc,
        })),
      );

      // Acumulados que CUENTAN (enviadas, autorizadas, cobradas).
      const estimado = new Map<string, number>();
      let amortizadoC = 0;
      let folio = 0;
      c.periodos.forEach((pe, idx) => {
        const hasta = pe.fin > this.hoy ? this.hoy : pe.fin;
        const ejecutado = new Map<string, number>();
        for (const cap of capturas.get(c.obra) ?? []) {
          if (cap.fecha > hasta) continue;
          ejecutado.set(cap.clave, r2((ejecutado.get(cap.clave) ?? 0) + cap.cantidad));
        }
        const renglones: { c: ConceptoObra; cantidad: number }[] = [];
        for (const co of conceptos) {
          const hecho = Math.min(ejecutado.get(co.clave) ?? 0, co.cantidad);
          let cant = r2(hecho - (estimado.get(co.clave) ?? 0));
          if (pe.inflar && co.clave === `p:${this.partidaId(c.obra, pe.inflar)}`) {
            cant = Math.min(r2(cant * 1.12 + 25), r2(co.cantidad - (estimado.get(co.clave) ?? 0)));
          }
          if (cant > 0) renglones.push({ c: co, cantidad: cant });
        }
        if (renglones.length === 0) return;
        const brutoC = renglones.reduce((a, x) => a + importeC(x.cantidad, x.c.precio), 0);
        const fondoC = pctC(brutoC, c.fondoPct);
        const rets = c.retenciones.map((x) => ({ ...x, importe: pctC(brutoC, x.valor) / 100 }));
        const retC = rets.reduce((a, x) => a + Math.round(x.importe * 100), 0);
        const anticipoC = Math.round(anticipo * 100);
        const pendienteC = Math.max(0, anticipoC - amortizadoC);
        const propuestaC = pe.finiquito ? pendienteC : pctC(brutoC, c.amortPct);
        const amortC = Math.max(0, Math.min(propuestaC, pendienteC, brutoC, Math.max(0, brutoC - fondoC - retC)));
        const subtotalC = brutoC - amortC;
        const ivaC = pctC(subtotalC, c.ivaPct);
        const totalC = subtotalC + ivaC;
        const netoC = totalC - fondoC - retC;
        const id = this.id(`estimacion:${c.obra}:${idx}`);
        folio += 1;
        const t = this.sello(sumarDias(pe.fin > this.hoy ? this.hoy : pe.fin, pe.fin > this.hoy ? 0 : 1), r, 10, 13);
        this.insertar('estimaciones', [
          {
            id,
            empresa_id: this.empresaId,
            obra_id: this.obraId(c.obra),
            periodo_inicio: ms(pe.ini),
            periodo_fin: ms(pe.fin),
            estado: 'BORRADOR',
            es_finiquito: !!pe.finiquito,
            notas: pe.finiquito ? 'Estimación de finiquito: amortiza el resto del anticipo.' : '',
            importe_bruto: dinero(brutoC / 100),
            amortizacion: dinero(amortC / 100),
            subtotal: dinero(subtotalC / 100),
            iva_pct: c.ivaPct,
            iva: dinero(ivaC / 100),
            total: dinero(totalC / 100),
            fondo_garantia_pct: c.fondoPct,
            fondo_garantia: dinero(fondoC / 100),
            retenciones: jsonb(rets),
            retenciones_total: dinero(retC / 100),
            neto: dinero(netoC / 100),
            created_at: t,
            updated_at: t,
          },
        ]);
        this.insertar(
          'estimacion_renglon',
          renglones.map((x, i) => ({
            id: this.id(`estimacion:${c.obra}:${idx}:renglon:${i}`),
            empresa_id: this.empresaId,
            estimacion_id: id,
            presupuesto_id: x.c.presupuestoId,
            orden_cambio_renglon_id: x.c.extraRenglonId,
            concepto: x.c.concepto,
            unidad: x.c.unidad,
            seccion: x.c.seccion,
            cantidad: x.cantidad,
            precio_unitario: x.c.precio,
            orden: x.c.orden,
            created_at: t,
            updated_at: t,
          })),
        );
        if (pe.estado === 'BORRADOR') return;
        this.rpc(`public.enviar_estimacion('${id}'::uuid)`, `enviar estimación ${c.obra}#${idx}`);
        // Cuenta para los acumulados mientras no la rechacen.
        if (pe.estado === 'RECHAZADA') {
          this.rpc(
            `public.registrar_respuesta_estimacion('${id}'::uuid, false, ${lit(c.quien)}, ${lit(pe.motivo ?? 'Rechazada')})`,
            `rechazo estimación ${c.obra}#${idx}`,
          );
          return;
        }
        for (const x of renglones) estimado.set(x.c.clave, r2((estimado.get(x.c.clave) ?? 0) + x.cantidad));
        amortizadoC += amortC;
        if (pe.estado === 'ENVIADA') return;
        this.rpc(`public.registrar_respuesta_estimacion('${id}'::uuid, true, ${lit(c.quien)})`, `autorizar estimación ${c.obra}#${idx}`);
        if (pe.estado === 'AUTORIZADA') return;
        const cobro = sumarDias(pe.fin, 12 + Math.floor(r() * 3));
        const mov = this.id(`cobro-estimacion:${c.obra}:${idx}`);
        this.estimacionesCobradas.push({ obra: c.obra, estimacionId: id, movimientoId: mov, fecha: cobro, neto: netoC / 100 });
        this.insertar('movimientos', [
          this.movimiento(
            {
              id: mov,
              obra: c.obra,
              fecha: cobro > this.hoy ? this.hoy : cobro,
              tipo: 'ENTRADA',
              categoria: 'Estimación',
              concepto: `Pago de la estimación ${folio}`,
              monto: netoC / 100,
              metodo: 'TRANSFERENCIA',
              referencia: `SPEI ${Math.floor(10_000_000 + r() * 80_000_000)}`,
              nombre: this.clienteNombre(this.obra(c.obra).clienteKey),
            },
            r,
          ),
        ]);
        this.rpc(`public.marcar_estimacion_cobrada('${id}'::uuid, '${mov}'::uuid)`, `cobrar estimación ${c.obra}#${idx}`);
      });
    }
  }

  private estimacionesCobradas: { obra: ClaveObra; estimacionId: string; movimientoId: string; fecha: string; neto: number }[] = [];

  // ── 12. Cobros de obras sin estimaciones (remodelación y local) ─────────

  private cobrosObra(): void {
    this.comentario('Cobros de la remodelación y del local (entradas de caja ligadas a su cotización)');
    const r = this.azar('cobros');
    const totB = r2(this.obra('B').partidas.reduce((a, pa) => a + pa.cantidad * pa.precio, 0) * 1.16);
    const totC = r2(this.obra('C').partidas.reduce((a, pa) => a + pa.cantidad * pa.precio, 0) * 1.16);
    const extrasB = EXTRAS.filter((e) => e.obra === 'B' && e.final === 'APROBADA').reduce(
      (a, e) => a + e.renglones.reduce((s, [, , c, pr]) => s + c * pr, 0),
      0,
    );
    const cotB = this.id('cotizacion:garza');
    const cotC = this.id('cotizacion:sendero');
    const lista: [ClaveObra, string, string, number, string, string, string | null][] = [
      ['B', '2026-04-15', 'Anticipo', r2(totB * 0.4), 'Anticipo del 40 %', 'TRANSFERENCIA', cotB],
      ['B', '2026-05-29', 'Pago de cotización', r2(totB * 0.2), 'Segundo pago (avance de ampliación)', 'TRANSFERENCIA', cotB],
      ['B', '2026-06-19', 'Extras', r2(extrasB * 0.5), 'Anticipo de extras 1 y 2', 'EFECTIVO', null],
      ['B', '2026-07-10', 'Pago de cotización', r2(totB * 0.15), 'Tercer pago', 'TRANSFERENCIA', cotB],
      ['B', '2026-08-28', 'Pago de cotización', r2(totB * 0.15), 'Cuarto pago (acabados)', 'TRANSFERENCIA', cotB],
      ['C', '2026-06-12', 'Anticipo', r2(totC * 0.35), 'Anticipo del 35 %', 'TRANSFERENCIA', cotC],
      ['C', '2026-08-21', 'Pago de cotización', 420000, 'Pago por avance de cimentación', 'TRANSFERENCIA', cotC],
    ];
    this.cobrosSinEstimacion = lista.map(([obra, fecha, , , concepto], i) => ({ obra, fecha, concepto, id: this.id(`cobro:${obra}:${i}`) }));
    this.insertar(
      'movimientos',
      lista.map(([obra, fecha, categoria, monto, concepto, metodo, cot], i) =>
        this.movimiento(
          {
            id: this.id(`cobro:${obra}:${i}`),
            obra,
            fecha,
            tipo: 'ENTRADA',
            categoria,
            concepto,
            monto,
            metodo,
            referencia: metodo === 'TRANSFERENCIA' ? `SPEI ${Math.floor(10_000_000 + r() * 80_000_000)}` : '',
            nombre: this.clienteNombre(this.obra(obra).clienteKey),
            cotizacionId: cot,
          },
          r,
        ),
      ),
    );
  }

  private cobrosSinEstimacion: { obra: ClaveObra; fecha: string; concepto: string; id: string }[] = [];

  // ── 13. Notas de obra y subcontratos ────────────────────────────────────

  private notasYSubcontratos(): void {
    this.comentario('Notas de obra (tratos de palabra) y subcontratos con REPSE, pagos y retención');
    const r = this.azar('notas');
    for (const n of NOTAS) {
      const id = this.id(`nota:${n.key}`);
      const t = this.sello(n.fecha, r);
      const ultimo = n.renglones.reduce((a, x) => (x[6] && x[6] > a ? x[6] : a), n.fecha);
      this.insertar('nota_obra', [
        {
          id,
          empresa_id: this.empresaId,
          obra_id: this.obraId(n.obra),
          destinatario: n.destinatario,
          colaborador_id: n.colaborador ? this.personaId(n.colaborador) : null,
          titulo: n.titulo,
          fecha: ms(n.fecha, 12),
          estado: n.estado,
          notas: n.notas,
          orden: NOTAS.indexOf(n) * 100 + 100,
          created_at: t,
          updated_at: this.sello(ultimo, r),
        },
      ]);
      this.insertar(
        'nota_obra_renglon',
        n.renglones.map(([tipo, etiqueta, monto, base, pct, texto, fecha, mostrar], i) => {
          const tr = this.sello(fecha ?? n.fecha, r);
          return {
          id: this.id(`nota:${n.key}:renglon:${i}`),
          empresa_id: this.empresaId,
          nota_id: id,
          tipo,
          etiqueta,
          monto,
          monto_base: base,
          porcentaje: pct,
          mostrar_porcentaje: !!mostrar,
          texto,
          fecha: fecha ? ms(fecha, 12) : null,
          orden: (i + 1) * 100,
          created_at: tr,
          updated_at: tr,
          };
        }),
      );
      if (n.pagosEnCaja) {
        this.insertar(
          'movimientos',
          n.renglones
            .map((x, i) => [x, i] as const)
            .filter(([x]) => x[0] === 'PAGO')
            .map(([[, etiqueta, monto, , , , fecha], i]) =>
              this.movimiento(
                {
                  id: this.id(`nota:${n.key}:pago:${i}`),
                  obra: n.obra,
                  fecha: fecha!,
                  tipo: 'SALIDA',
                  categoria: 'Subcontrato',
                  concepto: `${etiqueta} — ${n.titulo}`.slice(0, 200),
                  monto: monto!,
                  metodo: monto! > 50_000 ? 'TRANSFERENCIA' : 'EFECTIVO',
                  nombre: n.destinatario,
                  categoriaCosto: 'SUBCONTRATO',
                },
                r,
              ),
            ),
        );
      }
    }

    // Subcontratistas con expediente.
    const ts = ms('2026-05-20', 10);
    this.insertar('subcontratista', [
      {
        id: this.id('subcontratista:ien'),
        empresa_id: this.empresaId,
        nombre: 'Instalaciones Electromecánicas del Norte, S.A. de C.V.',
        rfc: 'IEN160311AB7',
        contacto: 'Ing. Sergio Villegas',
        telefono: '81 8363 4471',
        correo: 'contacto.ien@example.com',
        especialidad: 'Instalaciones hidrosanitarias y eléctricas',
        notas: 'Trabajan con registro REPSE vigente; piden anticipo a la firma.',
        created_at: ts,
        updated_at: ts,
      },
      {
        id: this.id('subcontratista:ruiz'),
        empresa_id: this.empresaId,
        nombre: 'José Luis Ruiz Tamez (Tablaroca Ruiz)',
        rfc: 'RUTL800715HE5',
        contacto: 'José Luis Ruiz',
        telefono: '81 1734 2096',
        correo: '',
        especialidad: 'Tablaroca y plafones',
        notas: 'Persona física; falta que entregue su registro REPSE.',
        created_at: ms('2026-08-12', 11),
        updated_at: ms('2026-08-12', 11),
      },
    ]);
    const doc = (k: string, sub: string, tipo: string, desc: string, folio: string, emision: string, vigencia: string | null): Fila => ({
      id: this.id(`subdoc:${k}`),
      empresa_id: this.empresaId,
      subcontratista_id: this.id(`subcontratista:${sub}`),
      tipo,
      descripcion: desc,
      folio,
      fecha_emision: ms(emision),
      vigencia_hasta: vigencia ? ms(vigencia) : null,
      path: null,
      created_at: ms(emision, 12),
      updated_at: ms(emision, 12),
    });
    this.insertar('subcontratista_documento', [
      doc('ien-repse', 'ien', 'REPSE', 'Aviso de registro en el padrón REPSE', 'AR27319/2025', '2025-02-10', '2028-02-10'),
      doc('ien-csf', 'ien', 'CONSTANCIA_FISCAL', 'Constancia de situación fiscal', '', '2026-05-18', null),
      doc('ien-32d', 'ien', 'OPINION_32D', 'Opinión de cumplimiento SAT (32-D) positiva', '26NA1487329', '2026-09-10', '2026-10-10'),
      doc('ien-imss', 'ien', 'IMSS_OPINION', 'Opinión de cumplimiento IMSS positiva', '', '2026-09-15', '2026-11-15'),
      doc('ruiz-csf', 'ruiz', 'CONSTANCIA_FISCAL', 'Constancia de situación fiscal', '', '2026-08-10', null),
    ]);

    // S1: instalaciones del fraccionamiento (contrato desde cero).
    const s1 = this.id('subcontrato:instalaciones');
    this.insertar('subcontrato', [
      {
        id: s1,
        empresa_id: this.empresaId,
        obra_id: this.obraId('A'),
        subcontratista_id: this.id('subcontratista:ien'),
        subcontratista_nombre: 'Instalaciones Electromecánicas del Norte, S.A. de C.V.',
        alcance:
          'Instalación hidrosanitaria (tubería CPVC, drenaje PVC, tinaco y muebles) e instalación eléctrica (canalización, cableado, centro de carga y accesorios) de las seis casas de la etapa 2, con pruebas de hermeticidad y de continuidad.',
        monto: 486000,
        retencion_pct: 5,
        forma_pago: '30 % al terminar tubería en muros, 40 % al terminar cableado y 30 % a la entrega con pruebas; se retiene 5 % de fondo de garantía en cada pago.',
        fecha_inicio: ms('2026-06-01'),
        fecha_fin: ms('2026-10-30'),
        fecha_firma: ms('2026-05-28'),
        estado: 'FIRMADO',
        notas: '',
        created_at: ms('2026-05-26', 12),
        updated_at: ms('2026-05-28', 17),
      },
    ]);
    this.insertar('subcontrato_renglon', [
      { id: this.id('subcontrato:instalaciones:r0'), empresa_id: this.empresaId, subcontrato_id: s1, concepto: 'Instalación hidrosanitaria por casa', unidad: 'casa', cantidad: 6, precio_unitario: 43000, importe: 258000, orden: 100, created_at: ms('2026-05-26', 12), updated_at: ms('2026-05-26', 12) },
      { id: this.id('subcontrato:instalaciones:r1'), empresa_id: this.empresaId, subcontrato_id: s1, concepto: 'Instalación eléctrica por casa', unidad: 'casa', cantidad: 6, precio_unitario: 38000, importe: 228000, orden: 200, created_at: ms('2026-05-26', 12), updated_at: ms('2026-05-26', 12) },
    ]);
    const pagosS1: [string, number, string][] = [
      ['2026-07-03', 97200, 'Tubería en muros casas 1 a 3'],
      ['2026-08-07', 121500, 'Tubería casas 4 a 6 y cableado casas 1 y 2'],
      ['2026-09-11', 97200, 'Cableado casas 3 y 4'],
    ];
    this.pagosSubcontrato(s1, 'A', 'Instalaciones Electromecánicas del Norte, S.A. de C.V.', 5, pagosS1, r);

    // S2: la nota de tablaroca convertida en contrato (F5-9).
    const s2 = this.id('subcontrato:tablaroca');
    this.insertar('subcontrato', [
      {
        id: s2,
        empresa_id: this.empresaId,
        obra_id: this.obraId('C'),
        subcontratista_id: this.id('subcontratista:ruiz'),
        subcontratista_nombre: 'José Luis Ruiz Tamez (Tablaroca Ruiz)',
        nota_obra_id: this.id('nota:tablaroca'),
        alcance: 'Muros de tablaroca y plafón reticular del local, con material del subcontratista.',
        monto: null,
        retencion_pct: 5,
        forma_pago: 'Anticipo del 30 % y pagos semanales contra avance.',
        fecha_inicio: ms('2026-08-24'),
        fecha_fin: ms('2026-10-16'),
        fecha_firma: ms('2026-08-14'),
        estado: 'FIRMADO',
        notas: 'Viene de la nota de obra «Muros de tablaroca y plafón reticular».',
        created_at: ms('2026-08-14', 12),
        updated_at: ms('2026-08-14', 12),
      },
    ]);
    this.insertar('subcontrato_renglon', [
      { id: this.id('subcontrato:tablaroca:r0'), empresa_id: this.empresaId, subcontrato_id: s2, concepto: 'Muros de tablaroca (180 m²)', unidad: '', cantidad: null, precio_unitario: null, importe: 68400, orden: 100, created_at: ms('2026-08-14', 12), updated_at: ms('2026-08-14', 12) },
      { id: this.id('subcontrato:tablaroca:r1'), empresa_id: this.empresaId, subcontrato_id: s2, concepto: 'Plafón reticular (95 m²)', unidad: '', cantidad: null, precio_unitario: null, importe: 27550, orden: 200, created_at: ms('2026-08-14', 12), updated_at: ms('2026-08-14', 12) },
    ]);
    // El anticipo de la nota ya estaba en caja: pago previo SIN movimiento.
    this.insertar('subcontrato_pago', [
      {
        id: this.id('subcontrato:tablaroca:pago-previo'),
        empresa_id: this.empresaId,
        subcontrato_id: s2,
        fecha: ms('2026-08-15', 12),
        monto: 31578.95,
        retencion: 1578.95,
        metodo_pago: 'EFECTIVO',
        referencia: '',
        notas: 'Pago registrado en la nota de obra (ya estaba en caja).',
        movimiento_id: null,
        created_at: ms('2026-08-14', 12),
        updated_at: ms('2026-08-14', 12),
      },
    ]);
    this.pagosSubcontrato(s2, 'C', 'José Luis Ruiz Tamez (Tablaroca Ruiz)', 5, [['2026-09-12', 25000, 'Avance de muros en área de mostrador']], r);
  }

  private pagosSubcontrato(
    sub: string,
    obra: ClaveObra,
    nombre: string,
    pct: number,
    pagos: [string, number, string][],
    r: () => number,
  ): void {
    pagos.forEach(([fecha, bruto, nota], i) => {
      const ret = r2((bruto * pct) / 100);
      const mov = this.id(`subcontrato:${sub}:mov:${i}`);
      this.insertar('movimientos', [
        this.movimiento(
          {
            id: mov,
            obra,
            fecha,
            tipo: 'SALIDA',
            categoria: '',
            concepto: `Pago de subcontrato — ${nombre}`.slice(0, 200),
            monto: r2(bruto - ret),
            metodo: 'TRANSFERENCIA',
            referencia: `SPEI ${Math.floor(10_000_000 + r() * 80_000_000)}`,
            nombre,
            categoriaCosto: 'SUBCONTRATO',
          },
          r,
        ),
      ]);
      const t = this.sello(fecha, r);
      this.insertar('subcontrato_pago', [
        {
          id: this.id(`subcontrato:${sub}:pago:${i}`),
          empresa_id: this.empresaId,
          subcontrato_id: sub,
          fecha: ms(fecha, 12),
          monto: bruto,
          retencion: ret,
          metodo_pago: 'TRANSFERENCIA',
          referencia: '',
          notas: nota,
          movimiento_id: mov,
          created_at: t,
          updated_at: t,
        },
      ]);
    });
  }

  // ── 14. Compras ──────────────────────────────────────────────────────────

  /**
   * Material pagado por órdenes de compra. El monto de cada orden sale de un
   * presupuesto de material calibrado (ver `costosDeCierre`); aquí se reparte
   * por `peso` y se redondea a cantidades enteras de cada material.
   */
  private compras(capturas: Map<ClaveObra, Captura[]>): Map<ClaveObra, number> {
    this.comentario('Compras: proveedores, materiales, requisiciones → órdenes (RPC emitir) → entregas → pagos (RPC)');
    const r = this.azar('compras');
    const t0 = ms(INICIO_GUION, 10);
    this.insertar(
      'proveedores',
      PROVEEDORES.map(([key, nombre, rfc, contacto, tel, credito]) => ({
        id: this.id(`proveedor:${key}`),
        empresa_id: this.empresaId,
        nombre,
        rfc,
        contacto,
        telefono: tel,
        correo: `ventas.${key}@example.com`,
        dias_credito: credito,
        notas: '',
        created_at: t0,
        updated_at: t0,
      })),
    );
    this.insertar(
      'materiales',
      MATERIALES.map(([key, nombre, unidad, precio, prov]) => ({
        id: this.id(`material:${key}`),
        empresa_id: this.empresaId,
        nombre,
        unidad,
        ultimo_precio: precio,
        proveedor_id: this.id(`proveedor:${prov}`),
        notas: '',
        created_at: t0,
        updated_at: t0,
      })),
    );
    this.sql(
      `insert into public.regla_aprobacion (id, empresa_id, tipo, monto_minimo, rol_aprobador, activa, notas, created_at, updated_at) values ('${this.id('regla:compra')}', _emp, 'COMPRA', 50000, 'admin', true, ${lit('Compras mayores a $50,000 (con IVA) necesitan el visto bueno del dueño.')}, ${ms('2026-04-01', 9)}, ${ms('2026-04-01', 9)});`,
    );
    this.contar('regla_aprobacion');

    // Presupuesto de material pagado por obra (lo fija la calibración).
    const presupuesto = this.presupuestoMaterial(capturas);
    const pagadoPorObra = new Map<ClaveObra, number>();
    const precio = (k: string) => {
      const m = MATERIALES.find((x) => x[0] === k);
      if (!m) throw new Error(`Material desconocido: ${k}`);
      return m;
    };

    const aprobaciones: Fila[] = [];
    for (const o of ORDENES) {
      const pesoObra = ORDENES.filter((x) => x.obra === o.obra && x.peso > 0).reduce((a, x) => a + x.peso, 0);
      // Lo que se paga es subtotal × 1.16: el objetivo del subtotal se divide.
      const subObjetivo = o.subtotal ?? ((presupuesto.get(o.obra) ?? 0) * (o.peso / pesoObra)) / 1.16 / (o.final === 'PARCIAL' ? 0.6 : o.final === 'ANTICIPO' ? 0.5 : 1);
      const items = o.items.map(([mat, parte]) => {
        const [, nombre, unidad, pu] = precio(mat);
        const cant = Math.max(1, Math.round((subObjetivo * parte) / pu));
        return { mat, nombre, unidad, pu, cant };
      });
      const subtotal = r2(items.reduce((a, x) => a + importeC(x.cant, x.pu), 0) / 100);
      const iva = r2(subtotal * 0.16);
      const total = r2(subtotal + iva);

      // Requisición (la pide el supervisor; en la demo, el dueño).
      const req = this.id(`requisicion:${o.key}`);
      const fr = sumarDias(o.fecha, -2);
      const tr = this.sello(fr, r, 8, 11);
      this.insertar('requisiciones', [
        {
          id: req,
          empresa_id: this.empresaId,
          obra_id: this.obraId(o.obra),
          para_cuando: ms(sumarDias(o.fecha, 3)),
          notas: o.reqDeMas ? 'Se pidió de más por si se ocupa en la casa 6.' : '',
          created_at: tr,
          updated_at: tr,
        },
      ]);
      this.insertar(
        'requisicion_renglon',
        items.map((x, i) => ({
          id: this.id(`requisicion:${o.key}:r${i}`),
          empresa_id: this.empresaId,
          requisicion_id: req,
          material_id: this.id(`material:${x.mat}`),
          descripcion: x.nombre,
          unidad: x.unidad,
          cantidad: o.reqDeMas && i === 0 ? Math.round(x.cant * 1.25) : x.cant,
          notas: '',
          orden: (i + 1) * 100,
          created_at: tr,
          updated_at: tr,
        })),
      );
      this.sql(`update public.requisiciones set estado = 'APROBADA', updated_at = ${this.sello(sumarDias(fr, 1), r, 8, 10)} where id = '${req}';`);

      // Orden de compra (borrador) ligada a la requisición.
      const oc = this.id(`orden:${o.key}`);
      const prov = PROVEEDORES.find((x) => x[0] === o.prov)!;
      const toc = this.sello(o.fecha, r, 9, 12);
      this.insertar('ordenes_compra', [
        {
          id: oc,
          empresa_id: this.empresaId,
          obra_id: this.obraId(o.obra),
          proveedor_id: this.id(`proveedor:${o.prov}`),
          fecha: ms(o.fecha, 12),
          iva_pct: 16,
          condiciones: prov[5] > 0 ? `Crédito a ${prov[5]} días. Entrega en obra.` : 'Contado contra entrega. Entrega en obra.',
          dias_credito: prov[5],
          fecha_entrega: ms(sumarDias(o.fecha, 2)),
          notas: '',
          created_at: toc,
          updated_at: toc,
        },
      ]);
      this.insertar(
        'orden_compra_renglon',
        items.map((x, i) => ({
          id: this.id(`orden:${o.key}:r${i}`),
          empresa_id: this.empresaId,
          orden_compra_id: oc,
          requisicion_renglon_id: this.id(`requisicion:${o.key}:r${i}`),
          material_id: this.id(`material:${x.mat}`),
          descripcion: x.nombre,
          unidad: x.unidad,
          cantidad: x.cant,
          precio_unitario: x.pu,
          orden: (i + 1) * 100,
          created_at: toc,
          updated_at: toc,
        })),
      );
      if (o.vistoBueno) {
        // El rol "compras" no existe en la demo (no se crean usuarios): la
        // solicitud se registra como la dejó Lupita de compras y el dueño la
        // aprueba. `aprobacion` no tiene policies de escritura (solo RPC que
        // exigen al que pide): va sin JWT.
        aprobaciones.push({
          id: this.id(`aprobacion:${o.key}`),
          empresa_id: this.empresaId,
          tipo: 'COMPRA',
          objeto_id: oc,
          obra_id: this.obraId(o.obra),
          monto: total,
          rol_aprobador: 'admin',
          estado: 'APROBADA',
          solicitado_por: null,
          solicitado_nombre: 'Lupita Méndez (compras)',
          solicitado_en: ms(o.fecha, 10),
          decidido_por: this.userId,
          decidido_nombre: 'Dirección',
          decidido_en: ms(o.fecha, 13),
          created_at: ms(o.fecha, 10),
          updated_at: ms(o.fecha, 13),
        });
      }
      if (o.final === 'BORRADOR_VB') {
        aprobaciones.push({
          id: this.id(`aprobacion:${o.key}`),
          empresa_id: this.empresaId,
          tipo: 'COMPRA',
          objeto_id: oc,
          obra_id: this.obraId(o.obra),
          monto: total,
          rol_aprobador: 'admin',
          estado: 'PENDIENTE',
          solicitado_por: null,
          solicitado_nombre: 'Lupita Méndez (compras)',
          solicitado_en: ms(o.fecha, 11),
          created_at: ms(o.fecha, 11),
          updated_at: ms(o.fecha, 11),
        });
        continue;
      }
      if (o.final === 'CANCELADA') {
        this.rpc(`public.cancelar_orden_compra('${oc}'::uuid)`, `cancelar orden ${o.key}`);
        continue;
      }
      this.rpc(`public.emitir_orden_compra('${oc}'::uuid)`, `emitir orden ${o.key}`);

      // Entregas.
      const entregas: { fecha: string; parte: number }[] =
        o.final === 'ANTICIPO'
          ? []
          : o.final === 'PARCIAL'
            ? [{ fecha: sumarDias(o.fecha, 2), parte: 0.6 }]
            : o.dosEntregas
              ? [
                  { fecha: sumarDias(o.fecha, 2), parte: 0.7 },
                  { fecha: sumarDias(o.fecha, 14), parte: 0.3 },
                ]
              : [{ fecha: sumarDias(o.fecha, 1 + Math.floor(r() * 3)), parte: 1 }];
      const recibido = new Map<number, number>();
      entregas.forEach((en, ei) => {
        const rec = this.id(`recepcion:${o.key}:${ei}`);
        const te = this.sello(en.fecha, r, 8, 15);
        this.insertar('recepciones', [
          {
            id: rec,
            empresa_id: this.empresaId,
            orden_compra_id: oc,
            obra_id: this.obraId(o.obra),
            fecha: ms(en.fecha, 12),
            notas: en.parte < 1 ? 'Entrega parcial; el resto llega en otra remisión.' : '',
            created_at: te,
            updated_at: te,
          },
        ]);
        this.insertar(
          'recepcion_renglon',
          items.map((x, i) => {
            const ya = recibido.get(i) ?? 0;
            const sumaPartes = entregas.reduce((a, e) => a + e.parte, 0);
            const cant =
              ei === entregas.length - 1 && sumaPartes >= 0.999 ? r2(x.cant - ya) : Math.min(x.cant, Math.max(1, Math.round(x.cant * en.parte)));
            recibido.set(i, ya + cant);
            return {
              id: this.id(`recepcion:${o.key}:${ei}:r${i}`),
              empresa_id: this.empresaId,
              recepcion_id: rec,
              orden_compra_renglon_id: this.id(`orden:${o.key}:r${i}`),
              cantidad_recibida: cant,
              notas: '',
              created_at: te,
              updated_at: te,
            };
          }).filter((f) => Number(f.cantidad_recibida) > 0),
        );
      });
      if (entregas.length) {
        for (const [i, x] of items.entries()) this.recibidoPorMaterial(o.obra, x.mat, recibido.get(i) ?? 0, entregas[0].fecha);
      }

      // Pagos (RPC: crea la SALIDA de caja MATERIAL y el pago al proveedor).
      const ultimaEntrega = entregas.length ? entregas[entregas.length - 1].fecha : o.fecha;
      const pagos: { fecha: string; monto: number }[] =
        o.final === 'PAGADA'
          ? [{ fecha: sumarDias(ultimaEntrega, Math.min(prov[5], 20)), monto: total }]
          : o.final === 'PARCIAL'
            ? [{ fecha: sumarDias(ultimaEntrega, 5), monto: r2(total * 0.6) }]
            : o.final === 'ANTICIPO'
              ? [{ fecha: sumarDias(o.fecha, 1), monto: r2(total * 0.5) }]
              : [];
      pagos.forEach((pg, pi) => {
        const f = pg.fecha > this.hoy ? this.hoy : pg.fecha;
        pagadoPorObra.set(o.obra, r2((pagadoPorObra.get(o.obra) ?? 0) + pg.monto));
        this.salidasPorObra.set(o.obra, r2((this.salidasPorObra.get(o.obra) ?? 0) + pg.monto));
        this.contar('pagos_proveedor');
        this.contar('movimientos');
        this.rpc(
          `public.pagar_orden_compra('${this.id(`pago-proveedor:${o.key}:${pi}`)}'::uuid, '${oc}'::uuid, ${pg.monto.toFixed(2)}::double precision, ${ms(f, 12)}::bigint, 'TRANSFERENCIA', ${lit(`SPEI ${Math.floor(10_000_000 + r() * 80_000_000)}`)}, '')`,
          `pagar orden ${o.key}`,
        );
      });
      // Factura del proveedor (sin XML en la demo: solo los datos).
      if (o.final !== 'ANTICIPO' && r() < 0.75) {
        const ff = sumarDias(ultimaEntrega, 1);
        this.sql(
          `update public.ordenes_compra set factura_uuid = ${lit(this.uuidCfdi(r))}, factura_rfc = ${lit(prov[2])}, factura_total = ${total.toFixed(2)}, factura_iva = ${iva.toFixed(2)}, factura_fecha = ${ms(ff, 12)}, updated_at = ${ms(ff, 17)} where id = '${oc}';`,
        );
      }
    }
    // Requisición rechazada y una por aprobar.
    const extra: [string, ClaveObra, string, string, string | null, [string, number][]][] = [
      ['rechazada', 'C', '2026-07-28', 'Más block para el muro de colindancia', 'Hay block sobrante en la bodega de la nave 4; se traspasa a esta obra.', [['block15', 400]]],
      ['pendiente', 'A', '2026-09-25', 'Material para el aplanado de las casas 5 y 6', null, [['yeso', 180], ['cal', 60], ['arena', 6]]],
    ];
    for (const [k, obra, fecha, notas, motivo, renglones] of extra) {
      const req = this.id(`requisicion:${k}`);
      const t = this.sello(fecha, r, 8, 11);
      this.insertar('requisiciones', [
        { id: req, empresa_id: this.empresaId, obra_id: this.obraId(obra), para_cuando: ms(sumarDias(fecha, 4)), notas, created_at: t, updated_at: t },
      ]);
      this.insertar(
        'requisicion_renglon',
        renglones.map(([mat, cant], i) => {
          const m = precio(mat);
          return {
            id: this.id(`requisicion:${k}:r${i}`),
            empresa_id: this.empresaId,
            requisicion_id: req,
            material_id: this.id(`material:${mat}`),
            descripcion: m[1],
            unidad: m[2],
            cantidad: cant,
            notas: '',
            orden: (i + 1) * 100,
            created_at: t,
            updated_at: t,
          };
        }),
      );
      if (motivo) {
        this.sql(
          `update public.requisiciones set estado = 'RECHAZADA', motivo_rechazo = ${lit(motivo)}, updated_at = ${ms(sumarDias(fecha, 1), 9)} where id = '${req}';`,
        );
      }
    }
    this.materialEnObra(r);
    if (aprobaciones.length) {
      this.comoSistema('solicitudes de visto bueno que hizo el rol "compras" (no hay usuarios extra en la demo)');
      this.insertar('aprobacion', aprobaciones);
      this.comoDueno();
    }
    return pagadoPorObra;
  }

  /** Lo recibido por (obra, material) y el día de la primera entrega. */
  private recibido = new Map<string, { cant: number; desde: string }>();
  private recibidoPorMaterial(obra: ClaveObra, mat: string, cant: number, fecha: string): void {
    const k = `${obra}:${mat}`;
    const a = this.recibido.get(k);
    this.recibido.set(k, { cant: (a?.cant ?? 0) + cant, desde: a && a.desde < fecha ? a.desde : fecha });
  }

  /**
   * Consumos, un traspaso y un ajuste (existencias por obra). El concreto y el
   * bombeo se gastan el día que llegan; lo demás se va usando en tres salidas
   * de almacén hasta hoy. La bodega (terminada) consume todo menos el block que
   * sobró y se traspasa al local.
   */
  private materialEnObra(r: () => number): void {
    const movs: Fila[] = [];
    const nota: Record<string, string> = {
      cemento: 'Plantillas, castillos y junteo',
      block15: 'Levantamiento de muros',
      var38: 'Castillos y dalas',
      var12: 'Zapatas y trabes',
      alambre: 'Amarres de acero',
    };
    for (const [k, { cant: total, desde }] of [...this.recibido.entries()].sort((a, b) => a[0].localeCompare(b[0]))) {
      const [obra, mat] = k.split(':') as [ClaveObra, string];
      const alDia = mat === 'c200' || mat === 'c250' || mat === 'bombeo';
      const fraccion = alDia ? 1 : obra === 'D' ? (mat === 'block15' ? 0.85 : 1) : mat === 'cemento' && obra === 'A' ? 0.8 : 0.7 + r() * 0.22;
      const usar = Math.floor(total * fraccion + 1e-9);
      if (usar <= 0) continue;
      const fin = this.finObra(obra) < this.hoy ? this.finObra(obra) : this.hoy;
      const veces = alDia || usar < 3 ? 1 : 3;
      let resto = usar;
      for (let i = 0; i < veces; i++) {
        const cantidad = i === veces - 1 ? resto : Math.floor(usar / veces);
        resto -= cantidad;
        const f = alDia ? desde : sumarDias(desde, Math.min(diasEntre(desde, fin), Math.round(((i + 1) * diasEntre(desde, fin)) / (veces + 0.5))));
        const t = this.sello(f, r, 15, 18);
        movs.push({
          id: this.id(`consumo:${obra}:${mat}:${i}`),
          empresa_id: this.empresaId,
          obra_id: this.obraId(obra),
          material_id: this.id(`material:${mat}`),
          tipo: 'CONSUMO',
          cantidad,
          fecha: ms(f, 12),
          notas: alDia ? 'Colado del día' : (nota[mat] ?? 'Salida de almacén'),
          created_at: t,
          updated_at: t,
        });
      }
    }
    const bloqD = this.recibido.get('D:block15')?.cant ?? 0;
    const sobrante = Math.max(1, Math.round(bloqD * 0.15) - 1);
    movs.push({
      id: this.id('traspaso:D:C:block15'),
      empresa_id: this.empresaId,
      obra_id: this.obraId('D'),
      obra_destino_id: this.obraId('C'),
      material_id: this.id('material:block15'),
      tipo: 'TRASPASO',
      cantidad: sobrante,
      fecha: ms('2026-07-29', 12),
      notas: 'Sobrante de la nave 4 para el muro de colindancia del local.',
      created_at: ms('2026-07-29', 16),
      updated_at: ms('2026-07-29', 16),
    });
    movs.push({
      id: this.id('ajuste:A:cemento'),
      empresa_id: this.empresaId,
      obra_id: this.obraId('A'),
      material_id: this.id('material:cemento'),
      tipo: 'AJUSTE',
      cantidad: -12,
      fecha: ms('2026-05-28', 12),
      notas: 'Merma: 12 sacos se mojaron con la tormenta del 27 de mayo.',
      created_at: ms('2026-05-28', 17),
      updated_at: ms('2026-05-28', 17),
    });
    // Firmas de columna distintas (con y sin destino): se insertan por separado.
    this.insertar('material_movimiento', movs);
  }

  /** CFDI ficticio con formato válido (mayúsculas, como los timbra el SAT). */
  private uuidCfdi(r: () => number): string {
    const hex = () => Math.floor(r() * 16).toString(16).toUpperCase();
    const b = (n: number) => Array.from({ length: n }, hex).join('');
    return `${b(8)}-${b(4)}-4${b(3)}-${'89AB'[Math.floor(r() * 4)]}${b(3)}-${b(12)}`;
  }

  // ── 15. Calibración del costo ────────────────────────────────────────────

  /** Costo real que busca el guion: contratado × avance × (1 − margen). */
  private costoBuscado(k: ClaveObra, capturas: Map<ClaveObra, Captura[]>): number {
    const o = this.obra(k);
    return r2(this.contratado(k) * (this.avanceFisico(k, capturas) / 100) * (1 - o.margenBuscado / 100));
  }

  /** Lo que ya está decidido antes de compras: raya, subcontratos y pagos de notas. */
  private costoConocido(k: ClaveObra): number {
    // Raya completa (en caja o no) + salidas ya generadas (subcontratos, notas).
    const enCajaSinRaya = (this.salidasPorObra.get(k) ?? 0) - (this.nominaEnCaja.get(k) ?? 0);
    return r2((this.rayaTotal.get(k) ?? 0) + enCajaSinRaya);
  }

  private presupuestoMaterial(capturas: Map<ClaveObra, Captura[]>): Map<ClaveObra, number> {
    const out = new Map<ClaveObra, number>();
    for (const o of OBRAS) {
      const buscado = this.costoBuscado(o.clave, capturas);
      const libre = buscado * (1 - o.pctIndirectos) - this.costoConocido(o.clave);
      if (libre < buscado * 0.12) {
        throw new Error(
          `Guion descuadrado en la obra ${o.clave}: la raya y los subcontratos (${this.costoConocido(o.clave).toFixed(0)}) no dejan lugar al material (costo buscado ${buscado.toFixed(0)}).`,
        );
      }
      // 82 % del material se compra por orden de compra; el resto va directo a caja.
      out.set(o.clave, libre * 0.82);
    }
    return out;
  }

  /** Indirectos y material comprado directo en caja, calibrados para cerrar el costo buscado. */
  private costosDeCierre(capturas: Map<ClaveObra, Captura[]>): void {
    this.comentario('Indirectos (renta, fletes, combustible, trámites) y material menor pagado directo en caja');
    const r = this.azar('cierre');
    // [concepto, peso, a quién, forma de pago, cómo se paga]
    const indirectos: [string, number, string, string, 'mensual' | 'varias' | 'una'][] = [
      ['Renta de retroexcavadora', 0.22, 'Renta de Maquinaria Escobedo, S.A. de C.V.', 'TRANSFERENCIA', 'varias'],
      ['Fletes de material y retiro de escombro', 0.18, 'Fletes Hernández', 'EFECTIVO', 'mensual'],
      ['Gasolina y diésel', 0.16, 'Gasolinera', 'EFECTIVO', 'mensual'],
      ['Renta de andamios y puntales adicionales', 0.12, 'Renta de Maquinaria Escobedo, S.A. de C.V.', 'TRANSFERENCIA', 'mensual'],
      ['Luz de obra (CFE provisional) y agua', 0.07, 'CFE', 'TRANSFERENCIA', 'mensual'],
      ['Renta de sanitario portátil', 0.05, 'Sanitarios Portátiles del Norte', 'TRANSFERENCIA', 'mensual'],
      ['Pruebas de laboratorio de concreto', 0.08, 'Laboratorio de Materiales Regio', 'TRANSFERENCIA', 'varias'],
      ['Licencia de construcción y trámites', 0.12, 'Municipio', 'TRANSFERENCIA', 'una'],
    ];
    const directos = [
      'Ferretería: discos, brocas, tornillería y cinta',
      'Material eléctrico de mostrador',
      'Cemento y arena en depósito cercano (urgencia)',
      'Consumibles de obra: cuñas, hilos, cubetas, cepillos',
      'Tubería y conexiones sueltas',
      'Clavo, alambre y madera de reposición',
      'Mortero y pegazulejo por saco',
      'Selladores, silicón y espuma',
    ];
    for (const o of OBRAS) {
      const buscado = this.costoBuscado(o.clave, capturas);
      const ind = r2(buscado * o.pctIndirectos);
      const fin = this.finObra(o.clave) < this.hoy ? this.finObra(o.clave) : this.hoy;
      const span = diasEntre(o.inicio, fin);
      const meses = Math.max(1, Math.round(span / 30));
      const filas: Fila[] = [];
      const lista = indirectos.filter(
        ([concepto]) => !(o.clave === 'B' && (concepto.startsWith('Renta de retro') || concepto.startsWith('Pruebas'))),
      );
      const pesoTotal = lista.reduce((a, x) => a + x[1], 0);
      let acumInd = 0;
      lista.forEach(([concepto, peso, nombre, metodo, modo], i) => {
        const totalConcepto = i === lista.length - 1 ? r2(ind - acumInd) : r2((ind * peso) / pesoTotal);
        acumInd = r2(acumInd + totalConcepto);
        const veces = modo === 'mensual' ? meses : modo === 'varias' ? Math.min(3, meses) : 1;
        let pagado = 0;
        for (let v = 0; v < veces; v++) {
          const monto = v === veces - 1 ? r2(totalConcepto - pagado) : r2(totalConcepto / veces);
          pagado = r2(pagado + monto);
          const dia = modo === 'una' ? 3 + Math.floor(r() * 5) : Math.floor(((v + 0.3 + r() * 0.5) * span) / veces);
          const f = sumarDias(o.inicio, Math.min(span, dia));
          filas.push(
            this.movimiento(
              {
                id: this.id(`indirecto:${o.clave}:${i}:${v}`),
                obra: o.clave,
                fecha: f,
                tipo: 'SALIDA',
                categoria: 'Indirectos',
                concepto: veces > 1 ? `${concepto} (${v + 1} de ${veces})` : concepto,
                monto,
                metodo,
                nombre,
                categoriaCosto: 'INDIRECTO',
              },
              r,
            ),
          );
        }
      });
      // Lo que falta para llegar al costo buscado es material comprado directo,
      // en tickets de mostrador de unos $15,000.
      const yaEnCosto = r2((this.salidasPorObra.get(o.clave) ?? 0) - (this.nominaEnCaja.get(o.clave) ?? 0) + (this.rayaTotal.get(o.clave) ?? 0));
      const falta = r2(buscado - yaEnCosto);
      if (falta <= 0) throw new Error(`Guion descuadrado en ${o.clave}: no queda material directo (${falta}).`);
      const tickets = Math.min(18, Math.max(5, Math.round(falta / 15_000)));
      const pesos = Array.from({ length: tickets }, () => 0.6 + r() * 0.8);
      const sumaPesos = pesos.reduce((a, b) => a + b, 0);
      let acum = 0;
      pesos.forEach((peso, i) => {
        const monto = i === tickets - 1 ? r2(falta - acum) : r2((falta * peso) / sumaPesos);
        acum = r2(acum + monto);
        const concepto = directos[i % directos.length];
        const f = sumarDias(o.inicio, Math.floor(span * ((i + 0.2 + 0.6 * r()) / tickets)));
        filas.push(
          this.movimiento(
            {
              id: this.id(`material-directo:${o.clave}:${i}`),
              obra: o.clave,
              fecha: f > this.hoy ? this.hoy : f,
              tipo: 'SALIDA',
              categoria: 'Material',
              concepto,
              monto,
              metodo: 'EFECTIVO',
              nombre: '',
              categoriaCosto: 'MATERIAL',
            },
            r,
          ),
        );
      });
      this.insertar('movimientos', filas);
    }
  }

  private resumenObra(k: ClaveObra, capturas: Map<ClaveObra, Captura[]>): ResumenObraDemo {
    const o = this.obra(k);
    const nomina = this.nominaEnCaja.get(k) ?? 0;
    const raya = this.rayaTotal.get(k) ?? 0;
    const salidas = this.salidasPorObra.get(k) ?? 0;
    return {
      clave: k,
      id: this.obraId(k),
      nombre: o.nombre,
      contratado: this.contratado(k),
      avanceFisico: this.avanceFisico(k, capturas),
      margenBuscado: o.margenBuscado,
      costoReal: r2(salidas + Math.max(0, raya - nomina)),
      rayaTotal: raya,
      rayaEnCaja: nomina,
    };
  }

  // ── 16. Cumplimiento ─────────────────────────────────────────────────────

  private cumplimiento(): void {
    this.comentario('Cumplimiento: REPSE propio, SIROC por obra, ICSOE/SISUB y datos IMSS');
    const r = this.azar('cumplimiento');
    this.insertar('empresa_repse', [
      {
        id: this.id('repse'),
        empresa_id: this.empresaId,
        folio: 'AR11482/2024',
        fecha_registro: ms('2024-06-10'),
        vigencia_hasta: ms('2027-06-10'),
        notas: 'Registro por servicios especializados de construcción.',
        created_at: ms(INICIO_GUION, 12),
        updated_at: ms(INICIO_GUION, 12),
      },
    ]);
    const siroc: [ClaveObra, string, string | null, string, string | null, string | null, string][] = [
      ['A', 'REGISTRADA', '2026-04-10', 'SR-2026-004517', null, null, 'Registrado en el SIROC con el contrato de la desarrolladora.'],
      ['B', 'REGISTRADA', '2026-04-24', 'SR-2026-004963', null, null, ''],
      ['C', 'PENDIENTE', null, '', null, null, 'Falta el contrato firmado por el cliente para registrarla.'],
      ['D', 'TERMINADA', '2026-04-03', 'SR-2026-003881', '2026-07-24', '2026-07-30', 'Aviso de terminación presentado.'],
    ];
    this.insertar(
      'obra_siroc',
      siroc.map(([k, estado, fr, num, ft, fa, notas]) => {
        const t = this.sello(fr ?? this.obra(k).inicio, r);
        return {
          id: this.id(`siroc:${k}`),
          empresa_id: this.empresaId,
          obra_id: this.obraId(k),
          fecha_inicio_obra: ms(this.obra(k).inicio),
          numero_registro: num,
          fecha_registro: fr ? ms(fr) : null,
          estado,
          fecha_terminacion: ft ? ms(ft) : null,
          aviso_terminacion_at: fa ? ms(fa, 12) : null,
          notas,
          created_at: t,
          updated_at: fa ? ms(fa, 12) : t,
        };
      }),
    );
    // Fechas límite: 17 de mayo (domingo → lunes 18) y 17 de septiembre.
    const obl: [string, string, string, string, string][] = [
      ['ICSOE', '2026-C1', '2026-05-18', '2026-05-14', 'Informativa de contratos de servicios especializados, enero–abril.'],
      ['SISUB', '2026-C1', '2026-05-18', '2026-05-15', 'Informativa al Infonavit, enero–abril.'],
      ['ICSOE', '2026-C2', '2026-09-17', '2026-09-14', 'Informativa de contratos de servicios especializados, mayo–agosto.'],
      ['SISUB', '2026-C2', '2026-09-17', '2026-09-15', 'Informativa al Infonavit, mayo–agosto.'],
    ];
    this.insertar(
      'obligacion_periodica',
      obl.map(([tipo, periodo, limite, entregado, desc]) => ({
        id: this.id(`obligacion:${tipo}:${periodo}`),
        empresa_id: this.empresaId,
        tipo,
        periodo,
        descripcion: desc,
        fecha_limite: ms(limite),
        entregado_at: ms(entregado, 13),
        notas: 'Presentada por el despacho contable.',
        created_at: ms(entregado, 13),
        updated_at: ms(entregado, 13),
      })),
    );
    const imss = GENTE.filter((g) => g.imss);
    this.insertar(
      'colaborador_datos_imss',
      imss.map((g) => {
        const [nac, ent] = g.imss!;
        const t = ms('2026-04-20', 11);
        return {
          colaborador_id: this.personaId(g.key),
          empresa_id: this.empresaId,
          nss: String(Math.floor(10_000_000_000 + r() * 89_999_999_999)),
          curp: this.curp(g.nombre, nac, ent, r),
          rfc: this.rfcFisica(g.nombre, nac, r),
          created_at: t,
          updated_at: t,
        };
      }),
    );
  }

  private letras(nombre: string): { ap: string; am: string; n: string } {
    const limpio = nombre
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .toUpperCase()
      .replace(/\bDE LA\b|\bDE\b/g, '')
      .split(/\s+/)
      .filter(Boolean);
    // "Nombre [Segundo] ApellidoP ApellidoM"
    const am = limpio[limpio.length - 1];
    const ap = limpio[limpio.length - 2];
    const n = limpio[0];
    return { ap, am, n };
  }

  private curp(nombre: string, nac: string, entidad: string, r: () => number): string {
    const { ap, am, n } = this.letras(nombre);
    const vocal = (s: string) => (s.slice(1).match(/[AEIOU]/) ?? ['X'])[0];
    const cons = (s: string) => (s.slice(1).match(/[B-DF-HJ-NP-TV-Z]/) ?? ['X'])[0];
    const f = nac.slice(2).replace(/-/g, '');
    const letra = () => 'ABCDEFGHIJKLMNPQRSTUVWXYZ'[Math.floor(r() * 25)];
    return `${ap[0]}${vocal(ap)}${am[0]}${n[0]}${f}H${entidad}${cons(ap)}${cons(am)}${cons(n)}${r() < 0.5 ? '0' : letra()}${Math.floor(r() * 10)}`;
  }

  private rfcFisica(nombre: string, nac: string, r: () => number): string {
    const { ap, am, n } = this.letras(nombre);
    const vocal = (s: string) => (s.slice(1).match(/[AEIOU]/) ?? ['X'])[0];
    const f = nac.slice(2).replace(/-/g, '');
    const c = () => 'ABCDEFGHJKLMNPRSTUVWXYZ0123456789'[Math.floor(r() * 33)];
    return `${ap[0]}${vocal(ap)}${am[0]}${n[0]}${f}${c()}${c()}${c()}`;
  }

  // ── 17. Bitácora y programa ──────────────────────────────────────────────

  private bitacoraYPrograma(asis: AsistenciaG[], capturas: Map<ClaveObra, Captura[]>): void {
    this.comentario('Bitácora (registrada_en la sella el servidor al cargar) y programa de obra');
    const r = this.azar('bitacora');
    const presentes = new Map<string, string[]>();
    for (const a of asis) {
      const k = `${a.obra}:${a.fecha}`;
      const l = presentes.get(k) ?? [];
      const [nom, ap] = this.persona(a.persona).nombre.split(' ');
      l.push(`${nom} ${ap}`);
      presentes.set(k, l);
    }
    const entradas: Fila[] = BITACORA.map(([obra, fecha, tipo, clima, visible, texto], i) => {
      const nombres = (presentes.get(`${obra}:${fecha}`) ?? []).sort((a, b) => a.localeCompare(b, 'es'));
      const t = this.sello(fecha, r, 17, 20);
      return {
        id: this.id(`bitacora:${i}`),
        empresa_id: this.empresaId,
        obra_id: this.obraId(obra),
        fecha: ms(fecha),
        tipo,
        texto,
        clima,
        personal_presente: nombres.length || null,
        personal_nombres: arrTexto(nombres),
        visible_cliente: visible,
        created_at: t,
        updated_at: t,
      };
    });
    this.insertar('bitacora_entrada', entradas);
    this.insertar(
      'bitacora_aclaracion',
      ACLARACIONES.map(([i, texto], j) => {
        const f = sumarDias(BITACORA[i][1], 2);
        const t = this.sello(f > this.hoy ? this.hoy : f, r, 9, 12);
        return { id: this.id(`aclaracion:${j}`), empresa_id: this.empresaId, entrada_id: this.id(`bitacora:${i}`), texto, created_at: t, updated_at: t };
      }),
    );

    // Programa: una barra por partida del presupuesto.
    const prog: Fila[] = [];
    for (const o of OBRAS) {
      const hecho = new Map<string, number>();
      for (const c of capturas.get(o.clave) ?? []) hecho.set(c.clave, r2((hecho.get(c.clave) ?? 0) + c.cantidad));
      o.partidas.forEach((pa, i) => {
        const id = this.partidaId(o.clave, pa.clave);
        const terminada = (hecho.get(`p:${id}`) ?? 0) >= pa.cantidad - 1e-6;
        const t = ms(sumarDias(o.inicio, -1), 12);
        prog.push({
          id: this.id(`programa:${o.clave}:${pa.clave}`),
          empresa_id: this.empresaId,
          obra_id: this.obraId(o.clave),
          presupuesto_id: id,
          seccion: pa.seccion,
          concepto: `${pa.clave} ${pa.concepto}`,
          fecha_inicio: ms(pa.plan[0]),
          fecha_fin: ms(pa.plan[1]),
          terminada,
          orden: i,
          created_at: t,
          updated_at: terminada ? ms((pa.real ?? pa.plan)[1] > this.hoy ? this.hoy : (pa.real ?? pa.plan)[1], 18) : t,
        });
      });
    }
    this.insertar('programa_partida', prog);
  }

  // ── 18. Seguridad ────────────────────────────────────────────────────────

  private seguridad(asis: AsistenciaG[]): void {
    this.comentario('Seguridad: revisión NOM-031 semanal, entregas de EPP e incidentes (salud mínima)');
    const r = this.azar('seguridad');
    const puntos = PUNTOS_NOM_031;
    const revisiones: Fila[] = [];
    const maestro: Record<ClaveObra, string> = { A: 'Enrique Morales', B: 'Javier Ibarra', C: 'Martín Treviño', D: 'Martín Treviño' };
    const notasNo: Record<string, string> = {
      epp_tarea: 'Dos ayudantes cortaban block sin lentes; se les entregaron.',
      altura_bordes: 'Faltaba barandal en el cubo de escalera; se colocó el mismo día.',
      orden: 'Puntas de varilla sin protección en castillos; se les pusieron tapones.',
      extintor: 'El extintor estaba descargado; se mandó a recargar.',
      electrica_provisional: 'Extensión con cable pelado; se cambió.',
      epp_chaleco: 'Un chaleco roto; se repuso.',
    };
    const dias = new Map<string, Set<string>>();
    for (const a of asis) {
      const s = dias.get(a.obra) ?? new Set<string>();
      s.add(a.fecha);
      dias.set(a.obra, s);
    }
    for (const o of OBRAS) {
      const trabajados = [...(dias.get(o.clave) ?? [])].sort();
      const semanas = new Map<string, string>();
      for (const f of trabajados) {
        const l = lunesDe(f);
        if (!semanas.has(l) && diaSemana(f) !== 6) semanas.set(l, f);
      }
      for (const [, f] of [...semanas.entries()].sort()) {
        const etapa = diasEntre(o.inicio, f) / Math.max(1, diasEntre(o.inicio, this.finObra(o.clave)));
        const pts = puntos.map(([clave, texto]) => {
          let resultado: string = 'CUMPLE';
          if (clave.startsWith('excav_') && etapa > 0.3) resultado = 'NO_APLICA';
          if (clave.startsWith('altura_') && etapa < 0.2) resultado = 'NO_APLICA';
          if (clave === 'soldadura' && o.clave !== 'D' && o.clave !== 'C') resultado = 'NO_APLICA';
          if (clave === 'transito' && o.clave === 'B') resultado = 'NO_APLICA';
          const nota = notasNo[clave];
          if (resultado === 'CUMPLE' && nota && r() < (o.clave === 'C' ? 0.09 : 0.04)) {
            return { clave, texto, resultado: 'NO_CUMPLE', nota };
          }
          return { clave, texto, resultado };
        });
        const noCumple = pts.filter((x) => x.resultado === 'NO_CUMPLE').length;
        const t = this.sello(f, r, 8, 10);
        revisiones.push({
          id: this.id(`revision:${o.clave}:${f}`),
          empresa_id: this.empresaId,
          obra_id: this.obraId(o.clave),
          fecha: ms(f),
          puntos: jsonb(pts),
          observaciones: noCumple ? 'Se corrigió lo observado el mismo día.' : 'Sin observaciones.',
          firmo_nombre: maestro[o.clave],
          created_at: t,
          updated_at: t,
        });
      }
    }
    this.insertar('seguridad_checklist', revisiones, 60);

    // EPP: casco, botas y chaleco al entrar; lo de su tarea; reposición de guantes.
    const primera = new Map<string, AsistenciaG>();
    for (const a of [...asis].sort((x, y) => x.fecha.localeCompare(y.fecha))) if (!primera.has(a.persona)) primera.set(a.persona, a);
    const epp: Fila[] = [];
    const entregar = (persona: string, obra: ClaveObra, fecha: string, articulo: string, notas = '') => {
      const t = this.sello(fecha, r, 7, 9);
      epp.push({
        id: this.id(`epp:${persona}:${articulo}:${fecha}`),
        empresa_id: this.empresaId,
        colaborador_id: this.personaId(persona),
        obra_id: this.obraId(obra),
        articulo,
        cantidad: 1,
        fecha: ms(fecha),
        entrego_nombre: 'Almacén de obra',
        notas,
        created_at: t,
        updated_at: t,
      });
    };
    for (const [persona, a] of primera) {
      entregar(persona, a.obra, a.fecha, 'Casco');
      entregar(persona, a.obra, a.fecha, 'Botas de seguridad');
      entregar(persona, a.obra, a.fecha, 'Chaleco reflejante');
      const pu = this.persona(persona).puesto;
      if (pu === 'fierrero' || pu === 'carpintero' || pu === 'ayudante') entregar(persona, a.obra, a.fecha, 'Guantes');
      if (pu === 'electricista' || pu === 'yesero' || pu === 'azulejero') entregar(persona, a.obra, a.fecha, 'Lentes de seguridad');
      if (pu === 'fierrero') entregar(persona, a.obra, sumarDias(a.fecha, 56) > this.hoy ? a.fecha : sumarDias(a.fecha, 56), 'Guantes', 'Reposición por desgaste.');
    }
    entregar('rogelio', 'C', '2026-08-03', 'Arnés con línea de vida', 'Para montaje de estructura.');
    entregar('fernando', 'C', '2026-08-03', 'Arnés con línea de vida', 'Para montaje de estructura.');
    entregar('porfirio', 'C', '2026-08-24', 'Guantes', 'Guantes anticorte al regresar de la incapacidad.');
    this.insertar('epp_entrega', epp);

    // Incidentes. La lesión va aparte y solo la ve el admin (D8).
    this.insertar('incidente', [
      {
        id: this.id('incidente:casi'),
        empresa_id: this.empresaId,
        obra_id: this.obraId('A'),
        fecha: ms('2026-06-10', 11, 20),
        tipo: 'CASI_ACCIDENTE',
        descripcion: 'Cayó una pieza de block desde el andamio del segundo nivel de la casa 3, a un metro de un ayudante. Nadie resultó lesionado.',
        acciones: 'Se colocó rodapié en el andamio, se delimitó el paso por debajo y se dio una plática de 10 minutos a la cuadrilla.',
        colaborador_id: null,
        created_at: ms('2026-06-10', 13),
        updated_at: ms('2026-06-10', 13),
      },
      {
        id: this.id('incidente:accidente'),
        empresa_id: this.empresaId,
        obra_id: this.obraId('C'),
        fecha: ms('2026-08-19', 16, 40),
        tipo: 'ACCIDENTE',
        descripcion: 'Al cortar varilla con la esmeriladora, el disco se atoró y el ayudante se cortó la mano izquierda.',
        acciones: 'Primeros auxilios en obra y traslado a la clínica del IMSS. Se retiraron los discos dañados y se revisaron las guardas de todas las esmeriladoras.',
        colaborador_id: this.personaId('porfirio'),
        dias_incapacidad: 3,
        aviso_imss_hecho: true,
        aviso_imss_fecha: ms('2026-08-20', 12),
        created_at: ms('2026-08-19', 18),
        updated_at: ms('2026-08-20', 13),
      },
    ]);
    this.insertar('incidente_salud', [
      {
        id: this.id('incidente:accidente:salud'),
        empresa_id: this.empresaId,
        incidente_id: this.id('incidente:accidente'),
        tipo_lesion: 'HERIDA',
        parte_cuerpo: 'BRAZO_MANO',
        atencion: 'IMSS',
        nota: 'Herida superficial; incapacidad de 3 días.',
        created_at: ms('2026-08-20', 13),
        updated_at: ms('2026-08-20', 13),
      },
    ]);
  }

  // ── 19. Herramienta ──────────────────────────────────────────────────────

  private herramienta(): void {
    this.comentario('Herramienta y equipo: inventario y préstamos (devueltos, activos y uno vencido)');
    const t = ms(INICIO_GUION, 12);
    this.insertar(
      'herramienta',
      HERRAMIENTA.map(([clave, nombre, tipo, costo, estado, serie]) => ({
        id: this.id(`herramienta:${clave}`),
        empresa_id: this.empresaId,
        nombre,
        tipo,
        clave,
        serie: serie ?? '',
        estado: estado ?? 'BUENO',
        costo,
        notas: estado === 'BAJA' ? 'Tarjeta quemada; no conviene repararla.' : '',
        created_at: t,
        updated_at: t,
      })),
    );
    this.insertar(
      'herramienta_asignacion',
      PRESTAMOS.map(([h, obra, persona, desde, devolver, hasta, estado, notas], i) => ({
        id: this.id(`prestamo:${h}:${i}`),
        empresa_id: this.empresaId,
        herramienta_id: this.id(`herramienta:${h}`),
        obra_id: obra ? this.obraId(obra) : null,
        colaborador_id: persona ? this.personaId(persona) : null,
        desde: ms(desde, 8),
        devolver_antes: devolver ? ms(devolver) : null,
        hasta: hasta ? ms(hasta, 17) : null,
        entrego_nombre: 'Almacén',
        recibio_nombre: hasta ? 'Almacén' : '',
        estado_regreso: estado,
        notas,
        created_at: ms(desde, 8),
        updated_at: ms(hasta ?? desde, hasta ? 17 : 8),
      })),
    );
    // La bailarina regresó dañada: queda en reparación (el trigger lo hace al
    // devolver con UPDATE; aquí el préstamo nace cerrado, así que se marca).
    this.sql(`update public.herramienta set estado = 'REPARACION', updated_at = ${ms('2026-04-24', 17)} where id = '${this.id('herramienta:H-004')}';`);
  }

  // ── 20. Garantía y postventa ─────────────────────────────────────────────

  private postventa(): void {
    this.comentario('Garantía de la bodega y dos reportes (uno resuelto, uno en revisión)');
    this.insertar('obra_garantia', [
      {
        id: this.id('garantia:D'),
        empresa_id: this.empresaId,
        obra_id: this.obraId('D'),
        entrega_fecha: ms('2026-07-31'),
        meses: 12,
        notas: 'Garantía de 12 meses por vicios ocultos en obra civil y cubierta.',
        created_at: ms('2026-07-31', 12),
        updated_at: ms('2026-07-31', 12),
      },
    ]);
    const r1 = this.id('reporte:canalon');
    const r2id = this.id('reporte:firme');
    this.insertar('garantia_reporte', [
      {
        id: r1,
        empresa_id: this.empresaId,
        obra_id: this.obraId('D'),
        origen: 'OFICINA',
        descripcion: 'Filtración de agua en el canalón del lado oriente después de la lluvia del 18 de agosto (reportado por teléfono).',
        ubicacion: 'Canalón oriente, eje 4',
        estado: 'ABIERTO',
        created_at: ms('2026-08-19', 10),
        updated_at: ms('2026-08-19', 10),
      },
      {
        id: r2id,
        empresa_id: this.empresaId,
        obra_id: this.obraId('D'),
        origen: 'OFICINA',
        descripcion: 'Grieta fina en el firme del área de andenes, de unos 2 m de largo (reportado por correo).',
        ubicacion: 'Andén 2',
        estado: 'ABIERTO',
        created_at: ms('2026-09-21', 9),
        updated_at: ms('2026-09-21', 9),
      },
    ]);
    this.sql(
      `update public.garantia_reporte set estado = 'RESUELTO', respuesta = ${lit('Se reselló la unión del canalón y se cambiaron 2 m de bajante. Prueba con agua el 28 de agosto sin filtraciones.')}, updated_at = ${ms('2026-08-28', 16)} where id = '${r1}';`,
    );
    this.sql(
      `update public.garantia_reporte set estado = 'EN_REVISION', respuesta = ${lit('Vamos a revisar con el laboratorio si es contracción del concreto. Visita programada la próxima semana.')}, updated_at = ${ms('2026-09-22', 11)} where id = '${r2id}';`,
    );
  }

  // ── 21. Fiscal: estado de cada cobro ─────────────────────────────────────

  private fiscalCobros(): void {
    this.comentario('Fiscal: cobros facturados (CFDI ficticio), por facturar y que no requieren factura');
    const r = this.azar('fiscal');
    const filas: Fila[] = [];
    const facturado = (base: Fila, fecha: string, total: number, metodo: 'PUE' | 'PPD', forma: string) => {
      const t = ms(fecha, 18);
      filas.push({
        ...base,
        empresa_id: this.empresaId,
        estado: 'facturado',
        metodo_pago: metodo,
        forma_pago: forma,
        uso_cfdi: 'I01',
        iva_modo: 'incluido',
        uuid: this.uuidCfdi(r),
        fecha_factura: ms(fecha, 12),
        total_factura: dinero(total),
        created_at: t,
        updated_at: t,
      });
    };
    // Estimaciones cobradas: facturadas, salvo la última de cada obra.
    const ultimas = new Set<string>();
    for (const k of ['A', 'D'] as ClaveObra[]) {
      const l = this.estimacionesCobradas.filter((e) => e.obra === k);
      if (l.length) ultimas.add(l[l.length - 1].estimacionId);
    }
    for (const e of this.estimacionesCobradas) {
      const base: Fila = { id: this.id(`cobro-fiscal:est:${e.estimacionId}`), estimacion_id: e.estimacionId };
      if (ultimas.has(e.estimacionId) && e.obra === 'A') {
        filas.push({ ...base, empresa_id: this.empresaId, estado: 'por_facturar', created_at: ms(e.fecha, 18), updated_at: ms(e.fecha, 18) });
      } else {
        facturado(base, sumarDias(e.fecha, -8), 0, 'PPD', '99');
      }
    }
    // Anticipos (con factura de anticipo).
    facturado({ id: this.id('cobro-fiscal:anticipo:A'), movimiento_id: this.id('anticipo:A') }, '2026-04-03', 0, 'PUE', '03');
    facturado({ id: this.id('cobro-fiscal:anticipo:D'), movimiento_id: this.id('anticipo:D') }, '2026-03-31', 0, 'PUE', '03');
    // Remodelación: la primera facturada, un pago en efectivo que no la requiere, el resto por facturar.
    this.cobrosSinEstimacion.forEach((c, i) => {
      const base: Fila = { id: this.id(`cobro-fiscal:mov:${c.id}`), movimiento_id: c.id };
      if (c.obra === 'B' && i === 0) facturado(base, c.fecha, 0, 'PUE', '03');
      else if (c.obra === 'B' && c.concepto.startsWith('Anticipo de extras')) {
        filas.push({ ...base, empresa_id: this.empresaId, estado: 'no_requiere', notas: 'Pago en efectivo; la clienta no pidió factura de los extras.', created_at: ms(c.fecha, 18), updated_at: ms(c.fecha, 18) });
      } else if (c.obra === 'C' && i === 5) facturado(base, c.fecha, 0, 'PUE', '03');
      else filas.push({ ...base, empresa_id: this.empresaId, estado: 'por_facturar', created_at: ms(c.fecha, 18), updated_at: ms(c.fecha, 18) });
    });
    // Pagos de la impermeabilización: no requieren factura.
    for (let i = 0; i < 2; i++) {
      filas.push({
        id: this.id(`cobro-fiscal:pago:${i}`),
        pago_id: this.id(`pago:elizondo:${i}`),
        empresa_id: this.empresaId,
        estado: 'no_requiere',
        notas: 'Particular; no pidió factura.',
        created_at: ms('2026-05-16', 18),
        updated_at: ms('2026-05-16', 18),
      });
    }
    // Los totales de factura de anticipos y cobros: se leen del movimiento.
    for (const f of filas) {
      if (!(f.total_factura instanceof Crudo) || f.total_factura.sql !== '0.00') continue;
      if (typeof f.movimiento_id === 'string') {
        f.total_factura = crudo(`(select m.monto from public.movimientos m where m.id = '${f.movimiento_id}')`);
      } else if (typeof f.estimacion_id === 'string') {
        // La factura de una estimación es su importe después de amortizar, más IVA.
        f.total_factura = crudo(`(select e.total from public.estimaciones e where e.id = '${f.estimacion_id}')`);
      }
    }
    this.insertar('cobro_fiscal', filas);
  }

  // ── 22. Cierre ───────────────────────────────────────────────────────────

  private cierre(): void {
    this.comentario('Cierre: avance a mano de cada obra (= físico) y la bodega queda terminada');
    for (const o of OBRAS) {
      // `obras.avance` lo actualiza la web desde la captura de avance (F3-13).
      this.sql(
        `update public.obras set avance = ${Math.round(this.avanceFisicoFinal.get(o.clave) ?? 0)}, activa = ${o.fin ? 'false' : 'true'}, updated_at = ${ms(o.fin ?? '2026-09-25', 18)} where id = '${this.obraId(o.clave)}';`,
      );
    }
    this.sql('reset role;');
    this.sql(`perform set_config('request.jwt.claims', '', true);`);
    this.sql(`perform set_config('request.jwt.claim.sub', '', true);`);
    this.sql(`perform set_config('request.jwt.claim.role', '', true);`);
    this.sql(`raise notice 'Demo sembrado en la empresa %', _emp;`);
    this.L.push('end', '$demo$;');
    if (this.transaccion) this.L.push('commit;');
  }

  private avanceFisicoFinal = new Map<ClaveObra, number>();
}

/**
 * Plantilla NOM-031 (clave y texto) que usa la revisión diaria. Copia de
 * `lib/seguridad/plantilla.ts` para no importar código de la web desde el
 * script de línea de comandos; `demo-seis-meses.test.ts` exige que coincidan.
 */
export const PUNTOS_NOM_031: readonly [clave: string, texto: string][] = [
  ['epp_casco', 'Todos traen casco'],
  ['epp_calzado', 'Todos traen calzado de seguridad (botas)'],
  ['epp_chaleco', 'Todos traen chaleco reflejante'],
  ['epp_tarea', 'Guantes, lentes, tapones o mascarilla según lo que hace cada quien (cortar, picar, pulir, colar)'],
  ['epp_visitas', 'Las visitas entran con casco'],
  ['altura_bordes', 'Bordes de losa, huecos y cubos protegidos (barandal, red o tapa)'],
  ['altura_arnes', 'Quien trabaja en altura usa arnés bien anclado'],
  ['altura_andamios', 'Andamios firmes, nivelados y con la plataforma completa; revisados hoy'],
  ['altura_escaleras', 'Escaleras de mano en buen estado y bien apoyadas'],
  ['excav_paredes', 'Paredes revisadas: sin grietas ni desprendimientos (ademe donde haga falta)'],
  ['excav_orilla', 'Tierra, material y maquinaria lejos de la orilla'],
  ['excav_acceso', 'Excavación delimitada y con escalera o rampa para salir'],
  ['maq_revisada', 'Maquinaria revisada antes de trabajar y con sus guardas puestas'],
  ['herr_estado', 'Herramienta en buen estado (sin mangos flojos, discos o cables dañados)'],
  ['electrica_provisional', 'Cables e instalación provisional sin partes peladas, lejos del agua y del paso'],
  ['soldadura', 'Donde se suelda o corta: sin material que arda cerca y con mampara'],
  ['transito', 'Paso de camiones y maquinaria separado del paso de la gente'],
  ['orden', 'Obra ordenada: pasillos libres, sin clavos ni puntas de varilla expuestas'],
  ['senales', 'Señales de riesgo y de uso de equipo a la vista'],
  ['extintor', 'Extintor a la mano y cargado'],
  ['emergencias', 'Botiquín y teléfonos de emergencia a la vista'],
  ['agua_sanitarios', 'Agua para tomar y sanitarios para la gente'],
  ['comedor', 'Lugar limpio para comer'],
];
