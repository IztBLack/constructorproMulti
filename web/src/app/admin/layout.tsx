import { redirect } from 'next/navigation';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/server';
import { getNombreEmpresa } from '@/lib/data/empresa';
import { nombreUsuario } from '@/lib/data/usuario';
import { contarIncompletos } from '@/lib/data/equipo';
import { AvisoIncompletos } from '@/components/equipo/aviso-incompletos';
import { NavLinks } from './nav-links';
import { AvisoInstalar } from '@/components/pwa/aviso-instalar';
import { ToggleTema } from '@/components/tema/toggle-tema';
import { EnlaceAjustes } from '@/components/ajustes/enlace-ajustes';
import { BotonDescargas } from '@/components/descargas/boton-descargas';

export const dynamic = 'force-dynamic';

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const marca = (await getNombreEmpresa()) ?? 'ConstructorPro';
  const nombre = nombreUsuario(user);
  // Aviso global de gente a medio registrar. Va en el layout y no en una
  // pantalla porque el pendiente es del negocio: quien da de alta en la obra
  // no suele ser quien completa los datos en la oficina.
  const incompletos = await contarIncompletos();

  return (
    // `print:*` deja fuera de la impresión el chrome del admin (nav, encabezado,
    // padding). Sin esto, cualquier página imprimible bajo /admin —en particular
    // el PDF de cotización— sacaba también la barra de navegación y el usuario, e
    // "imprimía toda la página" en vez del documento solo.
    <div className="min-h-screen flex flex-col bg-neutral-50 print:min-h-0 print:bg-white">
      <header className="border-b border-neutral-200 bg-white print:hidden">
        {/* Fila 1: marca + acciones de cuenta.
            El nav NO vive aquí. Con 10 secciones, la fila pedía ~1424px y el
            contenedor tope mide 1152: a partir de `sm` los enlaces se comprimían
            y el bar "se estiraba". Marca y acciones caben de sobra solas. */}
        <div className="mx-auto max-w-6xl flex items-center justify-between gap-4 px-4 py-3 sm:px-8">
          <Link
            href="/admin"
            className="min-w-0 truncate text-base font-semibold text-neutral-900"
          >
            {marca}
          </Link>
          <div className="flex shrink-0 items-center gap-2 sm:gap-3">
            {/* El nombre solo cuando hay espacio real: en tablet robaba el ancho
                que necesitan los botones. */}
            <span className="hidden max-w-[16ch] truncate text-sm text-neutral-500 lg:inline">
              {nombre}
            </span>
            <BotonDescargas />
            <EnlaceAjustes href="/admin/ajustes" />
            <ToggleTema />
            <form action="/auth/signout" method="post">
              <button className="rounded-lg border border-neutral-300 px-3 py-1.5 text-sm font-medium text-neutral-700 hover:bg-neutral-100 cursor-pointer">
                Salir
              </button>
            </form>
          </div>
        </div>
        {/* Fila 2: navegación, siempre en su propio renglón y en todos los
            tamaños (una sola implementación = un solo comportamiento). Se
            desplaza en horizontal solo cuando no cabe; en escritorio entra
            completa sin scroll. */}
        <NavLinks
          className="flex gap-1 overflow-x-auto border-t border-neutral-100 px-4 py-2 sm:px-8 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden mx-auto max-w-6xl"
          itemClassName="shrink-0"
        />
      </header>

      <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-8 sm:px-8 print:max-w-none print:p-0">
        <div className="mb-6 empty:mb-0 print:hidden">
          <AvisoInstalar />
        </div>
        {/* `print:hidden`: es un aviso de trabajo pendiente, no parte de ningún
            documento que se imprima desde estas pantallas. */}
        <div className="print:hidden">
          <AvisoIncompletos datos={incompletos} />
        </div>
        {children}
      </main>
    </div>
  );
}
