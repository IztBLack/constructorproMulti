'use client';

import { useTransition, useState } from 'react';
import { PageHeader, Card, Field, Input, Button } from '@/components/ui';
import { EstadoFormulario } from '@/components/ajustes/estado-formulario';
import { crearEmpresa, canjearInvitacion } from './actions';

type Camino = 'invitacion' | 'empresa';

/**
 * Primera pantalla de quien todavía no pertenece a ninguna empresa.
 *
 * ORDEN DE LAS OPCIONES: "Tengo un código" va PRIMERO y viene seleccionada. De
 * aquí en adelante, la inmensa mayoría de quien llegue a esta pantalla será
 * gente invitada —supervisores, colaboradores, clientes—, no dueños fundando su
 * constructora, que es algo que ocurre una vez. Cuando "Crear empresa" era la
 * única opción, el invitado hacía lo único que podía y terminaba con una empresa
 * vacía y sin acceso a los datos de su jefe.
 */
export default function OnboardingForm() {
  const [camino, setCamino] = useState<Camino>('invitacion');
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function enviar(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    const formData = new FormData(e.currentTarget);

    startTransition(async () => {
      const accion = camino === 'invitacion' ? canjearInvitacion : crearEmpresa;
      const resultado = await accion(formData);
      // Si se llega aquí sin redirección, es que falló.
      if (!resultado.ok) {
        setError(resultado.error ?? 'Ocurrió un error inesperado.');
      }
    });
  }

  function cambiarCamino(nuevo: Camino) {
    setCamino(nuevo);
    setError(null);
  }

  const esInvitacion = camino === 'invitacion';

  return (
    <main className="flex min-h-screen items-center justify-center bg-neutral-50 p-4">
      <div className="w-full max-w-md space-y-6">
        <PageHeader
          title="Bienvenido a Cimnova"
          description="Únete a una empresa o crea la tuya"
        />

        {/* Selector de camino. Se usan radios y no pestañas para que quede claro
            que son dos situaciones distintas y excluyentes, y para que funcione
            con teclado y lector de pantalla sin trabajo extra. */}
        <fieldset className="space-y-2">
          <legend className="sr-only">¿Cómo quieres entrar?</legend>

          {(
            [
              {
                valor: 'invitacion' as const,
                titulo: 'Me invitaron',
                ayuda: 'Tengo un código que me compartió mi empresa',
              },
              {
                valor: 'empresa' as const,
                titulo: 'Estoy creando mi empresa',
                ayuda: 'Soy el dueño y empiezo desde cero',
              },
            ]
          ).map((opcion) => {
            const activa = camino === opcion.valor;
            return (
              <label
                key={opcion.valor}
                className={`flex cursor-pointer items-center gap-3 rounded-lg border bg-white p-3 transition ${
                  activa ? 'border-neutral-900' : 'border-neutral-200 hover:bg-neutral-50'
                }`}
              >
                <input
                  type="radio"
                  name="camino"
                  checked={activa}
                  onChange={() => cambiarCamino(opcion.valor)}
                  disabled={isPending}
                  className="h-4 w-4 accent-neutral-900"
                />
                <span>
                  <span className="block text-sm font-medium text-neutral-900">
                    {opcion.titulo}
                  </span>
                  <span className="block text-xs text-neutral-600">{opcion.ayuda}</span>
                </span>
              </label>
            );
          })}
        </fieldset>

        <Card padding="lg">
          {/* `key` fuerza a React a montar un formulario NUEVO al cambiar de
              camino: sin esto conservaría el valor escrito en el otro campo y se
              enviaría un dato que no corresponde. */}
          <form key={camino} onSubmit={enviar} className="space-y-5">
            {esInvitacion ? (
              <Field
                label="Código de invitación"
                hint="Te lo da el administrador de tu empresa."
                htmlFor="code"
              >
                <Input
                  id="code"
                  name="code"
                  required
                  autoFocus
                  inputMode="numeric"
                  maxLength={12}
                  placeholder="Ej. 482 931"
                  disabled={isPending}
                  invalid={!!error}
                  className="font-mono tracking-widest"
                />
              </Field>
            ) : (
              <Field label="Nombre de la empresa" htmlFor="nombre">
                <Input
                  id="nombre"
                  name="nombre"
                  required
                  autoFocus
                  placeholder="Ej. Constructora Pérez S.A. de C.V."
                  disabled={isPending}
                  invalid={!!error}
                />
              </Field>
            )}

            <EstadoFormulario tono="error" mensaje={error} />

            <Button type="submit" disabled={isPending} className="w-full">
              {isPending
                ? esInvitacion
                  ? 'Validando código…'
                  : 'Creando empresa…'
                : esInvitacion
                  ? 'Unirme a la empresa'
                  : 'Crear empresa'}
            </Button>
          </form>
        </Card>
      </div>
    </main>
  );
}
