import { notFound } from 'next/navigation';
import { getObra, listMovimientosByObra } from '@/lib/data/obras';
import { listPresupuestoObra } from '@/lib/data/presupuesto-obra';
import { getNotaCaja } from '@/lib/data/caja-nota';
import { getNombreEmpresa } from '@/lib/data/empresa';
import { getEmpresaConfig } from '@/lib/data/empresa-config';
import { construirCajaDocumentoHtml } from '@/lib/obra/documento-caja-html';
import { DocumentShell } from '@/components/pdf/document-shell';
import { DocumentActions } from '@/components/pdf/document-actions';
import { PreviewFrame } from '@/components/pdf/preview-frame';

export const dynamic = 'force-dynamic';

interface Props {
  params: Promise<{ id: string }>;
}

export default async function CajaPdfPage({ params }: Props) {
  const { id } = await params;

  const [
    { data: obra, error },
    { data: partidas },
    { data: movimientos },
    notaCaja,
    nombreEmpresa,
    { pdf },
  ] = await Promise.all([
    getObra(id),
    listPresupuestoObra(id),
    listMovimientosByObra(id),
    getNotaCaja(id),
    getNombreEmpresa(),
    getEmpresaConfig(),
  ]);

  if (error) {
    return <div className="p-8 text-sm text-red-700">No se pudo cargar la obra: {error}</div>;
  }
  if (!obra) notFound();

  const html = construirCajaDocumentoHtml({
    obra,
    partidas,
    movimientos,
    notaCaja,
    nombreEmpresa: nombreEmpresa ?? 'ConstructorPro',
    pdf,
  });

  return (
    <DocumentShell>
      <DocumentActions
        volverHref={`/admin/obras/${obra.id}`}
        descargarHref={`/admin/obras/${obra.id}/pdf/descargar`}
        // Documento del CLIENTE (solo pagos), para enviarlo a clientes no
        // registrados. Distinto del PDF de caja interno de arriba (con salidas).
        estadoCuentaClienteHref={`/admin/obras/${obra.id}/estado-cuenta-cliente/descargar`}
      />
      <PreviewFrame html={html} />
    </DocumentShell>
  );
}
