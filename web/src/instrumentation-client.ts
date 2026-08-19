import * as Sentry from '@sentry/nextjs';
import { opcionesComunes, sentryActivo } from '@/lib/observabilidad/sentry';

/// Errores del NAVEGADOR. Aquí viven la tabla de proyección —que recalcula la
/// raya en cada toque— y el arrastre para reordenar: cosas que solo fallan en el
/// dispositivo de alguien, nunca en el servidor.
if (sentryActivo) {
  Sentry.init({
    ...opcionesComunes,
    // Sin repetición de sesión: grabaría la pantalla con sueldos y datos de
    // clientes dentro.
    replaysSessionSampleRate: 0,
    replaysOnErrorSampleRate: 0,
  });
}

// Requerido por Next para medir las navegaciones del App Router.
export const onRouterTransitionStart = Sentry.captureRouterTransitionStart;
