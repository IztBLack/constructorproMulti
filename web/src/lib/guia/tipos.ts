/**
 * Tipos de la Guía (tutorial por tarjetas).
 *
 * La guía es CONTENIDO, no pantallas: cada tarjeta explica una parte de la app,
 * trae una maqueta con datos de ejemplo y un botón "Llévame ahí" que abre la
 * pantalla real. Nada de lo que se ve en una tarjeta se guarda en ningún lado.
 *
 * Se decidió así (y no con una caja de arena donde el usuario "crea" datos
 * falsos) porque los registros de evidencia no se pueden borrar, el móvil
 * sincroniza lo que se guarda, y una copia simulada de los formularios se
 * desfasa de la real con cada cambio de interfaz. Ver `docs/PLAN_GUIA.md`.
 *
 * Todo es datos planos a propósito: el mismo contenido se puede llevar a la app
 * de Flutter sin reescribirlo.
 */

import type { ClaveModulo } from '@/lib/modulos';

/** Maqueta de ejemplo que acompaña a la tarjeta. Siempre se pinta con la marca EJEMPLO. */
export type Maqueta =
  | {
      tipo: 'lista';
      titulo: string;
      filas: {
        principal: string;
        detalle?: string;
        valor?: string;
        estado?: 'ok' | 'pendiente' | 'alerta';
      }[];
    }
  | {
      tipo: 'formulario';
      titulo: string;
      campos: { etiqueta: string; valor: string }[];
      boton: string;
    }
  | {
      tipo: 'resumen';
      titulo: string;
      cifras: { etiqueta: string; valor: string; tono?: 'positivo' | 'negativo' | 'neutro' }[];
    };

/** A dónde lleva "Llévame ahí". */
export interface DestinoTarjeta {
  /** Ruta real de la app (sin query). Debe existir y ser del panel o de /campo. */
  href: string;
  /**
   * Elemento a resaltar al llegar: el valor de un atributo `data-guia="…"` que
   * exista en la pantalla. Opcional: sin ancla solo se muestran los pasos.
   * Una prueba revisa que cada ancla exista en el código.
   */
  ancla?: string;
}

export interface Tarjeta {
  /** Estable: el progreso guardado se refiere a este id. No lo cambies sin subir VERSION_GUIA. */
  id: string;
  /** Módulo al que pertenece. `null` = general (menú, ajustes): se ve siempre. */
  modulo: ClaveModulo | null;
  /** Frente de la tarjeta: el nombre de la cosa. */
  titulo: string;
  /** Frente: para qué sirve, en lenguaje de obra. 1–2 frases. */
  resumen: string;
  /** Reverso: cómo se usa, paso por paso. 2–5 pasos cortos que empiezan con verbo. */
  pasos: string[];
  /** Reverso: un consejo práctico opcional. */
  consejo?: string;
  maqueta?: Maqueta;
  destino?: DestinoTarjeta;
  /** Solo estos roles la ven. Sin lista, todos los de oficina. */
  roles?: readonly string[];
}

export type ClaveMazo = 'inicio' | 'obras' | 'gente' | 'dinero' | 'operacion' | 'ajustes';

/** Un mazo es un "nivel" de la guía. Completarlo da su sello. */
export interface Mazo {
  clave: ClaveMazo;
  titulo: string;
  descripcion: string;
  /** Nombre del sello que se gana al terminar el mazo. */
  sello: string;
  tarjetas: Tarjeta[];
}
