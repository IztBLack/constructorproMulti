import { Card } from '@/components/ui';

/**
 * Fallback de Suspense para el segmento /admin (y sus subrutas sin loading propio).
 * Server Component: Next.js lo muestra de inmediato mientras la página real
 * hace streaming de datos. Respeta prefers-reduced-motion (ver globals vía
 * clase `motion-reduce:animate-none`).
 */
export default function AdminLoading() {
  return (
    <div className="space-y-6" role="status" aria-label="Cargando panel">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="space-y-2">
          <div className="h-4 w-40 animate-pulse rounded bg-neutral-200 motion-reduce:animate-none" />
          <div className="h-7 w-56 animate-pulse rounded bg-neutral-200 motion-reduce:animate-none" />
        </div>
        <div className="h-9 w-32 animate-pulse rounded-lg bg-neutral-200 motion-reduce:animate-none" />
      </div>

      <section className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <Card key={i}>
            <div className="h-3 w-16 animate-pulse rounded bg-neutral-200 motion-reduce:animate-none" />
            <div className="mt-3 h-7 w-20 animate-pulse rounded bg-neutral-200 motion-reduce:animate-none" />
          </Card>
        ))}
      </section>

      <div className="grid gap-4 lg:grid-cols-2">
        {Array.from({ length: 2 }).map((_, i) => (
          <Card key={i}>
            <div className="h-4 w-32 animate-pulse rounded bg-neutral-200 motion-reduce:animate-none" />
            <div className="mt-4 h-24 animate-pulse rounded bg-neutral-100 motion-reduce:animate-none" />
          </Card>
        ))}
      </div>

      <Card>
        <div className="h-4 w-28 animate-pulse rounded bg-neutral-200 motion-reduce:animate-none" />
        <div className="mt-4 space-y-2">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="h-10 animate-pulse rounded bg-neutral-100 motion-reduce:animate-none" />
          ))}
        </div>
      </Card>

      <span className="sr-only">Cargando información del panel…</span>
    </div>
  );
}
