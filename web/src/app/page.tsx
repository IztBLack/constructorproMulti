import { LinkButton } from '@/components/ui';

export default function Home() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-8 bg-neutral-50 p-8">
      <div className="space-y-3 text-center">
        <div className="text-4xl" aria-hidden="true">
          🏗️
        </div>
        <h1 className="text-3xl font-semibold text-neutral-900">ConstructorPro</h1>
        <p className="max-w-sm text-neutral-500">
          Gestión de obras de construcción: cotizaciones, avance y equipo en un solo lugar.
        </p>
      </div>
      <div className="flex flex-wrap justify-center gap-3">
        <LinkButton href="/admin">Panel de oficina</LinkButton>
        <LinkButton href="/cliente" variant="secondary">
          Portal de cliente
        </LinkButton>
      </div>
    </main>
  );
}
