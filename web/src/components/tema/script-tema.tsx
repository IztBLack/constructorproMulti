import { SCRIPT_TEMA } from './tema';

/**
 * Inyecta el script anti-parpadeo. Va en el <head> del layout raíz, lo más
 * arriba posible.
 *
 * No usa `next/script`: cualquier estrategia de ese componente (incluida
 * `beforeInteractive`) llega DESPUÉS del primer pintado, que es justo lo que hay
 * que ganarle. Tiene que ser un <script> síncrono y crudo.
 *
 * `dangerouslySetInnerHTML` aquí no es un riesgo de inyección: el contenido es
 * una constante del propio código, sin nada que venga del usuario ni del
 * servidor.
 */
export function ScriptTema() {
  return <script dangerouslySetInnerHTML={{ __html: SCRIPT_TEMA }} />;
}
