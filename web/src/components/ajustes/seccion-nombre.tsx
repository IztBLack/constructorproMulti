'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button, Card, CardHeader, CardTitle, Field, Input } from '@/components/ui';
import { actualizarNombre } from '@/lib/auth/cuenta-actions';
import { EstadoFormulario } from './estado-formulario';

/**
 * Nombre a mostrar. Es lo que aparece en la barra superior.
 *
 * Formulario propio de un solo campo, y no un campo dentro de uno grande:
 * cambiar el nombre no tiene consecuencias (no manda correos, no cierra sesión),
 * mientras que el correo y la contraseña sí. Mezclarlos obligaría al usuario a
 * pensar qué está tocando en cada guardado.
 */
export function SeccionNombre({ nombreActual }: { nombreActual: string }) {
  const router = useRouter();
  const [valor, setValor] = useState(nombreActual);
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);

  // Nada que guardar si no se tocó: un botón activo que no hace nada es una
  // invitación a dudar de si el cambio se aplicó.
  const sinCambios = valor.trim() === nombreActual.trim() || valor.trim() === '';

  async function alEnviar(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setCargando(true);
    setError(null);
    setAviso(null);

    const resultado = await actualizarNombre(new FormData(e.currentTarget));
    setCargando(false);

    if (!resultado.ok) {
      setError(resultado.error ?? 'No se pudo guardar el nombre.');
      return;
    }
    setAviso(resultado.aviso ?? 'Listo.');
    // La barra superior se pinta en el servidor: hay que refrescarla para que el
    // nombre nuevo aparezca sin recargar a mano.
    router.refresh();
  }

  return (
    <Card>
      <CardHeader>
        <div>
          <CardTitle as="h3">Nombre a mostrar</CardTitle>
          <p className="mt-1 text-sm text-neutral-600">
            Así te ven los demás dentro de la aplicación.
          </p>
        </div>
      </CardHeader>

      <form onSubmit={alEnviar} className="space-y-4">
        <Field label="Nombre">
          <Input
            name="nombre"
            value={valor}
            onChange={(e) => setValor(e.target.value)}
            maxLength={60}
            required
            disabled={cargando}
            autoComplete="name"
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
