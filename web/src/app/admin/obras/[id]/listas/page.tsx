import { notFound } from 'next/navigation';
import { getObra } from '@/lib/data/obras';
import { listListasObra } from '@/lib/data/listas';
import { getEmpresaUsuario } from '@/lib/data/empresa';
import { puedeEditarListas } from '@/lib/listas/calculo';
import ObraTabs from '../_obra-tabs';
import ListasCliente from './listas-cliente';

export const dynamic = 'force-dynamic';

/**
 * Listas de material de una obra (migración 0050, fase 1 de
 * docs/PLAN_LISTAS_MATERIAL.md): lo que pide el plano, por sección, para
 * palomear en obra. Gemela de la pantalla «Listas de material» del móvil.
 *
 * Escriben admin, supervisor y residente; contador, compras y almacén miran. La
 * barrera real son las policies de 0050 — `puedeEditar` solo evita enseñar
 * botones que fallarían.
 */
export default async function ListasObraPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  const [{ data: obra, error: obraError }, { data: listas, error }, rol] = await Promise.all([
    getObra(id),
    listListasObra(id),
    getEmpresaUsuario()
      .then((e) => e.rol)
      .catch(() => ''),
  ]);

  if (obraError) {
    return (
      <p className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
        No se pudo cargar la obra: {obraError}
      </p>
    );
  }
  if (!obra) notFound();

  return (
    <div className="space-y-6">
      <ObraTabs obraId={id} />

      <div>
        <h1 className="text-xl font-semibold text-neutral-900">Listas de material de {obra.nombre}</h1>
        <p className="mt-1 text-sm text-neutral-600">
          Lo que marca el plano, por sección: trabes, castillos, pasillo… Se palomea en la obra y sale en PDF
          para imprimir.
        </p>
      </div>

      {error ? (
        <p className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
          No se pudieron cargar las listas: {error}
        </p>
      ) : (
        <ListasCliente obraId={id} listas={listas} puedeEditar={puedeEditarListas(rol)} />
      )}
    </div>
  );
}
