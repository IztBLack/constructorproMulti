import Link from 'next/link';
import { GuardiaModulo } from '@/components/modulos/guardia-modulo';
import { getEmpresaUsuario } from '@/lib/data/empresa';
import { puedeCumplimiento } from '@/lib/data/cumplimiento';

/**
 * Cumplimiento: guardia del módulo + guardia de rol. Solo admin y contador
 * (RLS de 0040); a los demás se les explica en vez de enseñar tablas vacías.
 * La barra no conoce el rol (es de cliente), por eso la puerta está aquí.
 */
export default async function Layout({ children }: { children: React.ReactNode }) {
  const rol = await getEmpresaUsuario()
    .then((e) => e.rol)
    .catch(() => '');
  return (
    <GuardiaModulo clave="cumplimiento">
      {puedeCumplimiento(rol) ? (
        children
      ) : (
        <div className="mx-auto max-w-lg space-y-3 rounded-xl border border-neutral-200 bg-white p-6 text-center">
          <h1 className="text-lg font-semibold text-neutral-900">IMSS y papeles</h1>
          <p className="text-sm text-neutral-600">
            Esta sección la ven solo el administrador y el contador: trae datos del IMSS y del
            SAT de la empresa, de los subcontratistas y de los trabajadores.
          </p>
          <Link href="/admin" className="inline-flex min-h-11 items-center text-sm font-medium text-blue-700 underline">
            Volver al inicio
          </Link>
        </div>
      )}
    </GuardiaModulo>
  );
}
