import { notFound } from 'next/navigation';
import { getSubcontrato } from '@/lib/data/subcontratos';
import { getObra } from '@/lib/data/obras';
import { getNombreEmpresa } from '@/lib/data/empresa';
import { getEmpresaConfig } from '@/lib/data/empresa-config';
import { construirSubcontratoHtml } from '@/lib/subcontratos/documento-subcontrato-html';
import { DocumentShell } from '@/components/pdf/document-shell';
import { DocumentActions } from '@/components/pdf/document-actions';
import { PreviewFrame } from '@/components/pdf/preview-frame';

export const dynamic = 'force-dynamic';

export default async function SubcontratoPdfPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [{ data: contrato, error }, nombreEmpresa, { pdf }] = await Promise.all([
    getSubcontrato(id),
    getNombreEmpresa(),
    getEmpresaConfig(),
  ]);
  if (error) return <div className="p-8 text-sm text-red-700">No se pudo cargar el contrato.</div>;
  if (!contrato) notFound();
  const { data: obra } = await getObra(contrato.obra_id);

  const html = construirSubcontratoHtml({ contrato, obra, nombreEmpresa: nombreEmpresa ?? 'ConstructorPro', pdf });

  return (
    <DocumentShell>
      <DocumentActions volverHref={`/admin/subcontratos/${id}`} descargarHref={`/admin/subcontratos/${id}/pdf/descargar`} />
      <PreviewFrame html={html} />
    </DocumentShell>
  );
}
