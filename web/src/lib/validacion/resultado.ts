/**
 * Resultado de una validación: o hay valor, o hay un error legible para el
 * usuario. Nunca las dos cosas, y nunca ninguna.
 *
 * Es una unión discriminada y NO una excepción a propósito. Un `throw` lo puede
 * ignorar quien llama —basta con no poner el `try`— y el error se convierte en
 * un 500 sin mensaje; aquí TypeScript no deja tocar `.valor` sin haber mirado
 * antes `.ok`. La validación de un formulario no es un caso excepcional: es una
 * de las dos salidas normales, y el tipo lo dice.
 */
export type Resultado<T> =
  | { readonly ok: true; readonly valor: T }
  | { readonly ok: false; readonly error: string };

/** Resultado correcto. */
export function valido<T>(valor: T): Resultado<T> {
  return { ok: true, valor };
}

/**
 * Resultado con error. El mensaje se le enseña TAL CUAL al usuario, así que va
 * en español, en frase completa y sin nombres de campo de la base.
 */
export function invalido<T = never>(error: string): Resultado<T> {
  return { ok: false, error };
}
