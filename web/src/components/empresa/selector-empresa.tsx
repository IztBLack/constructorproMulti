import { listEmpresasDelUsuario, getEmpresaActiva } from '@/lib/sesion';
import { cambiarEmpresa } from './acciones';

/// Conmutador de empresa para la cabecera de /admin.
///
/// **No se pinta si el usuario sólo tiene una empresa**, que es el caso de
/// todos los usuarios de hoy. Así, el día que esto se despliegue, la interfaz
/// que ve la gente es exactamente la misma que antes: la función nueva sólo
/// aparece cuando existe algo entre lo que elegir.
///
/// Es un `<form>` con un `<select>` que se envía, y no un menú de cliente, por
/// una razón concreta: cambiar de empresa tiene que invalidar TODO lo que ya
/// está renderizado en el servidor. Una navegación completa lo garantiza; un
/// estado de cliente dejaría medias pantallas con datos de la empresa anterior.
export async function SelectorEmpresa() {
  const [empresas, activa] = await Promise.all([
    listEmpresasDelUsuario(),
    getEmpresaActiva(),
  ]);

  if (empresas.length < 2 || !activa) return null;

  return (
    <form action={cambiarEmpresa} className="shrink-0">
      <label className="sr-only" htmlFor="empresa-activa">
        Empresa
      </label>
      <select
        id="empresa-activa"
        name="empresaId"
        defaultValue={activa.empresaId}
        // Sin JavaScript esto sigue funcionando con el botón de abajo; con
        // JavaScript, cambiar la selección envía el formulario y evita el paso
        // extra. Es progresivo, no dependiente.
        className="max-w-[18ch] truncate rounded-lg border border-neutral-300 bg-white px-2 py-1.5 text-sm text-neutral-700 hover:bg-neutral-100 cursor-pointer"
      >
        {empresas.map((e) => (
          <option key={e.empresaId} value={e.empresaId}>
            {e.nombre || 'Empresa sin nombre'}
          </option>
        ))}
      </select>
      <button
        type="submit"
        className="ml-1 rounded-lg border border-neutral-300 px-2 py-1.5 text-sm font-medium text-neutral-700 hover:bg-neutral-100 cursor-pointer"
      >
        Cambiar
      </button>
    </form>
  );
}
