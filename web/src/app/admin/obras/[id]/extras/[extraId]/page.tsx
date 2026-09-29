import { notFound } from 'next/navigation';
import { getObra } from '@/lib/data/obras';
import { getExtra, urlFotoExtra } from '@/lib/data/cambios';
import { getEmpresaUsuario, getNombreEmpresa } from '@/lib/data/empresa';
import { getEmpresaConfig } from '@/lib/data/empresa-config';
import { origenTextoFinal, resolverTextoFinal, textoIntegrado } from '@/lib/pdf/textos-finales';
import { TextoFinalCard } from '@/components/pdf/texto-final-card';
import ObraTabs from '../../_obra-tabs';
import EditorExtra from './editor-extra';
import { capturaEnObra } from '@/lib/auth/roles';
import { listReglas } from '@/lib/data/aprobaciones';

export const dynamic = 'force-dynamic';

export default async function ExtraPage({
  params,
}: {
  params: Promise<{ id: string; extraId: string }>;
}) {
  const { id, extraId } = await params;

  const [{ data: obra, error: obraError }, { data: extra, error }, rol, nombreEmpresa, { pdf }] =
    await Promise.all([
      getObra(id),
      getExtra(extraId),
      getEmpresaUsuario()
        .then((e) => e.rol)
        .catch(() => ''),
      getNombreEmpresa(),
      getEmpresaConfig(),
    ]);

  if (obraError || error) {
    return (
      <p className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
        No se pudo cargar el extra: {obraError ?? error}
      </p>
    );
  }
  if (!obra || !extra || extra.obra_id !== id) notFound();

  const fotoUrl = await urlFotoExtra(extra.foto_uri);
  // Visto bueno (0042): con la regla de extras prendida, supervisor y residente
  // mandan solos lo chico y piden visto bueno para lo grande. Lo decide la base.
  const esAdmin = rol === 'admin';
  const delegado =
    !esAdmin && capturaEnObra(rol) && (await listReglas()).data.some((r) => r.tipo === 'EXTRA' && r.activa);
  const puedeEditar = capturaEnObra(rol) && extra.estado === 'BORRADOR';
  const ctx = { nombreEmpresa: nombreEmpresa ?? 'ConstructorPro' };

  return (
    <div className="space-y-6">
      <ObraTabs obraId={id} />

      <EditorExtra
        obraId={id}
        extra={extra}
        fotoUrl={fotoUrl}
        puedeEditar={puedeEditar}
        esAdmin={esAdmin}
        puedeEnviar={esAdmin || delegado}
        pedirVistoBueno={delegado}
        puedeDuplicar={capturaEnObra(rol)}
        tieneCliente={!!obra.cliente_id}
      />

      {/* El párrafo final se congela con el extra al enviarlo (0036): solo se
          ofrece editarlo mientras es borrador. */}
      {puedeEditar && (
        <TextoFinalCard
          tipo="extra"
          documentoId={extra.id}
          resuelto={resolverTextoFinal({ tipo: 'extra', documento: extra.texto_final, empresa: pdf.textos, ctx })}
          integrado={textoIntegrado('extra', ctx)}
          origen={origenTextoFinal({ tipo: 'extra', documento: extra.texto_final, empresa: pdf.textos })}
          puedeEditar
        />
      )}
    </div>
  );
}
