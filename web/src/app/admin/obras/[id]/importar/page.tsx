import { notFound } from 'next/navigation';
import { PageHeader } from '@/components/ui';
import { getObra } from '@/lib/data/obras';
import ImportarObraForm from './importar-obra-form';
import ObraTabs from '../_obra-tabs';

export const dynamic = 'force-dynamic';

export default async function ImportarMovimientosPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const { data: obra, error: obraError } = await getObra(id);

  if (obraError) {
    return (
      <p className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
        No se pudo cargar la obra: {obraError}
      </p>
    );
  }

  if (!obra) notFound();

  return (
    <div className="space-y-6">
      <ObraTabs obraId={id} />

      <PageHeader
        title="Importar movimientos"
        description="Sube un archivo .xlsx o .csv con el estado de cuenta para agregar movimientos nuevos a esta obra, sin duplicar los que ya existen."
      />

      <ImportarObraForm obraId={id} />
    </div>
  );
}
