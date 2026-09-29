import { cache } from 'react';
import { createClient } from '@/lib/supabase/server';
import { getEmpresaUsuario, type EmpresaUsuario } from './empresa';
import {
  PAQUETE_POR_DEFECTO,
  leerPerfil,
  modulo,
  normalizarModulos,
  perfilAJson,
  type ClaveModulo,
  type Modulo,
  type PerfilEmpresa,
} from '@/lib/modulos';

/**
 * Lectura de módulos en el servidor.
 *
 * `cache` de React: el layout de /admin, la guardia del segmento y la página
 * piden lo mismo en una misma petición; con esto se consulta UNA vez por
 * petición, no tres. No persiste entre peticiones (no es caché de datos), así
 * que un cambio en Ajustes se ve en la siguiente navegación.
 */

export interface EstadoModulos {
  activos: ClaveModulo[];
  perfil: PerfilEmpresa | null;
  /** Rol del usuario en la empresa ('' si no se pudo leer). */
  rol: string;
}

const empresaDelUsuario = cache(async (): Promise<EmpresaUsuario | null> => {
  try {
    return await getEmpresaUsuario();
  } catch {
    return null;
  }
});

/**
 * Módulos prendidos de la empresa del usuario, su perfil y su rol.
 *
 * NUNCA lanza. Si algo falla (sin sesión, sin fila, la migración 0035 todavía no
 * se aplica y la columna no existe) devuelve el paquete de siempre: es
 * preferible mostrar todo, como antes de que hubiera módulos, a dejar a alguien
 * sin sus pantallas por un error de lectura. Los módulos son presentación; la
 * RLS sigue siendo la barrera.
 */
export const getModulosEmpresa = cache(async (): Promise<EstadoModulos> => {
  const empresa = await empresaDelUsuario();
  const porDefecto: EstadoModulos = {
    activos: [...PAQUETE_POR_DEFECTO],
    perfil: null,
    rol: empresa?.rol ?? '',
  };
  if (!empresa) return porDefecto;

  const supabase = await createClient();
  // Filtrado por empresa (y no `.maybeSingle()` a secas como en
  // `getEmpresaConfig`): quien es personal de dos empresas tendría dos filas
  // visibles, y se quiere la MISMA empresa que usa el resto del panel.
  const { data, error } = await supabase
    .from('empresa_config')
    .select('modulos, perfil')
    .eq('empresa_id', empresa.empresaId)
    .maybeSingle();

  if (error || !data) return porDefecto;

  return {
    activos: normalizarModulos(data.modulos),
    perfil: leerPerfil(data.perfil),
    rol: empresa.rol,
  };
});

export type ResultadoGuardia =
  | { activo: true }
  | { activo: false; modulo: Modulo; esAdmin: boolean };

/**
 * Guardia de un módulo para páginas y layouts: dice si se puede mostrar y, si
 * no, qué pantalla de "está apagado" corresponde (el admin puede prenderlo; los
 * demás se lo piden). Se usa a través de `<GuardiaModulo>`.
 */
export async function exigirModulo(clave: ClaveModulo): Promise<ResultadoGuardia> {
  const { activos, rol } = await getModulosEmpresa();
  const m = modulo(clave);
  if (activos.includes(clave) && m.disponible) return { activo: true };
  return { activo: false, modulo: m, esAdmin: rol === 'admin' };
}

/** Para route handlers (PDF, Excel): ¿el módulo está prendido? */
export async function moduloActivo(clave: ClaveModulo): Promise<boolean> {
  return (await exigirModulo(clave)).activo;
}

/**
 * Para route handlers (PDF, Excel) de un módulo: si está apagado, la respuesta
 * 403 que hay que devolver; si está prendido, `null` y se sigue. Las pantallas
 * usan `<GuardiaModulo>`; esto cubre las descargas, que no pasan por un layout.
 */
export async function bloquearSiApagado(clave: ClaveModulo): Promise<Response | null> {
  if (await moduloActivo(clave)) return null;
  return Response.json(
    {
      error: `«${modulo(clave).nombre}» está apagado en tu empresa. Tus datos siguen guardados; el administrador puede prenderlo en Ajustes → Módulos.`,
    },
    { status: 403 },
  );
}

/**
 * Guarda el perfil (respuestas del registro, tarjeta descartada). Solo admin:
 * lo exige la policy `empresa_config_update_admin` (0018).
 *
 * Se escribe el perfil COMPLETO que se leyó y se modificó, y solo esa columna:
 * nada de upsert parcial sobre la fila de configuración (regla RT7).
 */
export async function guardarPerfil(
  cambiar: (p: PerfilEmpresa) => PerfilEmpresa,
): Promise<{ ok: boolean; error?: string }> {
  const empresa = await empresaDelUsuario();
  if (!empresa) return { ok: false, error: 'No hay sesión activa.' };
  if (empresa.rol !== 'admin') {
    return { ok: false, error: 'Solo un administrador puede cambiar esto.' };
  }

  const { perfil } = await getModulosEmpresa();
  const base: PerfilEmpresa = perfil ?? {
    tipo: null,
    factura: null,
    necesidades: [],
    proximamente: [],
    saltado: false,
    siguientePasoDescartado: false,
  };

  const supabase = await createClient();
  const { error } = await supabase
    .from('empresa_config')
    .update({ perfil: perfilAJson(cambiar(base)), updated_at: Date.now() })
    .eq('empresa_id', empresa.empresaId);

  if (error) return { ok: false, error: error.message };
  return { ok: true };
}
