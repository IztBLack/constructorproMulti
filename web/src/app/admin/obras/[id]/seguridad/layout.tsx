import { GuardiaModulo } from '@/components/modulos/guardia-modulo';

/** Si el módulo `seguridad` está apagado, la pestaña de la obra muestra el aviso. */
export default async function Layout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return (
    <GuardiaModulo clave="seguridad" volverHref={`/admin/obras/${id}`} volverTexto="Volver a la obra">
      {children}
    </GuardiaModulo>
  );
}
