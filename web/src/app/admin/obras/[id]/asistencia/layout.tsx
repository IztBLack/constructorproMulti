import { GuardiaModulo } from '@/components/modulos/guardia-modulo';

/** La asistencia de la obra es parte de `equipo`: si está apagado, se muestra el aviso. */
export default async function Layout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return (
    <GuardiaModulo clave="equipo" volverHref={`/admin/obras/${id}`} volverTexto="Volver a la obra">
      {children}
    </GuardiaModulo>
  );
}
