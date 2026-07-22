import { Card, CardHeader, CardTitle, LinkButton } from '@/components/ui';

/**
 * Tarjeta de entrada a Usuarios y roles.
 *
 * La pantalla real vive en `/admin/usuarios` y no aquí: una tabla con acciones
 * por fila no encaja en el ritmo de "una tarjeta, un campo, Guardar" del resto
 * de Ajustes. Lo que sí vive aquí es el ACCESO, para que `secciones.ts` siga
 * siendo el único lugar que decide qué ve cada rol.
 *
 * El resumen de cuánta gente hay no es adorno: es la comprobación de un vistazo
 * de que nadie tiene acceso de más, que es justo lo que uno viene a mirar.
 */
export function SeccionUsuarios({
  total,
  admins,
}: {
  total: number;
  admins: number;
}) {
  return (
    <Card>
      <CardHeader>
        <div>
          <CardTitle as="h3">Usuarios y roles</CardTitle>
          <p className="mt-1 text-sm text-neutral-600">
            {total === 1
              ? 'Solo tú tienes acceso a esta empresa.'
              : `${total} personas con acceso · ${admins} ${
                  admins === 1 ? 'administrador' : 'administradores'
                }.`}
          </p>
        </div>
      </CardHeader>

      <LinkButton href="/admin/usuarios" variant="secondary">
        Administrar usuarios
      </LinkButton>
    </Card>
  );
}
