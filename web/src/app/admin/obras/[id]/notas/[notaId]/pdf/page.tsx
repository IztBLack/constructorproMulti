import { notFound } from 'next/navigation';
import { getObra } from '@/lib/data/obras';
import { getNotaObra } from '@/lib/data/notas-obra';
import { getNombreEmpresa } from '@/lib/data/empresa';
import { getEmpresaConfig } from '@/lib/data/empresa-config';
import { construirNotaObraHtml } from '@/lib/obra/documento-nota-html';
import { DocumentShell } from '@/components/pdf/document-shell';
import { DocumentActions } from '@/components/pdf/document-actions';
import { PreviewFrame } from '@/components/pdf/preview-frame';

export const dynamic = 'force-dynamic';

export default async function NotaPdfPage({
  params,
}: {
  params: Promise<{ id: string; notaId: string }>;
}) {
  const { id, notaId } = await params;

  const [{ data: obra, error }, { data: nota }, nombreEmpresa, { pdf }] = await Promise.all([
    getObra(id),
    getNotaObra(notaId),
    getNombreEmpresa(),
    getEmpresaConfig(),
  ]);

  if (error) {
    return <div className="p-8 text-sm text-red-700">No se pudo cargar la obra: {error}</div>;
  }
  if (!obra || !nota || nota.obra_id !== id) notFound();

  const html = construirNotaObraHtml({
    obra,
    nota,
    nombreEmpresa: nombreEmpresa ?? 'ConstructorPro',
    pdf,
  });

  return (
    <DocumentShell>
      <DocumentActions
        volverHref={`/admin/obras/${id}/notas/${notaId}`}
        descargarHref={`/admin/obras/${id}/notas/${notaId}/pdf/descargar`}
      />
      <PreviewFrame html={html} />
    </DocumentShell>
  );
}
