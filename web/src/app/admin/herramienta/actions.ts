'use server';

import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { getEmpresaUsuario } from '@/lib/data/empresa';
import { fechaInputAMs } from '@/lib/data/tz';
import {
  esEstadoHerramienta,
  esTipoHerramienta,
  mensajeErrorHerramienta,
} from '@/lib/herramienta/herramienta';
import { capturaEnObra } from '@/lib/auth/roles';

/**
 * Escrituras de HERRAMIENTA (0043). Admin y supervisor. La base impone: un
 * préstamo abierto a la vez, no prestar lo dado de baja, historial intocable.
 */

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const FECHA = /^\d{4}-\d{2}-\d{2}$/;

export interface Resultado {
  ok: boolean;
  error?: string;
}

async function oficina(): Promise<{ empresaId: string } | { error: string }> {
  try {
    const { empresaId, rol } = await getEmpresaUsuario();
    if (!capturaEnObra(rol)) {
      return { error: 'Solo el administrador o un supervisor mueven la herramienta.' };
    }
    return { empresaId };
  } catch (e) {
    return { error: e instanceof Error ? e.message : 'Error de autenticación.' };
  }
}

function refrescar(id?: string) {
  revalidatePath('/admin/herramienta');
  if (id) revalidatePath(`/admin/herramienta/${id}`);
}

export interface HerramientaInput {
  id: string;
  nombre: string;
  tipo: string;
  clave: string;
  serie: string;
  estado: string;
  /** '' = sin costo. */
  costo: string;
  notas: string;
}

export async function guardarHerramienta(input: HerramientaInput, nueva: boolean): Promise<Resultado> {
  const q = await oficina();
  if ('error' in q) return { ok: false, error: q.error };
  if (!UUID.test(input.id)) return { ok: false, error: 'Identificador inválido.' };
  const nombre = input.nombre.trim();
  if (!nombre || nombre.length > 120) return { ok: false, error: 'Escribe el nombre (máx. 120 letras).' };
  if (!esTipoHerramienta(input.tipo)) return { ok: false, error: 'Elige el tipo.' };
  if (!esEstadoHerramienta(input.estado)) return { ok: false, error: 'Elige el estado.' };
  const clave = input.clave.trim().slice(0, 60);
  const serie = input.serie.trim().slice(0, 80);
  let costo: number | null = null;
  if (input.costo.trim() !== '') {
    costo = Number(input.costo);
    if (!Number.isFinite(costo) || costo < 0) return { ok: false, error: 'El costo no es válido.' };
    costo = Math.round(costo * 100) / 100;
  }
  const fila = {
    nombre,
    tipo: input.tipo,
    clave,
    serie,
    estado: input.estado,
    costo,
    notas: input.notas.trim().slice(0, 500),
    updated_at: Date.now(),
  };

  const supabase = await createClient();
  const { error } = nueva
    ? await supabase
        .from('herramienta')
        .insert({ id: input.id, empresa_id: q.empresaId, created_at: Date.now(), ...fila })
    : await supabase.from('herramienta').update(fila).eq('id', input.id);
  if (error) return { ok: false, error: mensajeErrorHerramienta(error.message) };
  refrescar(input.id);
  return { ok: true };
}

export async function darDeBajaHerramienta(id: string): Promise<Resultado> {
  const q = await oficina();
  if ('error' in q) return { ok: false, error: q.error };
  const supabase = await createClient();
  const { error } = await supabase
    .from('herramienta')
    .update({ deleted_at: Date.now(), updated_at: Date.now() })
    .eq('id', id);
  if (error) return { ok: false, error: mensajeErrorHerramienta(error.message) };
  refrescar();
  return { ok: true };
}

export interface PrestamoInput {
  herramientaId: string;
  obraId: string | null;
  colaboradorId: string | null;
  desde: string;
  devolverAntes: string | null;
  entregoNombre: string;
  notas: string;
}

