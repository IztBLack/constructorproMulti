import { createClient } from '@/lib/supabase/server';
import { recortar, type TipoDocumento } from '@/lib/pdf/textos-finales';

/**
 * Guarda el párrafo final PROPIO de un documento (columna `texto_final`, 0032).
 *
 * Un solo módulo para los tres tipos porque la operación es idéntica y lo único
 * que cambia es la tabla. Cada tabla trae sus propias policies —quién puede
 * editar una cotización ya está resuelto ahí— así que aquí no se repite ninguna
 * comprobación de rol: si el usuario no puede, la base lo rechaza.
 */

/** Dónde vive el texto de cada tipo de documento. */
const TABLA: Record<TipoDocumento, string> = {
  cotizacion: 'cotizaciones',
  // El estado de cuenta se emite POR OBRA: no hay una fila "estado de cuenta"
  // que pueda llevar el suyo.
  estado_cuenta: 'obras',
  nota: 'nota_obra',
};

export interface ResultadoTexto {
  ok: boolean;
  error?: string;
}

/**
 * `null` borra el texto propio y devuelve el documento al texto general. Es
 * distinto de guardar cadena vacía, y por eso el parámetro admite las dos
 * cosas: la interfaz solo produce `null` (botón "Restaurar"), pero la columna
 * deja la puerta abierta a un documento sin párrafo.
 */
export async function guardarTextoFinalDocumento(
  tipo: TipoDocumento,
  id: string,
  texto: string | null,
): Promise<ResultadoTexto> {
  const supabase = await createClient();

  const valor = texto === null ? null : recortar(texto) || null;

  const { error } = await supabase
    .from(TABLA[tipo])
    .update({ texto_final: valor, updated_at: Date.now() })
    .eq('id', id);

  if (error) return { ok: false, error: error.message };
  return { ok: true };
}
