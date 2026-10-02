/**
 * Tipos del RECORRIDO GUIADO.
 *
 * El recorrido camina sobre las pantallas REALES: oscurece todo menos lo que
 * toca usar y avanza cuando el usuario lo hace. Mientras corre, la app NO
 * PUEDE ESCRIBIR (un candado en el navegador corta envíos de formularios,
 * Server Actions y escrituras a Supabase): lo que se captura es de ejemplo y se
 * pierde al salir. Ver `docs/PLAN_GUIA.md`.
 *
 * Tono profesional a propósito (decisión de Mario, 2026-10-01): nada de
 * niveles de juego, misiones, rangos ni insignias. Se elige un ALCANCE con su
 * duración aproximada, y el avance se cuenta en temas.
 */

import type { ClaveModulo } from '@/lib/modulos';
import type { Maqueta } from '../tipos';

/** Qué tanto cubre el recorrido. Cada alcance incluye al anterior. */
export type Alcance = 'esencial' | 'diaria' | 'completo';

/**
 * Qué se le pide al usuario en el paso.
 * - `leer`: solo se señala y explica; lo señalado NO se puede tocar. Botón Siguiente.
 * - `tocar`: debe tocar lo señalado (abrir un formulario, una pestaña, un enlace
 *   del menú). El paso avanza solo. NUNCA sobre algo que guarde, borre o envíe.
 * - `escribir`: debe escribir en el campo señalado (o tocar "Escribir el
 *   ejemplo"). Avanza con Siguiente cuando el campo tiene algo.
 * - `bloqueado`: se señala un botón que guardaría (Guardar, Enviar…) y se
 *   explica qué haría. No se puede tocar.
 */
export type AccionPaso = 'leer' | 'tocar' | 'escribir' | 'bloqueado';

/** Qué se señala: un `data-guia="…"` o un enlace visible por su href (la barra). */
export type Objetivo = { ancla: string } | { enlace: string };

export interface PasoRecorrido {
  /** Único dentro del tema. */
  id: string;
  /**
   * Pantalla donde ocurre. Patrón por segmentos: `*` vale por uno solo
   * (`/admin/obras/*` = el detalle de cualquier obra).
   */
  ruta: string;
  /** Sin objetivo, el paso es un mensaje al centro de la pantalla. */
  objetivo?: Objetivo;
  titulo: string;
  /** 1–3 frases, de tú, claras y profesionales. */
  texto: string;
  accion: AccionPaso;
  /** `escribir`: lo que pone el botón "Escribir el ejemplo". Datos claramente de ejemplo. */
  ejemplo?: string;
  /**
   * Si el objetivo no aparece (p. ej. la cuenta aún no tiene obras y no hay
   * detalle que abrir), el paso se muestra como VISTA DE EJEMPLO con esta
   * maqueta. Sin maqueta, el paso se salta.
   */
  maqueta?: Maqueta;
  /** Al pasar al siguiente, cerrar el diálogo abierto (el formulario de ejemplo no se guarda). */
  cerrarDialogo?: boolean;
  /** Solo en estos alcances. Sin lista: en todos los que incluyen el tema. */
  soloEn?: readonly Alcance[];
}

export interface Tema {
  id: string;
  titulo: string;
  /** Qué se aprende, una frase. */
  descripcion: string;
  /** Alcance MÍNIMO que lo incluye: `diaria` sale en Operación diaria y en Completo. */
  desde: Alcance;
  /** Si el módulo está apagado, el tema no aparece. `null` = núcleo. */
  modulo: ClaveModulo | null;
  /** Solo estos roles. Sin lista, todos los de oficina. */
  roles?: readonly string[];
  /** Ruta CONCRETA (sin `*`) donde arranca: al empezar el tema se navega ahí. */
  inicio: string;
  pasos: PasoRecorrido[];
}
