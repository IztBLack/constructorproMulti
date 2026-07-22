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

      <div className="mt-6 border-t border-neutral-200 pt-4">
        <p className="mb-2 text-sm font-medium text-neutral-900">Catálogos</p>
        <div className="flex flex-wrap gap-3 text-sm">
          <Link href="/admin/catalogo" className="text-neutral-600 underline hover:text-neutral-900">
            Catálogo de conceptos
          </Link>
          <Link href="/admin/puestos" className="text-neutral-600 underline hover:text-neutral-900">
            Puestos y salarios
          </Link>
        </div>
      </div>
    </Card>
  );
}
