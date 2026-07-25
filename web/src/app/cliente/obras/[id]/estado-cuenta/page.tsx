import { notFound } from 'next/navigation';
import { getObraCliente, getEstadoCuentaObra } from '@/lib/data/portal-cliente';
import { getNombreEmpresa } from '@/lib/data/empresa';
import { getEmpresaConfig } from '@/lib/data/empresa-config';
import { hoyMxMs } from '@/lib/data/tz';
import { construirEstadoCuentaClienteHtml } from '@/lib/cliente/documento-estado-cuenta-html';
import { DocumentShell } from '@/components/pdf/document-shell';
import { DocumentActions } from '@/components/pdf/document-actions';
import { PreviewFrame } from '@/components/pdf/preview-frame';

export const dynamic = 'force-dynamic';

interface Props {
  params: Promise<{ id: string }>;
}

export default async function EstadoCuentaPage({ params }: Props) {
  const { id } = await params;

  const obra = await getObraCliente(id);
  if (!obra) notFound();

  const [estado, nombreEmpresa, { pdf }] = await Promise.all([
    getEstadoCuentaObra(obra.id),
    getNombreEmpresa(),
    getEmpresaConfig(),
  ]);

  const html = construirEstadoCuentaClienteHtml({
    obra,
    estado,
    nombreEmpresa: nombreEmpresa ?? 'ConstructorPro',
    pdf,
    hoy: hoyMxMs(),
  });

  return (
    <DocumentShell>
      <DocumentActions
        volverHref={`/cliente/obras/${obra.id}`}
        descargarHref={`/cliente/obras/${obra.id}/estado-cuenta/descargar`}
      />
      <PreviewFrame html={html} />
    </DocumentShell>
  );
}
