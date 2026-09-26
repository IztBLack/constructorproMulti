import { GuardiaModulo } from '@/components/modulos/guardia-modulo';

/** El PDF de caja de la obra es parte de `caja`: si está apagada, se muestra el aviso. */
export default async function Layout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return (
    <GuardiaModulo clave="caja" volverHref={`/admin/obras/${id}`} volverTexto="Volver a la obra">
      {children}
    </GuardiaModulo>
  );
}
