import Link from 'next/link';
import { notFound } from 'next/navigation';
import { Card, EmptyState, PageHeader, buttonClassName } from '@/components/ui';
import { BotonCopiar } from '@/components/fiscal/boton-copiar';
import { EstadoFiscalBadge } from '@/components/fiscal/estado-fiscal';
import { getAccesoFiscal, getEntradaHoja } from '@/lib/data/fiscal';
import { formatCurrency, formatDate } from '@/lib/data/format';
import { LEYENDA_NO_ES_FACTURA, LEYENDA_SUGERENCIA } from '@/lib/fiscal/catalogos';
import { armarHoja, hojaComoTexto, type AvisoHoja, type CampoHoja } from '@/lib/fiscal/hoja';
import { estadoDe, esOrigenCobro } from '@/lib/fiscal/tipos';
import { AccionesHoja } from './acciones-hoja';
import { ClavesConcepto } from './claves-concepto';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Hoja para facturar' };

const ESTILO_AVISO: Record<AvisoHoja['tipo'], { clase: string; icono: string; rol: string }> = {
  ok: { clase: 'border-green-200 bg-green-50 text-green-800', icono: '✓', rol: 'Listo' },
  atencion: { clase: 'border-amber-200 bg-amber-50 text-amber-900', icono: '!', rol: 'Atención' },
  info: { clase: 'border-blue-200 bg-blue-50 text-blue-800', icono: 'i', rol: 'Nota' },
};

/**
 * Hoja para facturar (RF1b.4): los datos de UN cobro en el orden del facturador
 * del SAT (Emisor → Receptor → Conceptos → Pago), cada uno con su botón de
 * copiar. Al final, cómo cerrar el ciclo: pegar el folio o subir el XML.
 */
export default async function HojaFacturarPage({
  params,
}: {
  params: Promise<{ origen: string; id: string }>;
}) {
  const { origen, id } = await params;
  if (!esOrigenCobro(origen)) notFound();

  const acceso = await getAccesoFiscal();
  if (!acceso.puede) {
    return (
      <EmptyState
        title="Solo el administrador y el contador ven los datos para facturar"
        description="Si necesitas una factura, pídesela al administrador."
      />
    );
  }

  const entrada = await getEntradaHoja(origen, id);
  if (!entrada) notFound();
  const hoja = armarHoja(entrada);
  const { cobro } = entrada;
  const f = cobro.fiscal;
  const estado = estadoDe(cobro);
  const volverA = `/admin/facturacion/hoja/${origen}/${id}`;
  const documentoHref =
    origen === 'pago' ? `/admin/cotizaciones/${cobro.documentoId}` : `/admin/obras/${cobro.documentoId}`;

  return (
    <div className="space-y-6">
      <div>
        <Link href="/admin/facturacion" className="inline-flex min-h-11 items-center text-sm text-neutral-600 hover:underline">
          ← Facturación
        </Link>
      </div>

      <PageHeader
        eyebrow={`${origen === 'pago' ? 'Cotización' : 'Obra'}: ${cobro.documentoNombre}`}
        title={hoja.titulo}
        description={`Cobro del ${formatDate(cobro.fecha)} · ${cobro.concepto || 'Sin concepto'} · ${formatCurrency(cobro.monto)}`}
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <EstadoFiscalBadge estado={estado} />
            <BotonCopiar valor={hojaComoTexto(hoja)} etiqueta="toda la hoja" texto="Copiar todo" />
            <a href={`${volverA}/pdf?disp=inline`} target="_blank" rel="noopener noreferrer" className={buttonClassName('secondary')}>
              PDF
            </a>
          </div>
        }
      />

      <p className="rounded-xl border border-neutral-300 bg-neutral-50 p-3 text-sm font-medium text-neutral-800">
        {LEYENDA_NO_ES_FACTURA} Es una guía para capturar la factura en el portal del SAT o en tu sistema.
      </p>

      {hoja.faltantes.length > 0 && (
        <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-800" role="alert">
          <p className="font-medium">Te falta:</p>
          <ul className="mt-1 list-disc pl-5">
            {hoja.faltantes.map((x) => (
              <li key={x}>{x}</li>
            ))}
          </ul>
          <p className="mt-2">
            Tus datos van en{' '}
            <Link href="/admin/ajustes#fiscal" className="underline">
              Ajustes
            </Link>
            ; los de tu cliente, en{' '}
            {cobro.clienteId ? (
              <Link href={`/admin/clientes/${cobro.clienteId}`} className="underline">
                su ficha
              </Link>
            ) : (
              <Link href={documentoHref} className="underline">
                la {origen === 'pago' ? 'cotización' : 'obra'} (ponle un cliente)
              </Link>
            )}
            .
          </p>
        </div>
      )}

      {hoja.avisos.length > 0 && (
        <ul className="space-y-2">
          {hoja.avisos.map((a) => (
            <li key={a.texto} className={`flex gap-2 rounded-xl border p-3 text-sm ${ESTILO_AVISO[a.tipo].clase}`}>
              <span aria-hidden="true" className="font-bold">{ESTILO_AVISO[a.tipo].icono}</span>
              <span>
                <span className="sr-only">{ESTILO_AVISO[a.tipo].rol}: </span>
                {a.texto}
              </span>
            </li>
          ))}
        </ul>
      )}

      <Paso numero={1} titulo="Emisor" subtitulo="Tus datos">
        <Campos campos={hoja.emisor} />
      </Paso>

      <Paso numero={2} titulo="Receptor" subtitulo="Tu cliente">
        <Campos campos={hoja.receptor} />
      </Paso>

      <Paso numero={3} titulo="Conceptos" subtitulo={hoja.tipo === 'complemento' ? 'En un complemento va un solo concepto fijo' : 'Lo que cobras'}>
        <ol className="space-y-4">
          {hoja.conceptos.map((c, i) => (
            <li key={`${c.origen?.id ?? 'c'}-${i}`} className="rounded-lg border border-neutral-200 p-3">
              <p className="mb-2 text-sm font-medium text-neutral-900">
                Concepto {i + 1}: {c.descripcion}
              </p>
              <Campos
                campos={[
                  { etiqueta: 'Clave de producto o servicio', valor: c.claveProdServ, sugerido: c.claveSugerida },
                  { etiqueta: 'Clave de unidad', valor: c.claveUnidad, ayuda: c.unidad, sugerido: c.unidadSugerida },
                  { etiqueta: 'Cantidad', valor: String(c.cantidad) },
                  { etiqueta: 'Descripción', valor: c.descripcion },
                  { etiqueta: 'Valor unitario', valor: c.valorUnitario.toFixed(2) },
                  { etiqueta: 'Importe', valor: c.importe.toFixed(2) },
                  {
                    etiqueta: 'Objeto de impuesto',
                    valor: c.objetoImpuesto,
                    ayuda: c.objetoImpuesto === '02' ? 'Sí objeto de impuesto' : 'No objeto de impuesto',
                  },
                ]}
              />
              {c.origen && hoja.tipo === 'factura' && (
                <ClavesConcepto
                  tabla={c.origen.tabla}
                  id={c.origen.id}
                  clave={c.claveSugerida ? '' : c.claveProdServ}
                  unidad={c.unidadSugerida ? '' : c.claveUnidad}
                  volverA={volverA}
                />
              )}
            </li>
          ))}
        </ol>
        {hoja.conceptos.some((c) => c.claveSugerida || c.unidadSugerida) && (
          <p className="mt-3 text-xs text-neutral-600">Las marcadas «sugerida» son de la app. {LEYENDA_SUGERENCIA}</p>
        )}
      </Paso>

      <Paso numero={4} titulo="Pago" subtitulo={hoja.tipo === 'complemento' ? 'Datos del complemento' : 'Forma, método y totales'}>
        <Campos campos={hoja.pago} />
      </Paso>

      {hoja.notas.length > 0 && (
        <Card>
          <h2 className="mb-2 text-base font-semibold text-neutral-900">Para que no te la rechacen</h2>
          <ul className="list-disc space-y-2 pl-5 text-sm text-neutral-700">
            {hoja.notas.map((n) => (
              <li key={n}>{n}</li>
            ))}
          </ul>
        </Card>
      )}

      <AccionesHoja
        origen={origen}
        id={id}
        estado={estado}
        esComplemento={hoja.tipo === 'complemento'}
        fiscal={f}
        ivaModo={hoja.ivaModo}
        retIsr={hoja.desglose.retIsrPct}
        retIva={hoja.desglose.retIvaPct}
      />

      <p className="text-xs text-neutral-500">{LEYENDA_NO_ES_FACTURA}</p>
    </div>
  );
}

