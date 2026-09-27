import { GuardiaModulo } from '@/components/modulos/guardia-modulo';

/** Si el módulo `estimaciones` está apagado, el avance de la obra muestra el aviso. */
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
