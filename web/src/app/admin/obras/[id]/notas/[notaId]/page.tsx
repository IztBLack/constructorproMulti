import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getObra } from '@/lib/data/obras';
import { getNotaObra } from '@/lib/data/notas-obra';
import { listColaboradores } from '@/lib/data/equipo';
import { getEmpresaUsuario, getNombreEmpresa } from '@/lib/data/empresa';
import { getEmpresaConfig } from '@/lib/data/empresa-config';
import { origenTextoFinal, resolverTextoFinal, textoIntegrado } from '@/lib/pdf/textos-finales';
import { TextoFinalCard } from '@/components/pdf/texto-final-card';
import { LinkButton } from '@/components/ui';
import EditorNota from './editor-nota';
import { ConvertirEnContrato } from './convertir-contrato';
import { getModulosEmpresa } from '@/lib/data/modulos';
import { puedeEscribirSubcontratos, subcontratoDeNota } from '@/lib/data/subcontratos';

export const dynamic = 'force-dynamic';

export default async function NotaDetallePage({
  params,
}: {
  params: Promise<{ id: string; notaId: string }>;
}) {
  const { id, notaId } = await params;

  const [{ data: obra }, { data: nota, error }, { data: colaboradores }, rol, nombreEmpresa, { pdf }] =
    await Promise.all([
      getObra(id),
      getNotaObra(notaId),
      listColaboradores(),
      getEmpresaUsuario()
        .then((e) => e.rol)
        .catch(() => ''),
      getNombreEmpresa(),
      getEmpresaConfig(),
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

  // «Convertir en contrato» (módulo `subcontratos`, RF5.7): solo admin y
  // contador escriben contratos (0040). Si ya hay uno, se enlaza en su lugar.
  const { activos } = await getModulosEmpresa();
  const conSubcontratos = activos.includes('subcontratos');
  const contrato = conSubcontratos ? await subcontratoDeNota(notaId) : null;

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Link
          href={`/admin/obras/${id}/notas`}
          className="inline-flex items-center text-sm text-neutral-500 transition hover:text-neutral-900 hover:underline"
        >
          ← Notas de {obra.nombre}
        </Link>

        <div className="flex flex-wrap items-start gap-2">
          {conSubcontratos && contrato && (
            <LinkButton href={`/admin/subcontratos/${contrato.id}`} variant="secondary" size="sm">
              Ver contrato
            </LinkButton>
          )}
          {conSubcontratos && !contrato && puedeEscribirSubcontratos(rol) && (
            <ConvertirEnContrato obraId={id} notaId={notaId} />
          )}
          <LinkButton href={`/admin/obras/${id}/notas/${notaId}/pdf`} variant="secondary" size="sm">
            Ver PDF para compartir
          </LinkButton>
        </div>
      </div>

      <EditorNota
        obraId={id}
        nota={nota}
        colaboradores={colaboradores.map((c) => ({ id: c.id, nombre: c.nombre }))}
        puedeEditar={puedeEditar}
      />

      <TextoFinalCard
        tipo="nota"
        documentoId={nota.id}
        resuelto={resolverTextoFinal({
          tipo: 'nota',
          documento: nota.texto_final,
          empresa: pdf.textos,
          ctx: { nombreEmpresa: nombreEmpresa ?? 'ConstructorPro', destinatario: nota.destinatario },
        })}
        integrado={textoIntegrado('nota', {
          nombreEmpresa: nombreEmpresa ?? 'ConstructorPro',
          destinatario: nota.destinatario,
        })}
        origen={origenTextoFinal({ tipo: 'nota', documento: nota.texto_final, empresa: pdf.textos })}
        puedeEditar={puedeEditar}
      />
    </div>
  );
}
