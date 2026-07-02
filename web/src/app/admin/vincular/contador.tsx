'use client';

import { useEffect, useState } from 'react';

interface ContadorProps {
  /** Tiempo de expiración como epoch en milisegundos. */
  expiresAt: number;
}

/**
 * Cuenta regresiva hasta `expiresAt`. Muestra mm:ss.
 * Cuando llega a 0 muestra aviso de código expirado.
 * No realiza ningún fetch — solo cuenta localmente.
 */
export default function Contador({ expiresAt }: ContadorProps) {
  const [restanteMs, setRestanteMs] = useState(() => Math.max(0, expiresAt - Date.now()));

  useEffect(() => {
    // Si ya expiró al montar, no iniciar el intervalo.
    if (restanteMs <= 0) return;

    const id = setInterval(() => {
      const ms = Math.max(0, expiresAt - Date.now());
      setRestanteMs(ms);
      if (ms <= 0) clearInterval(id);
    }, 500);

    return () => clearInterval(id);
  }, [expiresAt, restanteMs]);

  if (restanteMs <= 0) {
    return (
      <p className="text-sm font-medium text-red-600">
        Código expirado — genera uno nuevo.
      </p>
    );
  }

  const totalSegundos = Math.ceil(restanteMs / 1000);
  const minutos = Math.floor(totalSegundos / 60);
  const segundos = totalSegundos % 60;
  const mm = String(minutos).padStart(2, '0');
  const ss = String(segundos).padStart(2, '0');

  // Menos de 2 minutos → texto en rojo.
  const esCritico = restanteMs < 2 * 60 * 1000;

  return (
    <p className={`text-sm font-medium tabular-nums ${esCritico ? 'text-red-600' : 'text-neutral-500'}`}>
      Expira en{' '}
      <span className={`font-mono ${esCritico ? 'text-red-600' : 'text-neutral-700'}`}>
        {mm}:{ss}
      </span>
    </p>
  );
}
