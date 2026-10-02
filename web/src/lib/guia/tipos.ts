/**
 * Maqueta de ejemplo: el dibujo inerte que el recorrido guiado muestra como
 * VISTA DE EJEMPLO cuando la cuenta todavía no tiene datos para un paso (p. ej.
 * aún no hay obras). Siempre se pinta con la marca EJEMPLO.
 *
 * Datos planos a propósito: se pueden llevar a Flutter sin reescribirlos.
 */

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

