'use server';

import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { getEmpresaUsuario } from '@/lib/data/empresa';
import { guardarIvaPorDefecto, guardarPdfConfig } from '@/lib/data/empresa-config';

export interface ResultadoEmpresa {
  ok: boolean;
  error?: string;
  aviso?: string;
}

/**
 * Renombra la empresa.
 *
 * El rol se comprueba aquí para poder dar un mensaje decente, pero quien
 * REALMENTE impide el cambio es la policy `empresas_update_admin` de la
 * migración 0017: si alguien llama a esta acción sin ser admin, Postgres
 * rechaza el UPDATE aunque este código lo dejara pasar. La comprobación de
 * abajo es cortesía; la de la base es la barrera.
 */
export async function actualizarNombreEmpresa(formData: FormData): Promise<ResultadoEmpresa> {
  const nombre = String(formData.get('nombre') ?? '').trim();

  if (!nombre) {
    return { ok: false, error: 'El nombre de la empresa no puede quedar vacío.' };
  }
  if (nombre.length > 80) {
    return { ok: false, error: 'El nombre no puede pasar de 80 caracteres.' };
  }

  let empresaId: string;
  let rol: string;
  try {
    ({ empresaId, rol } = await getEmpresaUsuario());
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Error de autenticación.' };
  }

  if (rol !== 'admin') {
    return { ok: false, error: 'Solo un administrador puede cambiar el nombre de la empresa.' };
  }

  const supabase = await createClient();
  const { error } = await supabase
    .from('empresas')
    .update({ nombre })
    .eq('id', empresaId);

  if (error) {
    return { ok: false, error: error.message };
  }

  // El nombre es la marca que se imprime en la barra de TODOS los portales y en
  // los documentos del cliente.
  revalidatePath('/admin', 'layout');
  revalidatePath('/cliente', 'layout');
  return { ok: true, aviso: 'Nombre de la empresa actualizado.' };
}

/** Guarda la personalización del PDF. Admin y supervisor (policy de 0017). */
export async function actualizarPdfConfig(formData: FormData): Promise<ResultadoEmpresa> {
  const pdf = {
    empresaContacto: String(formData.get('empresa_contacto') ?? '').trim().slice(0, 120),
    colorHex: String(formData.get('color_hex') ?? '').trim(),
    pieDePagina: String(formData.get('pie_de_pagina') ?? '').trim().slice(0, 160),
    watermark: String(formData.get('watermark') ?? '').trim().slice(0, 40),
    mayusculas: formData.get('mayusculas') === 'on',
    modoCompacto: formData.get('modo_compacto') === 'on',
    firmaIzquierda: String(formData.get('firma_izquierda') ?? '').trim().slice(0, 60),
    firmaDerecha: String(formData.get('firma_derecha') ?? '').trim().slice(0, 60),
  };

  const resultado = await guardarPdfConfig(pdf);
  if (!resultado.ok) {
    return { ok: false, error: resultado.error };
  }

  revalidatePath('/admin/ajustes');
  // Las vistas de documento leen esta configuración al pintarse.
  revalidatePath('/admin/cotizaciones', 'layout');
  return { ok: true, aviso: 'Personalización guardada. Se aplica a los documentos nuevos que abras.' };
}

/** Guarda el IVA por defecto para cotizaciones nuevas. Admin y supervisor. */
export async function actualizarIva(formData: FormData): Promise<ResultadoEmpresa> {
  const crudo = String(formData.get('iva_porcentaje') ?? '').trim().replace(',', '.');
  const iva = Number(crudo);

  if (crudo === '' || !Number.isFinite(iva)) {
    return { ok: false, error: 'Escribe un porcentaje válido.' };
  }

  const resultado = await guardarIvaPorDefecto(iva);
  if (!resultado.ok) {
    return { ok: false, error: resultado.error };
  }

  revalidatePath('/admin/ajustes');
  return {
    ok: true,
    aviso: 'IVA actualizado. Solo aplica a cotizaciones nuevas; las anteriores conservan su tasa.',
  };
}
