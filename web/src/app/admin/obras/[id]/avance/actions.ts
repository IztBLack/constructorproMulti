'use server';

import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { moduloActivo } from '@/lib/data/modulos';
import {
  eliminarCaptura,
  getAvanceFisicoObra,
  listCapturasAvance,
  listConceptosObra,
  registrarAvance,
} from '@/lib/data/estimaciones';
import { cantidadDesdePct, ejecutadoPorConcepto, incrementoDesdeTotal } from '@/lib/estimaciones/avance';
import { fechaInputAMs, hoyMxMs } from '@/lib/data/tz';

/**
 * Captura del AVANCE por partida (0039). La RLS decide quién (admin y
 * supervisor capturan; el supervisor borra solo lo suyo); aquí se valida lo que
 * llega del navegador y se traduce "llevamos en total X" o "vamos al 40 %" a la
 * captura incremental que guarda la base.
 */

export interface ResultadoAvance {
  ok: boolean;
  error?: string;
  aviso?: string;
}

type Modo = 'hoy' | 'total' | 'pct';

function numero(fd: FormData, campo: string): number {
  const bruto = String(fd.get(campo) ?? '').trim().replace(',', '.');
  if (bruto === '') return Number.NaN;
  return Number(bruto);
}

async function apagado(): Promise<ResultadoAvance | null> {
  if (await moduloActivo('estimaciones')) return null;
  return {
    ok: false,
    error: 'Avance y estimaciones está apagado en tu empresa. El administrador puede prenderlo en Ajustes → Módulos.',
  };
}

function revalidar(obraId: string) {
  revalidatePath(`/admin/obras/${obraId}/avance`);
  revalidatePath(`/admin/obras/${obraId}`);
  revalidatePath(`/admin/obras/${obraId}/programa`);
  revalidatePath(`/admin/obras/${obraId}/estimaciones`);
}

/**
 * `obras.avance` (el % que ve el móvil, la lista del portal y el encabezado de
 * la obra) se pone al día con el físico medido. No es un trigger a propósito:
 * así la base no reescribe `obras` a espaldas del móvil, y una obra sin
 * presupuesto sigue con su avance a mano. Si no se puede (permiso), no pasa
 * nada: la captura ya quedó.
 */
async function sincronizarAvanceObra(obraId: string) {
  const a = await getAvanceFisicoObra(obraId);
  if (!a || !a.hayCapturas || a.pct === null) return;
  const supabase = await createClient();
  const pct = Math.round(a.pct);
  await supabase
    .from('obras')
    .update({ avance: pct, updated_at: Date.now() })
    .eq('id', obraId)
    .neq('avance', pct);
}

export async function capturarAvanceAction(obraId: string, fd: FormData): Promise<ResultadoAvance> {
  const off = await apagado();
  if (off) return off;

  const clave = String(fd.get('clave') ?? '');
  const modo = String(fd.get('modo') ?? 'hoy') as Modo;
  const valor = numero(fd, 'valor');
  const nota = String(fd.get('nota') ?? '').trim().slice(0, 500);
  const fechaStr = String(fd.get('fecha') ?? '').trim();
  const fecha = fechaStr ? fechaInputAMs(fechaStr) : hoyMxMs();

  if (!/^[px]:[0-9a-f-]{36}$/i.test(clave)) return { ok: false, error: 'Partida no válida.' };
  if (!['hoy', 'total', 'pct'].includes(modo)) return { ok: false, error: 'Forma de captura no válida.' };
  if (!Number.isFinite(valor)) return { ok: false, error: 'Escribe una cantidad.' };
  if (Math.abs(valor) > 1e8) return { ok: false, error: 'La cantidad es demasiado grande.' };
  if (!Number.isFinite(fecha)) return { ok: false, error: 'La fecha no es válida.' };
  if (fecha > hoyMxMs() + 86_400_000) return { ok: false, error: 'No se puede capturar avance de días que no han pasado.' };

  // La partida tiene que ser de ESTA obra (la RLS lo vuelve a exigir).
  const [{ data: conceptos, error }, { data: capturas, error: errC }] = await Promise.all([
    listConceptosObra(obraId),
    listCapturasAvance(obraId),
  ]);
  if (error || errC) return { ok: false, error: error ?? errC ?? 'No se pudo leer la obra.' };
  const concepto = conceptos.find((c) => c.clave === clave);
  if (!concepto) return { ok: false, error: 'Esa partida ya no está en el contrato de la obra.' };

  const acumulado = ejecutadoPorConcepto(capturas).get(clave) ?? 0;
  let cantidad: number;
  if (modo === 'hoy') {
    if (valor === 0) return { ok: false, error: 'La cantidad no puede ser cero.' };
    cantidad = valor;
  } else {
    if (valor < 0) return { ok: false, error: 'El total no puede ser negativo.' };
    if (modo === 'pct' && valor > 100) return { ok: false, error: 'El porcentaje va de 0 a 100.' };
    const total = modo === 'pct' ? cantidadDesdePct(concepto.cantidad, valor) : valor;
    cantidad = incrementoDesdeTotal(acumulado, total);
    if (cantidad === 0) return { ok: true, aviso: 'Eso ya estaba capturado: no hubo cambio.' };
  }

  const r = await registrarAvance({
    obraId,
    origen: concepto.origen,
    conceptoId: concepto.id,
    fecha,
    cantidad,
    nota,
  });
  if (!r.ok) return r;

  await sincronizarAvanceObra(obraId);
  revalidar(obraId);
  const nuevo = acumulado + cantidad;
  return {
    ok: true,
    aviso:
      nuevo > concepto.cantidad
        ? `Quedó guardado. Ojo: ya se hizo más de lo contratado en «${concepto.concepto}». Lo de más se cobra con un extra.`
        : undefined,
  };
}

export async function borrarCapturaAction(obraId: string, capturaId: string): Promise<ResultadoAvance> {
  const off = await apagado();
  if (off) return off;
  if (!/^[0-9a-f-]{36}$/i.test(capturaId)) return { ok: false, error: 'Captura no válida.' };
  const r = await eliminarCaptura(obraId, capturaId);
  if (!r.ok) return r;
  await sincronizarAvanceObra(obraId);
  revalidar(obraId);
  return { ok: true };
}
