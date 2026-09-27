import { notFound } from 'next/navigation';
import { getObra } from '@/lib/data/obras';
import { getOrden, listProveedores } from '@/lib/data/compras';
import { getNombreEmpresa } from '@/lib/data/empresa';
import { getEmpresaConfig } from '@/lib/data/empresa-config';
import { construirOrdenCompraHtml } from '@/lib/compras/documento-orden-compra-html';
import { DocumentShell } from '@/components/pdf/document-shell';
import { DocumentActions } from '@/components/pdf/document-actions';
import { PreviewFrame } from '@/components/pdf/preview-frame';

export const dynamic = 'force-dynamic';

export default async function OrdenPdfPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const orden = await getOrden(id);
  if (!orden) notFound();
  const [{ data: obra }, proveedores, nombreEmpresa, { pdf }] = await Promise.all([
    getObra(orden.obra_id),
    listProveedores(),
    getNombreEmpresa(),
    getEmpresaConfig(),
  ]);

  const html = construirOrdenCompraHtml({
    orden,
    proveedor: proveedores.data.find((p) => p.id === orden.proveedor_id) ?? null,
    obra: { nombre: obra?.nombre ?? 'Obra', ubicacion: obra?.ubicacion ?? null },
    nombreEmpresa: nombreEmpresa ?? 'ConstructorPro',
    pdf,
  });

  return (
    <DocumentShell>
      <DocumentActions
        volverHref={`/admin/compras/ordenes/${id}`}
        descargarHref={`/admin/compras/ordenes/${id}/pdf/descargar`}
      />
      <PreviewFrame html={html} />
    </DocumentShell>
  );
}
