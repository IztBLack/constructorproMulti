import { cache } from 'react';
import { cookies } from 'next/headers';
import type { User } from '@supabase/supabase-js';
import { createClient } from '@/lib/supabase/server';
import type { Rol } from '@/lib/data/types';

/// Identidad del usuario y de su empresa, **una sola vez por petición**.
///
/// EL PROBLEMA QUE RESUELVE
/// ───────────────────────
/// Antes de este archivo, `supabase.auth.getUser()` se llamaba en 30 sitios y
/// `getEmpresaUsuario()` en 55, cada uno con su propio viaje de red. Una página
/// de `/admin` compuesta por cuatro Server Components hacía cuatro llamadas al
/// servidor de Auth **y** cuatro consultas a `usuarios_empresa` para responder
/// cuatro veces la misma pregunta: "¿quién eres y de qué empresa?".
///
/// `cache()` de React memoiza por **render de una petición** (no entre
/// peticiones, no entre usuarios): la primera llamada viaja, las demás
/// devuelven el mismo resultado. Es lo que convierte esas ocho idas y vueltas
/// en dos.
///
/// POR QUÉ NO ES UN RIESGO DE SEGURIDAD
/// ────────────────────────────────────
/// El ámbito de `cache()` es la petición en curso: dos usuarios distintos son
/// dos peticiones distintas y nunca comparten entrada. Y no se guarda nada en
/// disco ni en memoria entre peticiones, así que un cambio de rol se ve en la
/// siguiente navegación. No sustituye a RLS: sigue siendo Postgres quien decide
/// qué filas se ven.
///
/// POR QUÉ `getUser()` Y NO `getSession()`
/// ───────────────────────────────────────
/// `getSession()` lee la cookie sin validarla contra el servidor: una cookie
/// manipulada pasaría. `getUser()` verifica el JWT contra Auth. La llamada de
/// red es justamente lo que estamos deduplicando, no eliminando.

/// Usuario autenticado, o `null` si no hay sesión. Cacheado por petición.
export const getUsuario = cache(async (): Promise<User | null> => {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return user ?? null;
});

export interface EmpresaUsuario {
  empresaId: string;
  rol: Rol;
}

/// Nombre de la cookie que recuerda qué empresa está viendo el usuario.
///
/// Es una PREFERENCIA, no una autorización. Nunca se confía en su contenido:
/// antes de usarla se comprueba contra `usuarios_empresa` que el usuario
/// pertenece de verdad a esa empresa. Aunque alguien la falsifique, RLS seguiría
/// devolviendo cero filas — la comprobación de aquí sólo evita pintar una
/// interfaz que promete datos que la base no va a entregar.
const COOKIE_EMPRESA = 'empresa_activa';

/// Todas las empresas del usuario, con su rol en cada una, de la más antigua a
/// la más reciente.
///
/// Que esto exista es lo que convierte al sistema en multi-empresa. Antes había
/// un `limit(1)` escondido en la capa de datos: un contador externo no podía
/// llevar dos constructoras, y un dueño con dos razones sociales tampoco podía
/// separarlas.
export const listEmpresasDelUsuario = cache(
  async (): Promise<{ empresaId: string; rol: Rol; nombre: string }[]> => {
    const user = await getUsuario();
    if (!user) return [];

    const supabase = await createClient();
    const { data, error } = await supabase
      .from('usuarios_empresa')
      .select('empresa_id, rol, empresas(nombre)')
      .eq('user_id', user.id)
      .order('created_at', { ascending: true });

    if (error) {
      throw new Error(`No se pudieron leer las empresas del usuario: ${error.message}`);
    }

    return (data ?? []).map((fila) => {
      const emp = fila.empresas as unknown as { nombre?: string } | null;
      return {
        empresaId: fila.empresa_id as string,
        rol: fila.rol as Rol,
        nombre: (emp?.nombre ?? '').trim(),
      };
    });
  },
);

/// Empresa y rol con los que el usuario está trabajando ahora mismo.
///
/// Resuelve en este orden:
///   1. La empresa de la cookie, **si el usuario pertenece a ella**.
///   2. Si no, la primera a la que se unió.
///
/// El orden por antigüedad no es cosmético: sin él, Postgres devuelve una fila
/// arbitraria que puede cambiar entre peticiones, y la pantalla mostraría un rol
/// distinto según el momento.
///
/// Devuelve `null` cuando no hay sesión o el usuario no tiene ninguna empresa
/// —dos situaciones NORMALES, que el llamante decide cómo tratar—. Los que
/// necesitan el comportamiento estricto usan `getEmpresaUsuario()` (en
/// `lib/data/empresa.ts`), que envuelve a este y lanza.
///
/// Un error de Postgres SÍ se lanza, en vez de convertirse en `null`: "la
/// consulta falló" no es lo mismo que "no tiene empresa", y confundirlos
/// convertiría un fallo de RLS o de red en un silencioso "no tienes acceso"
/// imposible de diagnosticar.
export const getEmpresaActiva = cache(async (): Promise<EmpresaUsuario | null> => {
  const empresas = await listEmpresasDelUsuario();
  if (empresas.length === 0) return null;

  const elegida = (await cookies()).get(COOKIE_EMPRESA)?.value ?? null;
  return resolverEmpresaActiva(empresas, elegida);
});

/// La decisión de "¿con qué empresa está trabajando?", separada de dónde salen
/// los datos para poder probarla sin sesión, sin cookies y sin base.
///
/// La regla en una línea: **la cookie sólo cuenta si el usuario pertenece a esa
/// empresa**; si no, la primera a la que se unió. Nunca se devuelve una empresa
/// que no esté en la lista, y la lista viene de `usuarios_empresa` — o sea, de
/// la misma tabla que gobierna RLS.
export function resolverEmpresaActiva(
  empresas: { empresaId: string; rol: Rol }[],
  elegida: string | null,
): EmpresaUsuario | null {
  if (empresas.length === 0) return null;

  const coincide = elegida
    ? empresas.find((e) => e.empresaId === elegida)
    : undefined;

  const activa = coincide ?? empresas[0];
  return { empresaId: activa.empresaId, rol: activa.rol };
}

/// Rol del usuario en la empresa activa, o `''` si no hay sesión/empresa.
/// Azúcar para las pantallas que sólo quieren decidir qué botones pintar; nunca
/// lanza, ni siquiera ante un fallo de consulta —pintar de menos es preferible a
/// tirar la página entera por no saber qué botones mostrar.
export async function getRolActual(): Promise<Rol | ''> {
  try {
    return (await getEmpresaActiva())?.rol ?? '';
  } catch {
    return '';
  }
}

/// Fija la empresa activa. Devuelve `false` si el usuario no pertenece a ella.
///
/// La comprobación de pertenencia va aquí y no en el componente que llama: es
/// la única puerta por la que se escribe esta cookie, y una puerta que valida
/// vale más que N llamantes que se acuerdan de validar.
export async function fijarEmpresaActiva(empresaId: string): Promise<boolean> {
  const empresas = await listEmpresasDelUsuario();
  if (!empresas.some((e) => e.empresaId === empresaId)) return false;

  (await cookies()).set(COOKIE_EMPRESA, empresaId, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    // Un año: es una preferencia de trabajo, no una sesión. Si caducara antes,
    // el usuario volvería a su primera empresa sin haber pedido nada.
    maxAge: 60 * 60 * 24 * 365,
  });
  return true;
}
