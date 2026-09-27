import { NextResponse, type NextRequest } from 'next/server';
import { bloquearSiApagado } from '@/lib/data/modulos';
import { getAccesoFiscal, urlArchivoFiscal } from '@/lib/data/fiscal';

export const dynamic = 'force-dynamic';

/**
 * Abre un archivo del bucket privado `fiscal` (constancia, XML o PDF de una
 * factura) con una URL firmada de 10 minutos.
 *
 * La URL se firma con la sesión del usuario: la policy del bucket (0037) es la
 * barrera real. Aquí además se exige que la ruta sea de SU empresa, para no
 * firmar nada que no le toque aunque la policy cambiara.
 */
export async function GET(request: NextRequest) {
  const apagado = await bloquearSiApagado('fiscal');
  if (apagado) return apagado;
  const acceso = await getAccesoFiscal();
  if (!acceso.puede || !acceso.empresaId) {
    return NextResponse.json({ error: 'Solo el administrador o el contador.' }, { status: 403 });
  }
  const ruta = request.nextUrl.searchParams.get('ruta') ?? '';
  if (!ruta.startsWith(`${acceso.empresaId}/`) || ruta.includes('..')) {
    return NextResponse.json({ error: 'Archivo no válido.' }, { status: 400 });
  }
  const url = await urlArchivoFiscal(ruta);
  if (!url) return NextResponse.json({ error: 'No encontramos el archivo.' }, { status: 404 });
  return NextResponse.redirect(url);
}
