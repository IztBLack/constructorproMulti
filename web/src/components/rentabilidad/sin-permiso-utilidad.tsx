import { PageHeader } from '@/components/ui';

/**
 * Lo que ve quien llega a una pantalla de utilidad sin permiso (decisión D1:
 * solo admin y contador). No se calcula nada antes de mostrar esto.
 */
export function SinPermisoUtilidad() {
  return (
    <div className="space-y-4">
      <PageHeader
        title="Utilidad"
        description="La utilidad de las obras solo la ven el administrador y el contador."
      />
      <p className="rounded-lg bg-neutral-100 px-3 py-2 text-sm text-neutral-700">
        Si la necesitas, pídesela al administrador de tu empresa.
      </p>
    </div>
  );
}
