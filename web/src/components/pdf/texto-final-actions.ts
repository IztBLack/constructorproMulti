'use server';

import { revalidatePath } from 'next/cache';
import { guardarTextoFinalDocumento } from '@/lib/data/texto-final';
import { TIPOS_DOCUMENTO, type TipoDocumento } from '@/lib/pdf/textos-finales';

export interface ResultadoTextoFinal {
  ok: boolean;
  error?: string;
}

/**
 * Guarda el párrafo final de UN documento. Una sola acción para los tres tipos:
 * la tarjeta que la llama también es una sola.
 *
 * `texto = null` restaura el texto general.
 */
export async function guardarTextoFinalAction(
  tipo: TipoDocumento,
  id: string,
  texto: string | null,
): Promise<ResultadoTextoFinal> {
  // `tipo` llega del cliente, así que no se usa para indexar nada sin validar:
  // es la llave con la que el módulo de datos elige TABLA.
  if (!TIPOS_DOCUMENTO.includes(tipo)) {
    return { ok: false, error: 'Tipo de documento desconocido.' };
  }

  const resultado = await guardarTextoFinalDocumento(tipo, id, texto);
  if (!resultado.ok) return resultado;

  // La vista del documento y su PDF leen el texto al pintarse.
  switch (tipo) {
    case 'cotizacion':
      revalidatePath(`/admin/cotizaciones/${id}`);
      revalidatePath(`/admin/cotizaciones/${id}/pdf`);
      break;
    case 'estado_cuenta':
      revalidatePath(`/admin/obras/${id}`);
      break;
    case 'nota':
      // La nota no conoce el id de su obra desde aquí, y la ruta lo lleva
      // adentro. Revalidar la rama completa es barato y no falla nunca.
      revalidatePath('/admin/obras', 'layout');
      break;
  }

  return { ok: true };
}
