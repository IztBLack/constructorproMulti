import { getObra } from '@/lib/data/obras';
import { getNombreEmpresa } from '@/lib/data/empresa';
import { getEmpresaConfig } from '@/lib/data/empresa-config';
import { listBitacoraObra } from '@/lib/data/bitacora';
import { periodoBitacora, type PeriodoBitacora } from '@/lib/bitacora/periodo';
import { construirBitacoraHtml } from '@/lib/obra/documento-bitacora-html';

export type ParamsPeriodo = {
  desde?: string | string[];
  hasta?: string | string[];
  cliente?: string | string[];
};

/**
 * Lo que comparten la vista previa y la descarga del PDF de bitácora: mismo
 * periodo, mismos datos, mismo HTML. Todo con la sesión del usuario (RLS).
 */
export async function htmlBitacoraPdf(
  obraId: string,
  sp: ParamsPeriodo,
): Promise<
  | { ok: true; html: string; periodo: PeriodoBitacora; paraCliente: boolean }
  | { ok: false; status: number; error: string }
> {
  const periodo = periodoBitacora(sp);
  const paraCliente = (Array.isArray(sp.cliente) ? sp.cliente[0] : sp.cliente) === '1';

  const [{ data: obra, error }, { data: entradas, error: errB }, nombreEmpresa, { pdf }] =
    await Promise.all([
      getObra(obraId),
      listBitacoraObra(obraId, { desde: periodo.desde, hasta: periodo.hasta }),
      getNombreEmpresa(),
      getEmpresaConfig(),
    ]);
  if (error || errB) return { ok: false, status: 500, error: `Error al cargar: ${error ?? errB}` };
  if (!obra) return { ok: false, status: 404, error: 'Obra no encontrada.' };

  const html = construirBitacoraHtml({
    obra,
    entradas,
    desde: periodo.desde,
    hasta: periodo.hasta,
    nombreEmpresa: nombreEmpresa ?? 'ConstructorPro',
    pdf,
    paraCliente,
  });
  return { ok: true, html, periodo, paraCliente };
}
