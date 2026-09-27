import { GuardiaModulo } from '@/components/modulos/guardia-modulo';

/** Si el módulo `estimaciones` está apagado, las estimaciones de la obra muestran el aviso. */
export default async function Layout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return (
    <GuardiaModulo clave="estimaciones" volverHref={`/admin/obras/${id}`} volverTexto="Volver a la obra">
      {children}
    </GuardiaModulo>
  );
}
