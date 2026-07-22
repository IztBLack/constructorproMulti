import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { nombreUsuario } from '@/lib/data/usuario';
import { PageHeader } from '@/components/ui';
import { GrupoAjustes } from '@/components/ajustes/grupo-ajustes';
import { SeccionNombre } from '@/components/ajustes/seccion-nombre';
import { SeccionCorreo } from '@/components/ajustes/seccion-correo';
import { SeccionContrasena } from '@/components/ajustes/seccion-contrasena';
import { SeccionPreferencias } from '@/components/ajustes/seccion-preferencias';

export const dynamic = 'force-dynamic';

export const metadata = { title: 'Ajustes' };

/**
 * Ajustes del portal del cliente.
 *
 * Reusa EXACTAMENTE los mismos componentes y la misma organización que
 * `/admin/ajustes`: la cuenta es la cuenta, sin importar desde qué portal se
 * entre, y duplicar estos formularios sería garantizar que dentro de seis meses
 * uno valide la contraseña y el otro no.
 *
 * Al cliente le tocan cuenta, seguridad y preferencias; nada de empresa ni
 * operación. No hace falta filtrar por rol aquí porque el middleware ya saca de
 * `/cliente` a cualquiera que sea staff: quien llega es cliente por definición.
 *
 * Sin índice lateral a propósito: son tres grupos cortos, y un índice para eso
 * es andamiaje que estorba más de lo que orienta.
 */
export default async function AjustesClientePage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  return (
    <div className="space-y-8">
      <PageHeader title="Ajustes" description="Tu cuenta y tus preferencias." />

      <div className="max-w-2xl space-y-10">
        <GrupoAjustes
          id="cuenta"
          titulo="Mi cuenta"
          alcance="Solo a ti"
          descripcion="Cómo te identifica el sistema y con qué correo entras."
        >
          <SeccionNombre nombreActual={nombreUsuario(user)} />
          <SeccionCorreo correoActual={user.email ?? '—'} destino="/cliente/ajustes" />
        </GrupoAjustes>

        <GrupoAjustes
          id="seguridad"
          titulo="Seguridad"
          alcance="Solo a ti"
          descripcion="Va aparte del resto a propósito: es lo único aquí que protege el acceso a tu cuenta."
        >
          <SeccionContrasena />
        </GrupoAjustes>

        <GrupoAjustes
          id="preferencias"
          titulo="Preferencias"
          alcance="Solo este dispositivo"
          descripcion="No viajan con tu cuenta: si entras desde otro dispositivo, cada uno mantiene las suyas."
        >
          <SeccionPreferencias />
        </GrupoAjustes>
      </div>
    </div>
  );
}
