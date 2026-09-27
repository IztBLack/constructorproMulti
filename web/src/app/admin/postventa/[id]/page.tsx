import { notFound } from 'next/navigation';
import { BackLink, Badge, PageHeader } from '@/components/ui';
import { getEmpresaUsuario } from '@/lib/data/empresa';
import { getGarantiaObra, getReporte } from '@/lib/data/postventa';
import { formatDate, formatDateTime } from '@/lib/data/format';
import { msAFechaInput } from '@/lib/data/tz';
import {
  ETIQUETA_ESTADO_REPORTE,
  TEXTO_GARANTIA,
  TONO_ESTADO_REPORTE,
  estadoGarantia,
} from '@/lib/postventa/garantia';
import { Seguimiento } from '../formularios';
import { capturaEnObra } from '@/lib/auth/roles';

export const dynamic = 'force-dynamic';

/** Un reporte de garantía: lo que dijo el cliente, sus fotos y el seguimiento. */
export default async function ReporteGarantiaPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [{ data: r, error }, empresa] = await Promise.all([getReporte(id), getEmpresaUsuario().catch(() => null)]);
  if (error) {
    return (
      <p className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
        No se pudo cargar el reporte: {error}
      </p>
    );
  }
  if (!r) notFound();
  const gar = await getGarantiaObra(r.obra_id);
  const g = estadoGarantia(gar, r.reportado_en);
  const rol = empresa?.rol ?? '';
  const gestiona = capturaEnObra(rol);

  return (
    <div className="space-y-6">
      <BackLink href="/admin/postventa">Garantías</BackLink>
      <PageHeader
        title={r.obra_nombre ?? 'Reporte de garantía'}
        description={`${r.cliente_nombre ? `${r.cliente_nombre} · ` : ''}Reportado el ${formatDateTime(r.reportado_en)}${
          r.reportado_nombre ? ` por ${r.reportado_nombre}` : ''
        }`}
        actions={<Badge tone={TONO_ESTADO_REPORTE[r.estado]}>{ETIQUETA_ESTADO_REPORTE[r.estado]}</Badge>}
      />

      <section className="space-y-2 rounded-xl border border-neutral-200 bg-white p-4">
        <h2 className="text-sm font-medium text-neutral-500">
          {r.origen === 'CLIENTE' ? 'Lo que escribió el cliente' : 'Lo que se registró'}
        </h2>
        {r.ubicacion && <p className="text-sm font-medium text-neutral-900">Dónde: {r.ubicacion}</p>}
        <p className="whitespace-pre-line text-sm text-neutral-800">{r.descripcion}</p>
        <p className="text-xs text-neutral-500">
          Garantía al reportar: {TEXTO_GARANTIA[g.estado]}
          {g.vence !== null ? ` (vence el ${formatDate(g.vence)})` : ''}. La decisión de si procede es tuya.
        </p>
      </section>

      {r.fotos.length > 0 && (
        <section aria-labelledby="fotos-heading" className="space-y-2">
          <h2 id="fotos-heading" className="text-sm font-medium text-neutral-700">
            Fotos ({r.fotos.length})
          </h2>
          <ul className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            {r.fotos.map((f, i) =>
              f.url ? (
                <li key={f.id}>
                  <a href={f.url} target="_blank" rel="noopener noreferrer" className="block">
                    {/* eslint-disable-next-line @next/next/no-img-element -- URL firmada de Storage, temporal */}
                    <img
                      src={f.url}
                      alt={`Foto ${i + 1} del reporte${f.subida_por_cliente ? ' (la subió el cliente)' : ''}`}
                      className="aspect-square w-full rounded-lg border border-neutral-200 object-cover"
                      loading="lazy"
                    />
                  </a>
                </li>
              ) : null,
            )}
          </ul>
        </section>
      )}

      <section aria-labelledby="seguimiento-heading" className="space-y-3 rounded-xl border border-neutral-200 bg-white p-4">
        <h2 id="seguimiento-heading" className="text-base font-semibold text-neutral-900">
          Seguimiento
        </h2>
        {r.cerrado_en !== null && (
          <p className="text-sm text-neutral-600">Cerrado el {formatDate(r.cerrado_en)}.</p>
        )}
        {gestiona ? (
          <Seguimiento
            id={r.id}
            obraId={r.obra_id}
            estado={r.estado}
            respuesta={r.respuesta}
            programadoPara={r.programado_para !== null ? msAFechaInput(r.programado_para) : ''}
          />
        ) : (
          <div className="space-y-1 text-sm text-neutral-800">
            <p>{r.respuesta || 'Sin respuesta todavía.'}</p>
            {r.programado_para !== null && <p>Visita: {formatDate(r.programado_para)}</p>}
          </div>
        )}
      </section>
    </div>
  );
}
