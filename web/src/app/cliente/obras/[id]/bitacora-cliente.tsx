import { formatDate } from '@/lib/data/format';
import { ETIQUETA_CLIMA, ETIQUETA_TIPO, agruparPorDia, type EntradaBitacora } from '@/lib/bitacora/bitacora';

const fmtDia = new Intl.DateTimeFormat('es-MX', {
  timeZone: 'America/Mexico_City',
  weekday: 'long',
  day: 'numeric',
  month: 'long',
});

/**
 * Bitácora en el portal del cliente (RF4.4): solo lo que la constructora marcó
 * como visible. El filtro NO está aquí: lo pone la RLS de 0041 (entradas
 * publicadas de las obras del cliente, con sus fotos y aclaraciones). Si no
 * hay nada publicado, la sección no aparece.
 *
 * No se enseña quién la registró: es comunicación de la constructora con su
 * cliente, no de una persona en particular.
 */
export function BitacoraCliente({ entradas }: { entradas: EntradaBitacora[] }) {
  if (entradas.length === 0) return null;
  const dias = agruparPorDia(entradas);

  return (
    <section aria-labelledby="bitacora-heading" className="space-y-4">
      <div>
        <h2 id="bitacora-heading" className="text-base font-semibold text-neutral-900">
          Bitácora de la obra
        </h2>
        <p className="text-sm text-neutral-600">Lo que tu constructora reporta de cada día, con fotos.</p>
      </div>

      <ol className="space-y-6">
        {dias.map((d) => (
          <li key={d.clave}>
            <h3 className="mb-2 text-sm font-semibold text-neutral-900 first-letter:uppercase">
              {fmtDia.format(new Date(d.fecha))}
            </h3>
            <ol className="space-y-3 border-l-2 border-neutral-200 pl-4">
              {d.entradas.map((e) => (
                <li key={e.id} className="space-y-2 rounded-xl border border-neutral-200 bg-white p-4">
                  <p className="flex flex-wrap gap-2 text-xs font-medium text-neutral-700">
                    <span className="uppercase tracking-wide">{ETIQUETA_TIPO[e.tipo]}</span>
                    {e.clima && <span>· Clima: {ETIQUETA_CLIMA[e.clima]}</span>}
                    {e.personal_presente !== null && <span>· {e.personal_presente} personas en obra</span>}
                  </p>
                  <p className="whitespace-pre-wrap text-sm text-neutral-900">{e.texto}</p>

                  {e.fotos.some((f) => f.url) && (
                    <ul className="grid grid-cols-3 gap-2 sm:grid-cols-5" aria-label="Fotos">
                      {e.fotos
                        .filter((f) => f.url)
                        .map((f, i) => (
                          <li key={f.id}>
                            <a
                              href={f.url!}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="block overflow-hidden rounded-lg border border-neutral-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-neutral-900"
                            >
                              {/* eslint-disable-next-line @next/next/no-img-element -- URL firmada de Storage */}
                              <img
                                src={f.url!}
                                alt={`Foto ${i + 1} del ${formatDate(e.fecha)}`}
                                loading="lazy"
                                className="aspect-square w-full object-cover"
                              />
                            </a>
                          </li>
                        ))}
                    </ul>
                  )}

                  {e.aclaraciones.length > 0 && (
                    <div className="rounded-lg bg-amber-50 p-3 text-sm">
                      <p className="text-xs font-semibold uppercase tracking-wide text-amber-900">Aclaración</p>
                      {e.aclaraciones.map((a) => (
                        <p key={a.id} className="whitespace-pre-wrap text-neutral-900">
                          {a.texto} <span className="text-xs text-neutral-700">({formatDate(a.registrada_en)})</span>
                        </p>
                      ))}
                    </div>
                  )}
                </li>
              ))}
            </ol>
          </li>
        ))}
      </ol>
    </section>
  );
}
