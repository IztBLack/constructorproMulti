import * as Sentry from '@sentry/nextjs';
import { opcionesComunes } from '@/lib/observabilidad/sentry';

Sentry.init(opcionesComunes);
