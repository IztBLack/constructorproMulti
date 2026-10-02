import { Ayuda } from '@/components/guia/ayuda';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { Badge, BackLink, Card, LinkButton, PageHeader } from '@/components/ui';
import { getSubcontrato, puedeEscribirSubcontratos } from '@/lib/data/subcontratos';
import { getObra } from '@/lib/data/obras';
import { getEmpresaUsuario, getNombreEmpresa } from '@/lib/data/empresa';
import { getEmpresaConfig } from '@/lib/data/empresa-config';
import { getModulosEmpresa } from '@/lib/data/modulos';
import { formatCurrency } from '@/lib/data/format';
import { hoyMxMs, msAFechaInput } from '@/lib/data/tz';
import { contratoDesdeNota, resumenSubcontrato } from '@/lib/subcontratos/calculo';
import { getNotaObra } from '@/lib/data/notas-obra';
import { LEYENDA_LEGAL, clausulasBase, resolverClausulas } from '@/lib/subcontratos/clausulas';
import { origenTextoFinal, resolverTextoFinal, textoIntegrado } from '@/lib/pdf/textos-finales';
import { TextoFinalCard } from '@/components/pdf/texto-final-card';
import { TEXTO_ESTADO, TONO_ESTADO } from '@/components/subcontratos/estado';
import { BorrarContrato, Clausulas, DatosContrato, Pagos, Renglones } from './editor';

export const dynamic = 'force-dynamic';

function Seccion({ id, titulo, ayuda, children }: { id: string; titulo: string; ayuda?: React.ReactNode; children: React.ReactNode }) {
  return (
    <Card>
      <section aria-labelledby={id} className="space-y-3">
        <h2 id={id} className="text-base font-semibold text-neutral-900">
          {titulo}
          {ayuda && <> {ayuda}</>}
        </h2>
        {children}
      </section>
    </Card>
  );
}

