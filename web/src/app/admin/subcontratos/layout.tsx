import Link from 'next/link';
import { GuardiaModulo } from '@/components/modulos/guardia-modulo';
import { getEmpresaUsuario } from '@/lib/data/empresa';
import { ROLES_LEEN_SUBCONTRATOS } from '@/lib/data/subcontratos';

/**
 * Subcontratos: guardia del módulo + de rol. Leen admin, contador y
 * supervisor (RLS de 0040); el colaborador y el cliente, nada.
 */
export default async function Layout({ children }: { children: React.ReactNode }) {
  const rol = await getEmpresaUsuario()
    .then((e) => e.rol)
    .catch(() => '');
  const puede = (ROLES_LEEN_SUBCONTRATOS as readonly string[]).includes(rol);
  return (
    <GuardiaModulo clave="subcontratos">
      {puede ? (
        children
      ) : (
        <div className="mx-auto max-w-lg space-y-3 rounded-xl border border-neutral-200 bg-white p-6 text-center">
          <h1 className="text-lg font-semibold text-neutral-900">Subcontratos</h1>
          <p className="text-sm text-neutral-600">
            Los contratos los ven el administrador, el contador y el supervisor.
          </p>
          <Link href="/admin" className="inline-flex min-h-11 items-center text-sm font-medium text-blue-700 underline">
            Volver al inicio
          </Link>
        </div>
      )}
    </GuardiaModulo>
  );
}
