'use client';

import { useRef, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Button, Card, CardHeader, CardTitle } from '@/components/ui';
import { createClient } from '@/lib/supabase/client';
import { formatCurrency, formatDate } from '@/lib/data/format';
import type { ResumenFactura } from '@/lib/compras/tipos';
import {
  crearUrlSubidaFacturaPdf,
  quitarFacturaAction,
  registrarFacturaPdfAction,
  subirFacturaXmlAction,
} from '../../actions';

interface Factura {
  uuid: string;
  rfc: string | null;
  total: number | null;
  iva: number | null;
  fecha: number | null;
  xml: string | null;
  pdf: string | null;
  resumen: ResumenFactura | null;
}

/**
 * Factura del proveedor (CFDI 4.0): se sube el XML, la app lo lee (folio
 * fiscal, RFC, total, IVA, conceptos) y lo liga a la orden. Alimenta la hoja
 * "Gastos por obra" del paquete del contador. Admin y contador.
 */
export function FacturaProveedor({ ordenId, factura }: { ordenId: string; factura: Factura | null }) {
  const router = useRouter();
  const xmlRef = useRef<HTMLInputElement>(null);
  const pdfRef = useRef<HTMLInputElement>(null);
  const [error, setError] = useState<string | null>(null);
  const [avisos, setAvisos] = useState<string[]>([]);
  const [pendiente, startTransition] = useTransition();

  function subirXml(f: File) {
    setError(null);
    setAvisos([]);
    const fd = new FormData();
    fd.set('xml', f);
    startTransition(async () => {
      const r = await subirFacturaXmlAction(ordenId, fd);
      if (xmlRef.current) xmlRef.current.value = '';
      if (!r.ok) {
        setError(r.error ?? 'No se pudo leer la factura.');
        return;
      }
      setAvisos(r.avisos ?? []);
      router.refresh();
    });
  }

  function subirPdf(f: File) {
    setError(null);
    if (f.type !== 'application/pdf') {
      setError('Elige el PDF de la factura.');
      return;
    }
    startTransition(async () => {
      const prep = await crearUrlSubidaFacturaPdf(ordenId, f.size);
      if (!prep.ok || !prep.path || !prep.token) {
        setError(prep.error ?? 'No se pudo preparar la subida.');
        return;
      }
      const supabase = createClient();
      const { error: e } = await supabase.storage
        .from('compras')
        .uploadToSignedUrl(prep.path, prep.token, f, { contentType: 'application/pdf' });
      if (pdfRef.current) pdfRef.current.value = '';
      if (e) {
        setError(`No se pudo subir: ${e.message}`);
        return;
      }
      const r = await registrarFacturaPdfAction(ordenId, prep.path);
      if (!r.ok) setError(r.error ?? 'No se pudo guardar el PDF.');
      else router.refresh();
    });
  }

  const enlace = (ruta: string, texto: string) => (
    <a
      className="inline-flex min-h-11 items-center font-medium text-blue-700 underline"
      href={`/admin/compras/archivo?ruta=${encodeURIComponent(ruta)}`}
      target="_blank"
      rel="noopener noreferrer"
    >
      {texto}
    </a>
  );

  return (
    <Card>
      <CardHeader>
        <div>
          <CardTitle as="h2">Factura del proveedor</CardTitle>
          <p className="mt-1 text-sm text-neutral-600">
            Sube el XML: la app lo lee y lo manda al paquete del contador. Un mismo folio fiscal no se puede ligar a dos
            órdenes.
          </p>
        </div>
      </CardHeader>

      {factura ? (
        <div className="space-y-3 text-sm">
          <dl className="grid gap-2 sm:grid-cols-2">
            <Dato etiqueta="Folio fiscal" valor={factura.uuid} mono />
            <Dato etiqueta="RFC del proveedor" valor={factura.rfc ?? '—'} />
            <Dato etiqueta="Fecha" valor={formatDate(factura.fecha)} />
            <Dato
              etiqueta="Total · IVA"
              valor={`${formatCurrency(factura.total ?? 0)} · ${formatCurrency(factura.iva ?? 0)}`}
            />
          </dl>
          {factura.resumen && factura.resumen.conceptos.length > 0 && (
            <details>
              <summary className="min-h-11 cursor-pointer py-2 font-medium text-neutral-800">
                Conceptos de la factura ({factura.resumen.conceptos.length})
              </summary>
              <ul className="mt-1 space-y-1 text-neutral-700">
                {factura.resumen.conceptos.map((c, i) => (
                  <li key={i}>
                    {c.cantidad} {c.unidad} · {c.descripcion} · {formatCurrency(c.importe)}
                    {c.clave ? <span className="text-neutral-600"> (clave {c.clave})</span> : null}
                  </li>
                ))}
              </ul>
            </details>
          )}
          <div className="flex flex-wrap items-center gap-3">
            {factura.xml && enlace(factura.xml, 'Ver XML')}
            {factura.pdf ? enlace(factura.pdf, 'Ver PDF') : <span className="text-neutral-600">Sin PDF</span>}
          </div>
        </div>
      ) : (
        <p className="text-sm text-neutral-600">Esta orden todavía no tiene factura.</p>
      )}

      <div className="mt-4 flex flex-wrap gap-2">
        <input
          ref={xmlRef}
          type="file"
          accept=".xml,application/xml,text/xml"
          className="sr-only"
          aria-label="XML de la factura"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) subirXml(f);
          }}
        />
        <Button size="sm" variant={factura ? 'secondary' : 'primary'} disabled={pendiente} onClick={() => xmlRef.current?.click()}>
          {pendiente ? 'Leyendo…' : factura ? 'Cambiar XML' : 'Subir XML de la factura'}
        </Button>
        {factura && (
          <>
            <input
              ref={pdfRef}
              type="file"
              accept="application/pdf"
              className="sr-only"
              aria-label="PDF de la factura"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) subirPdf(f);
              }}
            />
            <Button size="sm" variant="secondary" disabled={pendiente} onClick={() => pdfRef.current?.click()}>
              {factura.pdf ? 'Cambiar PDF' : 'Subir PDF'}
            </Button>
            <Button
              size="sm"
              variant="ghost"
              disabled={pendiente}
              onClick={() => {
                if (!window.confirm('¿Quitar la factura de esta orden? Se borran el XML y el PDF.')) return;
                startTransition(async () => {
                  const r = await quitarFacturaAction(ordenId);
                  if (!r.ok) setError(r.error ?? 'No se pudo quitar.');
                  else router.refresh();
                });
              }}
            >
              Quitar factura
            </Button>
          </>
        )}
      </div>
      {avisos.length > 0 && (
        <ul role="status" className="mt-3 space-y-1 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-900">
          {avisos.map((a, i) => (
            <li key={i}>{a}</li>
          ))}
        </ul>
      )}
      {error && (
        <p role="alert" className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </p>
      )}
    </Card>
  );
}

function Dato({ etiqueta, valor, mono = false }: { etiqueta: string; valor: string; mono?: boolean }) {
  return (
    <div>
      <dt className="text-xs font-medium text-neutral-600">{etiqueta}</dt>
      <dd className={`text-neutral-900 ${mono ? 'break-all font-mono text-xs' : ''}`}>{valor}</dd>
    </div>
  );
}
