'use server';

import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { getEmpresaUsuario } from '@/lib/data/empresa';
import { BUCKET_SEGURIDAD } from '@/lib/data/seguridad';
import { fechaInputAMs } from '@/lib/data/tz';
import { MAX_OBSERVACIONES, normalizarPuntos, type PuntoChecklist } from '@/lib/seguridad/checklist';
import {
  MAX_NOTA_SALUD,
  esAtencion,
  esParteCuerpo,
  esTipoIncidente,
  esTipoLesion,
} from '@/lib/seguridad/incidentes';

/**
 * Escrituras de SEGURIDAD EN OBRA (0043). La barrera es la base (RLS +
 * triggers); aquí se valida para dar mensajes claros. Nunca se regresa en un
 * error el contenido de los datos de salud (checklist PHI de ECC): solo textos
 * genéricos.
 */

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const FECHA = /^\d{4}-\d{2}-\d{2}$/;
const MAX_BYTES = 10 * 1024 * 1024;
const TIPOS_COMPROBANTE = ['image/jpeg', 'image/png', 'image/webp', 'application/pdf'];

export interface Resultado {
  ok: boolean;
  error?: string;
}

async function quien(roles: string[]): Promise<{ empresaId: string; rol: string } | { error: string }> {
  try {
    const { empresaId, rol } = await getEmpresaUsuario();
    if (!roles.includes(rol)) {
      return {
        error: roles.length === 1 ? 'Solo el administrador puede hacer esto.' : 'Solo el administrador o un supervisor.',
      };
    }
    return { empresaId, rol };
  } catch (e) {
    return { error: e instanceof Error ? e.message : 'Error de autenticación.' };
  }
}

function ruta(obraId: string) {
  return `/admin/obras/${obraId}/seguridad`;
}

function mensaje(msg: string): string {
  if (msg.includes('uq_seguridad_checklist_obra_dia')) {
    return 'Ya hay una revisión guardada para ese día. Recarga la página para editarla.';
  }
  if (msg.includes('INCIDENTE_SOLO_ADMIN')) return 'El comprobante del aviso solo lo sube el administrador.';
  if (msg.includes('incidente_incapacidad_solo_accidente') || msg.includes('incidente_aviso_solo_accidente')) {
    return 'La incapacidad y el aviso al IMSS solo aplican cuando alguien se lastimó (accidente).';
  }
  if (/row-level security/i.test(msg)) return 'No tienes permiso para hacer esto.';
  if (/check constraint/i.test(msg)) return 'Algún dato no es válido. Revisa lo capturado.';
  return 'No se pudo guardar. Intenta de nuevo.';
}

// ── Revisión diaria ─────────────────────────────────────────────────────────

export interface ChecklistInput {
  /** Nuevo (lo genera el navegador) o el de la revisión que se edita. */
  id: string;
  fecha: string;
  puntos: PuntoChecklist[];
  observaciones: string;
  firmoNombre: string;
}

export async function guardarChecklist(obraId: string, input: ChecklistInput): Promise<Resultado> {
  const q = await quien(['admin', 'supervisor']);
  if ('error' in q) return { ok: false, error: q.error };
  if (!UUID.test(input.id) || !UUID.test(obraId)) return { ok: false, error: 'Identificador inválido.' };
  if (!FECHA.test(input.fecha)) return { ok: false, error: 'Elige el día.' };
  const puntos = normalizarPuntos(input.puntos);
  if (puntos.length === 0) return { ok: false, error: 'La revisión no tiene puntos.' };
  if (puntos.every((p) => p.resultado === null)) return { ok: false, error: 'Contesta al menos un punto.' };
  const observaciones = String(input.observaciones ?? '').trim();
  if (observaciones.length > MAX_OBSERVACIONES) return { ok: false, error: 'Las observaciones son muy largas.' };
  const firmo = String(input.firmoNombre ?? '').trim().slice(0, 120);

  const supabase = await createClient();
  const ahora = Date.now();
  const fila = {
    fecha: fechaInputAMs(input.fecha),
    puntos,
    observaciones,
    firmo_nombre: firmo,
    updated_at: ahora,
  };

  // ¿Existe? Se edita. Si no, se crea. (El índice único por obra+día evita dos.)
  const { data: existente } = await supabase
    .from('seguridad_checklist')
    .select('id')
    .eq('id', input.id)
    .maybeSingle();

  const { error } = existente
    ? await supabase.from('seguridad_checklist').update(fila).eq('id', input.id).eq('obra_id', obraId)
    : await supabase
        .from('seguridad_checklist')
        .insert({ id: input.id, empresa_id: q.empresaId, obra_id: obraId, created_at: ahora, ...fila });
  if (error) return { ok: false, error: mensaje(error.message) };
  revalidatePath(ruta(obraId));
  return { ok: true };
}

