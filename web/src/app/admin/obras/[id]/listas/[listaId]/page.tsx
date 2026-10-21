import { notFound } from 'next/navigation';
import { getObra } from '@/lib/data/obras';
import { getListaMaterial } from '@/lib/data/listas';
import { getEmpresaUsuario } from '@/lib/data/empresa';
import { puedeEditarListas } from '@/lib/listas/calculo';
import ObraTabs from '../../_obra-tabs';
import EditorLista from './editor-lista';

export const dynamic = 'force-dynamic';

/** Una lista de material: el checklist por sección (gemela de la del móvil). */
export default async function ListaPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string; listaId: string }>;
  searchParams: Promise<{ pegar?: string }>;
}) {
  const [{ id, listaId }, { pegar }] = await Promise.all([params, searchParams]);

  const [{ data: obra, error }, { data: lista, error: errorLista }, rol] = await Promise.all([
    getObra(id),
    getListaMaterial(listaId),
    getEmpresaUsuario()
      .then((e) => e.rol)
      .catch(() => ''),
  ]);

  if (error || errorLista) {
    return (
      <p className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
        No se pudo cargar la lista: {error ?? errorLista}
      </p>
    );
  }
  if (!obra || !lista || lista.obra_id !== id) notFound();

  return (
    <div className="space-y-6">
      <ObraTabs obraId={id} />
      <EditorLista
        obraId={id}
        lista={lista}
        puedeEditar={puedeEditarListas(rol)}
        abrirPegar={pegar === '1' && lista.renglones.length === 0}
      />
    </div>
  );
}
