import { redirect } from 'next/navigation';
import { headers } from 'next/headers';
import { createClient } from '@/lib/supabase/server';
import { getEmpresaUsuario } from '@/lib/data/empresa';
import { listUsuariosEmpresa } from '@/lib/data/usuarios-empresa';
import { BackLink, EmptyState, PageHeader } from '@/components/ui';
import { TablaUsuarios } from './tabla-usuarios';
import { InvitarUsuario } from './invitar-usuario';

export const dynamic = 'force-dynamic';

export const metadata = { title: 'Usuarios y roles' };

/**
 * Quién tiene acceso a la empresa. Solo admin.
 *
 * Vive fuera de /admin/ajustes —aunque se entre desde ahí— porque una tabla con
 * acciones por fila no encaja en el ritmo de "una tarjeta, un campo, un botón
 * Guardar" de esa pantalla. `secciones.ts` sigue siendo la única fuente de
 * verdad de quién ve qué; aquí solo se respeta.
 *
 * El `redirect` de abajo no es la barrera de seguridad: es cortesía para que
 * quien llegue por error vea algo sensato. La barrera son las RPCs de la
 * migración 0018, que validan el rol por dentro y corren aunque nadie pase por
 * esta página.
 */
export default async function UsuariosPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  let rol: string;
  try {
    ({ rol } = await getEmpresaUsuario());
  } catch {
    redirect('/admin');
  }
  if (rol !== 'admin') redirect('/admin');

  const { data: usuarios, error } = await listUsuariosEmpresa();

  // La URL real de este despliegue, para poder dictársela a quien se invita.
  const h = await headers();
  const host = h.get('x-forwarded-host') ?? h.get('host') ?? 'localhost:3000';

  return (
    <div className="space-y-6">
      <BackLink href="/admin/ajustes">Ajustes</BackLink>

      <PageHeader
        title="Usuarios y roles"
        description="Quién puede entrar a Cimnova y con qué permisos."
        actions={<InvitarUsuario urlBase={host} />}
      />

      {error ? (
        <p
          role="alert"
          className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700"
        >
          No se pudo cargar la lista: {error}
        </p>
      ) : usuarios.length === 0 ? (
        <EmptyState
          title="Todavía no hay nadie más"
          description="Invita a tu equipo para que capture asistencia y lleve las obras contigo."
        />
      ) : (
        <TablaUsuarios usuarios={usuarios} miUserId={user.id} />
      )}
    </div>
  );
}
