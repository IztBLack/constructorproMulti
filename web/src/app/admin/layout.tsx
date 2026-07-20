import { redirect } from 'next/navigation';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/server';
import { getNombreEmpresa } from '@/lib/data/empresa';
import { nombreUsuario } from '@/lib/data/usuario';
import { NavLinks } from './nav-links';
import { AvisoInstalar } from '@/components/pwa/aviso-instalar';

export const dynamic = 'force-dynamic';

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const marca = (await getNombreEmpresa()) ?? 'ConstructorPro';
  const nombre = nombreUsuario(user);

  return (
    <div className="min-h-screen flex flex-col bg-neutral-50">
      <header className="border-b border-neutral-200 bg-white">
        <div className="mx-auto max-w-6xl flex items-center justify-between gap-4 px-4 py-3 sm:px-8">
          <div className="flex items-center gap-6">
            <Link href="/admin" className="text-base font-semibold text-neutral-900">
              {marca}
            </Link>
            {/* Nav escritorio */}
            <NavLinks className="hidden sm:flex items-center gap-1" />
          </div>
          <div className="flex items-center gap-3">
            <span className="hidden sm:inline text-sm text-neutral-500">{nombre}</span>
            <form action="/auth/signout" method="post">
              <button className="rounded-lg border border-neutral-300 px-3 py-1.5 text-sm font-medium text-neutral-700 hover:bg-neutral-100 cursor-pointer">
                Salir
              </button>
            </form>
          </div>
        </div>
        {/* Nav móvil */}
        <NavLinks className="flex sm:hidden gap-1 overflow-x-auto border-t border-neutral-100 px-4 py-2" itemClassName="shrink-0" />
      </header>

      <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-8 sm:px-8">
        <div className="mb-6 empty:mb-0">
          <AvisoInstalar />
        </div>
        {children}
      </main>
    </div>
  );
}
