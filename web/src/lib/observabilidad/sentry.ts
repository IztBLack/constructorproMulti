/// Configuración compartida de Sentry.
///
/// Hasta agosto de 2026 la web no registraba ningún error: si a alguien se le
/// caía la generación de un PDF o una Server Action de nómina, nadie se
/// enteraba salvo que el usuario lo contara. Esto es la red mínima.
///
/// **Sin DSN, Sentry queda APAGADO y la app funciona igual.** No es un descuido:
/// es lo que permite que el repo se pueda clonar, correr y desplegar sin cuenta
/// de Sentry, y que el CI compile sin secretos. `Sentry.init` con `dsn: ''` es un
/// no-op documentado del SDK; aun así se comprueba antes para no dejar dudas al
/// leer el código.

/// DSN del proyecto. `NEXT_PUBLIC_` porque el cliente también lo necesita: el
/// DSN es público por diseño (solo permite ESCRIBIR eventos, igual que la
/// publishable key de Supabase).
export const SENTRY_DSN = process.env.NEXT_PUBLIC_SENTRY_DSN ?? '';

export const sentryActivo = SENTRY_DSN.length > 0;

/// Opciones comunes a los tres entornos (servidor, edge y navegador).
export const opcionesComunes = {
  dsn: SENTRY_DSN,

  // Sin trazas de rendimiento: lo que hacía falta era saber QUÉ se rompe, no
  // cuánto tarda. Se puede subir después; a 0 no se gasta cuota.
  tracesSampleRate: 0,

  // La app maneja nombres de colaboradores, montos y datos de clientes. Que no
  // se vayan a un tercero por accidente dentro del cuerpo de una petición.
  sendDefaultPii: false,

  environment: process.env.VERCEL_ENV ?? process.env.NODE_ENV ?? 'development',

  // En local los errores ya se ven en la terminal; mandarlos solo ensucia el
  // panel y gasta cuota del plan gratuito.
  enabled: process.env.NODE_ENV === 'production',
};
