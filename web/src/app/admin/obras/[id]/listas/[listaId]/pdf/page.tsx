import { notFound } from 'next/navigation';
import { getObra } from '@/lib/data/obras';
import { getListaMaterial } from '@/lib/data/listas';
import { getNombreEmpresa } from '@/lib/data/empresa';
import { getEmpresaConfig } from '@/lib/data/empresa-config';
import { construirListaHtml } from '@/lib/listas/documento-lista-html';
import { DocumentShell } from '@/components/pdf/document-shell';
import { DocumentActions } from '@/components/pdf/document-actions';
import { PreviewFrame } from '@/components/pdf/preview-frame';

export const dynamic = 'force-dynamic';

/** Vista previa del PDF de una lista de material (`?marcas=0` = en blanco). */
export default async function ListaPdfPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string; listaId: string }>;
  searchParams: Promise<{ marcas?: string }>;
}) {
  const [{ id, listaId }, { marcas }] = await Promise.all([params, searchParams]);
  const conMarcas = marcas !== '0';

  const [{ data: obra, error }, { data: lista }, nombreEmpresa, { pdf }] = await Promise.all([
    getObra(id),
    getListaMaterial(listaId),
    getNombreEmpresa(),
    getEmpresaConfig(),
  ]);

  if (error) {
    return <div className="p-8 text-sm text-red-700">No se pudo cargar la obra: {error}</div>;
  }
  if (!obra || !lista || lista.obra_id !== id) notFound();

  const html = construirListaHtml({
    obraNombre: obra.nombre,
    lista,
    nombreEmpresa: nombreEmpresa ?? 'ConstructorPro',
    pdf,
    conMarcas,
  });

  return (
    <DocumentShell>
      <DocumentActions
        volverHref={`/admin/obras/${id}/listas/${listaId}`}
        descargarHref={`/admin/obras/${id}/listas/${listaId}/pdf/descargar${conMarcas ? '' : '?marcas=0'}`}
      />
      <PreviewFrame html={html} />
    </DocumentShell>
  );
}
