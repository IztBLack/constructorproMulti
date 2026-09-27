import { notFound } from 'next/navigation';
import { getObra } from '@/lib/data/obras';
import { getEmpresaUsuario } from '@/lib/data/empresa';
import {
  acumuladosDe,
  getContratoObra,
  listConceptosObra,
  listEntradasObra,
  listEstimacionesObra,
} from '@/lib/data/estimaciones';
import { hoyMxMs, msAFechaInput } from '@/lib/data/tz';
import ObraTabs from '../_obra-tabs';
import { ContratoObraCard } from './contrato-obra';
import { EstimacionesLista } from './estimaciones-lista';

export const dynamic = 'force-dynamic';

/**
 * ESTIMACIONES de la obra (RF3.2–RF3.5): cobrar por avance. Arriba el contrato
 * (anticipo, amortización, fondo de garantía, retenciones), luego los
 * acumulados y la lista de estimaciones con su estado.
 *
 * Solo el admin crea, edita y envía; el contador marca cobrada; el supervisor
 * mira. La barrera real es la RLS y las RPC de 0039.
 */
export default async function EstimacionesPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  const [{ data: obra, error: obraError }, estimaciones, contrato, conceptos, entradas, yo] = await Promise.all([
    getObra(id),
    listEstimacionesObra(id),
    getContratoObra(id),
    listConceptosObra(id),
    listEntradasObra(id),
    getEmpresaUsuario().catch(() => null),
  ]);

  if (obraError) {
    return (
      <p className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
        No se pudo cargar la obra: {obraError}
      </p>
    );
  }
  if (!obra) notFound();

  const rol = yo?.rol ?? '';
  const error = estimaciones.error ?? contrato.error ?? conceptos.error;
  const contratado = conceptos.data
    .filter((c) => c.origen === 'presupuesto')
    .reduce((s, c) => s + c.cantidad * c.precioUnitario, 0);
  const ac = acumuladosDe(estimaciones.data, contrato.data.contrato.anticipo);
  const hoy = hoyMxMs();
  const ultimaFin = estimaciones.data
    .filter((e) => e.estado !== 'RECHAZADA')
    .reduce((m, e) => Math.max(m, e.periodo_fin), 0);

  return (
    <div className="space-y-6">
      <ObraTabs obraId={id} />

      <div>
        <h1 className="text-xl font-semibold text-neutral-900">Estimaciones de {obra.nombre}</h1>
        <p className="mt-1 max-w-2xl text-sm text-neutral-600">
          Cobra por avance: lo que se hizo en el periodo por el precio del presupuesto, menos lo que
          toca del anticipo y las retenciones. Se le manda al cliente, la autoriza en su portal y la
          cobras.
        </p>
        {!obra.cliente_id && (
          <p className="mt-2 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-800">
            Esta obra no tiene un cliente del portal ligado: puedes mandarle el PDF y registrar tú su
            autorización, o ligar la obra a un cliente (Detalle → Editar) para que la autorice en línea.
          </p>
        )}
      </div>

      {error ? (
        <p className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
          No se pudieron cargar las estimaciones: {error}
        </p>
      ) : (
        <>
          <ContratoObraCard
            obraId={id}
            contrato={contrato.data}
            contratado={contratado}
            entradas={entradas}
            esAdmin={rol === 'admin'}
          />
          <EstimacionesLista
            obraId={id}
            estimaciones={estimaciones.data}
            acumulados={ac}
            contratado={contratado}
            esAdmin={rol === 'admin'}
            hayPresupuesto={conceptos.data.length > 0}
            sugerenciaInicio={msAFechaInput(ultimaFin > 0 ? ultimaFin + 86_400_000 : (obra.fecha_inicio ?? hoy))}
            hoy={msAFechaInput(hoy)}
          />
        </>
      )}
    </div>
  );
}