/** Detalle de un contrato de subcontrato (RF5.7–RF5.9). */
export default async function SubcontratoPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ revisar?: string }>;
}) {
  const [{ id }, { revisar }] = await Promise.all([params, searchParams]);
  const [{ data: c, error }, rol, nombreEmpresa, { pdf }, { activos }] = await Promise.all([
    getSubcontrato(id),
    getEmpresaUsuario()
      .then((e) => e.rol)
      .catch(() => ''),
    getNombreEmpresa(),
    getEmpresaConfig(),
    getModulosEmpresa(),
  ]);
  if (error) {
    return (
      <p role="alert" className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
        No se pudo cargar el contrato.
      </p>
    );
  }
  if (!c) notFound();
  const { data: obra } = await getObra(c.obra_id);
  // Recién convertida desde una nota: lo que NO pasó solo al contrato
  // (deducciones sin %, total fijado a mano…) se vuelve a calcular aquí para
  // enseñarlo, en vez de mandarlo por la URL.
  const avisos =
    revisar && c.nota_obra_id && obra
      ? await getNotaObra(c.nota_obra_id).then(({ data }) => (data ? contratoDesdeNota(data, obra.nombre).avisos : []))
      : [];

  const puedeEditar = puedeEscribirSubcontratos(rol);
  const r = resumenSubcontrato(c, c.renglones, c.pagos);
  const empresa = nombreEmpresa ?? 'ConstructorPro';
  const ctx = {
    contratante: empresa,
    subcontratista: c.subcontratista_nombre,
    obra: obra?.nombre ?? '',
    ubicacion: obra?.ubicacion ?? '',
    montoContratado: r.montoContratado,
    retencionPct: c.retencion_pct,
    formaPago: c.forma_pago,
  };

  return (
    <div className="space-y-6">
      <BackLink href="/admin/subcontratos">Subcontratos</BackLink>
      <PageHeader
        title={c.subcontratista_nombre || 'Contrato'}
        description={obra ? `Obra: ${obra.nombre}` : undefined}
        actions={
          <LinkButton href={`/admin/subcontratos/${id}/pdf`} variant="secondary" size="sm">
            Ver PDF del contrato
          </LinkButton>
        }
      />
      <div className="flex flex-wrap items-center gap-3 text-sm">
        <Badge tone={TONO_ESTADO[c.estado]}>{TEXTO_ESTADO.get(c.estado)}</Badge>
        {c.nota_obra_id && obra && (
          <Link href={`/admin/obras/${obra.id}/notas/${c.nota_obra_id}`} className="inline-flex min-h-11 items-center text-blue-700 underline">
            Ver la nota de la que nació
          </Link>
        )}
        {puedeEditar && (
          <Link href={`/admin/cumplimiento/subcontratistas/${c.subcontratista_id}`} className="inline-flex min-h-11 items-center text-blue-700 underline">
            Expediente del subcontratista
          </Link>
        )}
      </div>

      {avisos.length > 0 && (
        <div role="status" className="space-y-1 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
          <p className="font-medium">Revisa esto de la nota:</p>
          <ul className="list-disc space-y-1 pl-5">
            {avisos.map((a) => (
              <li key={a}>{a}</li>
            ))}
          </ul>
        </div>
      )}

      <Card>
        <dl className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-5">
          <div>
            <dt className="text-xs text-neutral-500">Contratado</dt>
            <dd className="font-semibold text-neutral-900">{formatCurrency(r.montoContratado)}</dd>
            {r.montoFijado && <dd className="text-xs text-neutral-500">Conceptos: {formatCurrency(r.sumaRenglones)}</dd>}
          </div>
          <div>
            <dt className="text-xs text-neutral-500">Abonado</dt>
            <dd className="text-neutral-900">
              {formatCurrency(r.pagadoBruto)} ({r.avancePct} %)
            </dd>
          </div>
          <div>
            <dt className="text-xs text-neutral-500">Salió de caja</dt>
            <dd className="text-neutral-900">{formatCurrency(r.pagadoNeto)}</dd>
          </div>
          <div>
            <dt className="text-xs text-neutral-500">Fondo de garantía</dt>
            <dd className="text-neutral-900">{formatCurrency(r.retenido)}</dd>
          </div>
          <div>
            <dt className="text-xs text-neutral-500">Por abonar</dt>
            <dd className="text-neutral-900">{formatCurrency(r.porPagar)}</dd>
          </div>
        </dl>
      </Card>

      {puedeEditar && (
        <Seccion id="datos" titulo="Datos del contrato">
          <DatosContrato c={c} sumaRenglones={r.sumaRenglones} />
        </Seccion>
      )}
      {!puedeEditar && (
        <Seccion id="alcance" titulo="Alcance">
          <p className="whitespace-pre-line text-sm text-neutral-700">{c.alcance || '—'}</p>
          {c.forma_pago && <p className="text-sm text-neutral-600">Forma de pago: {c.forma_pago}</p>}
        </Seccion>
      )}

      <Seccion id="conceptos" titulo="Conceptos">
        <Renglones c={c} puedeEditar={puedeEditar} />
      </Seccion>

      <Seccion id="pagos" titulo="Pagos" ayuda={<Ayuda clave="subcontrato.pagos" />}>
        <Pagos c={c} puedeEditar={puedeEditar} conCaja={activos.includes('caja')} hoy={msAFechaInput(hoyMxMs())} />
      </Seccion>

      <Seccion id="clausulas" titulo="Cláusulas">
        <p className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">{LEYENDA_LEGAL}</p>
        <Clausulas c={c} resueltas={resolverClausulas(c.clausulas, ctx)} base={clausulasBase(ctx)} puedeEditar={puedeEditar} />
      </Seccion>

      <TextoFinalCard
        tipo="subcontrato"
        documentoId={c.id}
        resuelto={resolverTextoFinal({
          tipo: 'subcontrato',
          documento: c.texto_final,
          empresa: pdf.textos,
          ctx: { nombreEmpresa: empresa, destinatario: c.subcontratista_nombre },
        })}
        integrado={textoIntegrado('subcontrato', { nombreEmpresa: empresa, destinatario: c.subcontratista_nombre })}
        origen={origenTextoFinal({ tipo: 'subcontrato', documento: c.texto_final, empresa: pdf.textos })}
        puedeEditar={puedeEditar}
      />

      {puedeEditar && <BorrarContrato id={c.id} />}
    </div>
  );
}
