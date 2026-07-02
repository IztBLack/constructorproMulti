import { listObras } from '@/lib/data/obras';
import NuevaObraForm from './nueva-obra-form';
import BuscadorObras from './buscador-obras';

export const dynamic = 'force-dynamic';

export default async function ObrasPage() {
  const { data: obras, error } = await listObras();

  return (
    <div className="space-y-6">
      <header className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-neutral-900">Obras</h1>
          <p className="text-sm text-neutral-500">Gestiona las obras activas e inactivas de tu empresa.</p>
        </div>
        <NuevaObraForm />
      </header>

      {error && (
        <p className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
          No se pudieron cargar las obras: {error}
        </p>
      )}

      {!error && <BuscadorObras obras={obras} />}
    </div>
  );
}
