'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { Button, Field, Input } from '@/components/ui';
import { Turnstile, captchaConfigurado } from './turnstile';

type Modo = 'login' | 'registro';

type SupabaseBrowserClient = ReturnType<typeof createClient>;

/**
 * Resuelve a dónde mandar al usuario tras iniciar sesión, según su ROL.
 *
 * OJO: un cliente del portal también tiene fila en `usuarios_empresa`, pero con
 * `rol='cliente'` (la crea `canjear_codigo_vinculacion`). Por eso NO basta con
 * "¿tiene membresía?" → hay que mirar el rol:
 * - Cualquier rol de staff (admin/supervisor/colaborador/oficina, es decir
 *   cualquier rol distinto de 'cliente') → panel de oficina (/admin).
 * - Solo rol 'cliente' (o fila en `clientes`) → portal del cliente (/cliente).
 * - Sin ninguna membresía (recién registrado) → /admin, que redirige a
 *   /onboarding (ver middleware.ts) — se preserva ese flujo.
 *
 * Si las consultas fallan (RLS/red), no bloqueamos el login: caemos a /admin.
 */
async function resolverDestino(supabase: SupabaseBrowserClient, userId: string): Promise<string> {
  const { data: membresias } = await supabase
    .from('usuarios_empresa')
    .select('rol')
    .eq('user_id', userId);

  const roles = (membresias ?? []).map((m) => m.rol as string);
  const esStaff = roles.some((r) => r !== 'cliente');
  if (esStaff) return '/admin';

  const { data: cliente } = await supabase
    .from('clientes')
    .select('id')
    .eq('user_id', userId)
    .is('deleted_at', null)
    .limit(1)
    .maybeSingle();

  if (cliente || roles.includes('cliente')) return '/cliente';

  return '/admin';
}

const ERRORES: Record<string, string> = {
  'Invalid login credentials': 'Correo o contraseña incorrectos.',
  'Email not confirmed': 'Debes confirmar tu correo antes de iniciar sesión.',
  'User already registered': 'Ya existe una cuenta con ese correo. Inicia sesión.',
  'Password should be at least 6 characters': 'La contraseña debe tener al menos 6 caracteres.',
};

function traducirError(msg: string): string {
  if (msg.toLowerCase().includes('captcha')) {
    return 'La verificación de seguridad falló. Recárgala e intenta de nuevo.';
  }
  return ERRORES[msg] ?? msg;
}

export default function LoginPage() {
  const router = useRouter();
  const [modo, setModo] = useState<Modo>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [captchaToken, setCaptchaToken] = useState<string | null>(null);

  // Tras un intento fallido el token de Turnstile ya se consumió: se descarta y
  // se recarga el widget para obtener uno nuevo.
  function resetCaptcha() {
    setCaptchaToken(null);
    if (typeof window !== 'undefined') window.turnstile?.reset();
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setInfo(null);
    const supabase = createClient();

    if (modo === 'registro') {
      const { data, error: signUpError } = await supabase.auth.signUp({
        email,
        password,
        options: { captchaToken: captchaToken ?? undefined },
      });
      setLoading(false);
      if (signUpError) {
        setError(traducirError(signUpError.message));
        resetCaptcha();
        return;
      }
      // Si Supabase devuelve sesión activa vamos directo a onboarding.
      if (data.session) {
        router.push('/onboarding');
        router.refresh();
      } else {
        // Requiere confirmación de email.
        setInfo('Revisa tu correo para confirmar la cuenta y luego inicia sesión.');
      }
      return;
    }

    // Modo login normal.
    const { data: signInData, error: signInError } = await supabase.auth.signInWithPassword({
      email,
      password,
      options: { captchaToken: captchaToken ?? undefined },
    });
    if (signInError) {
      setLoading(false);
      setError(traducirError(signInError.message));
      resetCaptcha();
      return;
    }

    const userId = signInData.user?.id;
    const destino = userId ? await resolverDestino(supabase, userId) : '/admin';
    setLoading(false);
    router.push(destino);
    router.refresh();
  }

  function cambiarModo(nuevoModo: Modo) {
    setModo(nuevoModo);
    setError(null);
    setInfo(null);
  }

  const esRegistro = modo === 'registro';

  return (
    <main className="flex min-h-screen items-center justify-center bg-neutral-50 p-4">
      <div className="w-full max-w-sm space-y-4">
        {/* Encabezado */}
        <div className="space-y-1 text-center">
          <div className="text-2xl" aria-hidden="true">
            🏗️
          </div>
          <h1 className="text-xl font-semibold text-neutral-900">ConstructorPro</h1>
          <p className="text-sm text-neutral-500">
            {esRegistro ? 'Crea tu cuenta' : 'Entra a tu panel'}
          </p>
        </div>

        {/* Toggle modo */}
        <div className="flex rounded-xl border border-neutral-200 bg-white p-1">
          <button
            type="button"
            onClick={() => cambiarModo('login')}
            className={`flex-1 rounded-lg py-1.5 text-sm font-medium transition ${
              !esRegistro
                ? 'bg-neutral-900 text-white'
                : 'text-neutral-500 hover:text-neutral-700'
            }`}
          >
            Iniciar sesión
          </button>
          <button
            type="button"
            onClick={() => cambiarModo('registro')}
            className={`flex-1 rounded-lg py-1.5 text-sm font-medium transition ${
              esRegistro
                ? 'bg-neutral-900 text-white'
                : 'text-neutral-500 hover:text-neutral-700'
            }`}
          >
            Crear cuenta
          </button>
        </div>

        {/* Formulario */}
        <form
          onSubmit={onSubmit}
          className="space-y-5 rounded-2xl border border-neutral-200 bg-white p-8 shadow-sm"
        >
          <div className="space-y-4">
            <Field label="Correo">
              <Input
                type="email"
                required
                autoComplete="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </Field>

            <Field label="Contraseña">
              <Input
                type="password"
                required
                autoComplete={esRegistro ? 'new-password' : 'current-password'}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </Field>
          </div>

          {error && (
            <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">
              {error}
            </p>
          )}

          {info && (
            <p role="status" className="rounded-lg bg-blue-50 px-3 py-2 text-sm text-blue-700">
              {info}
            </p>
          )}

          <Turnstile onToken={setCaptchaToken} />

          <Button
            type="submit"
            disabled={loading || (captchaConfigurado && !captchaToken)}
            className="w-full"
          >
            {loading
              ? esRegistro
                ? 'Creando cuenta…'
                : 'Entrando…'
              : esRegistro
                ? 'Crear cuenta'
                : 'Entrar'}
          </Button>
        </form>
      </div>
    </main>
  );
}
