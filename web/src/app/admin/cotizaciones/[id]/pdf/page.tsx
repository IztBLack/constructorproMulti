import { notFound } from 'next/navigation';
import { calcularTotales, getCotizacionConDetalle } from '@/lib/data/cotizaciones';
import { formatCurrency, formatDate } from '@/lib/data/format';
import { createClient } from '@/lib/supabase/server';
import { PrintButton } from './print-button';

export const dynamic = 'force-dynamic';

// Short folio: last 8 characters of UUID
function folioCorto(id: string): string {
  return id.replace(/-/g, '').slice(-8).toUpperCase();
}

interface Props {
  params: Promise<{ id: string }>;
}

export default async function CotizacionPdfPage({ params }: Props) {
  const { id } = await params;

  const { data: cotizacion, error } = await getCotizacionConDetalle(id);

  if (error) {
    return (
      <div className="p-8 text-sm text-red-700">
        No se pudo cargar la cotización: {error}
      </div>
    );
  }

  if (!cotizacion) notFound();

  // Fetch company name
  const supabase = await createClient();
  const { data: empresaData } = await supabase
    .from('empresas')
    .select('nombre')
    .eq('id', cotizacion.empresa_id)
    .maybeSingle();

  const nombreEmpresa: string = empresaData?.nombre ?? 'ConstructorPro';
  const totales = calcularTotales(cotizacion);
  const folio = folioCorto(cotizacion.id);

  return (
    <>
      {/*
        Print styles injected inline so this page is self-contained even if globals.css
        is not loaded in a print context. Tailwind `print:hidden` classes handle the rest.
      */}
      <style>{`
        @media print {
          @page {
            size: letter;
            margin: 18mm 20mm 18mm 20mm;
          }
          body {
            background: #ffffff !important;
            color: #020617 !important;
            -webkit-print-color-adjust: exact;
            print-color-adjust: exact;
          }
          .print-avoid-break {
            break-inside: avoid;
            page-break-inside: avoid;
          }
        }
        @media (prefers-reduced-motion: reduce) {
          * { transition: none !important; animation: none !important; }
        }
      `}</style>

      {/* Screen wrapper: white card centered, max letter width */}
      <div className="min-h-screen bg-neutral-100 print:bg-white print:min-h-0">
        <div className="mx-auto max-w-[816px] bg-white px-10 py-10 print:px-0 print:py-0 print:max-w-none print:shadow-none shadow-md print:rounded-none rounded-none sm:my-8 print:my-0">

          {/* ── Action bar (screen only) ── */}
          <PrintButton cotizacionId={cotizacion.id} />

          {/* ═══════════════════════════════════════════
              DOCUMENT START
          ══════════════════════════════════════════════ */}

          {/* Header */}
          <header className="print-avoid-break border-b-2 border-[#0F172A] pb-5 mb-6">
            <div className="flex items-start justify-between gap-4">
              {/* Emisor */}
              <div>
                <p className="text-xs font-semibold uppercase tracking-widest text-[#0369A1]">
                  Cotización / Presupuesto
                </p>
                <h1 className="mt-1 text-2xl font-bold text-[#0F172A] leading-tight">
                  {nombreEmpresa}
                </h1>
              </div>

              {/* Folio + Fecha */}
              <div className="text-right shrink-0">
                <p className="text-xs text-neutral-500 uppercase tracking-wide">Folio</p>
                <p className="font-mono text-base font-semibold text-[#0F172A] tabular-nums">
                  #{folio}
                </p>
                <p className="mt-1 text-xs text-neutral-500 uppercase tracking-wide">Fecha</p>
                <p className="text-sm font-medium text-[#0F172A]">
                  {formatDate(cotizacion.fecha)}
                </p>
              </div>
            </div>
          </header>

          {/* Client info */}
          <section className="print-avoid-break mb-6 grid grid-cols-1 gap-3 sm:grid-cols-3 rounded-lg border border-neutral-200 bg-neutral-50 px-5 py-4 print:bg-white print:border-neutral-200">
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-widest text-neutral-500 mb-0.5">
                Cliente
              </p>
              <p className="text-sm font-semibold text-[#0F172A]">{cotizacion.cliente}</p>
            </div>
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-widest text-neutral-500 mb-0.5">
                Proyecto
              </p>
              <p className="text-sm font-semibold text-[#0F172A]">{cotizacion.nombre_proyecto}</p>
            </div>
            {cotizacion.ubicacion && (
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-widest text-neutral-500 mb-0.5">
                  Ubicación
                </p>
                <p className="text-sm text-[#0F172A]">{cotizacion.ubicacion}</p>
              </div>
            )}
          </section>

          {/* Sections + line items */}
          <div className="mb-6 space-y-6">
            {cotizacion.secciones.length === 0 && (
              <p className="text-sm text-neutral-500 italic">
                Esta cotización no tiene partidas registradas.
              </p>
            )}

            {cotizacion.secciones.map((seccion) => (
              <div key={seccion.id} className="print-avoid-break">
                {/* Section title */}
                <div className="mb-1 border-l-4 border-[#0369A1] pl-3">
                  <h2 className="text-sm font-semibold uppercase tracking-wide text-[#0F172A]">
                    {seccion.nombre}
                  </h2>
                </div>

                {/* Partidas table */}
                {seccion.partidas.length === 0 ? (
                  <p className="text-xs text-neutral-400 italic pl-3">Sin partidas.</p>
                ) : (
                  <table className="w-full border-collapse text-xs">
                    <thead>
                      <tr className="border-b border-neutral-200 text-[10px] uppercase tracking-wider text-neutral-500">
                        <th className="py-1.5 pr-2 text-left font-semibold w-[40%]">Concepto / Descripcion</th>
                        <th className="py-1.5 px-2 text-center font-semibold w-[10%]">Unidad</th>
                        <th className="py-1.5 px-2 text-right font-semibold tabular-nums w-[12%]">Cantidad</th>
                        <th className="py-1.5 px-2 text-right font-semibold tabular-nums w-[18%]">P. Unitario</th>
                        <th className="py-1.5 pl-2 text-right font-semibold tabular-nums w-[20%]">Importe</th>
                      </tr>
                    </thead>
                    <tbody>
                      {seccion.partidas.map((partida, idx) => {
                        const importe = partida.cantidad * partida.precio_unitario;
                        const isEven = idx % 2 === 0;
                        return (
                          <tr
                            key={partida.id}
                            className={`border-b border-neutral-100 print-avoid-break ${isEven ? 'bg-white' : 'bg-neutral-50 print:bg-white'}`}
                          >
                            <td className="py-1.5 pr-2 text-[#0F172A] leading-snug">
                              {partida.clave ? (
                                <span>
                                  <span className="font-medium text-neutral-400 mr-1">{partida.clave}</span>
                                  {partida.descripcion}
                                </span>
                              ) : (
                                partida.descripcion
                              )}
                            </td>
                            <td className="py-1.5 px-2 text-center text-neutral-600">
                              {partida.unidad || '—'}
                            </td>
                            <td className="py-1.5 px-2 text-right tabular-nums text-neutral-700">
                              {partida.cantidad.toLocaleString('es-MX')}
                            </td>
                            <td className="py-1.5 px-2 text-right tabular-nums text-neutral-700">
                              {formatCurrency(partida.precio_unitario)}
                            </td>
                            <td className="py-1.5 pl-2 text-right tabular-nums font-medium text-[#0F172A]">
                              {formatCurrency(importe)}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                )}
              </div>
            ))}
          </div>

          {/* Totals */}
          <div className="print-avoid-break flex justify-end mb-8">
            <div className="w-full max-w-xs">
              <dl className="text-sm">
                <div className="flex justify-between border-b border-neutral-100 py-1.5">
                  <dt className="text-neutral-600">Subtotal</dt>
                  <dd className="tabular-nums font-medium text-[#0F172A]">
                    {formatCurrency(totales.subtotal)}
                  </dd>
                </div>

                {cotizacion.descuento > 0 && (
                  <div className="flex justify-between border-b border-neutral-100 py-1.5">
                    <dt className="text-neutral-600">
                      Descuento ({cotizacion.descuento}%)
                    </dt>
                    <dd className="tabular-nums font-medium text-red-600">
                      -{formatCurrency(totales.descuentoMonto)}
                    </dd>
                  </div>
                )}

                {cotizacion.iva_enabled && (
                  <div className="flex justify-between border-b border-neutral-100 py-1.5">
                    <dt className="text-neutral-600">IVA (16%)</dt>
                    <dd className="tabular-nums font-medium text-[#0F172A]">
                      {formatCurrency(totales.ivaMonto)}
                    </dd>
                  </div>
                )}

                <div className="flex justify-between border-t-2 border-[#0F172A] pt-2 mt-1">
                  <dt className="text-base font-bold text-[#0F172A]">TOTAL</dt>
                  <dd className="text-base tabular-nums font-bold text-[#0F172A]">
                    {formatCurrency(totales.total)}
                  </dd>
                </div>
              </dl>
            </div>
          </div>

          {/* Footer: notes + validity */}
          <footer className="print-avoid-break border-t border-neutral-200 pt-5 space-y-4">
            {cotizacion.notas && (
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-widest text-neutral-500 mb-1">
                  Notas
                </p>
                <p className="text-xs text-neutral-700 whitespace-pre-wrap leading-relaxed">
                  {cotizacion.notas}
                </p>
              </div>
            )}

            <div className="border-t border-dashed border-neutral-200 pt-4">
              <p className="text-[10px] text-neutral-400 leading-relaxed">
                Esta cotización tiene una vigencia de 30 días naturales a partir de la fecha de emisión.
                Los precios están expresados en pesos mexicanos (MXN).
                {cotizacion.iva_enabled
                  ? ' Los precios incluyen IVA (16%).'
                  : ' Los precios no incluyen IVA.'}
                {` Para consultas o aclaraciones comuníquese con ${nombreEmpresa}.`}
              </p>
            </div>
          </footer>

        </div>
      </div>
    </>
  );
}
