import Link from 'next/link';
import { notFound } from 'next/navigation';
import { DocumentShell } from '@/components/pdf/document-shell';
import { DocumentActions } from '@/components/pdf/document-actions';
import { PreviewFrame } from '@/components/pdf/preview-frame';
import { htmlBitacoraPdf, type ParamsPeriodo } from './datos';

export const dynamic = 'force-dynamic';

/** Vista previa del PDF de bitácora por periodo (completa o para el cliente). */
export default async function BitacoraPdfPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<ParamsPeriodo>;
}) {
  const [{ id }, sp] = await Promise.all([params, searchParams]);
  const r = await htmlBitacoraPdf(id, sp);
  if (!r.ok) {
    if (r.status === 404) notFound();
    return <div className="p-8 text-sm text-red-700">{r.error}</div>;
  }

  const base = { desde: r.periodo.desdeInput, hasta: r.periodo.hastaInput };
  const qs = (cliente: boolean) =>
    new URLSearchParams(cliente ? { ...base, cliente: '1' } : base).toString();
  const clase = (activa: boolean) =>
    `inline-flex min-h-11 items-center rounded-lg border px-4 ${
      activa ? 'border-neutral-900 font-semibold text-neutral-900' : 'border-neutral-300 text-neutral-700'
    }`;

  return (
    <DocumentShell>
      <DocumentActions
        volverHref={`/admin/obras/${id}/bitacora?${qs(false)}`}
        descargarHref={`/admin/obras/${id}/bitacora/pdf/descargar?${qs(r.paraCliente)}`}
      />
      <nav aria-label="Versión del PDF" className="flex flex-wrap gap-2 text-sm">
        <Link
          href={`/admin/obras/${id}/bitacora/pdf?${qs(false)}`}
          aria-current={!r.paraCliente ? 'page' : undefined}
          className={clase(!r.paraCliente)}
        >
          Completa (interna)
        </Link>
        <Link
          href={`/admin/obras/${id}/bitacora/pdf?${qs(true)}`}
          aria-current={r.paraCliente ? 'page' : undefined}
          className={clase(r.paraCliente)}
        >
          Para el cliente (solo lo publicado)
        </Link>
      </nav>
      <PreviewFrame html={r.html} />
    </DocumentShell>
  );
}
