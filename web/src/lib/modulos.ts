/**
 * Catálogo de MÓDULOS por empresa — la ÚNICA fuente en la web.
 *
 * Cada empresa prende las partes de la app que usa (plan
 * `docs/PLAN_ALCANCE_AMPLIADO.md` §2). Aquí vive todo lo que la interfaz
 * necesita saber de un módulo: su nombre, cómo se explica, de qué depende, qué
 * rutas son suyas y qué enlaces pone en la barra. No crees listas paralelas: la
 * barra, la paleta de comandos, Ajustes y el onboarding leen de aquí.
 *
 * Módulo PURO (sin `server-only`, sin Supabase) para que lo importen igual los
 * componentes de cliente, los de servidor y las pruebas.
 *
 * ESPEJO EN LA BASE: `supabase/migrations/0035_modulos_empresa.sql` tiene el
 * catálogo y las dependencias en `modulos_catalogo()` y
 * `modulos_dependencias()`. `modulos.test.ts` lee esa migración y falla si las
 * dos listas dejan de coincidir.
 *
 * REGLA QUE MANDA: apagar un módulo OCULTA, nunca BORRA. Esto es presentación,
 * no seguridad: lo que se puede leer o escribir lo sigue decidiendo la RLS.
 *
 * CADA FASE NUEVA: cambia `disponible: true` en su módulo, llena `rutas` y
 * `nav`, y listo. Nada más en la web tiene que enterarse.
 */

export const CLAVES_MODULO = [
  // Existentes
  'obras',
  'cotizaciones',
  'equipo',
  'cuadrillas',
  'caja',
  'proyeccion',
  'notas',
  'portal',
  // Futuros (F1–F7)
  'cambios',
  'rentabilidad',
  'fiscal',
  'compras',
  'estimaciones',
  'bitacora',
  'programa',
  'cumplimiento',
  'subcontratos',
  'seguridad',
  'postventa',
  'herramienta',
] as const;

export type ClaveModulo = (typeof CLAVES_MODULO)[number];

/** Cómo se agrupan en Ajustes → Módulos. En palabras de obra, no de sistema. */
export type GrupoModulo = 'base' | 'dinero' | 'gente' | 'socios' | 'obra' | 'cliente' | 'papeles';

export const GRUPOS_MODULO: { clave: GrupoModulo; titulo: string }[] = [
  { clave: 'base', titulo: 'Lo básico' },
  { clave: 'dinero', titulo: 'Cotizar, cobrar y pagar' },
  { clave: 'gente', titulo: 'Tu gente y la raya' },
  { clave: 'socios', titulo: 'Maestros y subcontratistas' },
  { clave: 'obra', titulo: 'En la obra' },
  { clave: 'cliente', titulo: 'Tu cliente' },
  { clave: 'papeles', titulo: 'IMSS y papeles' },
];

export interface NavModulo {
  href: string;
  label: string;
  /** Posición en la barra (menor = más a la izquierda). */
  orden: number;
  /**
   * Solo estos roles ven el enlace. Sin lista, todos. Es PRESENTACIÓN: la
   * página vuelve a comprobar el permiso en el servidor (p. ej. la utilidad,
   * decisión D1, `lib/auth/utilidad.ts`).
   */
  roles?: readonly string[];
}

export interface Modulo {
  clave: ClaveModulo;
  nombre: string;
  /** Qué resuelve, en lenguaje de obra. Es lo que lee el dueño al decidir. */
  descripcion: string;
  grupo: GrupoModulo;
  /** Módulos que se prenden solos al prender este. */
  dependeDe: ClaveModulo[];
  /**
   * Rutas que le pertenecen. Coinciden por PREFIJO de segmentos y un segmento
   * `*` vale por cualquiera (se usa en lugar del id de la obra). Gana la ruta más
   * específica: `/admin/obras/123/nomina` es de `equipo`, no de `obras`.
   */
  rutas: string[];
  /** Enlaces que pone en la barra principal. */
  nav?: NavModulo[];
  /** true solo cuando la fase ya se construyó. Lo demás sale "Próximamente". */
  disponible: boolean;
  /** El núcleo: siempre prendido, no tiene interruptor. */
  nucleo?: boolean;
}

