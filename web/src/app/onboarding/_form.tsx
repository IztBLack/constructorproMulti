'use client';

import { useTransition, useState } from 'react';
import { PageHeader, Card, Field, Input, Button } from '@/components/ui';
import { EstadoFormulario } from '@/components/ajustes/estado-formulario';
import { canjearInvitacion } from './actions';
import { AsistenteEmpresa } from './_asistente-empresa';

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
 *
 * "Estoy creando mi empresa" es un asistente de 4 pasos (`_asistente-empresa`)
 * que arma los módulos según cómo trabaja la empresa (plan §4). "Me invitaron"
 * no cambia: el invitado hereda los módulos de la empresa a la que entra.
 */
export default function OnboardingForm() {
  const [camino, setCamino] = useState<Camino>('invitacion');
  const [pasoEmpresa, setPasoEmpresa] = useState(1);

  function cambiarCamino(nuevo: Camino) {
    setCamino(nuevo);
    setPasoEmpresa(1);
  }

  const selector = <SelectorCamino camino={camino} onCambiar={cambiarCamino} />;

  return (
    <main className="flex min-h-screen items-center justify-center bg-neutral-50 p-4">
      <div className="w-full max-w-md space-y-6">
        <PageHeader
          title="Bienvenido a ConstructorPro"
          description={
            camino === 'empresa' && pasoEmpresa > 1
              ? 'Tres preguntas para dejarte solo lo que usas'
              : 'Únete a una empresa o crea la tuya'
          }
        />

        {camino === 'invitacion' ? (
          <>
            {selector}
            <FormInvitacion />
          </>
        ) : (
          <AsistenteEmpresa
            paso={pasoEmpresa}
            setPaso={setPasoEmpresa}
            selectorCamino={selector}
          />
        )}
      </div>
    </main>
  );
}

/**
 * Selector de camino. Se usan radios y no pestañas para que quede claro que son
 * dos situaciones distintas y excluyentes, y para que funcione con teclado y
 * lector de pantalla sin trabajo extra.
 */
function SelectorCamino({
  camino,
  onCambiar,
}: {
  camino: Camino;
  onCambiar: (c: Camino) => void;
}) {
  return (
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
              onChange={() => onCambiar(opcion.valor)}
              className="h-4 w-4 accent-neutral-900"
            />
            <span>
              <span className="block text-sm font-medium text-neutral-900">{opcion.titulo}</span>
              <span className="block text-xs text-neutral-600">{opcion.ayuda}</span>
            </span>
          </label>
        );
      })}
    </fieldset>
  );
}

/** Camino "Me invitaron": canjear el código. Sin cambios respecto a antes de los módulos. */
function FormInvitacion() {
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function enviar(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    const formData = new FormData(e.currentTarget);

    startTransition(async () => {
      const resultado = await canjearInvitacion(formData);
      // Si se llega aquí sin redirección, es que falló.
      if (!resultado.ok) {
        setError(resultado.error ?? 'Ocurrió un error inesperado.');
      }
    });
  }

  return (
    <Card padding="lg">
      <form onSubmit={enviar} className="space-y-5">
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

        <EstadoFormulario tono="error" mensaje={error} />

        <Button type="submit" disabled={isPending} className="w-full">
          {isPending ? 'Validando código…' : 'Unirme a la empresa'}
        </Button>
      </form>
    </Card>
  );
}
