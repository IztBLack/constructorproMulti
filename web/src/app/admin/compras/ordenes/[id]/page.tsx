import { notFound } from 'next/navigation';
import { Badge, BackLink, Card, CardHeader, CardTitle, LinkButton } from '@/components/ui';
import { TextoFinalCard } from '@/components/pdf/texto-final-card';
import { formatCurrency, formatDate } from '@/lib/data/format';
import { getEmpresaUsuario, getNombreEmpresa } from '@/lib/data/empresa';
import { getEmpresaConfig } from '@/lib/data/empresa-config';
import { getObra } from '@/lib/data/obras';
import { hoyMxMs, medianocheMx, msAFechaInput, partesTz } from '@/lib/data/tz';
import { getOrden, listMateriales, listPagos, listProveedores, listRecepciones } from '@/lib/data/compras';
import {
  ETIQUETA_SITUACION,
  faltantes,
  fechaBaseCredito,
  fechaVencimiento,
  recibidoPorRenglon,
  saldoOrden,
  situacionPago,
  totalesDe,
} from '@/lib/compras/calculo';
import { ETIQUETA_ESTADO_ORDEN, TONO_ESTADO_ORDEN, leerResumenFactura } from '@/lib/compras/tipos';
import { origenTextoFinal, resolverTextoFinal, textoIntegrado } from '@/lib/pdf/textos-finales';
import { AccionesOrden, EditorOrden } from './editor-orden';
import { Recepciones } from './recepciones';
import { FacturaProveedor } from './factura-proveedor';
import { PagosOrden } from './pagos-orden';
import { capturaEnObra } from '@/lib/auth/roles';
import { gestionaCompras, vePreciosDeCompras } from '@/lib/auth/roles';
import { PedirVistoBueno } from '@/components/aprobaciones/pedir-visto-bueno';

export const dynamic = 'force-dynamic';

/**
 * Una orden de compra: se arma y emite (admin), se recibe en obra (supervisor
 * o admin), se liga la factura del proveedor y se paga (contador o admin).
 * Cada sección se ofrece solo a quien la puede usar; la barrera real es la RLS
 * y las RPC de 0038.
 */
