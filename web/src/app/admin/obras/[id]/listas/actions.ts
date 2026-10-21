'use server';

import { revalidatePath } from 'next/cache';
import {
  actualizarLista,
  actualizarRenglon,
  crearLista,
  crearRenglones,
  eliminarLista,
  eliminarRenglon,
  marcarRenglon,
  renglonDeLeido,
  type RenglonInput,
} from '@/lib/data/listas';
import { tipoRenglonLista, type EstadoLista } from '@/lib/listas/calculo';
import { leerNotaMaterial } from '@/lib/listas/leer-nota';

/**
 * Acciones de las LISTAS DE MATERIAL (0050). Validan lo que llega del cliente
 * antes de escribir: el CHECK de la base también lo haría, pero con un mensaje
 * de Postgres que nadie en la obra entiende. Los permisos los decide la RLS.
 */

export interface ActionResult {
  ok: boolean;
  error?: string;
  id?: string;
}

function revalidar(obraId: string, listaId?: string) {
  revalidatePath(`/admin/obras/${obraId}/listas`);
  if (listaId) revalidatePath(`/admin/obras/${obraId}/listas/${listaId}`);
}

function texto(v: unknown, max: number): string {
  return String(v ?? '').trim().slice(0, max);
}

function numero(v: unknown): number | null {
  if (v == null || v === '') return null;
  const n = typeof v === 'number' ? v : Number(String(v).trim().replace(/[:,]/g, '.'));
  return Number.isFinite(n) ? n : null;
}

/** El renglón tal como lo manda el formulario, ya validado; o el error en palabras de obra. */
function validarRenglon(crudo: Record<string, unknown>): { renglon?: RenglonInput; error?: string } {
  const tipo = tipoRenglonLista(crudo.tipo);
  const cantidad = numero(crudo.cantidad);
  const largo = tipo === 'PIEZA' ? numero(crudo.largo) : null;
  const separacion = tipo === 'PIEZA' ? numero(crudo.separacion_cm) : null;
  if (cantidad == null || cantidad <= 0 || cantidad >= 1e9) return { error: 'Escribe la cantidad.' };
  if (largo != null && (largo <= 0 || largo >= 1000)) {
    return { error: 'El largo va en metros, por ejemplo 10.45.' };
  }
  if (separacion != null && (separacion <= 0 || separacion >= 1000)) {
    return { error: 'La separación de estribos va en centímetros, por ejemplo 25.' };
  }
  const descripcion = tipo === 'LIBRE' ? texto(crudo.descripcion, 300) : '';
  if (tipo === 'LIBRE' && !descripcion) return { error: 'Escribe qué material es.' };
  return {
    renglon: {
      seccion: texto(crudo.seccion, 120),
      tipo,
      cantidad,
      largo,
      separacion_cm: separacion,
      unidad: tipo === 'LIBRE' ? texto(crudo.unidad, 20) : '',
      descripcion,
      nota: texto(crudo.nota, 500),
    },
  };
}

export async function crearListaAction(
  obraId: string,
  datos: { titulo: string; plano: string },
): Promise<ActionResult> {
  const r = await crearLista(obraId, { titulo: texto(datos.titulo, 200), plano: texto(datos.plano, 60) });
  if (r.error || !r.id) return { ok: false, error: r.error ?? 'No se pudo crear la lista.' };
  revalidar(obraId);
  return { ok: true, id: r.id };
}

export async function actualizarListaAction(
  obraId: string,
  listaId: string,
  datos: { titulo?: string; plano?: string; notas?: string; estado?: EstadoLista },
): Promise<ActionResult> {
  const cambios: Parameters<typeof actualizarLista>[1] = {};
  if (datos.titulo !== undefined) cambios.titulo = texto(datos.titulo, 200);
  if (datos.plano !== undefined) cambios.plano = texto(datos.plano, 60);
  if (datos.notas !== undefined) cambios.notas = texto(datos.notas, 2000);
  if (datos.estado !== undefined) cambios.estado = datos.estado === 'CERRADA' ? 'CERRADA' : 'ABIERTA';
  const r = await actualizarLista(listaId, cambios);
  revalidar(obraId, listaId);
  return r;
}

export async function eliminarListaAction(obraId: string, listaId: string): Promise<ActionResult> {
  const r = await eliminarLista(listaId);
  revalidar(obraId, listaId);
  return r;
}

export async function agregarRenglonAction(
  obraId: string,
  listaId: string,
  crudo: Record<string, unknown>,
): Promise<ActionResult> {
  const { renglon, error } = validarRenglon(crudo);
  if (!renglon) return { ok: false, error };
  const r = await crearRenglones(listaId, [renglon]);
  revalidar(obraId, listaId);
  return r;
}

export async function editarRenglonAction(
  obraId: string,
  listaId: string,
  renglonId: string,
  crudo: Record<string, unknown>,
): Promise<ActionResult> {
  const { renglon, error } = validarRenglon(crudo);
  if (!renglon) return { ok: false, error };
  const r = await actualizarRenglon(renglonId, renglon);
  revalidar(obraId, listaId);
  return r;
}

export async function eliminarRenglonAction(
  obraId: string,
  listaId: string,
  renglonId: string,
): Promise<ActionResult> {
  const r = await eliminarRenglon(renglonId);
  revalidar(obraId, listaId);
  return r;
}

export async function marcarRenglonAction(
  obraId: string,
  listaId: string,
  renglonId: string,
  marcado: boolean,
): Promise<ActionResult> {
  const r = await marcarRenglon(renglonId, marcado);
  revalidar(obraId, listaId);
  return r;
}

/**
 * La nota pegada se vuelve a leer AQUÍ, no se confía en lo que mandó el
 * navegador: la vista previa es para que la persona revise, y lo que se guarda
 * sale del mismo lector con el mismo texto.
 */
export async function pegarNotaAction(
  obraId: string,
  listaId: string,
  nota: string,
  seccionInicial: string,
): Promise<ActionResult> {
  const leidos = leerNotaMaterial(String(nota ?? '').slice(0, 20000), texto(seccionInicial, 120));
  if (leidos.length === 0) return { ok: false, error: 'No se encontró ningún renglón en la nota.' };
  const r = await crearRenglones(
    listaId,
    leidos.map((l) => {
      const base = renglonDeLeido(l);
      // Los textos se recortan al largo que acepta la base.
      return {
        ...base,
        seccion: base.seccion.slice(0, 120),
        unidad: base.unidad.slice(0, 20),
        descripcion: base.descripcion.slice(0, 300),
        nota: base.nota.slice(0, 500),
        largo: base.largo != null && base.largo > 0 && base.largo < 1000 ? base.largo : null,
        separacion_cm:
          base.separacion_cm != null && base.separacion_cm > 0 && base.separacion_cm < 1000
            ? base.separacion_cm
            : null,
      };
    }),
  );
  revalidar(obraId, listaId);
  return r;
}
