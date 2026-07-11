import { Card } from '@/components/ui';

/** Fallback de Suspense para /admin/obras/[id] mientras cargan obra, movimientos, etc. */
export default function ObraDetalleLoading() {
  return (
    <div className="space-y-6" role="status" aria-label="Cargando obra">
      <div className="h-4 w-20 animate-pulse rounded bg-neutral-200 motion-reduce:animate-none" />

      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="space-y-2">
          <div className="h-7 w-48 animate-pulse rounded bg-neutral-200 motion-reduce:animate-none" />
          <div className="h-4 w-64 animate-pulse rounded bg-neutral-200 motion-reduce:animate-none" />
        </div>
        <div className="h-9 w-24 animate-pulse rounded-lg bg-neutral-200 motion-reduce:animate-none" />
      </div>

      <div className="flex gap-2">
        {Array.from({ length: 4 }).map((_, i) => (
          <div
            key={i}
            className="h-10 w-24 animate-pulse rounded-lg bg-neutral-200 motion-reduce:animate-none"
          />
        ))}
      </div>

      <Card>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="space-y-2">
              <div className="h-3 w-20 animate-pulse rounded bg-neutral-200 motion-reduce:animate-none" />
              <div className="h-6 w-28 animate-pulse rounded bg-neutral-200 motion-reduce:animate-none" />
            </div>
          ))}
        </div>
      </Card>

      <Card>
        <div className="h-4 w-32 animate-pulse rounded bg-neutral-200 motion-reduce:animate-none" />
        <div className="mt-4 space-y-2">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="h-10 animate-pulse rounded bg-neutral-100 motion-reduce:animate-none" />
          ))}
        </div>
      </Card>

      <span className="sr-only">Cargando información de la obra…</span>
    </div>
  );
}
