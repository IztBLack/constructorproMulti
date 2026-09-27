'use server';

import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { getModulosEmpresa, guardarPerfil } from '@/lib/data/modulos';
import {
  esClaveModulo,
  modulo,
  resolverDependencias,
  type ClaveModulo,
} from '@/lib/modulos';

export interface ResultadoModulos {
  ok: boolean;
  error?: string;
  modulos?: ClaveModulo[];
}

/**
 * Guarda la lista COMPLETA de módulos prendidos (Ajustes → Módulos).
 *
 * La barrera real es la RPC `activar_modulos` (0035): solo admin, valida contra
 * el catálogo y resuelve dependencias. Lo de aquí es cortesía para dar un buen
 * mensaje y para no mandarle basura.
 *
 * Desde la interfaz solo se prenden o apagan módulos DISPONIBLES. Si la empresa
 * tuviera prendido uno que todavía no existe en la web (alguien lo escribió a
 * mano), se conserva tal cual: este formulario no lo mostró, así que no le toca
 * apagarlo.
 */
export async function guardarModulos(claves: string[]): Promise<ResultadoModulos> {
  if (!Array.isArray(claves) || claves.length > 64) {
    return { ok: false, error: 'La lista de módulos no es válida.' };
  }

  const { activos, rol } = await getModulosEmpresa();
  if (rol !== 'admin') {
    return { ok: false, error: 'Solo un administrador puede prender o apagar módulos.' };
  }

  const elegidos = claves.filter(esClaveModulo).filter((c) => modulo(c).disponible);
  const ocultos = activos.filter((c) => !modulo(c).disponible);
  const final = resolverDependencias([...elegidos, ...ocultos]);

  const supabase = await createClient();
  const { data, error } = await supabase.rpc('activar_modulos', { p_modulos: final });

  if (error || !data?.ok) {
    return {
      ok: false,
      error: data?.error ?? error?.message ?? 'No se pudieron guardar los módulos.',
    };
  }

  // La barra, la paleta y cada sección leen los módulos en el layout de /admin.
  revalidatePath('/admin', 'layout');
  return { ok: true, modulos: final };
}

/**
 * "No me interesa" en una sugerencia de módulo (plan §4.3): se recuerda en
 * `perfil.sugerencias_descartadas` y no vuelve a salir, en ningún dispositivo.
 */
export async function descartarSugerenciaModulo(clave: string): Promise<{ ok: boolean; error?: string }> {
  if (!esClaveModulo(clave)) return { ok: false, error: 'Módulo desconocido.' };
  const r = await guardarPerfil((p) => ({
    ...p,
    sugerenciasDescartadas: [...new Set([...(p.sugerenciasDescartadas ?? []), clave])],
  }));
  if (r.ok) revalidatePath('/admin');
  return r;
}

/** "Prenderlo" desde una sugerencia: lo prendido de siempre + ese módulo (con dependencias). */
export async function prenderModuloSugerido(clave: string): Promise<ResultadoModulos> {
  if (!esClaveModulo(clave) || !modulo(clave).disponible) {
    return { ok: false, error: 'Ese módulo no está disponible.' };
  }
  const { activos } = await getModulosEmpresa();
  return guardarModulos([...activos, clave]);
}

/** Cierra para siempre la tarjeta "Siguiente paso" del inicio (se guarda en `perfil`). */
export async function descartarSiguientePaso(): Promise<{ ok: boolean; error?: string }> {
  const r = await guardarPerfil((p) => ({ ...p, siguientePasoDescartado: true }));
  if (r.ok) revalidatePath('/admin');
  return r;
}
