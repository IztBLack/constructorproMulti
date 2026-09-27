/**
 * Enlaces a las consultas y trámites OFICIALES que acompañan a cada documento.
 *
 * La app no consulta nada por su cuenta (no hay API abierta y los portales
 * piden e.firma): solo pone el enlace para que la PERSONA verifique. Cada URL
 * se revisó en internet el 2026-09-26/27 (ver docs/PROGRESO_ALCANCE.md, F5-2).
 * Si un sitio cambia de dirección, se cambia AQUÍ y en ningún otro lado.
 */

export interface EnlaceOficial {
  texto: string;
  href: string;
  /** Qué se hace allá, en una línea. */
  ayuda: string;
}

export const ENLACES = {
  /** STPS — Padrón público de contratistas (REPSE). Busca por RFC, razón social o folio; sin cuenta. */
  padronRepse: {
    texto: 'Consultar el padrón REPSE (STPS)',
    href: 'https://repse.stps.gob.mx/',
    ayuda: 'Botón «Consultar padrón»: busca por RFC, razón social o folio. No pide cuenta.',
  },
  /** SAT — validar la autenticidad de una opinión de cumplimiento (código QR). */
  validarOpinionSat: {
    texto: 'Validar una opinión de cumplimiento (SAT)',
    href: 'https://wwwmat.sat.gob.mx/consulta/20957/valida-la-autenticidad-de-la-informacion-de-tu-opinion-del-cumplimiento-de-obligaciones-fiscales',
    ayuda: 'Escanea el código QR de la opinión: muestra folio, RFC, fecha de emisión y sentido.',
  },
  /** SAT — opinión de quien autorizó hacerla pública (por RFC). */
  opinionPublicaSat: {
    texto: 'Consulta pública de la opinión (SAT)',
    href: 'https://wwwmat.sat.gob.mx/aplicacion/37819/consulta-publica-de-la-opinion-del-cumplimiento',
    ayuda: 'Solo aparece si el subcontratista autorizó que su opinión fuera pública.',
  },
  /** IMSS — opinión de cumplimiento en materia de seguridad social (información). */
  opinionImss: {
    texto: 'Opinión de cumplimiento del IMSS (información oficial)',
    href: 'https://www.gob.mx/imss/articulos/opinion-de-cumplimiento-imss',
    ayuda: 'Se obtiene en el Buzón IMSS con e.firma; un tercero la consulta con autorización del patrón.',
  },
  /** IMSS — ficha del trámite de registro de obra (SIROC). */
  siroc: {
    texto: 'Registro de obra en el SIROC (IMSS)',
    href: 'https://www.imss.gob.mx/tramites/imss02097',
    ayuda: 'Registro dentro de los 5 días hábiles siguientes al inicio; incidencias y terminación también por SIROC.',
  },
  /** IMSS — micrositio ICSOE. */
  icsoe: {
    texto: 'Micrositio ICSOE (IMSS)',
    href: 'https://www.imss.gob.mx/icsoe',
    ayuda: 'Se presenta del 1 al 17 de enero, mayo y septiembre con la e.firma del patrón.',
  },
  /** Infonavit — SISUB (portal empresarial). */
  sisub: {
    texto: 'SISUB (Infonavit)',
    href: 'https://portalmx.infonavit.org.mx/wps/portal/infonavitmx/mx2/patrones/mis_obligaciones/sisub/',
    ayuda: 'Se entra por el Portal Empresarial del Infonavit → Mis trámites → SISUB.',
  },
} as const satisfies Record<string, EnlaceOficial>;

export type ClaveEnlace = keyof typeof ENLACES;

/** Leyenda que acompaña a todo el módulo. */
export const LEYENDA_CUMPLIMIENTO =
  'ConstructorPro no se conecta al IMSS, al SAT, a la STPS ni al Infonavit, y nunca te pide tu e.firma ni contraseñas. Te recuerda lo que toca y guarda tus comprobantes; el trámite lo haces tú o tu contador en el portal oficial. Las fechas son una guía: confírmalas con tu contador.';
