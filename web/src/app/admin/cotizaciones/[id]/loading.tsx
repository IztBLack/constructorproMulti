/// Skeleton del detalle de cotización mientras se resuelve el fetch en servidor.
export default function CotizacionDetalleLoading() {
  return (
    <div className="space-y-6 animate-pulse" aria-hidden="true">
      <div className="h-4 w-32 rounded bg-neutral-200" />

      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="space-y-2">
          <div className="h-4 w-48 rounded bg-neutral-200" />
          <div className="h-7 w-64 rounded bg-neutral-200" />
          <div className="h-4 w-40 rounded bg-neutral-200" />
        </div>
        <div className="flex items-center gap-3">
          <div className="h-8 w-20 rounded-lg bg-neutral-200" />
          <div className="h-8 w-20 rounded-lg bg-neutral-200" />
        </div>
      </div>

      <div className="space-y-4">
        {[0, 1].map((i) => (
          <div key={i} className="overflow-hidden rounded-xl border border-neutral-200 bg-white">
            <div className="border-b border-neutral-200 px-4 py-3">
              <div className="h-4 w-40 rounded bg-neutral-200" />
            </div>
            <div className="space-y-3 p-4">
              {[0, 1, 2].map((j) => (
                <div key={j} className="h-4 w-full rounded bg-neutral-100" />
              ))}
            </div>
          </div>
        ))}
      </div>

      <div className="rounded-xl border border-neutral-200 bg-white p-5">
        <div className="space-y-2">
          <div className="h-4 w-full rounded bg-neutral-100" />
          <div className="h-4 w-full rounded bg-neutral-100" />
          <div className="h-5 w-full rounded bg-neutral-200" />
        </div>
      </div>
    </div>
  );
}
