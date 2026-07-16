'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui';
import { canjearCodigo } from './vincular-actions';

export function VincularForm() {
  const router = useRouter();
  const [codigo, setCodigo] = useState('');
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);

    const codigoLimpio = codigo.trim();

    if (codigoLimpio.length !== 8) {
      setError('El código debe tener exactamente 8 dígitos.');
      return;
    }

    setCargando(true);
    const resultado = await canjearCodigo(codigoLimpio);
    setCargando(false);

    if (!resultado.ok) {
      setError(resultado.error ?? 'Código inválido. Verifica e intenta de nuevo.');
      return;
    }

    router.refresh();
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="flex flex-col items-center gap-6 w-full max-w-xs mx-auto"
      noValidate
    >
      <div className="flex flex-col items-center gap-2 w-full">
        <label
          htmlFor="codigo-vinculacion"
          className="text-sm font-medium text-neutral-700 text-center"
        >
          Código de acceso
        </label>
        <input
          id="codigo-vinculacion"
          type="text"
          inputMode="numeric"
          pattern="[0-9]*"
          maxLength={8}
          autoComplete="one-time-code"
          value={codigo}
          onChange={(e) => {
            // Solo permitir dígitos
            const soloDigitos = e.target.value.replace(/\D/g, '');
            setCodigo(soloDigitos);
            setError(null);
          }}
          placeholder="00000000"
          className="w-full rounded-xl border border-neutral-300 bg-white px-5 py-4 text-center text-3xl font-bold tracking-widest text-neutral-900 outline-none transition placeholder:text-neutral-300 focus:border-neutral-900 focus-visible:ring-2 focus-visible:ring-neutral-900/10 invalid:border-red-400 disabled:cursor-not-allowed disabled:opacity-50"
          disabled={cargando}
          aria-describedby={error ? 'vincular-error' : undefined}
          aria-invalid={error !== null}
        />
        {error && (
          <p id="vincular-error" role="alert" className="text-sm text-red-600 text-center">
            {error}
          </p>
        )}
      </div>

      <Button
        type="submit"
        variant="primary"
        size="md"
        disabled={cargando || codigo.length !== 8}
        className="w-full cursor-pointer"
        aria-busy={cargando}
      >
        {cargando ? (
          <>
            <svg
              className="h-4 w-4 animate-spin"
              xmlns="http://www.w3.org/2000/svg"
              fill="none"
              viewBox="0 0 24 24"
              aria-hidden="true"
            >
              <circle
                className="opacity-25"
                cx="12"
                cy="12"
                r="10"
                stroke="currentColor"
                strokeWidth="4"
              />
              <path
                className="opacity-75"
                fill="currentColor"
                d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
              />
            </svg>
            Verificando...
          </>
        ) : (
          'Vincular'
        )}
      </Button>
    </form>
  );
}
