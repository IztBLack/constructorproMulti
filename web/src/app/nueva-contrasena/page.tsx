'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/client';
import { Button, Field, Input } from '@/components/ui';
import { traducirErrorAuth } from '@/lib/auth/errores';

const MINIMO = 6;

/**
 * Contraseña nueva, tras abrir el enlace del correo de recuperación.
 *
 * Aquí NO se pide la contraseña actual (a diferencia de Ajustes): quien llega
 * es precisamente alguien que no la recuerda. Lo que autoriza el cambio es la
 * sesión temporal que `/auth/callback` creó al canjear el código del correo.
 *
 * Por eso lo primero es comprobar que esa sesión existe: si alguien entra
 * directo a esta URL sin venir del correo, no hay nada que autorice el cambio y
 * se le manda a pedir un enlace.
 */
export default function NuevaContrasenaPage() {
  const router = useRouter();
  const [sesion, setSesion] = useState<'revisando' | 'ok' | 'sin-sesion'>('revisando');
  const [nueva, setNueva] = useState('');
  const [repetir, setRepetir] = useState('');
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [listo, setListo] = useState(false);

  useEffect(() => {
    const supabase = createClient();
    supabase.auth.getUser().then(({ data }) => {
      setSesion(data.user ? 'ok' : 'sin-sesion');
    });
  }, []);

  async function alEnviar(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (nueva.length < MINIMO) {
      setError(`La contraseña debe tener al menos ${MINIMO} caracteres.`);
      return;
    }
    if (nueva !== repetir) {
      setError('Las dos contraseñas no coinciden.');
      return;
    }

    setCargando(true);
    const supabase = createClient();
    const { error: errorCambio } = await supabase.auth.updateUser({ password: nueva });
    setCargando(false);

    if (errorCambio) {
      setError(traducirErrorAuth(errorCambio.message));
      return;
    }

    setListo(true);
    // El enlace del correo ya dejó la sesión iniciada, así que se entra directo
    // en vez de obligar a escribir la contraseña recién creada.
    setTimeout(() => {
      router.push('/admin');
      router.refresh();
    }, 1500);
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-neutral-50 p-4">
      <div className="w-full max-w-sm space-y-4">
        <div className="space-y-1 text-center">
          <div className="text-2xl" aria-hidden="true">
            🏗️
          </div>
          <h1 className="text-xl font-semibold text-neutral-900">Nueva contraseña</h1>
        </div>

        <div className="space-y-4 rounded-xl border border-neutral-200 bg-white p-6">
          {sesion === 'revisando' && (
            <p className="text-center text-sm text-neutral-600">Comprobando el enlace…</p>
          )}

          {sesion === 'sin-sesion' && (
            <>
              <p
                role="alert"
                className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700"
              >
                El enlace ya se usó o caducó. Pide uno nuevo.
              </p>
              <Link
                href="/recuperar"
                className="block text-center text-sm text-neutral-600 underline"
              >
                Pedir otro enlace
              </Link>
            </>
          )}

          {sesion === 'ok' && listo && (
            <p
              role="status"
              className="rounded-lg border border-green-200 bg-green-50 p-3 text-sm text-green-800"
            >
              Contraseña actualizada. Entrando…
            </p>
          )}

          {sesion === 'ok' && !listo && (
            <form onSubmit={alEnviar} className="space-y-4">
              <Field label="Contraseña nueva" hint={`Mínimo ${MINIMO} caracteres.`}>
                <Input
                  type="password"
                  autoComplete="new-password"
                  value={nueva}
                  onChange={(e) => setNueva(e.target.value)}
                  required
                  autoFocus
                  disabled={cargando}
                />
              </Field>

              <Field label="Repite la contraseña">
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

              {error && (
                <p role="alert" className="text-sm text-red-600">
                  {error}
                </p>
              )}

              <Button type="submit" disabled={cargando} className="w-full">
                {cargando ? 'Guardando…' : 'Guardar contraseña'}
              </Button>
            </form>
          )}
        </div>
      </div>
    </main>
  );
}
