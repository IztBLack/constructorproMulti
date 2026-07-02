import { listObras } from '@/lib/data/obras';
import { PageHeader } from '@/components/ui';
import NuevaObraForm from './nueva-obra-form';
import BuscadorObras from './buscador-obras';

export const dynamic = 'force-dynamic';

export default async function ObrasPage() {
  const { data: obras, error } = await listObras();

  return (
    <div className="space-y-6">
      <PageHeader
        title="Obras"
        description="Gestiona las obras activas e inactivas de tu empresa."
        actions={<NuevaObraForm />}
      />

      {error && (
        <p className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
          No se pudieron cargar las obras: {error}
        </p>
      )}

      {!error && <BuscadorObras obras={obras} />}
    </div>
  );
}
