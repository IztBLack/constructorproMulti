import { BackLink, PageHeader } from '@/components/ui';
import { getEmpresaUsuario } from '@/lib/data/empresa';
import { hoyMxMs } from '@/lib/data/tz';
import { listOrdenes, listPagos, listProveedores, listRecepciones } from '@/lib/data/compras';
import { saldosPorProveedor } from '@/lib/compras/calculo';
import { ListaProveedores } from './lista-proveedores';

export const dynamic = 'force-dynamic';

export const metadata = { title: 'Proveedores' };

/**
 * Proveedores (RF2.6): datos, RFC, días de crédito y cuánto se les debe.
 * Escriben admin y contador (RLS de 0038); el supervisor solo los ve.
 */
export default async function ProveedoresPage() {
  const rol = await getEmpresaUsuario()
    .then((e) => e.rol as string)
    .catch(() => '');
  const puedeEditar = rol === 'admin' || rol === 'contador';
  const { data: proveedores, error } = await listProveedores();

  let saldos = new Map<string, { saldo: number; vencido: number }>();
  if (puedeEditar) {
    const { data: ordenes } = await listOrdenes({ estados: ['EMITIDA', 'PARCIAL', 'RECIBIDA'] });
    const ids = ordenes.map((o) => o.id);
    const [pagos, recs] = await Promise.all([listPagos(ids), listRecepciones(ids)]);
    const primera = new Map<string, number>();
    for (const r of recs) primera.set(r.orden_compra_id, Math.min(primera.get(r.orden_compra_id) ?? r.fecha, r.fecha));
    saldos = new Map(
      saldosPorProveedor(ordenes, pagos, primera, hoyMxMs()).map((g) => [g.proveedorId, { saldo: g.saldo, vencido: g.vencido }]),
    );
  }

  return (
    <div className="space-y-6">
      <BackLink href="/admin/compras">Compras</BackLink>
      <PageHeader
        title="Proveedores"
        description="A quién le compras, sus días de crédito y cuánto le debes. El RFC sirve para reconocer sus facturas."
      />
      {error ? (
        <p className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">{error}</p>
      ) : (
        <ListaProveedores
          proveedores={proveedores.map((p) => ({ ...p, ...(saldos.get(p.id) ?? { saldo: 0, vencido: 0 }) }))}
          puedeEditar={puedeEditar}
          veSaldos={puedeEditar}
        />
      )}
    </div>
  );
}
