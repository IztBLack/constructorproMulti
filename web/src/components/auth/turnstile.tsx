'use client';

import { useEffect, useRef } from 'react';

const SITE_KEY = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY;

/// True solo si hay site key configurada (env NEXT_PUBLIC_TURNSTILE_SITE_KEY).
/// Si es false, el CAPTCHA no se renderiza ni se exige → el login funciona
/// exactamente como antes. Así, desplegar este código SIN la env var no cambia
/// nada; el CAPTCHA se activa solo cuando: (1) se define la site key en Vercel,
/// y (2) se configura el secret + se habilita el captcha en Supabase Auth.
export const captchaConfigurado = Boolean(SITE_KEY);

interface TurnstileApi {
  render: (el: HTMLElement, opts: Record<string, unknown>) => string;
  remove: (id: string) => void;
  reset: (id?: string) => void;
}
declare global {
  interface Window {
    turnstile?: TurnstileApi;
  }
}

const SCRIPT_SRC = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';

/// Widget de Cloudflare Turnstile. Sin site key no renderiza nada (no-op).
/// Llama a `onToken` con el token del reto (o null al expirar/fallar).
export function Turnstile({ onToken }: { onToken: (t: string | null) => void }) {
  const boxRef = useRef<HTMLDivElement>(null);
  const widgetId = useRef<string | null>(null);
  const onTokenRef = useRef(onToken);
  useEffect(() => {
    onTokenRef.current = onToken;
  }, [onToken]);

  useEffect(() => {
    const key = SITE_KEY;
    if (!key) return;

    function render() {
      if (!window.turnstile || !boxRef.current || widgetId.current) return;
      widgetId.current = window.turnstile.render(boxRef.current, {
        sitekey: key,
        callback: (token: string) => onTokenRef.current(token),
        'expired-callback': () => onTokenRef.current(null),
        'error-callback': () => onTokenRef.current(null),
      });
    }

    if (window.turnstile) {
      render();
    } else {
      let script = document.querySelector<HTMLScriptElement>(
        'script[src^="https://challenges.cloudflare.com/turnstile/v0/api.js"]',
      );
      if (!script) {
        script = document.createElement('script');
        script.src = SCRIPT_SRC;
        script.async = true;
        script.defer = true;
        document.head.appendChild(script);
      }
      script.addEventListener('load', render);
    }

    return () => {
      if (widgetId.current && window.turnstile) {
        try {
          window.turnstile.remove(widgetId.current);
        } catch {
          // ignorar errores de limpieza
        }
        widgetId.current = null;
      }
    };
  }, []);

  if (!SITE_KEY) return null;
  return <div ref={boxRef} className="flex justify-center" />;
}
