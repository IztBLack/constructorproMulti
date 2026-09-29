import { notFound } from 'next/navigation';
import { getObra } from '@/lib/data/obras';
import { getVistaEstimacion } from '@/lib/data/estimaciones';
import { getNombreEmpresa } from '@/lib/data/empresa';
import { getEmpresaConfig } from '@/lib/data/empresa-config';
import { construirEstimacionHtml } from '@/lib/estimaciones/documento-estimacion-html';
import { DocumentShell } from '@/components/pdf/document-shell';
import { DocumentActions } from '@/components/pdf/document-actions';
import { PreviewFrame } from '@/components/pdf/preview-frame';

export const dynamic = 'force-dynamic';

/** Vista previa del PDF de la estimación (con números generadores). */
export default async function EstimacionPdfPage({
  params,
}: {
  params: Promise<{ id: string; estId: string }>;
}) {
  const { id, estId } = await params;
  const { data: obra, error } = await getObra(id);
  if (error) {
    return <div className="p-8 text-sm text-red-700">No se pudo cargar la obra: {error}</div>;
  }
  if (!obra) notFound();

  const [{ data: vista }, nombreEmpresa, { pdf }] = await Promise.all([
    getVistaEstimacion(id, estId, obra.nombre),
    getNombreEmpresa(),
    getEmpresaConfig(),
  ]);
  if (!vista) notFound();

  const html = construirEstimacionHtml({
    obra,
    estimacion: vista.estimacion,
    foto: vista.foto,
    nombreEmpresa: nombreEmpresa ?? 'ConstructorPro',
    pdf,
  });

  return (
    <DocumentShell>
      <DocumentActions
        volverHref={`/admin/obras/${id}/estimaciones/${estId}`}
        descargarHref={`/admin/obras/${id}/estimaciones/${estId}/pdf/descargar`}
      />
      <PreviewFrame html={html} />
    </DocumentShell>
  );
}
