import { redirect } from 'next/navigation';

/**
 * "Vincular" se fundió con "Usuarios" en un solo módulo: el listado de accesos y
 * la invitación viven ahora en /admin/usuarios, y el código que se genera ahí
 * sirve por igual para canjear en el móvil o en la web.
 *
 * Esta ruta queda solo como redirección, para no romper enlaces guardados ni la
 * memoria muscular de quien la tenía a mano.
 */
export default function VincularRedirect() {
  redirect('/admin/usuarios');
}
