'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button, Card, CardHeader, CardTitle, Field, Input } from '@/components/ui';
import { actualizarNombreEmpresa } from '@/lib/auth/empresa-actions';
import { EstadoFormulario } from './estado-formulario';

/**
 * Nombre de la empresa. Solo admin.
 *
 * Hasta la migración 0017 esto era IMPOSIBLE de cambiar: `empresas` tenía
 * policies de lectura e inserción pero ninguna de UPDATE, así que un nombre mal
 * escrito en el onboarding se quedaba para siempre en la barra de todos los
 * usuarios y en el portal de los clientes.
 *
 * Se avisa de forma explícita que el cambio lo ven los clientes: es el tipo de
 * consecuencia que conviene decir ANTES, no descubrirla después.
 */
export function SeccionEmpresa({ nombreActual }: { nombreActual: string }) {
  const router = useRouter();
  const [valor, setValor] = useState(nombreActual);
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);

  const sinCambios = valor.trim() === nombreActual.trim() || valor.trim() === '';

  async function alEnviar(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setCargando(true);
    setError(null);
    setAviso(null);

    const resultado = await actualizarNombreEmpresa(new FormData(e.currentTarget));
    setCargando(false);

    if (!resultado.ok) {
      setError(resultado.error ?? 'No se pudo guardar.');
      return;
    }
    setAviso(resultado.aviso ?? 'Listo.');
    router.refresh();
  }

  return (
    <Card>
      <CardHeader>
        <div>
          <CardTitle as="h3">Nombre de la empresa</CardTitle>
          <p className="mt-1 text-sm text-neutral-600">
            Es la marca que aparece arriba a la izquierda, la que ven tus clientes
            en su portal y la que sale en tus documentos.
          </p>
        </div>
      </CardHeader>

      <form onSubmit={alEnviar} className="space-y-4">
        <Field label="Nombre" hint="Lo verán todos los usuarios y todos tus clientes.">
          <Input
            name="nombre"
            value={valor}
            onChange={(e) => setValor(e.target.value)}
            maxLength={80}
            required
            disabled={cargando}
          />
        </Field>

        <EstadoFormulario tono="error" mensaje={error} />
        <EstadoFormulario tono="exito" mensaje={aviso} />

        <Button type="submit" disabled={cargando || sinCambios}>
          {cargando ? 'Guardando…' : 'Guardar nombre'}
        </Button>
      </form>
    </Card>
  );
}