// ── Incidentes ──────────────────────────────────────────────────────────────

export interface IncidenteInput {
  id: string;
  fecha: string;
  tipo: string;
  descripcion: string;
  acciones: string;
  colaboradorId: string | null;
  diasIncapacidad: number | null;
}

function validarIncidente(i: IncidenteInput): string | null {
  if (!UUID.test(i.id)) return 'Identificador inválido.';
  if (!FECHA.test(i.fecha)) return 'Elige el día.';
  if (!esTipoIncidente(i.tipo)) return 'Elige qué tipo de incidente fue.';
  const d = i.descripcion.trim();
  if (!d) return 'Describe qué pasó.';
  if (d.length > 2000) return 'La descripción pasa de 2000 letras.';
  if (i.acciones.trim().length > 2000) return 'Las acciones pasan de 2000 letras.';
  if (i.colaboradorId !== null && !UUID.test(i.colaboradorId)) return 'Colaborador inválido.';
  if (i.diasIncapacidad !== null) {
    if (i.tipo !== 'ACCIDENTE') return 'Los días de incapacidad solo aplican a un accidente.';
    if (!Number.isInteger(i.diasIncapacidad) || i.diasIncapacidad < 0 || i.diasIncapacidad > 3650) {
      return 'Los días de incapacidad no son válidos.';
    }
  }
  return null;
}

export async function guardarIncidente(obraId: string, input: IncidenteInput): Promise<Resultado> {
  const q = await quien(['admin', 'supervisor']);
  if ('error' in q) return { ok: false, error: q.error };
  const invalido = validarIncidente(input);
  if (invalido) return { ok: false, error: invalido };

  const supabase = await createClient();
  const ahora = Date.now();
  const fila = {
    fecha: fechaInputAMs(input.fecha),
    tipo: input.tipo,
    descripcion: input.descripcion.trim(),
    acciones: input.acciones.trim(),
    colaborador_id: input.colaboradorId,
    dias_incapacidad: input.tipo === 'ACCIDENTE' ? input.diasIncapacidad : null,
    updated_at: ahora,
  };

  const { data: existente } = await supabase.from('incidente').select('id').eq('id', input.id).maybeSingle();
  const { error } = existente
    ? await supabase.from('incidente').update(fila).eq('id', input.id).eq('obra_id', obraId)
    : await supabase
        .from('incidente')
        .insert({ id: input.id, empresa_id: q.empresaId, obra_id: obraId, created_at: ahora, ...fila });
  if (error) {
    if (error.code === '23505') return { ok: true };
    return { ok: false, error: mensaje(error.message) };
  }
  revalidatePath(ruta(obraId));
  return { ok: true };
}

export async function marcarAvisoImss(
  obraId: string,
  incidenteId: string,
  hecho: boolean,
  fecha: string | null,
): Promise<Resultado> {
  const q = await quien(['admin', 'supervisor']);
  if ('error' in q) return { ok: false, error: q.error };
  if (hecho && (!fecha || !FECHA.test(fecha))) return { ok: false, error: 'Pon la fecha en que se dio el aviso.' };

  const supabase = await createClient();
  const { data, error } = await supabase
    .from('incidente')
    .update({
      aviso_imss_hecho: hecho,
      aviso_imss_fecha: hecho && fecha ? fechaInputAMs(fecha) : null,
      updated_at: Date.now(),
    })
    .eq('id', incidenteId)
    .eq('obra_id', obraId)
    .select('id');
  if (error) return { ok: false, error: mensaje(error.message) };
  if (!data || data.length === 0) return { ok: false, error: 'No se encontró el incidente.' };
  revalidatePath(ruta(obraId));
  return { ok: true };
}

export async function borrarIncidente(obraId: string, incidenteId: string): Promise<Resultado> {
  const q = await quien(['admin']);
  if ('error' in q) return { ok: false, error: q.error };
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('incidente')
    .update({ deleted_at: Date.now(), updated_at: Date.now() })
    .eq('id', incidenteId)
    .eq('obra_id', obraId)
    .select('id');
  if (error) return { ok: false, error: mensaje(error.message) };
  if (!data || data.length === 0) return { ok: false, error: 'No se encontró el incidente.' };
  revalidatePath(ruta(obraId));
  return { ok: true };
}

// ── Datos de salud (SOLO admin, D8) ─────────────────────────────────────────

export interface SaludInput {
  tipoLesion: string;
  parteCuerpo: string;
  atencion: string;
  nota: string;
}

