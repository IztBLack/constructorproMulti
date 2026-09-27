import { notFound } from 'next/navigation';
import { getObra } from '@/lib/data/obras';
import { getExtra, urlFotoExtra } from '@/lib/data/cambios';
import { getNombreEmpresa } from '@/lib/data/empresa';
import { getEmpresaConfig } from '@/lib/data/empresa-config';
import { construirExtraHtml } from '@/lib/cambios/documento-extra-html';
import { DocumentShell } from '@/components/pdf/document-shell';
import { DocumentActions } from '@/components/pdf/document-actions';
import { PreviewFrame } from '@/components/pdf/preview-frame';

export const dynamic = 'force-dynamic';

export default async function ExtraPdfPage({
  params,
}: {
  params: Promise<{ id: string; extraId: string }>;
}) {
  const { id, extraId } = await params;

  const [{ data: obra, error }, { data: extra }, nombreEmpresa, { pdf }] = await Promise.all([
    getObra(id),
    getExtra(extraId),
    getNombreEmpresa(),
    getEmpresaConfig(),
  ]);

  if (error) {
    return <div className="p-8 text-sm text-red-700">No se pudo cargar la obra: {error}</div>;
  }
  if (!obra || !extra || extra.obra_id !== id) notFound();

  const html = construirExtraHtml({
    obra,
    extra,
    nombreEmpresa: nombreEmpresa ?? 'ConstructorPro',
    pdf,
    fotoUrl: await urlFotoExtra(extra.foto_uri),
  });

  return (
    <DocumentShell>
      <DocumentActions
        volverHref={`/admin/obras/${id}/extras/${extraId}`}
        descargarHref={`/admin/obras/${id}/extras/${extraId}/pdf/descargar`}
      />
      <PreviewFrame html={html} />
    </DocumentShell>
  );
}
