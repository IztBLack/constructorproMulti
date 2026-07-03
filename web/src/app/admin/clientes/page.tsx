import { PageHeader, EmptyState } from '@/components/ui';
import { listClientes } from '@/lib/data/clientes';
import NuevoClienteForm from './nuevo-cliente-form';
import TablaClientes from './tabla-clientes';

export const dynamic = 'force-dynamic';

export default async function ClientesPage() {
  const { data: clientes, error } = await listClientes();

  return (
    <div className="space-y-6">
      <PageHeader
        title="Clientes"
        description="Administra tus clientes y dales acceso al portal para que vean sus obras y cotizaciones."
        actions={<NuevoClienteForm />}
      />

      {error && (
        <p className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
          No se pudieron cargar los clientes: {error}
        </p>
      )}

      {!error && clientes.length === 0 ? (
        <EmptyState
          title="Aún no tienes clientes"
          description="Registra un cliente para asignarle obras y cotizaciones, y darle acceso al portal."
        />
      ) : (
        !error && <TablaClientes clientes={clientes} />
      )}
    </div>
  );
}