export default async function OrdenPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const orden = await getOrden(id);
  if (!orden) notFound();

  const [rol, nombreEmpresa, { pdf }, { data: obra }, proveedores, materiales, recepciones] =
    await Promise.all([
      getEmpresaUsuario()
        .then((e) => e.rol as string)
        .catch(() => ''),
      getNombreEmpresa(),
      getEmpresaConfig(),
      getObra(orden.obra_id),
      listProveedores(),
      listMateriales(),
      listRecepciones([id]),
    ]);

  const esAdmin = rol === 'admin';
  // Arma, emite y cancela: el admin o el rol compras (F6; la emisión puede
  // pedir visto bueno según la regla de Ajustes → Visto bueno).
  const gestiona = gestionaCompras(rol);
  const recibe = capturaEnObra(rol) || rol === 'compras' || rol === 'almacen';
  // Almacén recibe por cantidades; los precios no son suyos (F6-9).
  const precios = vePreciosDeCompras(rol);
  const paga = rol === 'admin' || rol === 'contador';
  const pagos = paga ? await listPagos([id]) : [];

  const borrador = orden.estado === 'BORRADOR';
  const emitida = ['EMITIDA', 'PARCIAL', 'RECIBIDA'].includes(orden.estado);
  const t = totalesDe(orden);
  const proveedor = proveedores.data.find((p) => p.id === orden.proveedor_id) ?? null;
  const recibido = recibidoPorRenglon(recepciones.flatMap((r) => r.renglones));
  const falta = faltantes(orden.renglones, recibido);
  const saldo = saldoOrden(t.total, pagos);
  const primera = recepciones.length ? Math.min(...recepciones.map((r) => r.fecha)) : null;
  const vence = fechaVencimiento(fechaBaseCredito({ ...orden, primeraRecepcion: primera }), orden.dias_credito);
  const pv = partesTz(vence);
  const situacion = situacionPago({ saldo, vence, hoy: hoyMxMs(), venceDia: medianocheMx(pv.year, pv.month, pv.day) });
  const ctx = { nombreEmpresa: nombreEmpresa ?? 'ConstructorPro' };

  return (
    <div className="space-y-6">
      <BackLink href="/admin/compras">Compras</BackLink>

      <header className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-neutral-600">Orden de compra</p>
          <h1 className="text-xl font-semibold text-neutral-900">
            OC-{orden.folio} · {proveedor?.nombre ?? 'Proveedor'}
          </h1>
          <p className="mt-1 text-sm text-neutral-700">
            Para {obra?.nombre ?? 'la obra'} · {formatDate(orden.emitida_at ?? orden.fecha)}{' '}
            <Badge tone={TONO_ESTADO_ORDEN[orden.estado]}>{ETIQUETA_ESTADO_ORDEN[orden.estado]}</Badge>
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {precios && (
            <LinkButton href={`/admin/compras/ordenes/${id}/pdf`} variant="secondary" size="sm">
              Ver PDF
            </LinkButton>
          )}
          {gestiona && <AccionesOrden ordenId={id} estado={orden.estado} tieneRenglones={orden.renglones.length > 0} />}
          {rol === 'compras' && borrador && <PedirVistoBueno tipo="COMPRA" objetoId={id} />}
        </div>
      </header>

      {borrador && gestiona ? (
        <EditorOrden
          orden={orden}
          proveedores={proveedores.data.map((p) => ({ id: p.id, nombre: p.nombre, dias: p.dias_credito }))}
          materiales={materiales.data.map((m) => ({
            id: m.id,
            nombre: m.nombre,
            unidad: m.unidad,
            precio: m.ultimo_precio,
          }))}
          fechaEntrega={orden.fecha_entrega ? msAFechaInput(orden.fecha_entrega) : ''}
        />
      ) : (
        <Card padding="none">
          <div className="px-5 pb-2 pt-4">
            <CardTitle as="h2">Material</CardTitle>
            {borrador && <p className="mt-1 text-sm text-neutral-600">Borrador: lo arma el administrador.</p>}
          </div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px] text-sm">
              <thead>
                <tr className="border-y border-neutral-200 text-left text-neutral-600">
                  <th className="px-4 py-2 font-medium">Descripción</th>
                  <th className="px-4 py-2 text-right font-medium">Pedido</th>
                  <th className="px-4 py-2 text-right font-medium">Recibido</th>
                  <th className="px-4 py-2 text-right font-medium">Falta</th>
                  {precios && <th className="px-4 py-2 text-right font-medium">P. unitario</th>}
                  {precios && <th className="px-4 py-2 text-right font-medium">Importe</th>}
                </tr>
              </thead>
              <tbody>
                {orden.renglones.map((r, i) => (
                  <tr key={r.id} className="border-b border-neutral-100 last:border-0">
                    <td className="px-4 py-2 text-neutral-900">
                      {r.descripcion} <span className="text-neutral-600">({r.unidad || '—'})</span>
                    </td>
                    <td className="px-4 py-2 text-right tabular-nums">{falta[i].pedido}</td>
                    <td className="px-4 py-2 text-right tabular-nums">{falta[i].recibido}</td>
                    <td className="px-4 py-2 text-right tabular-nums">
                      {falta[i].faltante > 0 ? (
                        <span className="font-medium text-amber-800">{falta[i].faltante}</span>
                      ) : falta[i].sobrante > 0 ? (
                        <span className="text-blue-700">sobró {falta[i].sobrante}</span>
                      ) : (
                        '—'
                      )}
                    </td>
                    {precios && (
                      <td className="px-4 py-2 text-right tabular-nums">{formatCurrency(r.precio_unitario)}</td>
                    )}
                    {precios && (
                      <td className="px-4 py-2 text-right tabular-nums">
                        {formatCurrency(Math.round(r.cantidad * r.precio_unitario * 100) / 100)}
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {precios && (
            <dl className="space-y-1 border-t border-neutral-200 px-5 py-3 text-sm">
              <Linea etiqueta="Subtotal" valor={formatCurrency(t.subtotal)} />
              <Linea etiqueta={`IVA (${orden.iva_pct}%)`} valor={formatCurrency(t.iva)} />
              <Linea etiqueta="Total" valor={formatCurrency(t.total)} fuerte />
            </dl>
          )}
          {(orden.condiciones || orden.notas) && (
            <div className="space-y-1 border-t border-neutral-200 px-5 py-3 text-sm text-neutral-700">
              {orden.condiciones && <p>Condiciones: {orden.condiciones}</p>}
              {orden.notas && <p>Notas: {orden.notas}</p>}
            </div>
          )}
        </Card>
      )}

      {borrador && gestiona && (
        <TextoFinalCard
          tipo="orden_compra"
          documentoId={orden.id}
          resuelto={resolverTextoFinal({ tipo: 'orden_compra', documento: orden.texto_final, empresa: pdf.textos, ctx })}
          integrado={textoIntegrado('orden_compra', ctx)}
          origen={origenTextoFinal({ tipo: 'orden_compra', documento: orden.texto_final, empresa: pdf.textos })}
          puedeEditar
        />
      )}

      {emitida && (
        <Recepciones
          ordenId={id}
          renglones={orden.renglones.map((r, i) => ({
            id: r.id,
            descripcion: r.descripcion,
            unidad: r.unidad,
            faltante: falta[i].faltante,
          }))}
          recepciones={recepciones.map((r) => ({
            id: r.id,
            fecha: r.fecha,
            notas: r.notas,
            recibidoPor: r.recibido_por_nombre,
            remision: r.remision_uri,
            renglones: r.renglones.map((x) => ({
              descripcion: orden.renglones.find((o) => o.id === x.orden_compra_renglon_id)?.descripcion ?? '—',
              cantidad: x.cantidad_recibida,
              notas: x.notas,
            })),
          }))}
          puedeRecibir={recibe && (orden.estado === 'EMITIDA' || orden.estado === 'PARCIAL')}
          puedeSubirRemision={recibe}
          puedeBorrar={esAdmin}
          hoy={msAFechaInput(hoyMxMs())}
        />
      )}

      {emitida && paga && (
        <>
          <FacturaProveedor
            ordenId={id}
            factura={
              orden.factura_uuid
                ? {
                    uuid: orden.factura_uuid,
                    rfc: orden.factura_rfc,
                    total: orden.factura_total,
                    iva: orden.factura_iva,
                    fecha: orden.factura_fecha,
                    xml: orden.factura_xml_path,
                    pdf: orden.factura_pdf_path,
                    resumen: leerResumenFactura(orden.factura_resumen),
                  }
                : null
            }
          />
          <PagosOrden
            ordenId={id}
            total={t.total}
            saldo={saldo}
            vence={vence}
            situacion={ETIQUETA_SITUACION[situacion.situacion]}
            vencida={situacion.situacion === 'vencida'}
            diasCredito={orden.dias_credito}
            pagos={pagos.map((p) => ({
              id: p.id,
              monto: p.monto,
              fecha: p.fecha,
              metodo: p.metodo_pago,
              referencia: p.referencia,
            }))}
            hoy={msAFechaInput(hoyMxMs())}
          />
        </>
      )}

      {orden.estado === 'CANCELADA' && (
        <Card>
          <CardHeader>
            <CardTitle as="h2">Orden cancelada</CardTitle>
          </CardHeader>
          <p className="text-sm text-neutral-700">
            Cancelada el {formatDate(orden.cancelada_at)}. Lo que venía de requisiciones vuelve a quedar por comprar.
          </p>
        </Card>
      )}

      <p className="text-xs text-neutral-600">
        Cada pago de esta orden entra solo a la caja de {obra?.nombre ?? 'su obra'} como gasto de material: no lo
        captures otra vez en la caja.
      </p>
    </div>
  );
}

function Linea({ etiqueta, valor, fuerte = false }: { etiqueta: string; valor: string; fuerte?: boolean }) {
  return (
    <div className={`flex justify-between ${fuerte ? 'font-semibold text-neutral-900' : 'text-neutral-700'}`}>
      <dt>{etiqueta}</dt>
      <dd className="tabular-nums">{valor}</dd>
    </div>
  );
}
