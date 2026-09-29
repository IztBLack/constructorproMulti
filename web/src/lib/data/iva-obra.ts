import { createClient } from '@/lib/supabase/server';
import {
  tasaIvaValida,
  type EstimacionCobradaIva,
  type IvaEstadoCuenta,
} from '@/lib/cliente/estado-cuenta-calculo';

/**
 * Con qué IVA cobra cada obra, para separar el IVA cobrado en el estado de
 * cuenta (`lib/cliente/estado-cuenta-calculo.ts`).
 *
 * La tasa la resuelve la base con `iva_obras` (0047): contrato de la obra →
 * cotización convertida (o aceptada ligada) → sin IVA. La misma función sirve a
 * la oficina, al residente y al cliente del portal (que no lee `obra_contrato`),
 * así los dos lados ven los mismos números.
 *
 * Si la función no existe todavía (0047 sin aplicar), falla o no regresa la
 * obra: la obra cuenta como SIN IVA, que es exactamente el estado de cuenta de
 * antes (mismo criterio que F0-9 / F1-14).
 *
 * Las entradas con que se cobró una estimación llevan el IVA de la estimación
 * (0039 `estimaciones.movimiento_id`); la RLS de 0039 deja leer esas filas a la
 * oficina y al cliente dueño. Sin 0039 o sin permiso, lista vacía.
 */

export type OrigenIva = 'contrato' | 'cotizacion' | 'ninguno';

export interface IvaObra {
  tasaPct: number;
  origen: OrigenIva;
}

export const SIN_IVA: IvaObra = { tasaPct: 0, origen: 'ninguno' };

const ORIGENES: readonly OrigenIva[] = ['contrato', 'cotizacion', 'ninguno'];

/** Tasa de IVA de varias obras (una sola llamada). Las que no regresan: sin IVA. */
export async function getIvaObras(obraIds: readonly string[]): Promise<Map<string, IvaObra>> {
  const out = new Map<string, IvaObra>();
  if (obraIds.length === 0) return out;
  try {
    const supabase = await createClient();
    const { data, error } = await supabase.rpc('iva_obras', { p_obra_ids: [...new Set(obraIds)] });
    if (error || !Array.isArray(data)) return out;
    for (const f of data as { obra_id: string; iva_pct: number | string; origen: string }[]) {
      const origen = ORIGENES.includes(f.origen as OrigenIva) ? (f.origen as OrigenIva) : 'ninguno';
      out.set(f.obra_id, { tasaPct: tasaIvaValida(f.iva_pct), origen });
    }
  } catch {
    // Sin la función: sin IVA, como antes.
  }
  return out;
}

export async function getIvaObra(obraId: string): Promise<IvaObra> {
  return (await getIvaObras([obraId])).get(obraId) ?? SIN_IVA;
}

/** Estimaciones cobradas con una entrada de caja, de una o varias obras. */
async function estimacionesCobradas(
  obraIds: readonly string[],
): Promise<(EstimacionCobradaIva & { obraId: string })[]> {
  const ids = [...new Set(obraIds)];
  const out: (EstimacionCobradaIva & { obraId: string })[] = [];
  try {
    const supabase = await createClient();
    // En lotes: la lista de ids viaja en la URL.
    for (let i = 0; i < ids.length; i += 150) {
      const { data, error } = await supabase
        .from('estimaciones')
        .select('obra_id, movimiento_id, iva, neto')
        .in('obra_id', ids.slice(i, i + 150))
        .not('movimiento_id', 'is', null)
        .is('deleted_at', null);
      if (error || !data) return [];
      for (const e of data) {
        out.push({
          obraId: e.obra_id as string,
          movimientoId: e.movimiento_id as string,
          iva: Number(e.iva) || 0,
          neto: Number(e.neto) || 0,
        });
      }
    }
  } catch {
    return [];
  }
  return out;
}

/** Todo lo que el cálculo necesita para separar el IVA de UNA obra. */
export async function getIvaEstadoCuenta(obraId: string): Promise<IvaEstadoCuenta & { origen: OrigenIva }> {
  const [iva, ests] = await Promise.all([getIvaObra(obraId), estimacionesCobradas([obraId])]);
  return { tasaPct: iva.tasaPct, origen: iva.origen, estimacionesCobradas: ests };
}

/** Lo mismo, para varias obras a la vez (utilidad por obra, portal). */
export async function getIvaEstadoCuentaObras(
  obraIds: readonly string[],
): Promise<Map<string, IvaEstadoCuenta & { origen: OrigenIva }>> {
  const [tasas, ests] = await Promise.all([getIvaObras(obraIds), estimacionesCobradas(obraIds)]);
  const out = new Map<string, IvaEstadoCuenta & { origen: OrigenIva }>();
  for (const id of obraIds) {
    const t = tasas.get(id) ?? SIN_IVA;
    out.set(id, {
      tasaPct: t.tasaPct,
      origen: t.origen,
      estimacionesCobradas: ests.filter((e) => e.obraId === id),
    });
  }
  return out;
}
