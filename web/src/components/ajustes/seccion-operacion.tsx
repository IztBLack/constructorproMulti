'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Button, Card, CardHeader, CardTitle, Field, Input } from '@/components/ui';
import { EstadoFormulario } from './estado-formulario';
import { actualizarIva } from '@/lib/auth/empresa-actions';

/**
 * Configuración de operación: IVA por defecto y accesos a los catálogos.
 *
 * Admin y supervisor.
 *
 * El aviso de que solo afecta a cotizaciones NUEVAS no es un tecnicismo: es la
 * diferencia entre una herramienta confiable y una que reescribe el pasado. Cada
 * cotización guarda la tasa con la que se hizo (columna `iva_porcentaje`,
 * migración 0017), así que una cotización aceptada al 16% sigue diciendo 16%
 * aunque mañana la empresa opere al 8% de la franja fronteriza.
 */
export function SeccionOperacion({ ivaActual }: { ivaActual: number }) {
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);

  async function alEnviar(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setCargando(true);
    setError(null);
    setAviso(null);

    const resultado = await actualizarIva(new FormData(e.currentTarget));
    setCargando(false);

    if (!resultado.ok) {
      setError(resultado.error ?? 'No se pudo guardar el IVA.');
      return;
    }
    setAviso(resultado.aviso ?? 'Listo.');
  }

  return (
    <Card>
      <CardHeader>
        <div>
          <CardTitle as="h3">IVA por defecto</CardTitle>
          <p className="mt-1 text-sm text-neutral-600">
            Tasa con la que nace cada cotización nueva.
          </p>
        </div>
      </CardHeader>

      <form onSubmit={alEnviar} className="space-y-4">
        <Field
          label="IVA por defecto (%)"
          hint="16 en casi todo el país, 8 en la franja fronteriza. Solo aplica a cotizaciones nuevas: las anteriores conservan la tasa con la que se hicieron."
        >
          <Input
            type="number"
            name="iva_porcentaje"
            step="0.01"
            min="0"
            max="100"
            defaultValue={ivaActual}
            required
            disabled={cargando}
          />
        </Field>

        {/* Aviso permanente, no un mensaje de resultado: mientras la app móvil
            siga calculando el 16% fijo (`repositories_cotizacion.dart`), cambiar
            este valor hace que web y celular muestren totales distintos para la
            MISMA cotización. Es una divergencia silenciosa —no falla nada, solo
            no cuadra— y hay que advertirla ANTES de guardar, no después. */}
        <EstadoFormulario
          tono="info"
          mensaje="Por ahora esto solo aplica en la web: la app móvil sigue calculando 16% fijo. Si cambias este valor, una misma cotización mostrará totales distintos en el celular hasta que se actualice la app."
        />

        <EstadoFormulario tono="error" mensaje={error} />
        <EstadoFormulario tono="exito" mensaje={aviso} />

        <Button type="submit" disabled={cargando}>
          {cargando ? 'Guardando…' : 'Guardar IVA'}
        </Button>
      </form>

      {/* Ajustes es la ÚNICA puerta a la configuración (la barra de navegación
          solo lleva secciones de uso diario), así que estos dos tienen que
          leerse como destinos, no como notas al pie: antes eran dos enlaces
          subrayados debajo del formulario del IVA y se perdían. */}
      <div className="mt-6 border-t border-neutral-200 pt-4">
        <p className="text-sm font-medium text-neutral-900">Catálogos</p>
        <p className="mb-3 text-sm text-neutral-600">
          Los datos base que alimentan cotizaciones y nómina.
        </p>
        <div className="grid gap-2 sm:grid-cols-2">
          <EnlaceCatalogo
            href="/admin/catalogo"
            titulo="Catálogo de conceptos"
            descripcion="Conceptos, unidades y precios base."
          />
          <EnlaceCatalogo
            href="/admin/puestos"
            titulo="Puestos y salarios"
            descripcion="Salario por día de cada puesto."
          />
        </div>
      </div>
    </Card>
  );
}

/**
 * Fila-destino de un catálogo. Toda la tarjeta es el área clicable (no solo el
 * texto): con Ajustes como única entrada a la configuración, llegar aquí no
 * puede depender de atinarle a un enlace de una línea.
 */
function EnlaceCatalogo({
  href,
  titulo,
  descripcion,
}: {
  href: string;
  titulo: string;
  descripcion: string;
}) {
  return (
    <Link
      href={href}
      className="flex min-h-11 items-center justify-between gap-3 rounded-lg border border-neutral-200 px-3 py-2 transition hover:border-neutral-300 hover:bg-neutral-50"
    >
      <span>
        <span className="block text-sm font-medium text-neutral-900">{titulo}</span>
        <span className="block text-xs text-neutral-500">{descripcion}</span>
      </span>
      <span aria-hidden className="shrink-0 text-neutral-400">
        →
      </span>
    </Link>
  );
}
