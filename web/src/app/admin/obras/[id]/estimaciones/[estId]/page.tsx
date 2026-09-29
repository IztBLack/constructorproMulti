import { notFound } from 'next/navigation';
import { getObra } from '@/lib/data/obras';
import { getEmpresaUsuario, getNombreEmpresa } from '@/lib/data/empresa';
import { getEmpresaConfig } from '@/lib/data/empresa-config';
import { getVistaEstimacion, listEntradasObra } from '@/lib/data/estimaciones';
import { getAccesoFiscal } from '@/lib/data/fiscal';
import { origenTextoFinal, resolverTextoFinal, textoIntegrado } from '@/lib/pdf/textos-finales';
import { TextoFinalCard } from '@/components/pdf/texto-final-card';
import { hoyMxMs, msAFechaInput } from '@/lib/data/tz';
import ObraTabs from '../../_obra-tabs';
import { EditorEstimacion } from './editor-estimacion';

export const dynamic = 'force-dynamic';

export default async function EstimacionPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string; estId: string }>;
  searchParams: Promise<{ excedente?: string }>;
}) {
  const { id, estId } = await params;
  const { excedente } = await searchParams;

  const { data: obra, error: obraError } = await getObra(id);
  if (obraError) {
    return (
      <p className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
        No se pudo cargar la obra: {obraError}
      </p>
    );
  }
  if (!obra) notFound();

  const [{ data: vista, error }, entradas, yo, fiscal, nombreEmpresa, { pdf }] = await Promise.all([
    getVistaEstimacion(id, estId, obra.nombre),
    listEntradasObra(id),
    getEmpresaUsuario().catch(() => null),
    getAccesoFiscal(),
    getNombreEmpresa(),
    getEmpresaConfig(),
  ]);

  if (error) {
    return (
      <p className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
        No se pudo cargar la estimación: {error}
      </p>
    );
  }
  if (!vista) notFound();

  const rol = yo?.rol ?? '';
  const e = vista.estimacion;
  const ctx = { nombreEmpresa: nombreEmpresa ?? 'ConstructorPro' };

  return (
    <div className="space-y-6">
      <ObraTabs obraId={id} />

      <EditorEstimacion
        obraId={id}
        obraNombre={obra.nombre}
        vista={{
          estimacion: e,
          foto: vista.foto,
          conceptos: vista.conceptos,
          estimadoPrevio: Object.fromEntries(vista.estimadoPrevio),
          anticipoPendiente: Math.max(0, vista.contrato.contrato.anticipo - vista.previos.amortizado),
        }}
        entradas={entradas}
        esAdmin={rol === 'admin'}
        puedeCobrar={rol === 'admin' || rol === 'contador'}
        verFacturacion={fiscal.activo && fiscal.puede}
        avisoExcedente={excedente === '1'}
        hoy={msAFechaInput(hoyMxMs())}
      />

      {e.estado === 'BORRADOR' && (
        <TextoFinalCard
          tipo="estimacion"
          documentoId={e.id}
          resuelto={resolverTextoFinal({ tipo: 'estimacion', documento: e.texto_final, empresa: pdf.textos, ctx })}
          integrado={textoIntegrado('estimacion', ctx)}
          origen={origenTextoFinal({ tipo: 'estimacion', documento: e.texto_final, empresa: pdf.textos })}
          puedeEditar={rol === 'admin'}
        />
      )}
    </div>
  );
}
