import { notFound } from 'next/navigation';
import { getObra } from '@/lib/data/obras';
import {
  calcularNomina,
  listAsistenciasObraRango,
  listColaboradoresActivosObra,
  listDestajosObraRango,
  listPuestosLite,
  semanaDe,
} from '@/lib/data/nomina';
import { getEmpresaUsuario, getNombreEmpresa } from '@/lib/data/empresa';
import { puedeVerSueldos } from '@/lib/auth/sueldos';
import { getEmpresaConfig } from '@/lib/data/empresa-config';
import { construirNominaDocumentoHtml } from '@/lib/obra/documento-nomina-html';
import { DocumentShell } from '@/components/pdf/document-shell';
import { DocumentActions } from '@/components/pdf/document-actions';
import { PreviewFrame } from '@/components/pdf/preview-frame';

export const dynamic = 'force-dynamic';

interface Props {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ inicio?: string }>;
}

export default async function NominaPdfPage({ params, searchParams }: Props) {
  const { id } = await params;
  const { inicio } = await searchParams;

  // La vista previa del PDF enseña lo mismo que el PDF: la raya completa.
  const { rol } = await getEmpresaUsuario();
  if (!puedeVerSueldos(rol)) notFound();

  const { data: obra, error } = await getObra(id);
  if (error) {
    return <div className="p-8 text-sm text-red-700">No se pudo cargar la obra: {error}</div>;
  }
  if (!obra) notFound();

  const ancla = inicio ? new Date(Number(inicio)) : new Date();
  const { inicioMs, finMs } = semanaDe(ancla);

  const [
    { data: colaboradores },
    { data: asistencias },
    { data: destajos },
    { data: puestos },
    nombreEmpresa,
    { pdf },
  ] = await Promise.all([
    listColaboradoresActivosObra(id, inicioMs),
    listAsistenciasObraRango(id, inicioMs, finMs),
    listDestajosObraRango(id, inicioMs, finMs),
    listPuestosLite(),
    getNombreEmpresa(),
    getEmpresaConfig(),
  ]);

  const summary = calcularNomina({ colaboradores, asistencias, destajos, puestos });
  const html = construirNominaDocumentoHtml({
    obra,
    summary,
    inicioMs,
    finMs,
    nombreEmpresa: nombreEmpresa ?? 'ConstructorPro',
    pdf,
  });

  return (
    <DocumentShell>
      <DocumentActions
        volverHref={`/admin/obras/${obra.id}/nomina?inicio=${inicioMs}`}
        descargarHref={`/admin/obras/${obra.id}/nomina/pdf/descargar?inicio=${inicioMs}`}
      />
      <PreviewFrame html={html} />
    </DocumentShell>
  );
}
