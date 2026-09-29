import Link from 'next/link';
import { Badge, Card, EmptyState, PageHeader } from '@/components/ui';
import { listSubcontratos, puedeEscribirSubcontratos } from '@/lib/data/subcontratos';
import { listObras } from '@/lib/data/obras';
import { getEmpresaUsuario } from '@/lib/data/empresa';
import { formatCurrency } from '@/lib/data/format';
import { resumenSubcontrato } from '@/lib/subcontratos/calculo';
import { TEXTO_ESTADO, TONO_ESTADO } from '@/components/subcontratos/estado';
import { NuevoContrato } from './nuevo-contrato';

export const dynamic = 'force-dynamic';

/** Lista de contratos de subcontrato, con lo contratado, pagado y retenido. */
export default async function SubcontratosPage({ searchParams }: { searchParams: Promise<{ obra?: string }> }) {
  const { obra: obraFiltro } = await searchParams;
  const [{ data: contratos, error }, { data: obras }, rol] = await Promise.all([
    listSubcontratos(obraFiltro ? { obraId: obraFiltro } : {}),
    listObras(),
    getEmpresaUsuario()
      .then((e) => e.rol)
      .catch(() => ''),
  ]);
  const nombreObra = new Map(obras.map((o) => [o.id, o.nombre]));
  const puedeEscribir = puedeEscribirSubcontratos(rol);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Subcontratos"
        description="Los tratos con tus subcontratistas por escrito: alcance, monto, fondo de garantía y pagos."
      />

      <form method="get" className="flex flex-wrap items-end gap-3">
        <label className="block space-y-1">
          <span className="text-sm font-medium text-neutral-700">Obra</span>
          <select
            name="obra"
            defaultValue={obraFiltro ?? ''}
            className="min-h-11 rounded-lg border border-neutral-300 bg-white px-3 text-sm text-neutral-900"
          >
            <option value="">Todas</option>
            {obras.map((o) => (
              <option key={o.id} value={o.id}>
                {o.nombre}
              </option>
            ))}
          </select>
        </label>
        <button type="submit" className="inline-flex min-h-11 cursor-pointer items-center rounded-lg border border-neutral-300 bg-white px-4 text-sm font-medium text-neutral-700 hover:bg-neutral-100">
          Filtrar
        </button>
      </form>

      {puedeEscribir && (
        <NuevoContrato obras={obras.filter((o) => o.activa).map((o) => ({ id: o.id, nombre: o.nombre }))} obraInicial={obraFiltro} />
      )}

      {error && (
        <p role="alert" className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
          No se pudieron cargar los contratos.
        </p>
      )}

      {contratos.length === 0 ? (
        <EmptyState
          title="Sin contratos todavía"
          description="Abre una nota de obra y usa «Convertir en contrato», o crea uno aquí."
        />
      ) : (
        <ul className="space-y-3">
          {contratos.map((c) => {
            const r = resumenSubcontrato(c, c.renglones, c.pagos);
            return (
              <li key={c.id}>
                <Card padding="sm" className="space-y-2">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <Link
                      href={`/admin/subcontratos/${c.id}`}
                      className="inline-flex min-h-11 items-center text-base font-medium text-neutral-900 underline-offset-2 hover:underline"
                    >
                      {c.subcontratista_nombre || 'Sin nombre'} · {nombreObra.get(c.obra_id) ?? 'Obra'}
                    </Link>
                    <Badge tone={TONO_ESTADO[c.estado]}>{TEXTO_ESTADO.get(c.estado)}</Badge>
                  </div>
                  <p className="line-clamp-2 text-sm text-neutral-600">{c.alcance || 'Sin alcance escrito.'}</p>
                  <dl className="grid grid-cols-2 gap-2 text-sm sm:grid-cols-4">
                    <div>
                      <dt className="text-xs text-neutral-500">Contratado</dt>
                      <dd className="font-medium text-neutral-900">{formatCurrency(r.montoContratado)}</dd>
                    </div>
                    <div>
                      <dt className="text-xs text-neutral-500">Pagado</dt>
                      <dd className="text-neutral-900">{formatCurrency(r.pagadoBruto)}</dd>
                    </div>
                    <div>
                      <dt className="text-xs text-neutral-500">Retenido (garantía)</dt>
                      <dd className="text-neutral-900">{formatCurrency(r.retenido)}</dd>
                    </div>
                    <div>
                      <dt className="text-xs text-neutral-500">Por pagar</dt>
                      <dd className="text-neutral-900">{formatCurrency(r.porPagar)}</dd>
                    </div>
                  </dl>
                </Card>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