export const MODULOS: readonly Modulo[] = [
  {
    clave: 'obras',
    nombre: 'Obras y clientes',
    descripcion: 'Tus obras y tus clientes. Es la base de todo, por eso siempre está prendido.',
    grupo: 'base',
    dependeDe: [],
    rutas: ['/admin/obras', '/admin/clientes'],
    nav: [
      { href: '/admin/obras', label: 'Obras', orden: 20 },
      { href: '/admin/clientes', label: 'Clientes', orden: 40 },
    ],
    disponible: true,
    nucleo: true,
  },
  {
    clave: 'cotizaciones',
    nombre: 'Cotizaciones y presupuesto',
    descripcion:
      'Arma cotizaciones con tu lista de precios, mándalas en PDF y lleva el presupuesto de cada obra.',
    grupo: 'dinero',
    dependeDe: [],
    rutas: ['/admin/cotizaciones', '/admin/catalogo'],
    nav: [{ href: '/admin/cotizaciones', label: 'Cotizaciones', orden: 30 }],
    disponible: true,
  },
  {
    clave: 'caja',
    nombre: 'Caja de la obra',
    descripcion:
      'Lo que entra y sale de cada obra: pagos, gastos, comprobantes, el estado de cuenta del cliente y la carga del estado de cuenta del banco.',
    grupo: 'dinero',
    dependeDe: [],
    rutas: [
      '/admin/obras/*/importar',
      '/admin/obras/*/pdf',
      '/admin/obras/*/exportar',
      '/admin/obras/*/estado-cuenta-cliente',
    ],
    disponible: true,
  },
  {
    clave: 'equipo',
    nombre: 'Equipo, asistencia y raya',
    descripcion:
      'Tu gente con su puesto y su sueldo, el pase de lista de cada día y la raya del viernes.',
    grupo: 'gente',
    dependeDe: [],
    rutas: [
      '/admin/equipo',
      '/admin/puestos',
      '/campo',
      '/admin/obras/*/asistencia',
      '/admin/obras/*/nomina',
    ],
    nav: [
      { href: '/campo', label: 'Pase de lista', orden: 10 },
      { href: '/admin/equipo', label: 'Equipo', orden: 50 },
    ],
    disponible: true,
  },
  {
    clave: 'cuadrillas',
    nombre: 'Cuadrillas y destajo',
    descripcion: 'Agrupa a tu gente en cuadrillas con su jefe y paga los destajos por cuadrilla.',
    grupo: 'gente',
    dependeDe: ['equipo'],
    rutas: ['/admin/cuadrillas'],
    nav: [{ href: '/admin/cuadrillas', label: 'Cuadrillas', orden: 60 }],
    disponible: true,
  },
  {
    clave: 'proyeccion',
    nombre: 'Proyección de la raya',
    descripcion: 'Cuánto vas a pagar de raya la semana que viene, persona por persona.',
    grupo: 'gente',
    dependeDe: ['equipo'],
    rutas: ['/admin/proyeccion'],
    nav: [{ href: '/admin/proyeccion', label: 'Proyección', orden: 70 }],
    disponible: true,
  },
  {
    clave: 'notas',
    nombre: 'Tratos con maestros y socios',
    descripcion:
      'Los tratos de palabra con tus maestros y subcontratistas: lo acordado, lo pagado y lo que falta.',
    grupo: 'socios',
    dependeDe: [],
    rutas: ['/admin/obras/*/notas'],
    disponible: true,
  },
  {
    clave: 'portal',
    nombre: 'Portal del cliente',
    descripcion:
      'Tu cliente entra con un código y ve sus cotizaciones y cómo va su obra, sin tener que llamarte.',
    grupo: 'cliente',
    dependeDe: [],
    // El portal vive en /cliente, fuera del panel. Lo que este módulo controla en
    // /admin es la tarjeta "Acceso al portal" de cada cliente (ver PROGRESO).
    rutas: [],
    disponible: true,
  },
  // ── Futuros ──────────────────────────────────────────────────────────────
  {
    clave: 'cambios',
    nombre: 'Extras y cambios',
    descripcion: 'Los extras que te pide el cliente, aprobados por él y sumados a lo que te debe.',
    grupo: 'dinero',
    dependeDe: ['cotizaciones'],
    // Viven dentro de cada obra (pestaña "Extras"); no llevan enlace en la barra.
    rutas: ['/admin/obras/*/extras'],
    disponible: true,
  },
  {
    clave: 'rentabilidad',
    nombre: 'Ganancia por obra',
    descripcion: 'Cuánto te está dejando cada obra: lo contratado contra lo que llevas gastado.',
    grupo: 'dinero',
    dependeDe: ['cotizaciones'],
    rutas: ['/admin/rentabilidad', '/admin/obras/*/utilidad'],
    // Decisión D1: la utilidad es del dueño y del contador, no del supervisor.
    nav: [{ href: '/admin/rentabilidad', label: 'Utilidad', orden: 45, roles: ['admin', 'contador'] }],
    disponible: true,
  },
  {
    clave: 'fiscal',
    nombre: 'Datos para facturar',
    descripcion:
      'Junta los datos de cada cobro para facturar o para tu contador. La app no factura ni se conecta al SAT.',
    grupo: 'dinero',
    dependeDe: ['cotizaciones'],
    // La hoja de cada cobro, lo pendiente y el paquete para el contador. Los
    // datos fiscales del emisor (Ajustes), del cliente (su ficha) y del portal
    // se muestran solo con el módulo prendido (ver PROGRESO, F1b).
    rutas: ['/admin/facturacion'],
    nav: [{ href: '/admin/facturacion', label: 'Facturación', orden: 35 }],
    disponible: true,
  },
  {
    clave: 'estimaciones',
    nombre: 'Avance y estimaciones',
    descripcion:
      'Cobra por avance: lo que se hizo en el periodo por el precio pactado, con anticipo y retenciones.',
    grupo: 'dinero',
    dependeDe: ['cotizaciones'],
    rutas: [],
    disponible: false,
  },
  {
    clave: 'compras',
    nombre: 'Compras y material',
    descripcion: 'Pide material desde la obra, compra, recibe y sabe cuánto costó en cada obra.',
    grupo: 'obra',
    dependeDe: [],
    rutas: [],
    disponible: false,
  },
  {
    clave: 'bitacora',
    nombre: 'Bitácora con fotos',
    descripcion: 'Lo que pasa cada día en la obra, con fotos y fecha, para tener evidencia.',
    grupo: 'obra',
    dependeDe: [],
    // Vive dentro de cada obra (pestaña "Bitácora"): no pone enlace en la barra.
    rutas: ['/admin/obras/*/bitacora'],
    disponible: true,
  },
  {
    clave: 'programa',
    nombre: 'Programa de obra',
    descripcion: 'Fechas de inicio y fin de cada partida, y qué va atrasado.',
    grupo: 'obra',
    dependeDe: [],
    // Vive dentro de cada obra (pestaña "Programa"): no pone enlace en la barra.
    rutas: ['/admin/obras/*/programa'],
    disponible: true,
  },
  {
    clave: 'seguridad',
    nombre: 'Seguridad en obra',
    descripcion: 'Revisión diaria, equipo de protección entregado e incidentes.',
    grupo: 'obra',
    dependeDe: [],
    // Vive dentro de cada obra (pestaña "Seguridad") y en la ficha de cada
    // colaborador (EPP entregado): no pone enlace en la barra.
    rutas: ['/admin/obras/*/seguridad'],
    disponible: true,
  },
  {
    clave: 'herramienta',
    nombre: 'Herramienta y maquinaria',
    descripcion: 'Qué herramienta tienes, en qué obra está y quién la trae.',
    grupo: 'obra',
    dependeDe: [],
    rutas: ['/admin/herramienta'],
    // El colaborador no ve herramienta (0043): el enlace es para la oficina.
    nav: [{ href: '/admin/herramienta', label: 'Herramienta', orden: 65, roles: ['admin', 'supervisor', 'contador'] }],
    disponible: true,
  },
  {
    clave: 'subcontratos',
    nombre: 'Contratos de subcontrato',
    descripcion: 'Convierte un trato con un subcontratista en contrato, con sus retenciones.',
    grupo: 'socios',
    dependeDe: ['notas'],
    // El botón "Convertir en contrato" vive en la nota (ruta de `notas`); lo
    // oculta la propia página si este módulo está apagado.
    rutas: ['/admin/subcontratos'],
    nav: [{ href: '/admin/subcontratos', label: 'Subcontratos', orden: 75 }],
    disponible: true,
  },
  {
    clave: 'postventa',
    nombre: 'Garantías',
    descripcion: 'Tu cliente reporta una garantía desde el portal y tú le das seguimiento.',
    grupo: 'cliente',
    dependeDe: [],
    // En el portal, "Reportar un problema" sale solo con el módulo prendido
    // (RPC `postventa_disponible`, 0043); lo ya reportado se sigue viendo.
    rutas: ['/admin/postventa'],
    nav: [{ href: '/admin/postventa', label: 'Garantías', orden: 42, roles: ['admin', 'supervisor', 'contador'] }],
    disponible: true,
  },
  {
    clave: 'cumplimiento',
    nombre: 'IMSS, SIROC y REPSE',
    descripcion:
      'Te recuerda lo que toca con el IMSS y guarda los comprobantes, para que no te multen. El trámite lo haces tú o tu contador.',
    grupo: 'papeles',
    dependeDe: [],
    // La tarjeta SIROC del detalle de la obra la muestra la página de la obra
    // (núcleo) solo si este módulo está prendido y el rol es admin/contador.
    rutas: ['/admin/cumplimiento'],
    nav: [{ href: '/admin/cumplimiento', label: 'IMSS y papeles', orden: 80 }],
    disponible: true,
  },
];

