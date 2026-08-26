/**
 * Catálogo de la paleta de comandos.
 *
 * Módulo PURO —sin `'use server'`— para que el componente de cliente pueda
 * importarlo sin arrastrar acceso a datos al navegador.
 *
 * REGLA DE ADMISIÓN: aquí entra lo que NAVEGA, no lo que ejecuta. Nada que
 * borre, cobre o mande algo a un cliente. Una paleta se usa a ciegas —tres
 * letras y Enter—, que es justo el modo en el que no se debe confirmar algo
 * irreversible ni tocar dinero. Llevar hasta la pantalla donde eso vive: sí.
 */

export interface Comando {
  /** Texto que se lee. */
  titulo: string;
  /** Segunda línea, opcional. */
  detalle?: string;
  href: string;
  grupo: string;
  /**
   * Cómo llama el usuario a esto, aunque la app lo llame de otro modo.
   * "raya" para la nómina, "trabajadores" para el equipo. Nadie tiene por qué
   * aprenderse nuestros nombres de pantalla.
   */
  alias?: string;
  /** Documentos que se abren aparte para imprimir o mandar. */
  nuevaPestana?: boolean;
}

export const COMANDOS_FIJOS: Comando[] = [
  // ── Ir a ────────────────────────────────────────────────────────────────
  { titulo: 'Inicio', href: '/admin', grupo: 'Ir a', alias: 'resumen panorama tablero' },
  { titulo: 'Obras', href: '/admin/obras', grupo: 'Ir a', alias: 'trabajos proyectos' },
  { titulo: 'Cotizaciones', href: '/admin/cotizaciones', grupo: 'Ir a', alias: 'presupuestos precios cotizar' },
  { titulo: 'Equipo', href: '/admin/equipo', grupo: 'Ir a', alias: 'trabajadores gente colaboradores personal albañiles' },
  { titulo: 'Cuadrillas', href: '/admin/cuadrillas', grupo: 'Ir a', alias: 'grupos brigadas' },
  { titulo: 'Clientes', href: '/admin/clientes', grupo: 'Ir a', alias: 'contratantes' },
  { titulo: 'Proyección de nómina', href: '/admin/proyeccion', grupo: 'Ir a', alias: 'raya esperada semana estimado sueldos' },
  { titulo: 'Pase de lista de hoy', href: '/campo', grupo: 'Ir a', alias: 'asistencia lista campo jornada faltas' },
  { titulo: 'Catálogo de conceptos', href: '/admin/catalogo', grupo: 'Ir a', alias: 'precios partidas conceptos' },
  { titulo: 'Puestos', href: '/admin/puestos', grupo: 'Ir a', alias: 'oficios salarios' },
  { titulo: 'Usuarios y roles', href: '/admin/usuarios', grupo: 'Ir a', alias: 'permisos accesos socios' },
  { titulo: 'Ajustes', href: '/admin/ajustes', grupo: 'Ir a', alias: 'configuracion preferencias empresa' },
  { titulo: 'Vincular un dispositivo', href: '/admin/vincular', grupo: 'Ir a', alias: 'codigo celular tableta invitar' },

  // ── Crear ───────────────────────────────────────────────────────────────
  // Llevan a donde vive el alta. La paleta no crea nada por su cuenta: lo que
  // se hace a ciegas debe poder revisarse antes de guardarse.
  { titulo: 'Nueva cotización', href: '/admin/cotizaciones/nueva', grupo: 'Crear', alias: 'presupuesto cotizar agregar alta' },
  { titulo: 'Nueva obra', detalle: 'Se abre el alta en Obras', href: '/admin/obras?nueva=1', grupo: 'Crear', alias: 'agregar alta proyecto' },
  { titulo: 'Nuevo colaborador', detalle: 'Se abre el alta en Equipo', href: '/admin/equipo?nuevo=1', grupo: 'Crear', alias: 'trabajador contratar alta persona' },
  { titulo: 'Nuevo cliente', detalle: 'Se abre el alta en Clientes', href: '/admin/clientes?nuevo=1', grupo: 'Crear', alias: 'contratante alta' },
  { titulo: 'Nueva cuadrilla', href: '/admin/cuadrillas', grupo: 'Crear', alias: 'grupo brigada' },
  { titulo: 'Nuevo puesto', href: '/admin/puestos', grupo: 'Crear', alias: 'oficio salario' },
  { titulo: 'Importar obras de Excel', href: '/admin/obras/importar', grupo: 'Crear', alias: 'excel cargar subir' },

  // ── Gente ───────────────────────────────────────────────────────────────
  {
    titulo: 'Quién tiene datos pendientes',
    detalle: 'Colaboradores dados de alta solo con el nombre',
    href: '/admin/equipo?incompletos=1',
    grupo: 'Gente',
    alias: 'incompletos faltantes sin puesto sin sueldo',
  },

  // ── Sistema ─────────────────────────────────────────────────────────────
  { titulo: 'Personalizar los PDF', href: '/admin/ajustes#pdf', grupo: 'Sistema', alias: 'logo color firma marca documentos' },
  { titulo: 'Texto final de los documentos', href: '/admin/ajustes#pdf', grupo: 'Sistema', alias: 'vigencia condiciones pie parrafo' },
  { titulo: 'IVA por defecto', href: '/admin/ajustes', grupo: 'Sistema', alias: 'impuesto porcentaje' },
];

