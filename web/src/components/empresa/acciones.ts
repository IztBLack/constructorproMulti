'use server';

import { revalidatePath } from 'next/cache';
import { fijarEmpresaActiva } from '@/lib/sesion';

/// Cambia la empresa con la que trabaja el usuario.
///
/// La validación de pertenencia NO está aquí: vive dentro de
/// `fijarEmpresaActiva`, que es la única puerta por la que se escribe esa
/// cookie. Una puerta que valida es mejor que N llamantes que se acuerdan de
/// validar.
///
/// Si el id no corresponde a ninguna empresa del usuario, esto no hace nada y
/// no lo dice: es un valor que sólo puede llegar manipulando el formulario a
/// mano, no un error que un usuario legítimo pueda cometer. Y aunque la cookie
/// se hubiera escrito igual, RLS no devolvería ni una fila de esa empresa.
export async function cambiarEmpresa(formData: FormData) {
  const empresaId = String(formData.get('empresaId') ?? '').trim();
  if (empresaId.length === 0) return;

  await fijarEmpresaActiva(empresaId);

  // Todo lo que hay bajo /admin depende de la empresa activa: se invalida el
  // árbol entero, no la página actual. Revalidar sólo la ruta en curso dejaría
  // las demás secciones con datos de la empresa anterior hasta que caducaran.
  revalidatePath('/admin', 'layout');
}