const POR_CLAVE = new Map<ClaveModulo, Modulo>(MODULOS.map((m) => [m.clave, m]));

/** El módulo de una clave. Lanza si no existe: una clave inválida es un bug. */
export function modulo(clave: ClaveModulo): Modulo {
  const m = POR_CLAVE.get(clave);
  if (!m) throw new Error(`Módulo desconocido: ${clave}`);
  return m;
}

export function esClaveModulo(x: unknown): x is ClaveModulo {
  return typeof x === 'string' && POR_CLAVE.has(x as ClaveModulo);
}

/**
 * Lo que tiene prendido una empresa que nunca eligió: los 8 módulos que existían
 * antes de que hubiera módulos. Es el default de la columna en 0035 y el paquete
 * del perfil "contratista con cuadrillas", que es el de "Saltar".
 */
export const PAQUETE_POR_DEFECTO: readonly ClaveModulo[] = [
  'obras',
  'cotizaciones',
  'equipo',
  'cuadrillas',
  'caja',
  'proyeccion',
  'notas',
  'portal',
];

const ORDEN = new Map<ClaveModulo, number>(CLAVES_MODULO.map((c, i) => [c, i]));

function ordenar(claves: Iterable<ClaveModulo>): ClaveModulo[] {
  return [...new Set(claves)].sort((a, b) => (ORDEN.get(a) ?? 0) - (ORDEN.get(b) ?? 0));
}

