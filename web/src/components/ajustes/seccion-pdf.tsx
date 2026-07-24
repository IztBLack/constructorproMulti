'use client';

import { useState } from 'react';
import { Button, Card, CardHeader, CardTitle, Field, Input } from '@/components/ui';
import { EstadoFormulario } from './estado-formulario';
import { actualizarPdfConfig } from '@/lib/auth/empresa-actions';
import type { PdfConfig } from '@/lib/data/empresa-config';

/**
 * Personalización de los documentos (cotización en PDF, estado de cuenta).
 *
 * ALCANCE DELIBERADAMENTE CORTO. Solo contacto, color y pie de página. Faltan
 * el logo y la firma, que son imágenes y necesitan subida a Storage; y faltan
 * marca de agua, mayúsculas y modo compacto, que la app móvil sí tiene pero
 * cuyas vistas web todavía no saben aplicar. Se agregan cuando haya dónde
 * aplicarlos: un campo que se guarda pero no cambia nada es peor que no tenerlo.
 *
 * Vista previa en vivo: el color se ve aplicado antes de guardar, porque
 * elegir un hexadecimal a ciegas y tener que abrir un PDF para saber cómo quedó
 * es un ciclo de prueba y error innecesario.
 */
export function SeccionPdf({ configActual }: { configActual: PdfConfig }) {
  const [contacto, setContacto] = useState(configActual.empresaContacto);
  const [color, setColor] = useState(configActual.colorHex);
  const [pie, setPie] = useState(configActual.pieDePagina);
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);

  const colorValido = /^#[0-9a-fA-F]{6}$/.test(color);
  const sinCambios =
    contacto === configActual.empresaContacto &&
    color === configActual.colorHex &&
    pie === configActual.pieDePagina;

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
