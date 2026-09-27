import Link from 'next/link';
import { notFound } from 'next/navigation';
import { Badge, Card, CardHeader, CardTitle } from '@/components/ui';
import { formatCurrency, formatDate } from '@/lib/data/format';
import { getEmpresaUsuario } from '@/lib/data/empresa';
import { getObra, listObras } from '@/lib/data/obras';
import { hoyMxMs, msAFechaInput } from '@/lib/data/tz';
import {
  existenciasDeObra,
  listMateriales,
  listMovimientosMaterial,
  listOrdenes,
  listProveedores,
  listRequisiciones,
} from '@/lib/data/compras';
import { totalesDe } from '@/lib/compras/calculo';
import {
  ETIQUETA_ESTADO_ORDEN,
  ETIQUETA_ESTADO_REQUISICION,
  TONO_ESTADO_ORDEN,
  TONO_ESTADO_REQUISICION,
} from '@/lib/compras/tipos';
import ObraTabs from '../_obra-tabs';
import { NuevaRequisicion } from './nueva-requisicion';
import { BorrarRequisicion } from './borrar-requisicion';
import { ExistenciasObra } from './existencias-obra';
import { capturaEnObra } from '@/lib/auth/roles';

export const dynamic = 'force-dynamic';

/**
 * Material de la obra (módulo `compras`): pedir material (requisición, RF2.2),
 * ver qué se compró y qué falta por llegar, y lo que hay en la obra
 * (existencias y traspasos, RF2.7).
 *
 * Piden admin y supervisor; el contador solo mira. Recibir se hace en la orden
 * de compra (botón "Recibir" en cada orden por llegar).
 */
