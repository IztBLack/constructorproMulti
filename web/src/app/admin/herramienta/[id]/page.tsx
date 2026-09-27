import { notFound } from 'next/navigation';
import { BackLink, Badge, EmptyState, PageHeader } from '@/components/ui';
import { getEmpresaUsuario } from '@/lib/data/empresa';
import { listObrasDisponibles } from '@/lib/data/equipo';
import { getHerramienta, listResponsables } from '@/lib/data/herramienta';
import { formatCurrency, formatDate } from '@/lib/data/format';
import { hoyMxMs, msAFechaInput } from '@/lib/data/tz';
import {
  ETIQUETA_ESTADO_HERRAMIENTA,
  ETIQUETA_TIPO_HERRAMIENTA,
  estadoPrestamo,
} from '@/lib/herramienta/herramienta';
import { Devolver, FormHerramienta, Prestar } from '../formularios';
import { SemaforoPrestamo } from '../semaforo';
import { capturaEnObra } from '@/lib/auth/roles';

export const dynamic = 'force-dynamic';

const TONO_ESTADO = { BUENO: 'green', REPARACION: 'amber', BAJA: 'neutral' } as const;

/** Una herramienta y su historial completo: a dónde fue, quién la trajo, cómo regresó. */
export default async function HerramientaDetallePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const hoy = hoyMxMs();
  const hoyInput = msAFechaInput(hoy);
  const [{ data: h, historial, error }, empresa, obras, responsables] = await Promise.all([
    getHerramienta(id),
    getEmpresaUsuario().catch(() => null),
    listObrasDisponibles(),
    listResponsables(),
  ]);
  if (error) {
    return (
      <p className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
        No se pudo cargar la herramienta: {error}
      </p>
    );
  }
  if (!h) notFound();
  const rol = empresa?.rol ?? '';
  const escribe = capturaEnObra(rol);

  return (
    <div className="space-y-6">
      <BackLink href="/admin/herramienta">Herramienta</BackLink>
      <PageHeader
        title={h.nombre}
        description={[ETIQUETA_TIPO_HERRAMIENTA[h.tipo], h.clave && `#${h.clave}`, h.serie && `Serie ${h.serie}`]
          .filter(Boolean)
          .join(' · ')}
        actions={escribe ? <FormHerramienta inicial={h} textoBoton="Editar" /> : undefined}
      />

      <section className="flex flex-wrap items-center gap-3">
        <Badge tone={TONO_ESTADO[h.estado]}>{ETIQUETA_ESTADO_HERRAMIENTA[h.estado]}</Badge>
        {h.costo !== null && <span className="text-sm text-neutral-700">Costó {formatCurrency(h.costo)}</span>}
        {h.notas && <span className="text-sm text-neutral-600">{h.notas}</span>}
        {escribe &&
          (h.prestamo ? (
            <Devolver herramienta={{ id: h.id, nombre: h.nombre }} prestamoId={h.prestamo.id} hoy={hoyInput} />
          ) : (
            h.estado !== 'BAJA' && (
              <Prestar herramienta={{ id: h.id, nombre: h.nombre }} obras={obras.data} responsables={responsables} hoy={hoyInput} />
            )
          ))}
      </section>

      <section aria-labelledby="historial-heading" className="space-y-3">
        <h2 id="historial-heading" className="text-base font-semibold text-neutral-900">
          Historial
        </h2>
        {historial.length === 0 ? (
          <EmptyState title="Nunca se ha prestado" description="Cuando salga a una obra o con alguien, aquí queda." />
        ) : (
          <ol className="divide-y divide-neutral-100 rounded-xl border border-neutral-200 bg-white">
            {historial.map((p) => (
              <li key={p.id} className="space-y-1 p-4 text-sm">
                <p className="font-medium text-neutral-900">
                  {[p.obra_nombre, p.colaborador_nombre].filter(Boolean).join(' · ') || 'Sin destino registrado'}
                </p>
                <p className="text-neutral-700">
                  Salió el {formatDate(p.desde)}
                  {p.entrego_nombre ? ` (entregó ${p.entrego_nombre})` : ''}
                  {p.hasta !== null
                    ? ` · regresó el ${formatDate(p.hasta)}${p.recibio_nombre ? ` (recibió ${p.recibio_nombre})` : ''}`
                    : ''}
                  {p.estado_regreso ? ` · ${ETIQUETA_ESTADO_HERRAMIENTA[p.estado_regreso]}` : ''}
                </p>
                <SemaforoPrestamo estado={estadoPrestamo(p, hoy)} />
                {p.notas && <p className="text-xs text-neutral-600">{p.notas}</p>}
              </li>
            ))}
          </ol>
        )}
      </section>
    </div>
  );
}
