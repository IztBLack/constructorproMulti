import { Ayuda } from '@/components/guia/ayuda';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { Badge, Card, CardTitle, EmptyState, TableContainer, THead, Th, TBody, Tr, Td } from '@/components/ui';
import { getCliente, listObrasDeCliente, listCotizacionesDeCliente } from '@/lib/data/clientes';
import { formatDate } from '@/lib/data/format';
import EditarClienteForm from './editar-cliente-form';
import CodigoAcceso from './codigo-acceso';
import { getModulosEmpresa } from '@/lib/data/modulos';
import { getAccesoFiscal, getClienteFiscal } from '@/lib/data/fiscal';
import { DatosFiscalesCliente } from './datos-fiscales';

export const dynamic = 'force-dynamic';

const ESTADO_LABEL: Record<string, string> = {
  BORRADOR: 'Borrador',
  ENVIADA: 'Enviada',
  ACEPTADA: 'Aceptada',
  RECHAZADA: 'Rechazada',
  CONVERTIDA: 'Convertida',
};

export default async function ClienteDetallePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const { data: cliente, error } = await getCliente(id);

  if (error) {
    return (
      <p className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
        No se pudo cargar el cliente: {error}
      </p>
    );
  }
  if (!cliente) notFound();

  const [{ data: obras }, { data: cotizaciones }, { activos }] = await Promise.all([
    listObrasDeCliente(id),
    listCotizacionesDeCliente(id),
    getModulosEmpresa(),
  ]);
  const conPortal = activos.includes('portal');
  const conCotizaciones = activos.includes('cotizaciones');
  // Datos para factura: solo admin y contador (RR1b.1) y con el módulo prendido.
  const fiscal = await getAccesoFiscal();
  const verFiscal = fiscal.activo && fiscal.puede;
  const datosFiscales = verFiscal ? await getClienteFiscal(id) : null;

  return (
    <div className="space-y-6">
      <div>
        <Link href="/admin/clientes" className="text-sm text-neutral-500 hover:underline">
          ← Clientes
        </Link>
      </div>

      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-neutral-900">{cliente.nombre}</h1>
          <p className="text-sm text-neutral-500">
            {cliente.email || 'Sin correo'} · {cliente.telefono || 'Sin teléfono'}
          </p>
        </div>
        <EditarClienteForm cliente={cliente} />
      </header>

      {/* Dar acceso al portal es lo que controla el módulo `portal` en el panel.
          Apagarlo NO desvincula a quien ya entra: el portal (/cliente) no lee
          empresa_config (la RLS no se lo permite al rol cliente) y quitarle el
          acceso a alguien es una decisión aparte, no efecto de un interruptor. */}
      {conPortal && (
        <Card data-guia="cliente-portal">
          <CardTitle as="h2" className="mb-3 text-sm font-semibold text-neutral-700">
            Acceso al portal <Ayuda clave="cliente.portal" />
          </CardTitle>
          <CodigoAcceso clienteId={cliente.id} vinculado={cliente.user_id !== null} />
        </Card>
      )}

      {verFiscal && (
        <DatosFiscalesCliente clienteId={cliente.id} datos={datosFiscales} conPortal={conPortal} />
      )}

      <section className="space-y-3">
        <h2 className="text-sm font-medium text-neutral-700">Obras asignadas</h2>
        {obras.length === 0 ? (
          <EmptyState
            title="Sin obras asignadas"
            description="Asigna este cliente a una obra desde el detalle de la obra."
          />
        ) : (
          <TableContainer>
            <THead>
              <Th>Obra</Th>
              <Th>Ubicación</Th>
              <Th className="text-right">Avance</Th>
              <Th>Estado</Th>
            </THead>
            <TBody>
              {obras.map((o) => (
                <Tr key={o.id}>
                  <Td className="font-medium text-neutral-900">
                    <Link href={`/admin/obras/${o.id}`} className="hover:underline">
                      {o.nombre}
                    </Link>
                  </Td>
                  <Td className="text-neutral-600">{o.ubicacion || '—'}</Td>
                  <Td className="text-right tabular-nums">{o.avance ?? 0}%</Td>
                  <Td>
                    <Badge tone={o.activa ? 'green' : 'neutral'}>
                      {o.activa ? 'Activa' : 'Inactiva'}
                    </Badge>
                  </Td>
                </Tr>
              ))}
            </TBody>
          </TableContainer>
        )}
      </section>

      {conCotizaciones && (
        <section className="space-y-3">
          <h2 className="text-sm font-medium text-neutral-700">Cotizaciones asignadas</h2>
          {cotizaciones.length === 0 ? (
            <EmptyState
              title="Sin cotizaciones asignadas"
              description="Asigna este cliente a una cotización al crearla o editarla."
            />
          ) : (
            <TableContainer>
              <THead>
                <Th>Proyecto</Th>
                <Th>Fecha</Th>
                <Th>Estado</Th>
              </THead>
              <TBody>
                {cotizaciones.map((c) => (
                  <Tr key={c.id}>
                    <Td className="font-medium text-neutral-900">
                      <Link href={`/admin/cotizaciones/${c.id}`} className="hover:underline">
                        {c.nombre_proyecto}
                      </Link>
                    </Td>
                    <Td className="text-neutral-600">{formatDate(c.fecha)}</Td>
                    <Td>
                      <Badge tone="neutral">{ESTADO_LABEL[c.estado] ?? c.estado}</Badge>
                    </Td>
                  </Tr>
                ))}
              </TBody>
            </TableContainer>
          )}
        </section>
      )}
    </div>
  );
}
