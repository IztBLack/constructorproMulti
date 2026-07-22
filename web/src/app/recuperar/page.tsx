'use client';

import { useState } from 'react';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/client';
import { Button, Field, Input } from '@/components/ui';
import { Turnstile, captchaConfigurado } from '@/components/auth/turnstile';
import { traducirErrorAuth } from '@/lib/auth/errores';

/**
 * "Olvidé mi contraseña".
 *
 * Antes de esto no existía ninguna forma de recuperar una cuenta: había que
 * entrar al panel de Supabase a mano. Para un sistema con colaboradores y
 * clientes que entran desde su propio celular, eso no se sostiene.
 *
 * Nota de seguridad: la pantalla responde LO MISMO exista o no el correo. Si
 * dijera "ese correo no está registrado", cualquiera podría averiguar quién
 * tiene cuenta probando direcciones.
 */
export default function RecuperarPage() {
  const [correo, setCorreo] = useState('');
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [enviado, setEnviado] = useState(false);
  const [captcha, setCaptcha] = useState<string | null>(null);

  async function alEnviar(e: React.FormEvent) {
    e.preventDefault();
    setCargando(true);
    setError(null);

    const supabase = createClient();
    const { error: errorEnvio } = await supabase.auth.resetPasswordForEmail(correo.trim(), {
      redirectTo: `${window.location.origin}/auth/callback?destino=/nueva-contrasena`,
      captchaToken: captcha ?? undefined,
    });

    setCargando(false);

    // Solo se muestran errores que NO revelan si la cuenta existe (límite de
    // envíos, captcha, red). Un fallo por correo inexistente se trata como éxito.
    if (errorEnvio && !/user|not found/i.test(errorEnvio.message)) {
      setError(traducirErrorAuth(errorEnvio.message));
      setCaptcha(null);
      if (typeof window !== 'undefined') window.turnstile?.reset();
      return;
    }

    setEnviado(true);
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-neutral-50 p-4">
      <div className="w-full max-w-sm space-y-4">
        <div className="space-y-1 text-center">
          <div className="text-2xl" aria-hidden="true">
            🏗️
          </div>
          <h1 className="text-xl font-semibold text-neutral-900">Recuperar contraseña</h1>
          <p className="text-sm text-neutral-600">
            Te mandamos un enlace para crear una nueva.
          </p>
        </div>

        {enviado ? (
          <div className="space-y-4 rounded-xl border border-neutral-200 bg-white p-6">
            <p
              role="status"
              className="rounded-lg border border-blue-200 bg-blue-50 p-3 text-sm text-blue-700"
            >
              Si hay una cuenta con ese correo, ya va en camino el enlace. Revisa
              también la carpeta de correo no deseado.
            </p>
            <Link href="/login" className="block text-center text-sm text-neutral-600 underline">
              Volver a iniciar sesión
            </Link>
          </div>
        ) : (
          <form
            onSubmit={alEnviar}
            className="space-y-4 rounded-xl border border-neutral-200 bg-white p-6"
          >
            <Field label="Tu correo">
              <Input
                type="email"
                autoComplete="email"
                value={correo}
                onChange={(e) => setCorreo(e.target.value)}
                placeholder="tu@correo.com"
                required
                autoFocus
                disabled={cargando}
              />
            </Field>

            {captchaConfigurado && <Turnstile onToken={setCaptcha} />}

            {error && (
              <p role="alert" className="text-sm text-red-600">
                {error}
              </p>
            )}

            <Button type="submit" disabled={cargando} className="w-full">
              {cargando ? 'Enviando…' : 'Enviar enlace'}
            </Button>

            <Link href="/login" className="block text-center text-sm text-neutral-600 underline">
              Volver a iniciar sesión
            </Link>
          </form>
        )}
      </div>
    </main>
  );
}
