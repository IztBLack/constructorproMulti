import * as Sentry from '@sentry/nextjs';
import { opcionesComunes } from '@/lib/observabilidad/sentry';

// El middleware corre en el runtime edge: es la capa que separa /admin de
// /cliente, así que un fallo suyo interesa tanto como uno de Node.
Sentry.init(opcionesComunes);
