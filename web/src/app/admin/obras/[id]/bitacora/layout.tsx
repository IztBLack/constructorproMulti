import { GuardiaModulo } from '@/components/modulos/guardia-modulo';

/** Si el módulo `bitacora` está apagado, la bitácora de la obra muestra el aviso. */
export default async function Layout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return (
    <GuardiaModulo clave="bitacora" volverHref={`/admin/obras/${id}`} volverTexto="Volver a la obra">
      {children}
    </GuardiaModulo>
  );
}
