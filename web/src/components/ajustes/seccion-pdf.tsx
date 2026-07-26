'use client';

import { useState } from 'react';
import { Button, Card, CardHeader, CardTitle, Field, Input } from '@/components/ui';
import { EstadoFormulario } from './estado-formulario';
import { actualizarPdfConfig } from '@/lib/auth/empresa-actions';
import type { PdfConfig } from '@/lib/data/empresa-config';

/**
 * Personalización de los documentos (cotización en PDF, estado de cuenta, caja,
 * nómina). Incluye contacto, color, pie, marca de agua, MAYÚSCULAS, modo
 * compacto y firmas — las mismas opciones del móvil (salvo logo/firma en imagen,
 * que van a Storage y quedan para después). Se aplican en `documento-base.ts`.
 *
 * Vista previa en vivo: el color se ve aplicado antes de guardar, porque
 * elegir un hexadecimal a ciegas y abrir un PDF para saber cómo quedó es un
 * ciclo de prueba y error innecesario.
 */
export function SeccionPdf({ configActual }: { configActual: PdfConfig }) {
  const [contacto, setContacto] = useState(configActual.empresaContacto);
  const [color, setColor] = useState(configActual.colorHex);
  const [pie, setPie] = useState(configActual.pieDePagina);
  const [watermark, setWatermark] = useState(configActual.watermark);
  const [mayusculas, setMayusculas] = useState(configActual.mayusculas);
  const [compacto, setCompacto] = useState(configActual.modoCompacto);
  const [firmaIzq, setFirmaIzq] = useState(configActual.firmaIzquierda);
  const [firmaDer, setFirmaDer] = useState(configActual.firmaDerecha);
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);

  const colorValido = /^#[0-9a-fA-F]{6}$/.test(color);
  const sinCambios =
    contacto === configActual.empresaContacto &&
    color === configActual.colorHex &&
    pie === configActual.pieDePagina &&
    watermark === configActual.watermark &&
    mayusculas === configActual.mayusculas &&
    compacto === configActual.modoCompacto &&
    firmaIzq === configActual.firmaIzquierda &&
    firmaDer === configActual.firmaDerecha;

  async function alEnviar(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setCargando(true);
    setError(null);
    setAviso(null);

    const resultado = await actualizarPdfConfig(new FormData(e.currentTarget));
    setCargando(false);

    if (!resultado.ok) {
      setError(resultado.error ?? 'No se pudo guardar.');
      return;
    }
    setAviso(resultado.aviso ?? 'Listo.');
  }

  return (
    <Card>
      <CardHeader>
        <div>
          <CardTitle as="h3">Documentos</CardTitle>
          <p className="mt-1 text-sm text-neutral-600">
            Cómo se ven tus cotizaciones y estados de cuenta impresos.
          </p>
        </div>
      </CardHeader>

      <form onSubmit={alEnviar} className="space-y-4">
        <Field
          label="Contacto de la empresa"
          hint="Teléfono, correo o dirección. Se imprime bajo el nombre de la constructora."
        >
          <Input
            name="empresa_contacto"
            value={contacto}
            onChange={(e) => setContacto(e.target.value)}
            maxLength={120}
            placeholder="Tel. 55 1234 5678 · contacto@miconstructora.mx"
            disabled={cargando}
          />
        </Field>

        <Field
          label="Color de acento"
          error={!colorValido ? 'Usa un hexadecimal de 6 dígitos, por ejemplo #0369A1.' : undefined}
        >
          <div className="flex items-center gap-3">
            {/* El selector nativo y el texto editan el mismo valor: el selector
                para elegir a ojo, el texto para pegar un color de marca exacto. */}
            <input
              type="color"
              value={colorValido ? color : '#0369A1'}
              onChange={(e) => setColor(e.target.value)}
              disabled={cargando}
              aria-label="Elegir color de acento"
              className="h-11 w-14 shrink-0 cursor-pointer rounded-lg border border-neutral-300 bg-white p-1"
            />
            <Input
              name="color_hex"
              value={color}
              onChange={(e) => setColor(e.target.value)}
              maxLength={7}
              disabled={cargando}
              invalid={!colorValido}
              className="font-mono"
            />
          </div>
        </Field>

        <Field label="Pie de página" hint="Línea libre al final de cada documento. Opcional.">
          <Input
            name="pie_de_pagina"
            value={pie}
            onChange={(e) => setPie(e.target.value)}
            maxLength={160}
            placeholder="Gracias por su preferencia."
            disabled={cargando}
          />
        </Field>

        <Field
          label="Marca de agua"
          hint="Texto en diagonal detrás del documento (ej. BORRADOR, PAGADO). Vacío = sin marca."
        >
          <Input
            name="watermark"
            value={watermark}
            onChange={(e) => setWatermark(e.target.value)}
            maxLength={40}
            placeholder="BORRADOR"
            disabled={cargando}
          />
        </Field>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Firma izquierda" hint="Rótulo bajo la línea de firma. Vacío = sin firmas.">
            <Input
              name="firma_izquierda"
              value={firmaIzq}
              onChange={(e) => setFirmaIzq(e.target.value)}
              maxLength={60}
              placeholder="Autorizado por la obra"
              disabled={cargando}
            />
          </Field>
          <Field label="Firma derecha" hint="La otra línea de firma.">
            <Input
              name="firma_derecha"
              value={firmaDer}
              onChange={(e) => setFirmaDer(e.target.value)}
              maxLength={60}
              placeholder="Aceptado por el cliente"
              disabled={cargando}
            />
          </Field>
        </div>

        <div className="flex flex-wrap gap-x-6 gap-y-2">
          <label className="flex cursor-pointer items-center gap-2 text-sm text-neutral-700">
            <input
              type="checkbox"
              name="mayusculas"
              checked={mayusculas}
              onChange={(e) => setMayusculas(e.target.checked)}
              disabled={cargando}
              className="h-4 w-4 accent-neutral-900"
            />
            Todo en MAYÚSCULAS
          </label>
          <label className="flex cursor-pointer items-center gap-2 text-sm text-neutral-700">
            <input
              type="checkbox"
              name="modo_compacto"
              checked={compacto}
              onChange={(e) => setCompacto(e.target.checked)}
              disabled={cargando}
              className="h-4 w-4 accent-neutral-900"
            />
            Modo compacto (márgenes reducidos)
          </label>
        </div>

        {/* Vista previa: reproduce el encabezado real del documento. Va en
            `tema-papel` porque simula una hoja impresa (siempre blanca): sin esto,
            en modo oscuro la tarjeta se invertía a oscura mientras el color de
            acento (hex fijo) se quedaba igual, dejando el rótulo casi ilegible. */}
        <div className="tema-papel rounded-lg border border-neutral-200 bg-white p-4">
          <p className="mb-2 text-xs font-medium text-neutral-500">Vista previa</p>
          <div
            className="border-b-2 pb-2"
            style={{ borderColor: colorValido ? color : '#0369A1' }}
          >
            <p
              className="text-[10px] font-semibold uppercase tracking-widest"
              style={{ color: colorValido ? color : '#0369A1' }}
            >
              Cotización / Presupuesto
            </p>
            <p className="text-base font-bold text-neutral-900">Tu constructora</p>
            {contacto && <p className="text-xs text-neutral-600">{contacto}</p>}
          </div>
          {pie && <p className="mt-2 text-[10px] text-neutral-500">{pie}</p>}
        </div>

        <EstadoFormulario tono="error" mensaje={error} />
        <EstadoFormulario tono="exito" mensaje={aviso} />

        <Button type="submit" disabled={cargando || sinCambios || !colorValido}>
          {cargando ? 'Guardando…' : 'Guardar personalización'}
        </Button>
      </form>
    </Card>
  );
}