/**
 * Agrega `obras` y todo lo que se necesita para que cada módulo funcione, sin
 * repetidos y en el orden del catálogo. Es la misma regla que
 * `public.modulos_resolver` en la base.
 */
export function resolverDependencias(claves: Iterable<ClaveModulo>): ClaveModulo[] {
  const resultado = new Set<ClaveModulo>(['obras', ...claves]);
  const pendientes = [...resultado];
  while (pendientes.length > 0) {
    const actual = pendientes.pop()!;
    for (const dep of POR_CLAVE.get(actual)?.dependeDe ?? []) {
      if (!resultado.has(dep)) {
        resultado.add(dep);
        pendientes.push(dep);
      }
    }
  }
  return ordenar(resultado);
}

/**
 * Módulos que dejarían de funcionar si se apaga `clave` (directa o
 * indirectamente). Sirve para avisar ANTES: "si apagas Equipo, también se apagan
 * Cuadrillas y Proyección".
 */
export function dependientesDe(clave: ClaveModulo, entre?: Iterable<ClaveModulo>): ClaveModulo[] {
  const universo = entre ? new Set(entre) : new Set(CLAVES_MODULO);
  const fuera = new Set<ClaveModulo>([clave]);
  let cambio = true;
  while (cambio) {
    cambio = false;
    for (const m of MODULOS) {
      if (!universo.has(m.clave) || fuera.has(m.clave)) continue;
      if (m.dependeDe.some((d) => fuera.has(d))) {
        fuera.add(m.clave);
        cambio = true;
      }
    }
  }
  fuera.delete(clave);
  return ordenar(fuera);
}

