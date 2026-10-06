import { createClient } from '@/lib/supabase/server';
import { getEmpresaActiva, getUsuario, type EmpresaUsuario } from '@/lib/sesion';

export type { EmpresaUsuario };

/// Devuelve la empresa y rol del usuario autenticado actual.
/// Lanza error si no hay usuario o no tiene empresa.
/// Úsalo en Server Actions antes de escribir (empresa_id es obligatorio por RLS).
///
/// Es la envoltura ESTRICTA de `getEmpresaActiva()` (en `lib/sesion.ts`), que
/// es la que hace el trabajo y está cacheada por petición con `cache()` de
/// React. Esta capa sólo convierte "no hay" en una excepción, que es lo que
/// esperan las 55 llamadas existentes.
///
/// Si lo que quieres es preguntar el rol sin que reviente, usa
/// `getRolActual()` de `lib/sesion.ts` en vez de `.catch(() => '')`.
export async function getEmpresaUsuario(): Promise<EmpresaUsuario> {
  const user = await getUsuario();
  if (!user) {
    throw new Error('No hay sesión activa.');
  }

  const empresa = await getEmpresaActiva();
  if (!empresa) {
    throw new Error('El usuario no tiene una empresa asignada.');
  }

  return empresa;
}

/// Nombre de la empresa del usuario actual, para mostrar como marca en la UI
/// (en vez de un literal "ConstructorPro"). No lanza: devuelve null si no hay
/// sesión o empresa. Lectura acotada por RLS a las empresas del usuario.
///
/// La resolución de "qué empresa" ya no se repite aquí: sale de
/// `getEmpresaActiva()`, así que esta función y `getEmpresaUsuario()` no pueden
/// discrepar sobre cuál es la empresa del usuario —antes cada una hacía su
/// propia consulta, y sólo una de las dos ordenaba por antigüedad.
export async function getNombreEmpresa(): Promise<string | null> {
  const empresa = await getEmpresaActiva();
  if (!empresa) return null;

  const supabase = await createClient();
  const { data: emp } = await supabase
    .from('empresas')
    .select('nombre')
    .eq('id', empresa.empresaId)
    .maybeSingle();

  const nombre = (emp?.nombre as string | undefined)?.trim();
  return nombre && nombre.length > 0 ? nombre : null;
}
