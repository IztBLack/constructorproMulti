/// Skeleton de la lista de cotizaciones mientras se resuelve el fetch en servidor.
export default function CotizacionesLoading() {
  return (
    <div className="space-y-6 animate-pulse" aria-hidden="true">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="space-y-2">
          <div className="h-7 w-40 rounded bg-neutral-200" />
          <div className="h-4 w-72 rounded bg-neutral-200" />
        </div>
        <div className="h-9 w-40 rounded-lg bg-neutral-200" />
      </div>

      <div className="flex flex-wrap gap-2">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="h-7 w-20 rounded-full bg-neutral-200" />
        ))}
      </div>

      <div className="overflow-hidden rounded-xl border border-neutral-200 bg-white">
        {[0, 1, 2, 3, 4].map((i) => (
          <div key={i} className="flex items-center gap-4 border-b border-neutral-100 px-4 py-4 last:border-0">
            <div className="h-4 w-32 rounded bg-neutral-200" />
            <div className="h-4 w-40 rounded bg-neutral-200" />
            <div className="h-4 w-24 rounded bg-neutral-200" />
            <div className="ml-auto h-5 w-20 rounded-full bg-neutral-200" />
          </div>
        ))}
      </div>
    </div>
  );
}
