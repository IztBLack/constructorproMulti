import type { Metadata } from 'next';
import { Card, PageHeader } from '@/components/ui';

export const metadata: Metadata = {
  title: 'Sin conexión',
};

/**
 * Página de respaldo que el service worker sirve cuando una navegación falla
 * por falta de red. Es intencionalmente estática y sin datos: se precachea, y
 * cachear cualquier dato de usuario sería una fuga entre empresas.
 */
export default function OfflinePage() {
  return (
    <div className="mx-auto w-full max-w-2xl px-4 py-12 sm:px-8">
      <div className="space-y-6">
        <PageHeader
          title="Sin conexión"
          description="No pudimos cargar esta pantalla porque el dispositivo no tiene internet."
        />

        <Card padding="lg">
          <div className="space-y-4 text-sm text-neutral-600">
            <p>
              Lo que ya hayas capturado en el dispositivo <strong>no se pierde</strong>: se guarda
              localmente y se sincroniza solo en cuanto vuelva la señal.
            </p>
            <ul className="list-disc space-y-1 pl-5">
              <li>Revisa que tengas datos móviles o Wi-Fi activos.</li>
              <li>En obra, a veces basta con moverte a un punto con mejor señal.</li>
              <li>No cierres la app: al reconectar, la sincronización es automática.</li>
            </ul>
            <p className="text-neutral-500">
              Cuando vuelvas a tener conexión, recarga la página para continuar.
            </p>
          </div>
        </Card>
      </div>
    </div>
  );
}
