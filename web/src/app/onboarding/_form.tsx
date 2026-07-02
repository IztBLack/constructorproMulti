'use client';

import { useTransition, useState, useRef } from 'react';
import { PageHeader, Card, Field, Input, Button } from '@/components/ui';
import { crearEmpresa } from './actions';

export default function OnboardingForm() {
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const formRef = useRef<HTMLFormElement>(null);

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    const formData = new FormData(e.currentTarget);

    startTransition(async () => {
      const result = await crearEmpresa(formData);
      // Si llegamos aquí sin redirect, hubo error.
      if (!result.ok) {
        setError(result.error ?? 'Ocurrió un error inesperado.');
      }
    });
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-neutral-50 p-4">
      <div className="w-full max-w-md space-y-6">
        <PageHeader
          title="Bienvenido a ConstructorPro"
          description="Crea tu empresa para comenzar"
        />

        <p className="text-sm text-neutral-500">
          Este es tu primer paso. Registra el nombre de tu empresa y tendrás acceso completo
          al panel de administración.
        </p>

        <Card padding="lg">
          <form ref={formRef} onSubmit={handleSubmit} className="space-y-5">
            <Field
              label="Nombre de la empresa"
              error={error ?? undefined}
              htmlFor="nombre"
            >
              <Input
                id="nombre"
                name="nombre"
                type="text"
                required
                autoFocus
                placeholder="Ej. Constructora Pérez S.A. de C.V."
                disabled={isPending}
                invalid={!!error}
              />
            </Field>

            {error && (
              <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">
                {error}
              </p>
            )}

            <Button type="submit" disabled={isPending} className="w-full">
              {isPending ? 'Creando empresa…' : 'Crear empresa'}
            </Button>
          </form>
        </Card>
      </div>
    </main>
  );
}
