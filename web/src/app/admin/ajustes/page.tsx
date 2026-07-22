import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { getEmpresaUsuario, getNombreEmpresa } from '@/lib/data/empresa';
import { getEmpresaConfig } from '@/lib/data/empresa-config';
import { nombreUsuario } from '@/lib/data/usuario';
import { seccionesDe } from '@/lib/auth/secciones';
import { PageHeader } from '@/components/ui';
import { GrupoAjustes } from '@/components/ajustes/grupo-ajustes';
import { IndiceAjustes } from '@/components/ajustes/indice-ajustes';
import { SeccionNombre } from '@/components/ajustes/seccion-nombre';
import { SeccionCorreo } from '@/components/ajustes/seccion-correo';
import { SeccionContrasena } from '@/components/ajustes/seccion-contrasena';
import { SeccionPreferencias } from '@/components/ajustes/seccion-preferencias';
import { SeccionOperacion } from '@/components/ajustes/seccion-operacion';
import { SeccionPdf } from '@/components/ajustes/seccion-pdf';
import { SeccionEmpresa } from '@/components/ajustes/seccion-empresa';
import { SeccionUsuarios } from '@/components/ajustes/seccion-usuarios';
import { listUsuariosEmpresa } from '@/lib/data/usuarios-empresa';

export const dynamic = 'force-dynamic';

export const metadata = { title: 'Ajustes' };

const NOMBRE_ROL: Record<string, string> = {
  admin: 'Administrador',
  supervisor: 'Supervisor',
  contador: 'Contador',
  colaborador: 'Colaborador',
  cliente: 'Cliente',
};

/**
 * Ajustes del panel de oficina.
 *
 * ORGANIZACIÓN. Los ajustes se agrupan de lo más personal a lo más compartido:
 * primero tu cuenta, luego tu seguridad, luego tus gustos en este dispositivo, y
 * al final lo que afecta a toda la empresa y a sus clientes. Ese orden es el que
 * hace visible el modelo de círculos concéntricos de `lib/auth/secciones.ts`, y
 * es también el orden de riesgo: lo que puede afectar a otros queda abajo, no
 * mezclado con el cambio inocuo de tu nombre.
 *
 * Cada grupo declara a QUIÉN AFECTA. Sin esa etiqueta, "Nombre" y "Nombre de la
 * empresa" se ven idénticos aunque uno solo te afecte a ti y el otro lo vean
 * todos tus clientes.
 *
 * Qué grupos se arman lo decide `seccionesDe(rol)`. Repito lo de siempre: eso es
 * PRESENTACIÓN. Lo que se puede escribir lo deciden las policies de Supabase.
 */
export default async function AjustesPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  // El layout de /admin ya garantizó membresía de staff; si aun así falla (RLS,
  // red), es mejor mandar al inicio que reventar la pantalla.
  let rol: string;
  try {
    ({ rol } = await getEmpresaUsuario());
  } catch {
    redirect('/admin');
  }

  const secciones = seccionesDe(rol);
  const { ivaPorcentaje, pdf } = await getEmpresaConfig();
  const nombreEmpresa = await getNombreEmpresa();

  const verOperacion = secciones.includes('operacion');
  const verEmpresa = secciones.includes('empresa');
  const verUsuarios = secciones.includes('usuarios');

  // Solo se consulta si se va a mostrar: la RPC exige rol admin y lanzaría para
  // cualquier otro rol.
  const usuarios = verUsuarios ? (await listUsuariosEmpresa()).data : [];

  // El índice se arma con los grupos que este rol realmente ve, para que no
  // ofrezca saltar a una sección inexistente.
  const grupos = [
    { id: 'cuenta', titulo: 'Mi cuenta' },
    { id: 'seguridad', titulo: 'Seguridad' },
    { id: 'preferencias', titulo: 'Preferencias' },
    ...(verOperacion ? [{ id: 'operacion', titulo: 'Operación' }] : []),
    ...(verEmpresa ? [{ id: 'empresa', titulo: 'Empresa' }] : []),
    ...(verUsuarios ? [{ id: 'usuarios', titulo: 'Usuarios' }] : []),
  ];

  return (
    <div className="space-y-8">
      <PageHeader
        eyebrow={`Entraste como ${NOMBRE_ROL[rol] ?? rol}`}
        title="Ajustes"
        description="Tu cuenta, tus preferencias y la configuración de la empresa."
      />

      <div className="grid gap-8 lg:grid-cols-[180px_minmax(0,1fr)]">
        <IndiceAjustes grupos={grupos} />

        {/* Columna única y acotada: los formularios se leen mejor en una sola
            corrida vertical que repartidos en dos columnas, donde el ojo no sabe
            si seguir hacia abajo o hacia el lado. `max-w-2xl` mantiene la línea
            de texto en un largo cómodo. */}
        <div className="max-w-2xl space-y-10">
          <GrupoAjustes
            id="cuenta"
            titulo="Mi cuenta"
            alcance="Solo a ti"
            descripcion="Cómo te identifica el sistema. Te acompaña aunque cambies de empresa."
          >
            <SeccionNombre nombreActual={nombreUsuario(user)} />
            <SeccionCorreo correoActual={user.email ?? '—'} destino="/admin/ajustes" />
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
            descripcion="No viajan con tu cuenta: si entras desde otra computadora o celular, cada uno mantiene las suyas."
          >
            <SeccionPreferencias />
          </GrupoAjustes>

          {verOperacion && (
            <GrupoAjustes
              id="operacion"
              titulo="Operación"
              alcance="A toda la empresa"
              descripcion="Valores con los que arrancan las cotizaciones nuevas. No modifican las ya creadas."
            >
              <SeccionOperacion ivaActual={ivaPorcentaje} />
              <SeccionPdf configActual={pdf} />
            </GrupoAjustes>
          )}

          {verEmpresa && (
            <GrupoAjustes
              id="empresa"
              titulo="Empresa"
              alcance="Lo ven tus clientes"
              descripcion="Datos de la constructora que aparecen en la aplicación y en el portal del cliente."
            >
              <SeccionEmpresa nombreActual={nombreEmpresa ?? 'ConstructorPro'} />
            </GrupoAjustes>
          )}

          {verUsuarios && (
            <GrupoAjustes
              id="usuarios"
              titulo="Usuarios"
              alcance="Da o quita accesos"
              descripcion="Quién puede entrar a ConstructorPro y con qué permisos. Es lo más delicado de esta pantalla, y por eso va al final."
            >
              <SeccionUsuarios
                total={usuarios.length}
                admins={usuarios.filter((u) => u.rol === 'admin').length}
              />
            </GrupoAjustes>
          )}
        </div>
      </div>
    </div>
  );
}
