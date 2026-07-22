'use server';

import { headers } from 'next/headers';
import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { traducirErrorAuth } from './errores';

export interface ResultadoCuenta {
  ok: boolean;
  error?: string;
  /** Mensaje de éxito cuando la acción no termina aquí (ej. "revisa tu correo"). */
  aviso?: string;
}

/**
 * Origen público de esta petición (https://mi-dominio.com).
 *
 * Los enlaces que Supabase manda por correo tienen que apuntar a ESTE
 * despliegue. No sirve una variable de entorno fija: en preview cada despliegue
 * vive en un dominio distinto, y con una URL fija los correos de preview te
 * mandarían a producción. Se arma con las cabeceras que pone el proxy de Vercel.
 */
async function origen(): Promise<string> {
  const h = await headers();
  const host = h.get('x-forwarded-host') ?? h.get('host') ?? 'localhost:3000';
  const proto = h.get('x-forwarded-proto') ?? (host.startsWith('localhost') ? 'http' : 'https');
  return `${proto}://${host}`;
}

/**
 * Cambia el nombre a mostrar.
 *
 * Se guarda en `user_metadata.nombre`, que es de donde ya lo lee la barra
 * superior (`lib/data/usuario.ts`). No hace falta tabla ni migración: es un dato
 * de la cuenta, no de la empresa, y por eso viaja con el usuario aunque cambie
 * de constructora.
 */
export async function actualizarNombre(formData: FormData): Promise<ResultadoCuenta> {
  const nombre = String(formData.get('nombre') ?? '').trim();

  if (!nombre) {
    return { ok: false, error: 'El nombre no puede quedar vacío.' };
  }
  if (nombre.length > 60) {
    return { ok: false, error: 'El nombre no puede pasar de 60 caracteres.' };
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.updateUser({ data: { nombre } });

  if (error) {
    return { ok: false, error: traducirErrorAuth(error.message) };
  }

  // La barra superior imprime el nombre en el HTML del servidor: sin esto
  // seguiría mostrando el anterior hasta la siguiente navegación completa.
  revalidatePath('/admin', 'layout');
  revalidatePath('/cliente', 'layout');
  return { ok: true, aviso: 'Nombre actualizado.' };
}

/**
 * Pide el cambio de correo.
 *
 * IMPORTANTE: esto NO cambia el correo todavía. Supabase manda un enlace de
 * confirmación —por omisión a las DOS direcciones, la vieja y la nueva— y el
 * cambio se aplica cuando se confirma. Es a propósito: si alguien te deja la
 * sesión abierta, no puede quedarse con la cuenta cambiando el correo de golpe.
 *
 * Hay que decírselo al usuario en pantalla o va a pensar que no funcionó.
 */
export async function solicitarCambioCorreo(formData: FormData): Promise<ResultadoCuenta> {
  const correo = String(formData.get('correo') ?? '').trim().toLowerCase();

  if (!correo) {
    return { ok: false, error: 'Escribe el correo nuevo.' };
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(correo)) {
    return { ok: false, error: 'Ese correo no tiene un formato válido.' };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { ok: false, error: 'La sesión expiró. Vuelve a iniciar sesión.' };
  }
  if (user.email?.toLowerCase() === correo) {
    return { ok: false, error: 'Ese ya es tu correo actual.' };
  }

  // A dónde vuelve el usuario tras confirmar. Se compara contra una lista
  // cerrada en vez de usar el valor recibido: un `destino` libre convertiría
  // este correo en un redirector abierto hacia cualquier sitio.
  const pedido = String(formData.get('destino') ?? '');
  const destino = pedido === '/cliente/ajustes' ? '/cliente/ajustes' : '/admin/ajustes';

  const { error } = await supabase.auth.updateUser(
    { email: correo },
    { emailRedirectTo: `${await origen()}/auth/callback?destino=${destino}` },
  );

  if (error) {
    return { ok: false, error: traducirErrorAuth(error.message) };
  }

  return {
    ok: true,
    aviso:
      'Te enviamos un enlace de confirmación. Revisa AMBOS correos, el actual y el nuevo: ' +
      'el cambio se aplica hasta que confirmes.',
  };
}
