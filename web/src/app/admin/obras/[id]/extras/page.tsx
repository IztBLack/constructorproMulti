import { notFound } from 'next/navigation';
import { getObra } from '@/lib/data/obras';
import { listExtrasObra } from '@/lib/data/cambios';
import { getEmpresaUsuario } from '@/lib/data/empresa';
import ObraTabs from '../_obra-tabs';
import ExtrasLista from './extras-lista';

export const dynamic = 'force-dynamic';

/**
 * Extras de la obra (órdenes de cambio, 0036): lo que el cliente pide de más,
 * con su precio, aprobado por él desde su portal.
 *
 * Crean y editan borradores admin y supervisor; envía y cancela solo el admin;
 * el contador solo mira. La barrera real son la RLS y las RPC de 0036: los
 * permisos de aquí solo evitan enseñar botones que fallarían.
 */
export default async function ExtrasObraPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  const [{ data: obra, error: obraError }, { data: extras, error }, rol] = await Promise.all([
    getObra(id),
    listExtrasObra(id),
    getEmpresaUsuario()
      .then((e) => e.rol)
      .catch(() => ''),
  ]);

  if (obraError) {
    return (
      <p className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
        No se pudo cargar la obra: {obraError}
      </p>
    );
  }
  if (!obra) notFound();

  return (
    <div className="space-y-6">
      <ObraTabs obraId={id} />

      <div>
        <h1 className="text-xl font-semibold text-neutral-900">Extras de {obra.nombre}</h1>
        <p className="mt-1 text-sm text-neutral-600">
          Lo que el cliente pide de más. Se lo mandas, lo aprueba desde su portal (o con el PDF por
          WhatsApp) y lo aprobado se suma a lo que te debe.
        </p>
        {!obra.cliente_id && (
          <p className="mt-2 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-800">
            Esta obra no tiene un cliente del portal ligado: puedes mandar el PDF por WhatsApp,
            pero para que lo apruebe en línea liga la obra a un cliente (Detalle → Editar).
          </p>
        )}
      </div>

      {error && (
        <p className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
          No se pudieron cargar los extras: {error}
        </p>
      )}

      {!error && (
        <ExtrasLista
          obraId={id}
          extras={extras}
          puedeEditar={['admin', 'supervisor'].includes(rol)}
          esAdmin={rol === 'admin'}
        />
      )}
    </div>
  );
}
