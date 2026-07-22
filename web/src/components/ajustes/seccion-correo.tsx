'use client';

import { useState } from 'react';
import { Button, Card, CardHeader, CardTitle, Field, Input } from '@/components/ui';
import { EstadoFormulario } from './estado-formulario';
import { solicitarCambioCorreo } from '@/lib/auth/cuenta-actions';

/**
 * Cambio de correo.
 *
 * El correo NO cambia al enviar este formulario: Supabase manda un enlace de
 * confirmación y el cambio se aplica al abrirlo. La pantalla lo advierte antes
 * y después de enviar, porque es justo el punto donde el usuario cree que algo
 * falló y vuelve a intentarlo tres veces (y choca con el límite de envíos).
 */
export function SeccionCorreo({
  correoActual,
  destino,
}: {
  correoActual: string;
  /** A dónde vuelve tras confirmar: el portal desde el que se pidió el cambio. */
  destino: '/admin/ajustes' | '/cliente/ajustes';
}) {
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);

  async function alEnviar(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setCargando(true);
    setError(null);
    setAviso(null);

    const datos = new FormData(e.currentTarget);
    datos.set('destino', destino);

    const resultado = await solicitarCambioCorreo(datos);
    setCargando(false);

    if (!resultado.ok) {
      setError(resultado.error ?? 'No se pudo pedir el cambio de correo.');
      return;
    }
    setAviso(resultado.aviso ?? 'Revisa tu correo.');
  }

  return (
    <Card>
      <CardHeader>
        <div>
          <CardTitle as="h3">Correo</CardTitle>
          <p className="mt-1 text-sm text-neutral-600">
            Es con el que inicias sesión. Ahora mismo:{' '}
            <span className="font-medium text-neutral-900">{correoActual}</span>
          </p>
        </div>
      </CardHeader>

      <form onSubmit={alEnviar} className="space-y-4">
        <Field
          label="Correo nuevo"
          hint="Te llegará un enlace de confirmación. El correo no cambia hasta que lo abras."
        >
          <Input
            type="email"
            name="correo"
            autoComplete="email"
            placeholder="nuevo@correo.com"
            required
            disabled={cargando}
          />
        </Field>

        <EstadoFormulario tono="error" mensaje={error} />
        <EstadoFormulario tono="info" mensaje={aviso} />

        <Button type="submit" disabled={cargando}>
          {cargando ? 'Enviando…' : 'Enviar confirmación'}
        </Button>
      </form>
    </Card>
  );
}
