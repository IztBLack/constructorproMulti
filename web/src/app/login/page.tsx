'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { Button, Field, Input } from '@/components/ui';

type Modo = 'login' | 'registro';

type SupabaseBrowserClient = ReturnType<typeof createClient>;

/**
 * Resuelve a dónde mandar al usuario tras iniciar sesión, según su rol.
 *
 * Supuesto (documentado, no hay un campo "rol" único en el sistema):
 * - Staff/administración de una empresa tiene una fila en `usuarios_empresa`
 *   (user_id -> empresa_id, rol). Ver web/src/app/admin/page.tsx y
 *   web/src/app/onboarding/page.tsx, que usan exactamente esta tabla.
 * - Un cliente del portal tiene una fila en `clientes` con `user_id` apuntando
 *   a su cuenta de auth (ver web/src/lib/data/portal-cliente.ts:getClienteActual,
 *   que confía en RLS para devolver solo el registro del cliente autenticado).
 * - Un usuario puede no tener ninguna de las dos todavía (recién registrado):
 *   en ese caso lo mandamos a /admin, que sigue redirigiendo a /onboarding
 *   (ver middleware.ts) — se preserva el flujo de onboarding existente.
 *
 * Si ambas consultas fallan (RLS/red), no bloqueamos el login: caemos a /admin
 * (comportamiento previo).
 */
async function resolverDestino(supabase: SupabaseBrowserClient, userId: string): Promise<string> {
  const { data: membresia } = await supabase
    .from('usuarios_empresa')
    .select('empresa_id')
    .eq('user_id', userId)
    .limit(1)
    .maybeSingle();

  if (membresia) return '/admin';

  const { data: cliente } = await supabase
    .from('clientes')
    .select('id')
    .eq('user_id', userId)
    .is('deleted_at', null)
    .limit(1)
    .maybeSingle();

  if (cliente) return '/cliente';

  return '/admin';
}

const ERRORES: Record<string, string> = {
  'Invalid login credentials': 'Correo o contraseña incorrectos.',
  'Email not confirmed': 'Debes confirmar tu correo antes de iniciar sesión.',
  'User already registered': 'Ya existe una cuenta con ese correo. Inicia sesión.',
  'Password should be at least 6 characters': 'La contraseña debe tener al menos 6 caracteres.',
};

function traducirError(msg: string): string {
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

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setInfo(null);
    const supabase = createClient();

    if (modo === 'registro') {
      const { data, error: signUpError } = await supabase.auth.signUp({ email, password });
      setLoading(false);
      if (signUpError) {
        setError(traducirError(signUpError.message));
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
    });
    if (signInError) {
      setLoading(false);
      setError(traducirError(signInError.message));
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

          <Button type="submit" disabled={loading} className="w-full">
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