function Paso({
  numero,
  titulo,
  subtitulo,
  children,
}: {
  numero: number;
  titulo: string;
  subtitulo: string;
  children: React.ReactNode;
}) {
  return (
    <Card>
      <h2 className="mb-3 flex items-baseline gap-2 text-base font-semibold text-neutral-900">
        <span className="inline-flex h-7 w-7 items-center justify-center rounded-full bg-neutral-900 text-sm text-white" aria-hidden="true">
          {numero}
        </span>
        <span>
          <span className="sr-only">Paso {numero}: </span>
          {titulo}
        </span>
        <span className="text-sm font-normal text-neutral-500">· {subtitulo}</span>
      </h2>
      {children}
    </Card>
  );
}

function Campos({ campos }: { campos: CampoHoja[] }) {
  return (
    <dl className="divide-y divide-neutral-100">
      {campos.map((c) => (
        <div key={c.etiqueta} className="flex flex-wrap items-center justify-between gap-2 py-2">
          <div className="min-w-0 flex-1">
            <dt className="text-xs font-medium text-neutral-600">
              {c.etiqueta}
              {c.sugerido && (
                <span className="ml-2 rounded bg-amber-100 px-1.5 py-0.5 text-[11px] font-medium text-amber-900">sugerida</span>
              )}
            </dt>
            <dd className={`break-words font-mono text-sm ${c.falta ? 'text-red-700' : 'text-neutral-900'}`}>
              {c.valor || 'Falta'}
              {c.ayuda && <span className="ml-2 font-sans text-xs text-neutral-600">{c.ayuda}</span>}
            </dd>
          </div>
          <BotonCopiar valor={c.valor} etiqueta={c.etiqueta} />
        </div>
      ))}
    </dl>
  );
}
