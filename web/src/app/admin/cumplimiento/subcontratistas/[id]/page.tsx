import Link from 'next/link';
import { notFound } from 'next/navigation';
import { BackLink, Card, PageHeader } from '@/components/ui';
import { getSubcontratista, TIPOS_DOCUMENTO_SUB, type TipoDocumentoSub } from '@/lib/data/cumplimiento';
import { listColaboradores } from '@/lib/data/equipo';
import { listSubcontratos } from '@/lib/data/subcontratos';
import { getModulosEmpresa } from '@/lib/data/modulos';
import { formatDate } from '@/lib/data/format';
import { hoyMxMs } from '@/lib/data/tz';
import { resumenExpediente } from '@/lib/cumplimiento/expediente';
import { semaforoVencimiento } from '@/lib/cumplimiento/avisos';
import type { ClaveEnlace } from '@/lib/cumplimiento/enlaces';
import { EnlaceOficial, Semaforo } from '@/components/cumplimiento/semaforo';
import { ArchivoCumplimiento } from '@/components/cumplimiento/archivo-cumplimiento';
import { FormDocumento, FormSubcontratista, QuitarDocumento } from '../../formularios';

export const dynamic = 'force-dynamic';

const NOMBRE = new Map(TIPOS_DOCUMENTO_SUB.map((t) => [t.valor, t.texto]));

/** Dónde verifica la persona cada tipo de documento (la app no consulta). */
const VERIFICAR: Partial<Record<TipoDocumentoSub, ClaveEnlace[]>> = {
  REPSE: ['padronRepse'],
  OPINION_32D: ['validarOpinionSat', 'opinionPublicaSat'],
  IMSS_OPINION: ['opinionImss'],
};

/** Expediente de un subcontratista (RF5.4): sus datos y sus documentos con vencimiento. */
export default async function ExpedientePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [sub, { data: colaboradores }, { activos }] = await Promise.all([
    getSubcontratista(id),
    listColaboradores(),
    getModulosEmpresa(),
  ]);
  if (!sub) notFound();
  const conSubcontratos = activos.includes('subcontratos');
  const { data: contratos } = conSubcontratos ? await listSubcontratos({ subcontratistaId: id }) : { data: [] };

  const hoy = hoyMxMs();
  const resumen = resumenExpediente(sub.documentos, hoy);

  return (
    <div className="space-y-6">
      <BackLink href="/admin/cumplimiento">IMSS y papeles</BackLink>
      <PageHeader title={sub.nombre} description={sub.especialidad || 'Subcontratista'} />

      <Card>
        <section aria-labelledby="docs" className="space-y-4">
          <div className="flex flex-wrap items-center gap-2">
            <h2 id="docs" className="text-base font-semibold text-neutral-900">
              Expediente
            </h2>
            <Semaforo nivel={resumen.nivel} />
          </div>
          {resumen.faltan.length > 0 && (
            <p className="text-sm text-neutral-600">
              Pídele: {resumen.faltan.map((t) => NOMBRE.get(t) ?? t).join(', ')}.
            </p>
          )}

          {sub.documentos.length === 0 ? (
            <p className="text-sm text-neutral-500">Sin documentos todavía.</p>
          ) : (
            <ul className="divide-y divide-neutral-100">
              {sub.documentos.map((d) => {
                const s = semaforoVencimiento(d.vigencia_hasta, hoy);
                return (
                  <li key={d.id} className="space-y-2 py-3">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <p className="flex flex-wrap items-center gap-2 text-sm font-medium text-neutral-900">
                        {d.vigencia_hasta ? <Semaforo nivel={s.nivel} /> : null}
                        {d.tipo === 'OTRO' && d.descripcion ? d.descripcion : NOMBRE.get(d.tipo)}
                      </p>
                      <QuitarDocumento id={d.id} />
                    </div>
                    <p className="text-sm text-neutral-600">
                      {[
                        d.folio && `Folio ${d.folio}`,
                        d.fecha_emision && `Emitido ${formatDate(d.fecha_emision)}`,
                        d.vigencia_hasta ? `${s.texto} (${formatDate(d.vigencia_hasta)})` : 'Sin vencimiento anotado',
                      ]
                        .filter(Boolean)
                        .join(' · ')}
                    </p>
                    <ArchivoCumplimiento ambito="subcontratista" registroId={d.id} path={d.path} etiqueta="documento" puedeEditar />
                    {(VERIFICAR[d.tipo] ?? []).map((c) => (
                      <EnlaceOficial key={c} clave={c} compacto />
                    ))}
                  </li>
                );
              })}
            </ul>
          )}

          <div className="rounded-lg border border-neutral-200 p-4">
            <h3 className="mb-3 text-sm font-medium text-neutral-700">Agregar documento</h3>
            <FormDocumento subcontratistaId={sub.id} tipos={TIPOS_DOCUMENTO_SUB} />
          </div>
        </section>
      </Card>

      {conSubcontratos && (
        <Card>
          <section aria-labelledby="contratos" className="space-y-3">
            <h2 id="contratos" className="text-base font-semibold text-neutral-900">
              Contratos
            </h2>
            {contratos.length === 0 ? (
              <p className="text-sm text-neutral-500">Sin contratos. Se crean desde una nota de obra o en Subcontratos.</p>
            ) : (
              <ul className="space-y-1">
                {contratos.map((c) => (
                  <li key={c.id}>
                    <Link href={`/admin/subcontratos/${c.id}`} className="inline-flex min-h-11 items-center text-sm text-blue-700 underline">
                      {c.alcance.split('\n')[0] || 'Contrato'} · {c.estado.toLowerCase()}
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </Card>
      )}

      <Card>
        <section aria-labelledby="datos" className="space-y-3">
          <h2 id="datos" className="text-base font-semibold text-neutral-900">
            Datos
          </h2>
          <FormSubcontratista sub={sub} colaboradores={colaboradores.map((c) => ({ id: c.id, nombre: c.nombre }))} />
        </section>
      </Card>
    </div>
  );
}
