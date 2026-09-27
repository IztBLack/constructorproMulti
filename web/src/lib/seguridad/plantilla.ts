/**
 * Plantilla de la REVISIÓN DIARIA de seguridad (módulo `seguridad`, 0043).
 *
 * Los puntos salen de la NOM-031-STPS-2011 "Construcción — Condiciones de
 * seguridad y salud en el trabajo" (DOF 4-may-2011), en lenguaje de obra. Cada
 * punto cita el numeral o capítulo de la norma de donde sale, para que quien lo
 * lea pueda ir a la fuente. NO es la norma completa ni sustituye el análisis de
 * riesgos, los procedimientos o el plan de emergencias que la norma pide según
 * el tamaño de la obra (5.1–5.7, 5.16): es lo que un supervisor puede revisar
 * con la vista en 10 minutos cada mañana.
 *
 * Texto oficial: https://dof.gob.mx/normasOficiales/4376/stps/stps.htm
 *
 * La revisión guarda el TEXTO de cada punto (foto fija): cambiar esta plantilla
 * no altera revisiones pasadas. Las claves no se reusan para otro significado.
 */

export const FUENTE_NOM_031 = {
  nombre: 'NOM-031-STPS-2011, Construcción — Condiciones de seguridad y salud en el trabajo',
  url: 'https://dof.gob.mx/normasOficiales/4376/stps/stps.htm',
} as const;

export interface PuntoPlantilla {
  clave: string;
  texto: string;
  /** Numeral o capítulo de la NOM-031 de donde sale. */
  cita: string;
}

export interface GrupoPlantilla {
  titulo: string;
  puntos: PuntoPlantilla[];
}

export const PLANTILLA_NOM_031: readonly GrupoPlantilla[] = [
  {
    titulo: 'Equipo de protección',
    puntos: [
      { clave: 'epp_casco', texto: 'Todos traen casco', cita: '5.10 y Tabla 5' },
      { clave: 'epp_calzado', texto: 'Todos traen calzado de seguridad (botas)', cita: '5.10 y Tabla 5' },
      { clave: 'epp_chaleco', texto: 'Todos traen chaleco reflejante', cita: '5.10 y Tabla 5' },
      {
        clave: 'epp_tarea',
        texto: 'Guantes, lentes, tapones o mascarilla según lo que hace cada quien (cortar, picar, pulir, colar)',
        cita: '5.8 y Tabla 5',
      },
      {
        clave: 'epp_visitas',
        texto: 'Las visitas entran con casco',
        cita: '5.10',
      },
    ],
  },
  {
    titulo: 'Trabajos en altura',
    puntos: [
      {
        clave: 'altura_bordes',
        texto: 'Bordes de losa, huecos y cubos protegidos (barandal, red o tapa)',
        cita: 'Cap. 14',
      },
      { clave: 'altura_arnes', texto: 'Quien trabaja en altura usa arnés bien anclado', cita: 'Cap. 14' },
      {
        clave: 'altura_andamios',
        texto: 'Andamios firmes, nivelados y con la plataforma completa; revisados hoy',
        cita: 'Cap. 14',
      },
      { clave: 'altura_escaleras', texto: 'Escaleras de mano en buen estado y bien apoyadas', cita: 'Cap. 14' },
    ],
  },
  {
    titulo: 'Excavaciones y zanjas',
    puntos: [
      {
        clave: 'excav_paredes',
        texto: 'Paredes revisadas: sin grietas ni desprendimientos (ademe donde haga falta)',
        cita: 'Cap. 11',
      },
      {
        clave: 'excav_orilla',
        texto: 'Tierra, material y maquinaria lejos de la orilla',
        cita: 'Cap. 11',
      },
      {
        clave: 'excav_acceso',
        texto: 'Excavación delimitada y con escalera o rampa para salir',
        cita: 'Cap. 11',
      },
    ],
  },
  {
    titulo: 'Maquinaria, herramienta y electricidad',
    puntos: [
      {
        clave: 'maq_revisada',
        texto: 'Maquinaria revisada antes de trabajar y con sus guardas puestas',
        cita: '5.13 y cap. 17',
      },
      {
        clave: 'herr_estado',
        texto: 'Herramienta en buen estado (sin mangos flojos, discos o cables dañados)',
        cita: 'Cap. 18',
      },
      {
        clave: 'electrica_provisional',
        texto: 'Cables e instalación provisional sin partes peladas, lejos del agua y del paso',
        cita: '5.11',
      },
      {
        clave: 'soldadura',
        texto: 'Donde se suelda o corta: sin material que arda cerca y con mampara',
        cita: 'Cap. 13',
      },
      {
        clave: 'transito',
        texto: 'Paso de camiones y maquinaria separado del paso de la gente',
        cita: 'Cap. 15',
      },
    ],
  },
  {
    titulo: 'Orden, señales y emergencias',
    puntos: [
      {
        clave: 'orden',
        texto: 'Obra ordenada: pasillos libres, sin clavos ni puntas de varilla expuestas',
        cita: '5.11',
      },
      { clave: 'senales', texto: 'Señales de riesgo y de uso de equipo a la vista', cita: '5.15' },
      { clave: 'extintor', texto: 'Extintor a la mano y cargado', cita: '5.12' },
      {
        clave: 'emergencias',
        texto: 'Botiquín y teléfonos de emergencia a la vista',
        cita: '5.16',
      },
      { clave: 'agua_sanitarios', texto: 'Agua para tomar y sanitarios para la gente', cita: '5.24' },
      { clave: 'comedor', texto: 'Lugar limpio para comer', cita: '5.23' },
    ],
  },
];

/** Todos los puntos, en orden. */
export function puntosPlantilla(): PuntoPlantilla[] {
  return PLANTILLA_NOM_031.flatMap((g) => g.puntos);
}

const CITAS = new Map(puntosPlantilla().map((p) => [p.clave, p.cita]));

/** Cita de la norma para una clave (vacío si ya no está en la plantilla). */
export function citaDe(clave: string): string {
  return CITAS.get(clave) ?? '';
}
