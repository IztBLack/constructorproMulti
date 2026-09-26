'use server';

import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import {
  esClaveModulo,
  modulo,
  perfilAJson,
  perfilDeRespuestas,
  resolverDependencias,
} from '@/lib/modulos';

export interface ActionResult {
  ok: boolean;
  error?: string;
}

/**
 * Canjea un código de invitación para unirse a una empresa que ya existe.
 *
 * ESTE ERA EL ESLABÓN QUE FALTABA. Hasta ahora `/onboarding` solo ofrecía "crear
 * empresa", así que un supervisor invitado que se registraba en la web acababa
 * creando una SEGUNDA EMPRESA VACÍA en vez de unirse a la de su jefe. Por eso el
 * sistema no tenía ni un supervisor: no faltaba la pantalla de invitar, faltaba
 * la de aceptar.
 *
 * El código se normaliza a mayúsculas y sin espacios porque llega dictado por
 * teléfono o pegado desde WhatsApp, y nadie lo escribe con el formato exacto.
 */
export async function canjearInvitacion(formData: FormData): Promise<ActionResult> {
  const code = String(formData.get('code') ?? '')
    .trim()
    .toUpperCase()
    .replace(/\s+/g, '');

  if (!code) {
    return { ok: false, error: 'Escribe el código que te compartieron.' };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { ok: false, error: 'No hay sesión activa. Inicia sesión primero.' };
  }

  const { data, error } = await supabase.rpc('canjear_codigo_vinculacion', { p_code: code });

  if (error || !data?.ok) {
    return {
      ok: false,
      error: data?.error ?? error?.message ?? 'El código no es válido o ya expiró.',
    };
  }

  // El destino depende del rol con el que entra: un cliente no pinta nada en el
  // panel de oficina, y el middleware lo devolvería de todas formas.
  redirect(data.rol === 'cliente' ? '/cliente' : '/admin');
}

/** Lo que manda el asistente "Estoy creando mi empresa". Todo menos el nombre es opcional. */
export interface DatosEmpresaNueva {
  nombre: string;
  /** Módulos elegidos en el resumen. `null` = se saltó: paquete recomendado. */
  modulos: string[] | null;
  tipo: string | null;
  factura: string | null;
  necesidades: string[];
  saltado: boolean;
}

/**
 * Crea la empresa con sus módulos y las respuestas del cuestionario (0035).
 *
 * Nada de lo que llega se toma tal cual: viene del navegador. Los módulos se
 * filtran a los que existen y están disponibles, y se completan dependencias;
 * el perfil se rearma y su lista de "próximamente" se recalcula aquí. La RPC
 * vuelve a validar todo del lado de la base.
 */
export async function crearEmpresa(datos: DatosEmpresaNueva): Promise<ActionResult> {
  const nombre = String(datos?.nombre ?? '').trim();

  if (!nombre) {
    return { ok: false, error: 'El nombre de la empresa es obligatorio.' };
  }
  if (nombre.length > 80) {
    return { ok: false, error: 'El nombre no puede pasar de 80 caracteres.' };
  }

  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { ok: false, error: 'No hay sesión activa. Inicia sesión primero.' };
  }

  const perfil = perfilDeRespuestas({
    tipo: datos.tipo,
    factura: datos.factura,
    necesidades: datos.necesidades,
    saltado: datos.saltado === true,
  });
  const modulos = Array.isArray(datos.modulos)
    ? resolverDependencias(
        datos.modulos.filter(esClaveModulo).filter((c) => modulo(c).disponible),
      )
    : null;

  // Llamada RPC atómica — la función maneja creación + vinculación + deduplicación.
  let { data, error } = await supabase.rpc('crear_empresa', {
    p_nombre: nombre,
    p_modulos: modulos,
    p_perfil: perfilAJson(perfil),
  });

  // Despliegue a medias: si la web nueva sale antes que la migración 0035, la
  // base todavía no conoce los parámetros nuevos (PostgREST responde PGRST202,
  // "función no encontrada"). Se crea la empresa como antes —con todo prendido
  // por el default de siempre— en vez de dejar a alguien sin poder registrarse.
  if (error?.code === 'PGRST202') {
    ({ data, error } = await supabase.rpc('crear_empresa', { p_nombre: nombre }));
  }

  if (error || !data?.ok) {
    return { ok: false, error: data?.error ?? error?.message ?? 'No se pudo crear la empresa.' };
  }

  redirect('/admin');
}
