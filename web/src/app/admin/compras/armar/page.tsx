import { BackLink, PageHeader } from '@/components/ui';
import { getEmpresaUsuario } from '@/lib/data/empresa';
import { listObras } from '@/lib/data/obras';
import {
  listMateriales,
  listOrdenadoDeRequisiciones,
  listProveedores,
  listRequisiciones,
} from '@/lib/data/compras';
import { ordenadoPorRenglon, pendientePorComprar } from '@/lib/compras/calculo';
import { ArmarOrdenes, type FilaPorComprar } from './armar-ordenes';
import { gestionaCompras } from '@/lib/auth/roles';

export const dynamic = 'force-dynamic';

export const metadata = { title: 'Armar órdenes de compra' };

/**
 * Convertir lo aprobado en órdenes de compra: se elige proveedor y precio por
 * material, y la app agrupa en una orden por obra y proveedor. Solo admin (lo
 * exige la RLS de 0038 al insertar).
 */
export default async function ArmarPage() {
  const rol = await getEmpresaUsuario()
    .then((e) => e.rol as string)
    .catch(() => '');

  const [reqs, proveedores, materiales, obras] = await Promise.all([
    listRequisiciones({ estados: ['APROBADA', 'PARCIAL'], limite: 500 }),
    listProveedores(),
    listMateriales(),
    listObras(),
  ]);
  const ordenado = ordenadoPorRenglon(
    await listOrdenadoDeRequisiciones(reqs.data.flatMap((r) => r.renglones.map((x) => x.id))),
  );
  const nombreObra = new Map(obras.data.map((o) => [o.id, o.nombre]));
  const materialPor = new Map(materiales.data.map((m) => [m.id, m]));

  const filas: FilaPorComprar[] = reqs.data.flatMap((q) =>
    q.renglones
      .map((r) => {
        const falta = pendientePorComprar(r.cantidad, ordenado.get(r.id) ?? 0);
        const m = r.material_id ? materialPor.get(r.material_id) : undefined;
        return {
          renglonId: r.id,
          requisicionFolio: q.folio,
          obraId: q.obra_id,
          obra: nombreObra.get(q.obra_id) ?? 'Obra',
          paraCuando: q.para_cuando,
          descripcion: r.descripcion,
          unidad: r.unidad,
          falta,
          proveedorSugerido: m?.proveedor_id ?? '',
          precioSugerido: m?.ultimo_precio ?? null,
        };
      })
      .filter((f) => f.falta > 0),
  );

  return (
    <div className="space-y-6">
      <BackLink href="/admin/compras">Compras</BackLink>
      <PageHeader
        title="Armar órdenes de compra"
        description="Elige proveedor y precio de cada material aprobado. Se arma una orden por obra y proveedor; nacen en borrador para que las revises antes de emitirlas."
      />
      {!gestionaCompras(rol) ? (
        <p className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
          Las órdenes de compra las arma el administrador.
        </p>
      ) : (
        <ArmarOrdenes
          filas={filas}
          proveedores={proveedores.data.map((p) => ({ id: p.id, nombre: p.nombre }))}
        />
      )}
    </div>
  );
}
