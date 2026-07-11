/// Loading UI del portal cliente: skeleton ligero mientras se resuelve el segmento.
export default function ClienteLoading() {
  return (
    <div className="space-y-6 animate-pulse" aria-hidden="true">
      <div className="space-y-2">
        <div className="h-4 w-32 rounded bg-neutral-200" />
        <div className="h-7 w-56 rounded bg-neutral-200" />
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        {[0, 1, 2].map((i) => (
          <div key={i} className="rounded-xl border border-neutral-200 bg-white p-4">
            <div className="h-3 w-24 rounded bg-neutral-200" />
            <div className="mt-3 h-6 w-28 rounded bg-neutral-200" />
          </div>
        ))}
      </div>

      <div className="space-y-3">
        {[0, 1, 2].map((i) => (
          <div key={i} className="h-20 rounded-xl border border-neutral-200 bg-white" />
        ))}
      </div>
    </div>
  );
}
