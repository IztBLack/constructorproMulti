/**
 * Vocabulario compartido del tema claro/oscuro.
 *
 * El tema es una preferencia del DISPOSITIVO, no de la cuenta: se guarda en
 * `localStorage`, nunca en la base de datos. Si dos personas usan la misma
 * laptop con cuentas distintas, el tema no se mueve al cambiar de sesión.
 *
 * Esa decisión también es la que permite que `/campo` tenga tema: ese layout no
 * consulta la sesión a propósito (para que el service worker cachee el HTML sin
 * filtrar datos entre empresas), así que no podría leer una preferencia por
 * cuenta aunque quisiera.
 *
 * Es además el mismo modelo que ya usa la app móvil (Auto/Claro/Oscuro en
 * `lib/presentation/configuraciones/config_screen.dart`), lo que evita tener que
 * reconciliar dos modelos distintos cuando toque la paridad Android/iOS.
 */

/** Lo que el usuario ELIGE. `auto` delega en el sistema operativo. */
export type Tema = 'auto' | 'claro' | 'oscuro';

/** Lo que finalmente se PINTA. `auto` ya está resuelto contra el sistema. */
export type TemaEfectivo = 'claro' | 'oscuro';

/** Clave en localStorage. Cambiarla hace que todos vuelvan a `auto` (no rompe nada). */
export const CLAVE_TEMA = 'cp-tema';

/** Clase que se pone en <html>. Debe coincidir con `@custom-variant dark` de globals.css. */
export const CLASE_OSCURO = 'dark';

/** Clase temporal que habilita la transición de color. Ver globals.css. */
export const CLASE_TRANSICION = 'cambiando-tema';

export function esTemaValido(valor: unknown): valor is Tema {
  return valor === 'auto' || valor === 'claro' || valor === 'oscuro';
}

/**
 * Script que corre ANTES de que el navegador pinte, inyectado en el <head>.
 *
 * Sin esto habría un destello blanco en CADA carga de página: el HTML lo genera
 * el servidor, que no tiene forma de conocer el `localStorage` del navegador, así
 * que manda el documento en tema claro y el oscuro solo se aplicaría después de
 * hidratar React. El parpadeo es muy visible y se percibe como un bug.
 *
 * Va como string y no como módulo importado porque tiene que ejecutarse de forma
 * síncrona y bloqueante en el <head>, antes de cualquier bundle.
 *
 * El try/catch no es decorativo: `localStorage` LANZA (no devuelve null) cuando
 * las cookies de terceros están bloqueadas o en modo privado de algunos
 * navegadores. Sin él, la excepción rompería el render de toda la página.
 */
export const SCRIPT_TEMA = `(function(){try{
var t=localStorage.getItem('${CLAVE_TEMA}');
var oscuro = t==='oscuro' || ((!t||t==='auto') && window.matchMedia('(prefers-color-scheme: dark)').matches);
if(oscuro){document.documentElement.classList.add('${CLASE_OSCURO}');}
}catch(e){}})();`;
