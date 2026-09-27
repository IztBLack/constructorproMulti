import { NextResponse, type NextRequest } from 'next/server';
import { bloquearSiApagado } from '@/lib/data/modulos';
import { getEmpresaUsuario } from '@/lib/data/empresa';
import { urlArchivoCompras } from '@/lib/data/compras';

export const dynamic = 'force-dynamic';

/**
 * Abre un archivo del bucket privado `compras` (foto de remisión, XML o PDF de
 * la factura del proveedor) con una URL firmada de 1 hora.
 *
 * La URL se firma con la sesión del usuario: la policy del bucket (0038) es la
 * barrera real (oficina de la empresa). Aquí además se exige que la ruta sea de
 * SU empresa y de una de las dos carpetas conocidas.
 */
export async function GET(request: NextRequest) {
  const apagado = await bloquearSiApagado('compras');
  if (apagado) return apagado;
  let empresaId: string;
  try {
    ({ empresaId } = await getEmpresaUsuario());
  } catch {
    return NextResponse.json({ error: 'No autenticado.' }, { status: 401 });
  }
  const ruta = request.nextUrl.searchParams.get('ruta') ?? '';
  const valida =
    (ruta.startsWith(`${empresaId}/remisiones/`) || ruta.startsWith(`${empresaId}/facturas/`)) &&
    !ruta.includes('..');
  if (!valida) return NextResponse.json({ error: 'Archivo no válido.' }, { status: 400 });
  const url = await urlArchivoCompras(ruta);
  if (!url) return NextResponse.json({ error: 'No encontramos el archivo.' }, { status: 404 });
  return NextResponse.redirect(url);
}