export async function guardarSalud(obraId: string, incidenteId: string, input: SaludInput): Promise<Resultado> {
  const q = await quien(['admin']);
  if ('error' in q) return { ok: false, error: q.error };
  if (!UUID.test(incidenteId)) return { ok: false, error: 'Incidente inválido.' };
  if (!esTipoLesion(input.tipoLesion) || !esParteCuerpo(input.parteCuerpo) || !esAtencion(input.atencion)) {
    return { ok: false, error: 'Elige una opción de cada lista.' };
  }
  const nota = String(input.nota ?? '').trim();
  if (nota.length > MAX_NOTA_SALUD) return { ok: false, error: `La nota pasa de ${MAX_NOTA_SALUD} letras.` };

  const supabase = await createClient();
  const ahora = Date.now();
  const fila = {
    tipo_lesion: input.tipoLesion,
    parte_cuerpo: input.parteCuerpo,
    atencion: input.atencion,
    nota,
    updated_at: ahora,
  };
  const { data: existente } = await supabase
    .from('incidente_salud')
    .select('id')
    .eq('incidente_id', incidenteId)
    .maybeSingle();
  const { error } = existente
    ? await supabase.from('incidente_salud').update(fila).eq('id', existente.id as string)
    : await supabase.from('incidente_salud').insert({
        id: crypto.randomUUID(),
        empresa_id: q.empresaId,
        incidente_id: incidenteId,
        created_at: ahora,
        ...fila,
      });
  if (error) return { ok: false, error: mensaje(error.message) };
  revalidatePath(ruta(obraId));
  return { ok: true };
}

// ── Comprobante del aviso (SOLO admin: un ST-7 trae el diagnóstico) ─────────

export async function crearUrlSubidaComprobante(
  obraId: string,
  incidenteId: string,
  tipo: string,
  bytes: number,
): Promise<Resultado & { path?: string; token?: string }> {
  const q = await quien(['admin']);
  if ('error' in q) return { ok: false, error: q.error };
  if (!UUID.test(obraId) || !UUID.test(incidenteId)) return { ok: false, error: 'Incidente inválido.' };
  if (!TIPOS_COMPROBANTE.includes(tipo)) return { ok: false, error: 'Solo foto (JPG, PNG, WEBP) o PDF.' };
  if (!bytes || bytes <= 0 || bytes > MAX_BYTES) return { ok: false, error: 'El archivo pasa de 10 MB o está vacío.' };

  const ext = tipo === 'application/pdf' ? 'pdf' : tipo === 'image/png' ? 'png' : tipo === 'image/webp' ? 'webp' : 'jpg';
  const path = `${q.empresaId}/incidentes/${incidenteId}/${crypto.randomUUID()}.${ext}`;
  const supabase = await createClient();
  const { data, error } = await supabase.storage.from(BUCKET_SEGURIDAD).createSignedUploadUrl(path);
  if (error || !data) return { ok: false, error: 'No se pudo preparar la subida.' };
  return { ok: true, path: data.path, token: data.token };
}

export async function registrarComprobante(obraId: string, incidenteId: string, path: string): Promise<Resultado> {
  const q = await quien(['admin']);
  if ('error' in q) return { ok: false, error: q.error };
  if (!path.startsWith(`${q.empresaId}/incidentes/${incidenteId}/`)) return { ok: false, error: 'Ruta inválida.' };

  const supabase = await createClient();
  const { data: previo } = await supabase
    .from('incidente')
    .select('comprobante_path')
    .eq('id', incidenteId)
    .maybeSingle();
  const { error } = await supabase
    .from('incidente')
    .update({ comprobante_path: path, updated_at: Date.now() })
    .eq('id', incidenteId)
    .eq('obra_id', obraId);
  if (error) {
    await supabase.storage.from(BUCKET_SEGURIDAD).remove([path]);
    return { ok: false, error: mensaje(error.message) };
  }
  const viejo = (previo as { comprobante_path?: string | null } | null)?.comprobante_path;
  if (viejo && viejo !== path) await supabase.storage.from(BUCKET_SEGURIDAD).remove([viejo]);
  revalidatePath(ruta(obraId));
  return { ok: true };
}

/** Enlace de 5 minutos al comprobante, pedido al momento (no se manda en la página). */
export async function urlComprobante(incidenteId: string): Promise<Resultado & { url?: string }> {
  const q = await quien(['admin']);
  if ('error' in q) return { ok: false, error: q.error };
  const supabase = await createClient();
  const { data } = await supabase.from('incidente').select('comprobante_path').eq('id', incidenteId).maybeSingle();
  const path = (data as { comprobante_path?: string | null } | null)?.comprobante_path;
  if (!path) return { ok: false, error: 'No hay comprobante.' };
  const { data: firmada, error } = await supabase.storage.from(BUCKET_SEGURIDAD).createSignedUrl(path, 300);
  if (error || !firmada) return { ok: false, error: 'No se pudo abrir el comprobante.' };
  return { ok: true, url: firmada.signedUrl };
}
