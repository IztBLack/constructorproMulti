import type { Instrumentation } from 'next';

/// Punto de arranque de la observabilidad del servidor (Next lo llama UNA vez
/// por instancia, antes de atender la primera petición).
///
/// Sin `NEXT_PUBLIC_SENTRY_DSN` no se carga ni el SDK: el `await import` va
/// dentro del `if`, así que en un despliegue sin Sentry configurado no se paga
/// ni el arranque ni el peso del módulo.
export async function register() {
  const { sentryActivo } = await import('@/lib/observabilidad/sentry');
  if (!sentryActivo) return;

  if (process.env.NEXT_RUNTIME === 'nodejs') {
    await import('./sentry.server.config');
  }
  if (process.env.NEXT_RUNTIME === 'edge') {
    await import('./sentry.edge.config');
  }
}

/// Errores del servidor: Server Actions, route handlers y render de los Server
/// Components. Es la mitad que más importa aquí, porque ahí vive la lógica de
/// dinero (nómina, proyección, estado de cuenta) y los seis PDF.
export const onRequestError: Instrumentation.onRequestError = async (
  err,
  request,
  context,
) => {
  const { sentryActivo } = await import('@/lib/observabilidad/sentry');
  if (!sentryActivo) return;

  const Sentry = await import('@sentry/nextjs');
  Sentry.captureRequestError(err, request, context);
};