export default async function MaterialObraPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [{ data: obra, error: errObra }, rol, reqs, ordenes, materiales, proveedores, obras, existencias, movimientos] =
    await Promise.all([
      getObra(id),
      getEmpresaUsuario()
        .then((e) => ({ rol: e.rol as string }))
        .catch(() => ({ rol: '' })),
      listRequisiciones({ obraId: id, limite: 100 }),
      listOrdenes({ obraId: id, limite: 100 }),
      listMateriales(),
      listProveedores(),
      listObras(),
      existenciasDeObra(id),
      listMovimientosMaterial(id),
    ]);

  if (errObra) {
    return (
      <p className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
        No se pudo cargar la obra: {errObra}
      </p>
    );
  }
  if (!obra) notFound();

  const puedePedir = capturaEnObra(rol.rol) || rol.rol === 'compras';
  const nombreProv = new Map(proveedores.data.map((p) => [p.id, p.nombre]));
  const nombreMaterial = new Map(materiales.data.map((m) => [m.id, m]));
  const porLlegar = ordenes.data.filter((o) => o.estado === 'EMITIDA' || o.estado === 'PARCIAL');
  const otras = ordenes.data.filter((o) => o.estado !== 'EMITIDA' && o.estado !== 'PARCIAL' && o.estado !== 'CANCELADA');
  const error = reqs.error ?? ordenes.error;

  return (
    <div className="space-y-6">
      <ObraTabs obraId={id} />

      <div>
        <h1 className="text-xl font-semibold text-neutral-900">Material de {obra.nombre}</h1>
        <p className="mt-1 text-sm text-neutral-600">
          Pide lo que hace falta, revisa qué ya se compró y registra lo que llega. Cuando se paga, el gasto entra solo a la
          caja de la obra.
        </p>
      </div>

      {error && <p className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">{error}</p>}

      {puedePedir && (
        <NuevaRequisicion
          obraId={id}
          materiales={materiales.data.map((m) => ({ id: m.id, nombre: m.nombre, unidad: m.unidad }))}
        />
      )}

      <Card>
        <CardHeader>
          <div>
            <CardTitle as="h2">Por llegar</CardTitle>
            <p className="mt-1 text-sm text-neutral-600">Órdenes emitidas que todavía tienen material pendiente.</p>
          </div>
        </CardHeader>
        {porLlegar.length === 0 ? (
          <p className="text-sm text-neutral-600">No hay nada pendiente de llegar.</p>
        ) : (
          <ul className="divide-y divide-neutral-100">
            {porLlegar.map((o) => (
              <li key={o.id} className="flex flex-wrap items-center justify-between gap-2 py-2 text-sm">
                <span>
                  <span className="font-medium text-neutral-900">OC-{o.folio}</span> · {nombreProv.get(o.proveedor_id)} ·{' '}
                  {o.renglones.length} {o.renglones.length === 1 ? 'material' : 'materiales'}
                  {o.fecha_entrega ? ` · para el ${formatDate(o.fecha_entrega)}` : ''}{' '}
                  <Badge tone={TONO_ESTADO_ORDEN[o.estado]}>{ETIQUETA_ESTADO_ORDEN[o.estado]}</Badge>
                </span>
                <Link
                  href={`/admin/compras/ordenes/${o.id}`}
                  className="inline-flex min-h-11 items-center rounded-lg border border-neutral-300 px-3 font-medium text-neutral-800 hover:bg-neutral-100"
                >
                  {puedePedir ? 'Recibir' : 'Ver'}
                </Link>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <Card>
        <CardHeader>
          <div>
            <CardTitle as="h2">Requisiciones</CardTitle>
            <p className="mt-1 text-sm text-neutral-600">Lo que se ha pedido para esta obra.</p>
          </div>
        </CardHeader>
        {reqs.data.length === 0 ? (
          <p className="text-sm text-neutral-600">Todavía no se ha pedido material para esta obra.</p>
        ) : (
          <ul className="divide-y divide-neutral-100">
            {reqs.data.map((r) => (
              <li key={r.id} className="py-3 text-sm">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <p className="font-medium text-neutral-900">
                      Requisición {r.folio}{' '}
                      <Badge tone={TONO_ESTADO_REQUISICION[r.estado]}>{ETIQUETA_ESTADO_REQUISICION[r.estado]}</Badge>
                    </p>
                    <p className="text-neutral-600">
                      {r.pedido_por_nombre || 'Alguien del equipo'} · {formatDate(r.created_at)}
                      {r.para_cuando ? ` · para el ${formatDate(r.para_cuando)}` : ''}
                    </p>
                    <ul className="mt-1 text-neutral-700">
                      {r.renglones.map((x) => (
                        <li key={x.id}>
                          {Number(x.cantidad).toLocaleString('es-MX')} {x.unidad} · {x.descripcion}
                        </li>
                      ))}
                    </ul>
                    {r.estado === 'RECHAZADA' && r.motivo_rechazo && (
                      <p className="mt-1 text-red-700">Motivo: {r.motivo_rechazo}</p>
                    )}
                  </div>
                  {puedePedir && (r.estado === 'PENDIENTE' || (r.estado === 'RECHAZADA' && rol.rol === 'admin')) && (
                    <BorrarRequisicion id={r.id} obraId={id} />
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </Card>

      {otras.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle as="h2">Otras órdenes de esta obra</CardTitle>
          </CardHeader>
          <ul className="divide-y divide-neutral-100 text-sm">
            {otras.map((o) => (
              <li key={o.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
                <Link href={`/admin/compras/ordenes/${o.id}`} className="font-medium text-blue-700 underline">
                  OC-{o.folio} · {nombreProv.get(o.proveedor_id)}
                </Link>
                <span>
                  <Badge tone={TONO_ESTADO_ORDEN[o.estado]}>{ETIQUETA_ESTADO_ORDEN[o.estado]}</Badge>{' '}
                  <span className="tabular-nums">{formatCurrency(totalesDe(o).total)}</span>
                </span>
              </li>
            ))}
          </ul>
        </Card>
      )}

      <ExistenciasObra
        obraId={id}
        existencias={existencias.data.map((e) => ({
          ...e,
          nombre: nombreMaterial.get(e.materialId)?.nombre ?? 'Material',
          unidad: nombreMaterial.get(e.materialId)?.unidad ?? '',
        }))}
        movimientos={movimientos.map((m) => ({
          id: m.id,
          fecha: m.fecha,
          tipo: m.tipo,
          cantidad: m.cantidad,
          material: nombreMaterial.get(m.material_id)?.nombre ?? 'Material',
          entrada: m.obra_destino_id === id,
          otraObra:
            obras.data.find((o) => o.id === (m.obra_destino_id === id ? m.obra_id : m.obra_destino_id))?.nombre ?? null,
          notas: m.notas,
        }))}
        materiales={materiales.data.map((m) => ({ id: m.id, nombre: m.nombre, unidad: m.unidad }))}
        obras={obras.data.filter((o) => o.id !== id && o.activa).map((o) => ({ id: o.id, nombre: o.nombre }))}
        puedeRegistrar={puedePedir}
        hoy={msAFechaInput(hoyMxMs())}
        error={existencias.error}
      />
    </div>
  );
}
