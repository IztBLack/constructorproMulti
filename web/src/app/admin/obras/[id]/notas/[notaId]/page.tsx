import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getObra } from '@/lib/data/obras';
import { getNotaObra } from '@/lib/data/notas-obra';
import { listColaboradores } from '@/lib/data/equipo';
import { getEmpresaUsuario } from '@/lib/data/empresa';
import { LinkButton } from '@/components/ui';
import EditorNota from './editor-nota';

export const dynamic = 'force-dynamic';

export default async function NotaDetallePage({
  params,
}: {
  params: Promise<{ id: string; notaId: string }>;
}) {
  const { id, notaId } = await params;

  const [{ data: obra }, { data: nota, error }, { data: colaboradores }, rol] = await Promise.all([
    getObra(id),
    getNotaObra(notaId),
    listColaboradores(),
    getEmpresaUsuario()
      .then((e) => e.rol)
      .catch(() => ''),
  ]);

  if (error) {
    return (
      <p className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
        No se pudo cargar la nota: {error}
      </p>
    );
  }

  // La nota tiene que existir Y ser de esta obra: entrar por la URL de otra obra
  // enseñaría una nota bajo un encabezado que no le corresponde.
  if (!obra || !nota || nota.obra_id !== id) notFound();

  const puedeEditar = ['admin', 'supervisor'].includes(rol);

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Link
          href={`/admin/obras/${id}/notas`}
          className="inline-flex items-center text-sm text-neutral-500 transition hover:text-neutral-900 hover:underline"
        >
          ← Notas de {obra.nombre}
        </Link>

        <LinkButton href={`/admin/obras/${id}/notas/${notaId}/pdf`} variant="secondary" size="sm">
          Ver PDF para compartir
        </LinkButton>
      </div>

      <EditorNota
        obraId={id}
        nota={nota}
        colaboradores={colaboradores.map((c) => ({ id: c.id, nombre: c.nombre }))}
        puedeEditar={puedeEditar}
      />
    </div>
  );
}