/**
 * Lo que queda prendido al APAGAR `clave`: se quita ella y lo que depende de
 * ella. (El núcleo no se apaga.)
 */
export function apagarModulo(activos: Iterable<ClaveModulo>, clave: ClaveModulo): ClaveModulo[] {
  if (POR_CLAVE.get(clave)?.nucleo) return resolverDependencias(activos);
  const quitar = new Set([clave, ...dependientesDe(clave, activos)]);
  return resolverDependencias([...activos].filter((c) => !quitar.has(c)));
}

/** Lo que queda prendido al PRENDER `clave` (con sus dependencias). */
export function prenderModulo(activos: Iterable<ClaveModulo>, clave: ClaveModulo): ClaveModulo[] {
  return resolverDependencias([...activos, clave]);
}

/**
 * Normaliza lo que venga de `empresa_config.modulos`: puede faltar (migración
 * sin aplicar, fila ausente) o traer claves que esta versión de la web no
 * conoce. Ante la duda, el paquete de siempre: nunca se deja a una empresa sin
 * pantallas por un dato raro.
 */
export function normalizarModulos(crudo: unknown): ClaveModulo[] {
  if (!Array.isArray(crudo)) return [...PAQUETE_POR_DEFECTO];
  return resolverDependencias(crudo.filter(esClaveModulo));
}

// ── Rutas ────────────────────────────────────────────────────────────────────

