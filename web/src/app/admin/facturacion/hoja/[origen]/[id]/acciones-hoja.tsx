'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button, Card, Field, Input, Select, Textarea } from '@/components/ui';
import { EstadoFormulario } from '@/components/ajustes/estado-formulario';
import { createClient } from '@/lib/supabase/client';
import { FORMAS_PAGO, METODOS_PAGO, USOS_CFDI } from '@/lib/fiscal/catalogos';
import type { CobroFiscal, EstadoFiscal, IvaModo, OrigenCobro } from '@/lib/fiscal/tipos';
import {
  cambiarEstadoCobroAction,
  guardarAjustesCobroAction,
  registrarFolioAction,
  registrarPdfAction,
  subirXmlAction,
  urlSubidaPdfAction,
} from '../../../actions';

type Resultado = { ok: boolean; error?: string; aviso?: string };

function useAccion() {
  const router = useRouter();
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  async function correr(fn: () => Promise<Resultado>, alTerminar?: () => void) {
    setCargando(true);
    setError(null);
    setAviso(null);
    try {
      const r = await fn();
      if (!r.ok) setError(r.error ?? 'No se pudo.');
      else {
        setAviso(r.aviso ?? 'Listo.');
        alTerminar?.();
        router.refresh();
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo.');
    } finally {
      setCargando(false);
    }
  }
  return { cargando, error, aviso, correr };
}

const archivo = (ruta: string) => `/admin/facturacion/archivo?ruta=${encodeURIComponent(ruta)}`;

/**
 * Cerrar el ciclo (RF1b.6) y ajustar la hoja. Todo lo de aquí escribe en
 * `cobro_fiscal`, que solo admin y contador pueden tocar (RLS de 0037).
 */
export function AccionesHoja({
  origen,
  id,
  estado,
  esComplemento,
  fiscal,
  ivaModo,
  retIsr,
  retIva,
}: {
  origen: OrigenCobro;
  id: string;
  estado: EstadoFiscal;
  esComplemento: boolean;
  fiscal: CobroFiscal | null;
  ivaModo: IvaModo;
  retIsr: number;
  retIva: number;
}) {
  const xml = useAccion();
  const folio = useAccion();
  const pdf = useAccion();
  const ajustes = useAccion();
  const est = useAccion();
  const [pdfArchivo, setPdfArchivo] = useState<File | null>(null);

  const yaCerrado = esComplemento ? !!fiscal?.complemento_uuid : estado === 'facturado';

  async function subirPdf(): Promise<Resultado> {
    if (!pdfArchivo) return { ok: false, error: 'Elige el PDF.' };
    if (pdfArchivo.type !== 'application/pdf') return { ok: false, error: 'Solo archivos PDF.' };
    const prep = await urlSubidaPdfAction(origen, id, pdfArchivo.size);
    if (!prep.ok || !prep.ruta || !prep.token) return { ok: false, error: prep.error };
    const { error } = await createClient()
      .storage.from('fiscal')
      .uploadToSignedUrl(prep.ruta, prep.token, pdfArchivo, { contentType: 'application/pdf' });
    if (error) return { ok: false, error: `No se pudo subir: ${error.message}` };
    return registrarPdfAction(origen, id, prep.ruta);
  }

  return (
    <div className="space-y-6">
      <Card>
        <h2 className="text-base font-semibold text-neutral-900">
          {esComplemento ? 'Ya hice el complemento de pago' : 'Ya la facturé'}
        </h2>
        <p className="mt-1 text-sm text-neutral-600">
          Sube el XML que te dio el SAT o tu sistema de facturación: la app lo lee y llena el folio,
          la fecha y el total. Si no lo tienes a la mano, pega solo el folio fiscal (UUID).
        </p>

        {yaCerrado && (
          <div className="mt-3 rounded-lg border border-green-200 bg-green-50 p-3 text-sm text-green-800">
            <p>
              <span aria-hidden="true">✓ </span>
              {esComplemento ? 'Complemento' : 'Factura'}:{' '}
              <span className="font-mono">{esComplemento ? fiscal?.complemento_uuid : fiscal?.uuid}</span>
            </p>
            <p className="mt-1 flex flex-wrap gap-3">
              {fiscal?.xml_path && (
                <a href={archivo(fiscal.xml_path)} target="_blank" rel="noopener noreferrer" className="inline-flex min-h-11 items-center underline">
                  Ver XML
                </a>
              )}
              {fiscal?.complemento_xml_path && (
                <a href={archivo(fiscal.complemento_xml_path)} target="_blank" rel="noopener noreferrer" className="inline-flex min-h-11 items-center underline">
                  Ver XML del complemento
                </a>
              )}
              {fiscal?.pdf_path && (
                <a href={archivo(fiscal.pdf_path)} target="_blank" rel="noopener noreferrer" className="inline-flex min-h-11 items-center underline">
                  Ver PDF de la factura
                </a>
              )}
            </p>
          </div>
        )}

        <div className="mt-4 grid gap-6 md:grid-cols-2">
          <form
            onSubmit={(e) => {
              e.preventDefault();
              const datos = new FormData(e.currentTarget);
              const form = e.currentTarget;
              void xml.correr(() => subirXmlAction(origen, id, datos), () => form.reset());
            }}
            className="space-y-3"
          >
            <Field label="Subir XML" hint="El archivo .xml timbrado (CFDI 4.0).">
              <Input type="file" name="xml" accept=".xml,application/xml,text/xml" required className="min-h-11" />
            </Field>
            <Button type="submit" disabled={xml.cargando}>
              {xml.cargando ? 'Leyendo…' : 'Subir XML'}
            </Button>
            <EstadoFormulario tono="error" mensaje={xml.error} />
            <EstadoFormulario tono="exito" mensaje={xml.aviso} />
          </form>

          <form
            onSubmit={(e) => {
              e.preventDefault();
              const datos = new FormData(e.currentTarget);
              void folio.correr(() => registrarFolioAction(origen, id, datos));
            }}
            className="space-y-3"
          >
            <Field label="O pega el folio fiscal (UUID)" hint="32 letras y números: 8-4-4-4-12.">
              <Input name="uuid" required maxLength={40} autoComplete="off" spellCheck={false} className="font-mono uppercase" />
            </Field>
            <Button type="submit" variant="secondary" disabled={folio.cargando}>
              {folio.cargando ? 'Guardando…' : 'Guardar folio'}
            </Button>
            <EstadoFormulario tono="error" mensaje={folio.error} />
            <EstadoFormulario tono="exito" mensaje={folio.aviso} />
          </form>
        </div>

        {estado === 'facturado' && !esComplemento && (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              void pdf.correr(subirPdf, () => setPdfArchivo(null));
            }}
            className="mt-6 space-y-3 border-t border-neutral-100 pt-4"
          >
            <Field label="PDF de la factura (opcional)" hint="Para mandárselo al contador en el paquete.">
              <Input
                type="file"
                accept="application/pdf,.pdf"
                onChange={(e) => setPdfArchivo(e.target.files?.[0] ?? null)}
                className="min-h-11"
              />
            </Field>
            <Button type="submit" variant="secondary" disabled={pdf.cargando || !pdfArchivo}>
              {pdf.cargando ? 'Subiendo…' : 'Subir PDF'}
            </Button>
            <EstadoFormulario tono="error" mensaje={pdf.error} />
            <EstadoFormulario tono="exito" mensaje={pdf.aviso} />
          </form>
        )}
      </Card>

      {!esComplemento && estado !== 'facturado' && (
        <Card>
          <h2 className="text-base font-semibold text-neutral-900">Ajustar la hoja</h2>
          <p className="mt-1 text-sm text-neutral-600">
            Lo que dejes vacío lo sugiere la app. Lo que cambies aquí se queda para este cobro.
          </p>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              const datos = new FormData(e.currentTarget);
              void ajustes.correr(() => guardarAjustesCobroAction(origen, id, datos));
            }}
            className="mt-4 grid gap-4 sm:grid-cols-2"
          >
            <Field label="IVA">
              <Select name="iva_modo" defaultValue={fiscal?.iva_modo ?? ''}>
                <option value="">Sugerido ({ivaModo === 'aparte' ? 'va encima' : 'ya incluido'})</option>
                <option value="incluido">Lo que cobré ya trae IVA</option>
                <option value="aparte">El IVA va encima de lo que cobré</option>
                <option value="sin_iva">No lleva IVA (exento)</option>
              </Select>
            </Field>
            <Field label="Método de pago">
              <Select name="metodo_pago" defaultValue={fiscal?.metodo_pago ?? ''}>
                <option value="">Sugerido</option>
                {METODOS_PAGO.map((m) => (
                  <option key={m.clave} value={m.clave}>
                    {m.clave} · {m.llano}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Forma de pago">
              <Select name="forma_pago" defaultValue={fiscal?.forma_pago ?? ''}>
                <option value="">Sugerida (según cómo te pagaron)</option>
                {FORMAS_PAGO.map((fp) => (
                  <option key={fp.clave} value={fp.clave}>
                    {fp.clave} · {fp.texto}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Uso del CFDI">
              <Select name="uso_cfdi" defaultValue={fiscal?.uso_cfdi ?? ''}>
                <option value="">El de los datos del cliente</option>
                {USOS_CFDI.map((u) => (
                  <option key={u.clave} value={u.clave}>
                    {u.clave} · {u.texto}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Retención de ISR (%)" hint={`Ahora: ${retIsr}%. Vacío = sugerido.`}>
              <Input name="ret_isr_pct" inputMode="decimal" defaultValue={fiscal?.ret_isr_pct ?? ''} />
            </Field>
            <Field label="Retención de IVA (%)" hint={`Ahora: ${retIva}%. Vacío = sugerido.`}>
              <Input name="ret_iva_pct" inputMode="decimal" defaultValue={fiscal?.ret_iva_pct ?? ''} />
            </Field>
            <Field label="Notas para el contador" className="sm:col-span-2">
              <Textarea name="notas" rows={2} maxLength={2000} defaultValue={fiscal?.notas ?? ''} />
            </Field>
            <div className="space-y-3 sm:col-span-2">
              <EstadoFormulario tono="error" mensaje={ajustes.error} />
              <EstadoFormulario tono="exito" mensaje={ajustes.aviso} />
              <Button type="submit" variant="secondary" disabled={ajustes.cargando}>
                {ajustes.cargando ? 'Guardando…' : 'Guardar ajustes'}
              </Button>
            </div>
          </form>
        </Card>
      )}

      <Card>
        <h2 className="text-base font-semibold text-neutral-900">¿Este cobro no lleva factura?</h2>
        <p className="mt-1 text-sm text-neutral-600">
          Márcalo y deja de salir en lo pendiente. Tus datos no se borran.
        </p>
        <div className="mt-3 flex flex-wrap gap-2">
          {estado !== 'no_requiere' ? (
            <Button
              type="button"
              variant="secondary"
              disabled={est.cargando}
              onClick={() => void est.correr(() => cambiarEstadoCobroAction(origen, id, 'no_requiere'))}
            >
              No requiere factura
            </Button>
          ) : null}
          {estado !== 'por_facturar' ? (
            <Button
              type="button"
              variant="ghost"
              disabled={est.cargando}
              onClick={() => void est.correr(() => cambiarEstadoCobroAction(origen, id, 'por_facturar'))}
            >
              Regresar a «por facturar»
            </Button>
          ) : null}
        </div>
        {estado === 'facturado' && (
          <p className="mt-2 text-xs text-neutral-600">
            Regresarlo a «por facturar» quita el folio y los archivos ligados (por ejemplo, si cancelaste la factura).
          </p>
        )}
        <EstadoFormulario tono="error" mensaje={est.error} />
      </Card>
    </div>
  );
}
