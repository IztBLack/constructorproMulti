import { notFound } from 'next/navigation';
import {
  getObra,
  listMovimientosByObra,
  listObras,
  sugerenciasDeMovimientos,
} from '@/lib/data/obras';
import { listPresupuestoObra } from '@/lib/data/presupuesto-obra';
import { listColaboradores, listColaboradoresDeObra } from '@/lib/data/equipo';
import { listClientes } from '@/lib/data/clientes';
import { getEmpresaUsuario } from '@/lib/data/empresa';
import { getNotaCaja } from '@/lib/data/caja-nota';
import { getNombreEmpresa } from '@/lib/data/empresa';
import { getEmpresaConfig } from '@/lib/data/empresa-config';
import { getModulosEmpresa } from '@/lib/data/modulos';
import { listExtrasAprobadosObra } from '@/lib/data/cambios';
import { origenTextoFinal, resolverTextoFinal, textoIntegrado } from '@/lib/pdf/textos-finales';
import { TextoFinalCard } from '@/components/pdf/texto-final-card';
import { TarjetaSiroc } from '@/components/cumplimiento/tarjeta-siroc';
import { getSirocObra, puedeCumplimiento } from '@/lib/data/cumplimiento';
import { avisoSiroc } from '@/lib/cumplimiento/avisos';
import { hoyMxMs } from '@/lib/data/tz';
import ObraHeader from './obra-header';
import { NotaCaja } from './nota-caja';
import RegistrarMovimiento from './registrar-movimiento';
import MovimientosTabla from './movimientos-tabla';
import EquipoObra from './equipo-obra';
import EstadoCuenta from './estado-cuenta';
import PresupuestoObra from './presupuesto-obra';
import ObraTabs from './_obra-tabs';
import { CobrosFiscales } from './cobros-fiscales';
import { getAccesoFiscal, listCobros } from '@/lib/data/fiscal';
import { acumuladosDe, getAvanceFisicoObra, listEstimacionesObra } from '@/lib/data/estimaciones';
import { avanceFinanciero } from '@/lib/estimaciones/avance';
import { costoTotal } from '@/lib/data/presupuesto-obra';
import { AvanceFisicoFinanciero } from '@/components/estimaciones/avance-fisico-financiero';

export const dynamic = 'force-dynamic';