export async function prestarHerramienta(input: PrestamoInput): Promise<Resultado> {
  const q = await oficina();
  if ('error' in q) return { ok: false, error: q.error };
  if (!UUID.test(input.herramientaId)) return { ok: false, error: 'Herramienta inválida.' };
  if (!input.obraId && !input.colaboradorId) return { ok: false, error: 'Di a qué obra va o quién se la lleva.' };
  if (input.obraId && !UUID.test(input.obraId)) return { ok: false, error: 'Obra inválida.' };
  if (input.colaboradorId && !UUID.test(input.colaboradorId)) return { ok: false, error: 'Responsable inválido.' };
  if (!FECHA.test(input.desde)) return { ok: false, error: 'Elige desde cuándo.' };
  if (input.devolverAntes && !FECHA.test(input.devolverAntes)) return { ok: false, error: 'Fecha de regreso inválida.' };
  const desde = fechaInputAMs(input.desde);
  const devolver = input.devolverAntes ? fechaInputAMs(input.devolverAntes) : null;
  if (devolver !== null && devolver < desde) return { ok: false, error: 'La fecha de regreso es antes de la salida.' };

  const supabase = await createClient();
  const ahora = Date.now();
  const { error } = await supabase.from('herramienta_asignacion').insert({
    id: crypto.randomUUID(),
    empresa_id: q.empresaId,
    herramienta_id: input.herramientaId,
    obra_id: input.obraId,
    colaborador_id: input.colaboradorId,
    desde,
    devolver_antes: devolver,
    entrego_nombre: input.entregoNombre.trim().slice(0, 120),
    notas: input.notas.trim().slice(0, 500),
    created_at: ahora,
    updated_at: ahora,
  });
  if (error) return { ok: false, error: mensajeErrorHerramienta(error.message) };
  refrescar(input.herramientaId);
  return { ok: true };
}

export interface DevolucionInput {
  prestamoId: string;
  herramientaId: string;
  hasta: string;
  recibioNombre: string;
  estadoRegreso: string;
  notas: string;
}

export async function devolverHerramienta(input: DevolucionInput): Promise<Resultado> {
  const q = await oficina();
  if ('error' in q) return { ok: false, error: q.error };
  if (!UUID.test(input.prestamoId)) return { ok: false, error: 'Préstamo inválido.' };
  if (!FECHA.test(input.hasta)) return { ok: false, error: 'Elige el día en que regresó.' };
  if (!esEstadoHerramienta(input.estadoRegreso)) return { ok: false, error: 'Di en qué estado regresó.' };

  const supabase = await createClient();
  const { data: previo } = await supabase
    .from('herramienta_asignacion')
    .select('desde, notas')
    .eq('id', input.prestamoId)
    .maybeSingle();
  const desde = Number((previo as { desde?: number } | null)?.desde ?? 0);
  // Si regresó "antes" de salir (error de captura), se toma el día de salida.
  const hasta = Math.max(fechaInputAMs(input.hasta), desde);
  const notaPrev = String((previo as { notas?: string } | null)?.notas ?? '');
  const nota = input.notas.trim();
  const { data, error } = await supabase
    .from('herramienta_asignacion')
    .update({
      hasta,
      recibio_nombre: input.recibioNombre.trim().slice(0, 120),
      estado_regreso: input.estadoRegreso,
      notas: (nota ? (notaPrev ? `${notaPrev} · Al regresar: ${nota}` : `Al regresar: ${nota}`) : notaPrev).slice(0, 500),
      updated_at: Date.now(),
    })
    .eq('id', input.prestamoId)
    .is('hasta', null)
    .select('id');
  if (error) return { ok: false, error: mensajeErrorHerramienta(error.message) };
  if (!data || data.length === 0) return { ok: false, error: 'Ese préstamo ya estaba cerrado.' };
  refrescar(input.herramientaId);
  return { ok: true };
}
