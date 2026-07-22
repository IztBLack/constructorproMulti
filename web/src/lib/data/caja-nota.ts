import { createClient } from '@/lib/supabase/server';
import { getEmpresaUsuario } from './empresa';

/**
 * Nota de conciliación de caja de una obra (tabla `obra_caja_nota`, migración
 * 0023). Es el texto libre que la contadora pone al pie de su hoja, como
 * "diferencia a favor con tal proveedor".
 *
 * No lanza si no hay nota: devuelve cadena vacía. La mayoría de las obras no
 * tendrán una, y eso no es un error.
 */
export async function getNotaCaja(obraId: string): Promise<string> {
  const supabase = await createClient();
  const { data } = await supabase
    .from('obra_caja_nota')
    .select('nota')
    .eq('obra_id', obraId)
    .maybeSingle();

  return (data?.nota as string | undefined) ?? '';
}

export interface ResultadoNota {
  ok: boolean;
  error?: string;
}

/**
 * Guarda (crea o actualiza) la nota de caja. La policy de 0023 solo deja
 * escribir a admin/supervisor/contador; si un colaborador llega aquí, la base
 * lo rechaza aunque este código lo dejara pasar.
 */
export async function guardarNotaCaja(obraId: string, nota: string): Promise<ResultadoNota> {
  let empresaId: string;
  try {
    ({ empresaId } = await getEmpresaUsuario());
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Error de autenticación.' };
  }

  const supabase = await createClient();
  // upsert: una fila por obra (obra_id es la llave primaria).
  const { error } = await supabase.from('obra_caja_nota').upsert(
    {
      obra_id: obraId,
      empresa_id: empresaId,
      nota: nota.trim().slice(0, 2000),
      updated_at: Date.now(),
    },
    { onConflict: 'obra_id' },
  );

  if (error) return { ok: false, error: error.message };
  return { ok: true };
}