export default async function ObraDetallePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const { data: obra, error: obraError } = await getObra(id);

  if (obraError) {
    return (
      <p className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
        No se pudo cargar la obra: {obraError}
      </p>
    );
  }

  if (!obra) notFound();

  const [
    { data: movimientos, error: movError },
    { data: partidas, error: presupuestoError },
    { data: equipoAsignado, error: equipoError },
    { data: colaboradores, error: colaboradoresError },
    { data: clientes },
    notaCaja,
    { data: todasLasObras },
    nombreEmpresa,
    { pdf },
  ] = await Promise.all([
    listMovimientosByObra(id),
    listPresupuestoObra(id),
    listColaboradoresDeObra(id),
    listColaboradores(),
    listClientes(),
    getNotaCaja(id),
    listObras(),
    getNombreEmpresa(),
    getEmpresaConfig(),
  ]);

  // Para el cambio rápido entre obras (paridad móvil): todas por nombre.
  const obrasLite = (todasLasObras ?? []).map((o) => ({ id: o.id, nombre: o.nombre }));

  // Personal de oficina (admin/supervisor/contador): edita la nota de caja y
  // gestiona los comprobantes. Si falla la consulta de rol, se asume que no
  // (mejor solo lectura que romper la página).
  const rol = await getEmpresaUsuario().then((e) => e.rol).catch(() => '');
  const esOficina = ['admin', 'supervisor', 'contador'].includes(rol);

  // Qué secciones de la obra se muestran según los módulos prendidos. La obra
  // en sí (encabezado, datos) es del núcleo y siempre se ve. Apagar un módulo
  // solo OCULTA su sección: los datos siguen ahí.
  const { activos } = await getModulosEmpresa();
  const conCaja = activos.includes('caja');
  const conPresupuesto = activos.includes('cotizaciones');
  const conEquipo = activos.includes('equipo');
  const conExtras = activos.includes('cambios');
  // Extras aprobados para el estado de cuenta. Si falla la lectura (p. ej. 0036
  // sin aplicar), cuentan como cero: es el estado de cuenta de antes.
  const extrasAprobados =
    conCaja && conExtras ? await listExtrasAprobadosObra(id).then((r) => (r.error ? [] : r.data)) : [];

  // Cobros para facturar (módulo `fiscal`): admin y contador. Van con la caja
  // porque los cobros de la obra SON sus entradas de caja.
  const fiscal = await getAccesoFiscal();
  const verFiscal = conCaja && fiscal.activo && fiscal.puede;
  const cobrosFiscales = verFiscal
    ? (await listCobros({ obraId: id, soloOrigen: 'movimiento' })).data
    : [];
  // SIROC (módulo `cumplimiento`): solo admin y contador, que son quienes ven
  // ese dato por RLS (0040). Recién creada la obra, la tarjeta ya avisa "te
  // quedan N días hábiles" con la fecha de inicio de la obra.
  const conSiroc = activos.includes('cumplimiento') && puedeCumplimiento(rol);
  const siroc = conSiroc ? await getSirocObra(id) : null;

  // Avance físico vs financiero (RF3.7), con el módulo de estimaciones. Si 0039
  // no está aplicada, el físico sale "sin medir" y lo demás igual.
  const conEstimaciones = activos.includes('estimaciones');
  let fisicoFinanciero: React.ComponentProps<typeof AvanceFisicoFinanciero> | null = null;
  if (conEstimaciones && !presupuestoError) {
    const [fisico, ests, extras] = await Promise.all([
      getAvanceFisicoObra(id),
      listEstimacionesObra(id),
      conExtras ? listExtrasAprobadosObra(id) : Promise.resolve({ total: 0, error: null }),
    ]);
    const contratado = costoTotal(partidas) + (extras.error ? 0 : extras.total);
    const cobrado = (movimientos ?? []).filter((m) => m.tipo === 'ENTRADA').reduce((s, m) => s + m.monto, 0);
    const ac = acumuladosDe(ests.error ? [] : ests.data, 0);
    fisicoFinanciero = {
      fisico: fisico?.hayCapturas ? fisico.pct : null,
      financiero: avanceFinanciero(cobrado, contratado),
      estimado: avanceFinanciero(ac.estimado, contratado),
      porCobrar: ac.porCobrar,
      fondoRetenido: ac.fondoRetenido,
    };
  }

  return (
    <div className="space-y-6">
      <ObraTabs obraId={id} />

      <ObraHeader obra={obra} clientes={clientes} obras={obrasLite} />

      {fisicoFinanciero && <AvanceFisicoFinanciero {...fisicoFinanciero} />}

      {conSiroc && (
        <TarjetaSiroc
          obraId={id}
          siroc={siroc}
          obraFechaInicio={obra.fecha_inicio}
          aviso={avisoSiroc(siroc, obra.fecha_inicio, hoyMxMs())}
        />
      )}

      {/* ── Sección financiera ──────────────────────────────────────────── */}

      {/* El error del presupuesto se avisa una sola vez, si alguna de las dos
          secciones que lo usan (estado de cuenta, presupuesto) está a la vista. */}
      {presupuestoError && (conCaja || conPresupuesto) && (
        <p className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
          No se pudo cargar el presupuesto: {presupuestoError}
        </p>
      )}

      {/* 1. Estado de cuenta: encabezado (COSTO TOTAL / RECIBIDO / PENDIENTE) + resúmenes.
          Es de `caja`: sale de los movimientos de la obra. */}
      {conCaja && (
        <>
          {!presupuestoError && (
            <EstadoCuenta
              obraId={id}
              partidas={partidas}
              movimientos={movimientos ?? []}
              extras={extrasAprobados}
            />
          )}

          {verFiscal && <CobrosFiscales cobros={cobrosFiscales} />}

          {/* Nota de conciliación (el apunte al pie del Excel de la contadora). */}
          <NotaCaja obraId={id} notaInicial={notaCaja} puedeEditar={esOficina} />

          {/* Párrafo final del ESTADO DE CUENTA DEL CLIENTE de esta obra. Vive junto
              al estado de cuenta y no en Movimientos porque es lo que se imprime en
              ese documento, no en el PDF de caja interno. */}
          <TextoFinalCard
            tipo="estado_cuenta"
            documentoId={id}
            resuelto={resolverTextoFinal({
              tipo: 'estado_cuenta',
              documento: obra.texto_final,
              empresa: pdf.textos,
              ctx: { nombreEmpresa: nombreEmpresa ?? 'ConstructorPro' },
            })}
            integrado={textoIntegrado('estado_cuenta', {
              nombreEmpresa: nombreEmpresa ?? 'ConstructorPro',
            })}
            origen={origenTextoFinal({
              tipo: 'estado_cuenta',
              documento: obra.texto_final,
              empresa: pdf.textos,
            })}
            puedeEditar={['admin', 'supervisor'].includes(rol)}
          />
        </>
      )}

      {/* 2. Presupuesto por partidas (editable). Es de `cotizaciones`. */}
      {conPresupuesto && !presupuestoError && (
        <PresupuestoObra obraId={id} partidas={partidas} />
      )}

      {/* 3. Equipo de la obra. Es de `equipo`. */}
      {conEquipo && (
        <section className="space-y-3">
          <h2 className="text-sm font-medium text-neutral-700">Equipo de la obra</h2>

          {equipoError && (
            <p className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
              No se pudo cargar el equipo: {equipoError}
            </p>
          )}

          {colaboradoresError && (
            <p className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
              No se pudieron cargar los colaboradores: {colaboradoresError}
            </p>
          )}

          {!equipoError && !colaboradoresError && (
            <EquipoObra
              obraId={id}
              asignados={equipoAsignado}
              colaboradoresDisponibles={colaboradores}
            />
          )}
        </section>
      )}

      {/* 4. Movimientos. Es de `caja`. */}
      {conCaja && (
        <section className="space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 className="text-sm font-medium text-neutral-700">Movimientos</h2>
            <RegistrarMovimiento obraId={id} sugerencias={sugerenciasDeMovimientos(movimientos)} />
          </div>

          {movError && (
            <p className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
              No se pudieron cargar los movimientos: {movError}
            </p>
          )}

          {!movError && (
            <MovimientosTabla
              obraId={id}
              movimientos={movimientos}
              sugerencias={sugerenciasDeMovimientos(movimientos)}
              puedeGestionarComprobante={esOficina}
            />
          )}
        </section>
      )}
    </div>
  );
}
