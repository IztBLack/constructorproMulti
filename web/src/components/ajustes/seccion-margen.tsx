import { Card, CardHeader, CardTitle } from '@/components/ui';
import { FormMargen } from '@/components/rentabilidad/form-margen';

/**
 * Margen objetivo de la empresa (módulo `rentabilidad`, RF1.7). Solo admin: la
 * sección Operación ya es solo suya (`lib/auth/secciones.ts`), y la acción y la
 * policy de `empresa_config` lo vuelven a exigir.
 *
 * Cada obra puede pisarlo desde su pestaña Utilidad.
 */
export function SeccionMargen({ margenActual }: { margenActual: number }) {
  return (
    <Card>
      <CardHeader>
        <div>
          <CardTitle as="h3">Margen objetivo</CardTitle>
          <p className="mt-1 text-sm text-neutral-600">
            Contra este número se pinta el semáforo de la utilidad de cada obra.
          </p>
        </div>
      </CardHeader>
      <div className="max-w-sm">
        <FormMargen actual={margenActual} />
      </div>
    </Card>
  );
}
