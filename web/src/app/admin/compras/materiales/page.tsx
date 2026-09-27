import { BackLink, PageHeader } from '@/components/ui';
import { getEmpresaUsuario } from '@/lib/data/empresa';
import { listMateriales, listProveedores } from '@/lib/data/compras';
import { CatalogoMateriales } from './catalogo-materiales';
import { gestionaCompras } from '@/lib/auth/roles';

export const dynamic = 'force-dynamic';

export const metadata = { title: 'Catálogo de materiales' };

/**
 * Catálogo de materiales (RF2.1): lo que se COMPRA, aparte del catálogo de
 * conceptos (lo que se vende). El último precio lo aprende solo al emitir una
 * orden. Lo da de alta el admin (RLS de 0038).
 */
export default async function MaterialesPage() {
  const rol = await getEmpresaUsuario()
    .then((e) => e.rol as string)
    .catch(() => '');
  const [{ data: materiales, error }, { data: proveedores }] = await Promise.all([listMateriales(), listProveedores()]);

  return (
    <div className="space-y-6">
      <BackLink href="/admin/compras">Compras</BackLink>
      <PageHeader
        title="Catálogo de materiales"
        description="Lo que compras para la obra, con su unidad, el último precio y a quién se lo compras. Es aparte de tu lista de precios de cotización."
      />
      {error ? (
        <p className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">{error}</p>
      ) : (
        <CatalogoMateriales
          materiales={materiales}
          proveedores={proveedores.map((p) => ({ id: p.id, nombre: p.nombre }))}
          puedeEditar={gestionaCompras(rol)}
        />
      )}
    </div>
  );
}
