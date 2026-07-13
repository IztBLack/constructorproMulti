import { notFound } from 'next/navigation';
import { formatCurrency, formatDate } from '@/lib/data/format';
import { getObraCliente, getEstadoCuentaObra } from '@/lib/data/portal-cliente';
import { PrintButton } from './print-button';

export const dynamic = 'force-dynamic';

// Folio corto: últimos 8 caracteres del UUID de la obra.
function folioCorto(id: string): string {
  return id.replace(/-/g, '').slice(-8).toUpperCase();
}

interface Props {
  params: Promise<{ id: string }>;
}

export default async function EstadoCuentaPdfPage({ params }: Props) {
  const { id } = await params;

  const obra = await getObraCliente(id);
  if (!obra) notFound();

  // Estado de cuenta REAL de la obra. Solo ENTRADAS (nunca SALIDA): lo garantiza
  // la RLS + el filtro en getEstadoCuentaObra.
  const { costoTotal, recibido, pendiente, pagadoPct, partidas, entradas } =
    await getEstadoCuentaObra(obra.id);

  const folio = folioCorto(obra.id);
  const hoy = Date.now();

  return (
    <>
      {/*
        Estilos de impresión inline para que la página sea autónoma incluso si
        globals.css no se carga en un contexto de impresión.
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

      <div className="min-h-screen bg-neutral-100 print:bg-white print:min-h-0">
        <div className="mx-auto max-w-[816px] bg-white px-10 py-10 print:px-0 print:py-0 print:max-w-none print:shadow-none shadow-md rounded-none sm:my-8 print:my-0">

          {/* ── Barra de acciones (solo pantalla) ── */}
          <PrintButton obraId={obra.id} />

          {/* Header */}
          <header className="print-avoid-break border-b-2 border-[#0F172A] pb-5 mb-6">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-xs font-semibold uppercase tracking-widest text-[#0369A1]">
                  Estado de cuenta
                </p>
                <h1 className="mt-1 text-2xl font-bold text-[#0F172A] leading-tight">
                  ConstructorPro
                </h1>
              </div>

              <div className="text-right shrink-0">
                <p className="text-xs text-neutral-500 uppercase tracking-wide">Folio de obra</p>
                <p className="font-mono text-base font-semibold text-[#0F172A] tabular-nums">
                  #{folio}
                </p>
                <p className="mt-1 text-xs text-neutral-500 uppercase tracking-wide">Emitido</p>
                <p className="text-sm font-medium text-[#0F172A]">{formatDate(hoy)}</p>
              </div>
            </div>
          </header>

          {/* Datos de la obra */}
          <section className="print-avoid-break mb-6 grid grid-cols-1 gap-3 sm:grid-cols-3 rounded-lg border border-neutral-200 bg-neutral-50 px-5 py-4 print:bg-white">
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-widest text-neutral-500 mb-0.5">
                Obra
              </p>
              <p className="text-sm font-semibold text-[#0F172A]">{obra.nombre}</p>
            </div>
            {obra.ubicacion && (
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-widest text-neutral-500 mb-0.5">
                  Ubicación
                </p>
                <p className="text-sm text-[#0F172A]">{obra.ubicacion}</p>
              </div>
            )}
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-widest text-neutral-500 mb-0.5">
                Inicio
              </p>
              <p className="text-sm text-[#0F172A]">{formatDate(obra.fecha_inicio)}</p>
            </div>
          </section>

          {/* Presupuesto (partidas) */}
          {partidas.length > 0 && (
            <div className="mb-6">
              <div className="mb-1 border-l-4 border-[#0369A1] pl-3">
                <h2 className="text-sm font-semibold uppercase tracking-wide text-[#0F172A]">
                  Presupuesto
                </h2>
              </div>
              <table className="w-full border-collapse text-xs">
                <thead>
                  <tr className="border-b border-neutral-200 text-[10px] uppercase tracking-wider text-neutral-500">
                    <th className="py-1.5 pr-2 text-left font-semibold w-[46%]">Concepto</th>
                    <th className="py-1.5 px-2 text-center font-semibold w-[10%]">Unidad</th>
                    <th className="py-1.5 px-2 text-right font-semibold tabular-nums w-[12%]">Cantidad</th>
                    <th className="py-1.5 px-2 text-right font-semibold tabular-nums w-[16%]">P. Unitario</th>
                    <th className="py-1.5 pl-2 text-right font-semibold tabular-nums w-[16%]">Importe</th>
                  </tr>
                </thead>
                <tbody>
                  {partidas.map((p, idx) => {
                    const importe = p.cantidad * p.precio_unitario;
                    const isEven = idx % 2 === 0;
                    return (
                      <tr
                        key={p.id}
                        className={`border-b border-neutral-100 print-avoid-break ${isEven ? 'bg-white' : 'bg-neutral-50 print:bg-white'}`}
                      >
                        <td className="py-1.5 pr-2 text-[#0F172A] leading-snug">{p.concepto}</td>
                        <td className="py-1.5 px-2 text-center text-neutral-600">
                          {p.unidad || '—'}
                        </td>
                        <td className="py-1.5 px-2 text-right tabular-nums text-neutral-700">
                          {p.cantidad.toLocaleString('es-MX')}
                        </td>
                        <td className="py-1.5 px-2 text-right tabular-nums text-neutral-700">
                          {formatCurrency(p.precio_unitario)}
                        </td>
                        <td className="py-1.5 pl-2 text-right tabular-nums font-medium text-[#0F172A]">
                          {formatCurrency(importe)}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}

          {/* Resumen financiero */}
          <div className="print-avoid-break flex justify-end mb-8">
            <div className="w-full max-w-xs">
              <dl className="text-sm">
                <div className="flex justify-between border-b border-neutral-100 py-1.5">
                  <dt className="text-neutral-600">Costo total</dt>
                  <dd className="tabular-nums font-medium text-[#0F172A]">
                    {formatCurrency(costoTotal)}
                  </dd>
                </div>
                <div className="flex justify-between border-b border-neutral-100 py-1.5">
                  <dt className="text-neutral-600">Pagado ({pagadoPct}%)</dt>
                  <dd className="tabular-nums font-medium text-green-700">
                    {formatCurrency(recibido)}
                  </dd>
                </div>
                <div className="flex justify-between border-t-2 border-[#0F172A] pt-2 mt-1">
                  <dt className="text-base font-bold text-[#0F172A]">Saldo pendiente</dt>
                  <dd className="text-base tabular-nums font-bold text-[#0F172A]">
                    {formatCurrency(pendiente)}
                  </dd>
                </div>
              </dl>
            </div>
          </div>

          {/* Historial de pagos (ENTRADAS) */}
          <div className="mb-8">
            <div className="mb-1 border-l-4 border-[#0369A1] pl-3">
              <h2 className="text-sm font-semibold uppercase tracking-wide text-[#0F172A]">
                Historial de pagos
              </h2>
            </div>
            {entradas.length === 0 ? (
              <p className="text-xs text-neutral-400 italic pl-3">Sin pagos registrados.</p>
            ) : (
              <table className="w-full border-collapse text-xs">
                <thead>
                  <tr className="border-b border-neutral-200 text-[10px] uppercase tracking-wider text-neutral-500">
                    <th className="py-1.5 pr-2 text-left font-semibold w-[18%]">Fecha</th>
                    <th className="py-1.5 px-2 text-left font-semibold w-[34%]">Concepto</th>
                    <th className="py-1.5 px-2 text-left font-semibold w-[16%]">Método</th>
                    <th className="py-1.5 px-2 text-left font-semibold w-[16%]">Referencia</th>
                    <th className="py-1.5 pl-2 text-right font-semibold tabular-nums w-[16%]">Monto</th>
                  </tr>
                </thead>
                <tbody>
                  {entradas.map((e, idx) => {
                    const isEven = idx % 2 === 0;
                    return (
                      <tr
                        key={e.id}
                        className={`border-b border-neutral-100 print-avoid-break ${isEven ? 'bg-white' : 'bg-neutral-50 print:bg-white'}`}
                      >
                        <td className="py-1.5 pr-2 text-neutral-700">{formatDate(e.fecha)}</td>
                        <td className="py-1.5 px-2 text-[#0F172A]">
                          {e.concepto?.trim() || e.categoria?.trim() || 'Pago'}
                        </td>
                        <td className="py-1.5 px-2 text-neutral-600">{e.metodo_pago?.trim() || '—'}</td>
                        <td className="py-1.5 px-2 text-neutral-600">{e.referencia?.trim() || '—'}</td>
                        <td className="py-1.5 pl-2 text-right tabular-nums font-medium text-green-700">
                          {formatCurrency(e.monto)}
                        </td>
                      </tr>
                    );
                  })}
                  <tr className="border-t-2 border-neutral-300">
                    <td colSpan={4} className="py-2 pr-2 text-right text-xs font-semibold text-neutral-700">
                      Total pagado
                    </td>
                    <td className="py-2 pl-2 text-right tabular-nums font-bold text-[#0F172A]">
                      {formatCurrency(recibido)}
                    </td>
                  </tr>
                </tbody>
              </table>
            )}
          </div>

          {/* Footer */}
          <footer className="print-avoid-break border-t border-neutral-200 pt-5">
            <p className="text-[10px] text-neutral-400 leading-relaxed">
              Estado de cuenta de la obra al {formatDate(hoy)}. Los importes están expresados en
              pesos mexicanos (MXN). Este documento refleja el presupuesto contratado y los pagos
              recibidos por ConstructorPro. Para cualquier aclaración comunícate con tu constructora.
            </p>
          </footer>

        </div>
      </div>
    </>
  );
}