function segmentos(ruta: string): string[] {
  // Fuera query y ancla: `/admin/obras?nueva=1` es la ruta `/admin/obras`.
  const limpia = ruta.split(/[?#]/)[0] ?? '';
  return limpia.split('/').filter(Boolean);
}

function coincidePatron(ruta: string[], patron: string[]): boolean {
  if (ruta.length < patron.length) return false;
  return patron.every((p, i) => p === '*' || p === ruta[i]);
}

/**
 * ¿De qué módulo es esta ruta? Gana el patrón más largo (el más específico).
 * `null` = no es de ningún módulo (Inicio, Ajustes, Usuarios…): siempre visible.
 */
export function rutaPerteneceAModulo(ruta: string): ClaveModulo | null {
  const segs = segmentos(ruta);
  let mejor: { clave: ClaveModulo; largo: number } | null = null;
  for (const m of MODULOS) {
    for (const r of m.rutas) {
      const patron = segmentos(r);
      if (coincidePatron(segs, patron) && (!mejor || patron.length > mejor.largo)) {
        mejor = { clave: m.clave, largo: patron.length };
      }
    }
  }
  return mejor?.clave ?? null;
}

/** ¿Se muestra un enlace a esta ruta con estos módulos prendidos? */
export function rutaVisible(ruta: string, activos: readonly ClaveModulo[]): boolean {
  const clave = rutaPerteneceAModulo(ruta);
  if (!clave) return true;
  return activos.includes(clave) && modulo(clave).disponible;
}

/**
 * Enlaces de la barra para lo prendido, en su orden. Siempre abre con Inicio.
 * Con `rol`, se quitan los enlaces restringidos a otros roles; sin él (un
 * componente que no lo conoce), también se quitan: ante la duda, menos.
 */
export function navDeModulos(
  activos: readonly ClaveModulo[],
  rol?: string,
): { href: string; label: string }[] {
  const enlaces: NavModulo[] = [{ href: '/admin', label: 'Inicio', orden: 0 }];
  for (const m of MODULOS) {
    if (!m.disponible || !activos.includes(m.clave)) continue;
    for (const n of m.nav ?? []) {
      if (n.roles && !(rol && n.roles.includes(rol))) continue;
      enlaces.push(n);
    }
  }
  return enlaces.sort((a, b) => a.orden - b.orden).map(({ href, label }) => ({ href, label }));
}

// ── Perfil del registro (plan §4.2) ─────────────────────────────────────────

export type TipoEmpresa = 'independiente' | 'contratista' | 'empresa' | 'constructora';
export type Factura = 'si' | 'algunos' | 'no';
export type Necesidad =
  | 'cotizar'
  | 'raya'
  | 'cuadrillas'
  | 'caja'
  | 'ganancia'
  | 'extras'
  | 'material'
  | 'estimaciones'
  | 'cliente'
  | 'tratos'
  | 'evidencia'
  | 'imss'
  | 'facturar';

/** Paso 2 — ¿Cómo trabajas hoy? Copy exacto del plan. */
export const TIPOS_EMPRESA: { valor: TipoEmpresa; texto: string }[] = [
  { valor: 'independiente', texto: 'Trabajo solo o con 1–3 ayudantes' },
  { valor: 'contratista', texto: 'Tengo una o varias cuadrillas' },
  { valor: 'empresa', texto: 'Tengo oficina: supervisores o residentes, contadora' },
  { valor: 'constructora', texto: 'Soy constructora o desarrolladora con varios frentes' },
];

/** Paso 2, pregunta secundaria. */
export const OPCIONES_FACTURA: { valor: Factura; texto: string }[] = [
  { valor: 'si', texto: 'Sí' },
  { valor: 'algunos', texto: 'Algunos' },
  { valor: 'no', texto: 'No, todavía no' },
];

/** Paso 3 — ¿Qué quieres resolver primero? Copy exacto del plan. */
export const NECESIDADES: { valor: Necesidad; texto: string }[] = [
  { valor: 'cotizar', texto: 'Cotizar rápido y verme profesional' },
  { valor: 'raya', texto: 'Pasar lista y sacar la raya del viernes' },
  { valor: 'cuadrillas', texto: 'Organizar mis cuadrillas y pagar destajos' },
  { valor: 'caja', texto: 'Saber cuánto dinero entra y sale de cada obra' },
  { valor: 'ganancia', texto: 'Saber si la obra me está dejando ganancia' },
  { valor: 'extras', texto: 'Cobrar los extras que me piden' },
  { valor: 'material', texto: 'Controlar el material y las compras' },
  { valor: 'estimaciones', texto: 'Cobrar por avance (estimaciones)' },
  { valor: 'cliente', texto: 'Que mi cliente vea cómo va su obra' },
  { valor: 'tratos', texto: 'Llevar los tratos con mis maestros y subcontratistas' },
  { valor: 'evidencia', texto: 'Tener evidencia con fotos de todo lo que pasa' },
  { valor: 'imss', texto: 'Cumplir con IMSS, SIROC y REPSE' },
  { valor: 'facturar', texto: 'Tener todo listo para facturar o para mi contador' },
];

const PAQUETE_BASE: Record<TipoEmpresa, ClaveModulo[]> = {
  independiente: ['obras', 'cotizaciones', 'equipo', 'caja'],
  contratista: ['cuadrillas', 'proyeccion', 'notas', 'portal'],
  empresa: ['rentabilidad', 'compras', 'estimaciones'],
  constructora: ['bitacora', 'programa', 'cumplimiento', 'subcontratos'],
};

/** Cada perfil incluye el paquete de los anteriores ("+ …" en la tabla del plan). */
const ESCALERA_TIPOS: TipoEmpresa[] = ['independiente', 'contratista', 'empresa', 'constructora'];

function paqueteBase(tipo: TipoEmpresa): ClaveModulo[] {
  const hasta = ESCALERA_TIPOS.indexOf(tipo);
  return ESCALERA_TIPOS.slice(0, hasta + 1).flatMap((t) => PAQUETE_BASE[t]);
}

/**
 * Módulos que prende una necesidad del paso 3. El PRIMERO es el que la
 * resuelve; los demás son apoyo (ver `necesidadProximamente`).
 */
export function modulosDeNecesidad(n: Necesidad, tipo: TipoEmpresa): ClaveModulo[] {
  switch (n) {
    case 'cotizar':
      return ['cotizaciones'];
    case 'raya':
      return ['equipo'];
    case 'cuadrillas':
      return ['cuadrillas', 'equipo'];
    case 'caja':
      return ['caja'];
    case 'ganancia':
      return ['rentabilidad', 'cotizaciones'];
    case 'extras':
      return ['cambios'];
    case 'material':
      return ['compras'];
    case 'estimaciones':
      return ['estimaciones'];
    case 'cliente':
      return ['portal'];
    case 'tratos':
      // "notas (+ subcontratos si es empresa)": los perfiles con oficina.
      return tipo === 'empresa' || tipo === 'constructora' ? ['notas', 'subcontratos'] : ['notas'];
    case 'evidencia':
      return ['bitacora'];
    case 'imss':
      return ['cumplimiento'];
    case 'facturar':
      return ['fiscal'];
  }
}

/**
 * ¿La necesidad todavía no se puede resolver? Se decide por su módulo
 * PRINCIPAL: "Saber si la obra me deja ganancia" prende cotizaciones (que ya
 * existe) pero lo que resuelve es la utilidad por obra (que viene), así que se
 * muestra como "Próximamente" aunque una parte ya esté.
 */
export function necesidadProximamente(n: Necesidad, tipo: TipoEmpresa | null): boolean {
  const principal = modulosDeNecesidad(n, tipo ?? 'contratista')[0];
  return !modulo(principal).disponible;
}

export interface Recomendacion {
  /** Lo que se prende de verdad: solo módulos disponibles, con dependencias. */
  activos: ClaveModulo[];
  /**
   * Lo pedido que todavía no existe. NO se prende: se guarda en `perfil` como
   * lista de demanda (ver decisión en docs/PROGRESO_ALCANCE.md).
   */
  proximamente: ClaveModulo[];
}

/**
 * Paquete recomendado según las respuestas del cuestionario (plan §4.2):
 * unión de paquete base + necesidades + (cumplimiento si factura) +
 * dependencias, separada en lo que ya existe y lo que viene.
 *
 * Sin tipo (se saltó la pregunta) = contratista, el paquete de "Saltar".
 */
export function modulosPorPerfil(
  tipo: TipoEmpresa | null,
  necesidades: readonly Necesidad[],
  factura: Factura | null,
): Recomendacion {
  const t = tipo ?? 'contratista';
  const pedidos: ClaveModulo[] = [
    ...paqueteBase(t),
    ...necesidades.flatMap((n) => modulosDeNecesidad(n, t)),
    ...(factura === 'si' || factura === 'algunos' ? (['cumplimiento'] as const) : []),
  ];
  const todos = resolverDependencias(pedidos);
  return {
    activos: todos.filter((c) => modulo(c).disponible),
    proximamente: todos.filter((c) => !modulo(c).disponible),
  };
}

// ── Perfil guardado ─────────────────────────────────────────────────────────

export interface PerfilEmpresa {
  tipo: TipoEmpresa | null;
  factura: Factura | null;
  necesidades: Necesidad[];
  proximamente: ClaveModulo[];
  /** Se saltó el cuestionario. */
  saltado: boolean;
  /** Cerró la tarjeta "Siguiente paso" del inicio. */
  siguientePasoDescartado: boolean;
}

const TIPOS = new Set<string>(TIPOS_EMPRESA.map((t) => t.valor));
const FACTURAS = new Set<string>(OPCIONES_FACTURA.map((f) => f.valor));
const NECESIDADES_VALIDAS = new Set<string>(NECESIDADES.map((n) => n.valor));

export function esTipoEmpresa(x: unknown): x is TipoEmpresa {
  return typeof x === 'string' && TIPOS.has(x);
}
export function esFactura(x: unknown): x is Factura {
  return typeof x === 'string' && FACTURAS.has(x);
}
export function esNecesidad(x: unknown): x is Necesidad {
  return typeof x === 'string' && NECESIDADES_VALIDAS.has(x);
}

/** Lee el jsonb `perfil`, descartando lo que no se reconozca. `null` si no hay. */
export function leerPerfil(crudo: unknown): PerfilEmpresa | null {
  if (!crudo || typeof crudo !== 'object' || Array.isArray(crudo)) return null;
  const o = crudo as Record<string, unknown>;
  const lista = (v: unknown) => (Array.isArray(v) ? v : []);
  return {
    tipo: esTipoEmpresa(o.tipo) ? o.tipo : null,
    factura: esFactura(o.factura) ? o.factura : null,
    necesidades: [...new Set(lista(o.necesidades).filter(esNecesidad))],
    proximamente: ordenar(lista(o.proximamente).filter(esClaveModulo)),
    saltado: o.saltado === true,
    siguientePasoDescartado: o.siguiente_paso_descartado === true,
  };
}

/**
 * Arma el perfil a partir de las respuestas CRUDAS del cuestionario (vienen del
 * navegador: no se confía en ellas). Lo desconocido se descarta y la lista de
 * "próximamente" se recalcula aquí, no se toma de lo que mande el cliente.
 */
export function perfilDeRespuestas(r: {
  tipo: unknown;
  factura: unknown;
  necesidades: unknown;
  saltado: boolean;
}): PerfilEmpresa {
  const tipo = esTipoEmpresa(r.tipo) ? r.tipo : null;
  const factura = esFactura(r.factura) ? r.factura : null;
  const necesidades = [
    ...new Set((Array.isArray(r.necesidades) ? r.necesidades : []).filter(esNecesidad)),
  ];
  return {
    tipo,
    factura,
    necesidades,
    proximamente: modulosPorPerfil(tipo, necesidades, factura).proximamente,
    saltado: r.saltado,
    siguientePasoDescartado: false,
  };
}

/** El jsonb que se guarda (claves en snake_case, como el resto de la base). */
export function perfilAJson(p: PerfilEmpresa): Record<string, unknown> {
  return {
    tipo: p.tipo,
    factura: p.factura,
    necesidades: p.necesidades,
    proximamente: p.proximamente,
    saltado: p.saltado,
    siguiente_paso_descartado: p.siguientePasoDescartado,
  };
}

// ── Siguiente paso (plan §4.3) ──────────────────────────────────────────────

export interface SiguientePaso {
  titulo: string;
  descripcion: string;
  href: string;
  boton: string;
}

/**
 * La primera cosa útil que conviene hacer según cómo trabaja la empresa. Si el
 * módulo que la resuelve está apagado, cae a "registra tu primera obra", que es
 * del núcleo y siempre existe.
 */
export function siguientePaso(
  tipo: TipoEmpresa | null,
  activos: readonly ClaveModulo[],
): SiguientePaso {
  const primeraObra: SiguientePaso = {
    titulo: 'Da de alta tu primera obra',
    descripcion: 'Con la obra registrada ya puedes llevar su dinero, su gente y sus documentos.',
    href: '/admin/obras?nueva=1',
    boton: 'Nueva obra',
  };
  const candidatos: Record<TipoEmpresa, SiguientePaso> = {
    independiente: {
      titulo: 'Haz tu primera cotización',
      descripcion: 'Usa la lista de precios que ya viene cargada y mándala en PDF por WhatsApp.',
      href: '/admin/cotizaciones/nueva',
      boton: 'Nueva cotización',
    },
    contratista: {
      titulo: 'Da de alta tu cuadrilla',
      descripcion: 'Pon a tu gente en su cuadrilla con su jefe; así el pase de lista y el destajo salen solos.',
      href: '/admin/cuadrillas',
      boton: 'Ir a cuadrillas',
    },
    empresa: {
      titulo: 'Invita a tu supervisor o a tu contadora',
      descripcion: 'Cada quien entra con su propio acceso y ve solo lo que le toca.',
      href: '/admin/usuarios',
      boton: 'Invitar',
    },
    constructora: {
      titulo: 'Registra tus frentes de obra',
      descripcion: 'Da de alta cada obra o impórtalas de Excel con su presupuesto.',
      href: '/admin/obras?nueva=1',
      boton: 'Nueva obra',
    },
  };
  if (!tipo) return primeraObra;
  const paso = candidatos[tipo];
  return rutaVisible(paso.href, activos) ? paso : primeraObra;
}