/**
 * Acciones de la obra en la que se está parado. Es lo que separa una paleta
 * útil de un buscador de menús: dentro de una obra, sus cosas primero y sin
 * tener que volver a nombrarla.
 */
export function comandosDeObra(obraId: string, nombre?: string): Comando[] {
  const suf = nombre ? ` · ${nombre}` : '';
  return [
    { titulo: `Asistencia${suf}`, href: `/admin/obras/${obraId}/asistencia`, grupo: 'En esta obra', alias: 'pase lista jornada faltas' },
    { titulo: `Nómina${suf}`, href: `/admin/obras/${obraId}/nomina`, grupo: 'En esta obra', alias: 'raya semana pago sueldo' },
    { titulo: `Notas de trato${suf}`, href: `/admin/obras/${obraId}/notas`, grupo: 'En esta obra', alias: 'socios acuerdos tratos' },
    { titulo: `PDF de caja${suf}`, href: `/admin/obras/${obraId}/pdf`, grupo: 'En esta obra', alias: 'imprimir documento movimientos', nuevaPestana: true },
    {
      titulo: `Estado de cuenta del cliente${suf}`,
      href: `/admin/obras/${obraId}/estado-cuenta-cliente/descargar`,
      grupo: 'En esta obra',
      alias: 'cobrar saldo cliente imprimir',
      nuevaPestana: true,
    },
    { titulo: `Importar movimientos${suf}`, href: `/admin/obras/${obraId}/importar`, grupo: 'En esta obra', alias: 'excel banco cargar' },
  ];
}

/** Acciones de la cotización en la que se está parado. */
export function comandosDeCotizacion(id: string): Comando[] {
  return [
    { titulo: 'Ver el PDF', href: `/admin/cotizaciones/${id}/pdf`, grupo: 'En esta cotización', alias: 'imprimir documento', nuevaPestana: true },
    {
      titulo: 'Descargar el PDF',
      href: `/admin/cotizaciones/${id}/pdf/descargar`,
      grupo: 'En esta cotización',
      alias: 'bajar guardar imprimir',
      nuevaPestana: true,
    },
  ];
}

/**
 * Compara ignorando mayúsculas y acentos: `nomina` tiene que encontrar
 * «Nómina», y `ramirez` a «Ramírez». Sin esto la paleta obliga a teclear los
 * acentos, que es justo la fricción que venía a quitar.
 *
 * `̀-ͯ` es el rango de marcas diacríticas combinantes, escrito con
 * escapes y no con los caracteres literales, que son invisibles en el código.
 */
export function normalizar(s: string): string {
  return s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
}

/** ¿Este comando responde a lo que se escribió? Todas las palabras, en cualquier orden. */
export function coincide(c: Comando, consulta: string): boolean {
  const heno = normalizar([c.titulo, c.detalle ?? '', c.alias ?? '', c.grupo].join(' '));
  return normalizar(consulta)
    .split(/\s+/)
    .filter(Boolean)
    .every((parte) => heno.includes(parte));
}
