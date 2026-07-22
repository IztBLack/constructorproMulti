'use client';

import { useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { Button, Card, CardHeader, CardTitle, Field, Input } from '@/components/ui';
import { EstadoFormulario } from './estado-formulario';
import { Turnstile, captchaConfigurado } from '@/components/auth/turnstile';
import { traducirErrorAuth } from '@/lib/auth/errores';

const MINIMO = 6;

/**
 * Cambio de contraseña, con revalidación de la actual.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * POR QUÉ SE PIDE LA CONTRASEÑA ACTUAL
 * ─────────────────────────────────────────────────────────────────────────────
 * `updateUser({ password })` de Supabase NO la exige: con una sesión válida
 * basta. Eso significa que cualquiera que encuentre una sesión abierta —la
 * laptop de la oficina, un celular prestado, alguien que se quedó con la
 * pestaña— puede cambiar la contraseña y quedarse con la cuenta, dejando fuera
 * al dueño. Por eso aquí primero se vuelve a iniciar sesión con la contraseña
 * actual y solo si eso pasa se cambia. Es un paso más para el usuario legítimo
 * y una barrera real para quien no lo es.
 *
 * Va del lado del cliente porque `signInWithPassword` rota la sesión, y hacerlo
 * en el servidor obligaría a reescribir las cookies a media petición.
 *
 * El captcha se incluye por si se activa Turnstile en el proyecto: en cuanto
 * Supabase lo exige, `signInWithPassword` empieza a rechazar las llamadas sin
 * token, y esta pantalla dejaría de funcionar sin avisar. Si no está
 * configurado, el widget no se dibuja y no estorba.
 */
export function SeccionContrasena() {
  const [actual, setActual] = useState('');
  const [nueva, setNueva] = useState('');
  const [repetir, setRepetir] = useState('');
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const [captcha, setCaptcha] = useState<string | null>(null);

  function reiniciarCaptcha() {
    setCaptcha(null);
    if (typeof window !== 'undefined') window.turnstile?.reset();
  }

  async function alEnviar(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setAviso(null);

    if (nueva.length < MINIMO) {
      setError(`La contraseña nueva debe tener al menos ${MINIMO} caracteres.`);
      return;
    }
    if (nueva !== repetir) {
      setError('Las dos contraseñas nuevas no coinciden.');
      return;
    }
    if (nueva === actual) {
      setError('La contraseña nueva debe ser distinta de la actual.');
      return;
    }

    setCargando(true);
    const supabase = createClient();

    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user?.email) {
      setCargando(false);
      setError('La sesión expiró. Vuelve a iniciar sesión.');
      return;
    }

    // Paso 1: comprobar que quien está al teclado conoce la contraseña actual.
    const { error: errorRevalidar } = await supabase.auth.signInWithPassword({
      email: user.email,
      password: actual,
      options: { captchaToken: captcha ?? undefined },
    });

    if (errorRevalidar) {
      setCargando(false);
      reiniciarCaptcha();
      // Un "credenciales inválidas" aquí solo puede significar una cosa, y
      // decirlo así evita que el usuario crea que el problema es la nueva.
      setError(
        errorRevalidar.message === 'Invalid login credentials'
          ? 'La contraseña actual no es correcta.'
          : traducirErrorAuth(errorRevalidar.message),
      );
      return;
    }

    // Paso 2: ahora sí, cambiarla.
    const { error: errorCambio } = await supabase.auth.updateUser({ password: nueva });
    setCargando(false);
    reiniciarCaptcha();

    if (errorCambio) {
      setError(traducirErrorAuth(errorCambio.message));
      return;
    }

    setActual('');
    setNueva('');
    setRepetir('');
    setAviso('Contraseña actualizada. Tu sesión sigue abierta en este dispositivo.');
  }

  return (
    <Card>
      <CardHeader>
        <div>
          <CardTitle as="h3">Contraseña</CardTitle>
          <p className="mt-1 text-sm text-neutral-600">
            Te pedimos la actual para confirmar que eres tú.
          </p>
        </div>
      </CardHeader>

      <form onSubmit={alEnviar} className="space-y-4">
        <Field label="Contraseña actual">
          <Input
            type="password"
            autoComplete="current-password"
            value={actual}
            onChange={(e) => setActual(e.target.value)}
            required
            disabled={cargando}
          />
        </Field>

        <Field label="Contraseña nueva" hint={`Mínimo ${MINIMO} caracteres.`}>
          <Input
            type="password"
            autoComplete="new-password"
            value={nueva}
            onChange={(e) => setNueva(e.target.value)}
            required
            disabled={cargando}
          />
        </Field>

        <Field label="Repite la contraseña nueva">
          <Input
            type="password"
            autoComplete="new-password"
            value={repetir}
            onChange={(e) => setRepetir(e.target.value)}
            required
            disabled={cargando}
            invalid={repetir.length > 0 && repetir !== nueva}
          />
        </Field>

        {captchaConfigurado && <Turnstile onToken={setCaptcha} />}

        <EstadoFormulario tono="error" mensaje={error} />
        <EstadoFormulario tono="exito" mensaje={aviso} />

        <Button type="submit" disabled={cargando}>
          {cargando ? 'Cambiando…' : 'Cambiar contraseña'}
        </Button>
      </form>
    </Card>
  );
}
