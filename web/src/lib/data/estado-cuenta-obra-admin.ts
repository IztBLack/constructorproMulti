/// Estado de cuenta del CLIENTE, pero calculado desde el lado ADMIN (oficina).
///
/// ¿Por qué existe este archivo si ya hay `getEstadoCuentaObra` en
/// `portal-cliente.ts`? Porque aquel usa queries con RLS de CLIENTE: la política
/// de `movimientos` solo deja ver `tipo='ENTRADA'` al cliente autenticado, y la
/// de `obras/obra_presupuesto` acota a las obras del propio cliente. Si un
/// usuario STAFF llamara esas funciones, la RLS le devolvería VACÍO (no es el
/// cliente vinculado). Por eso aquí usamos las funciones de datos del admin
/// (`listPresupuestoObra`, `listMovimientosByObra`), que sí leen bajo la RLS de
/// staff, y REPRODUCIMOS la misma forma `EstadoCuentaObra` para alimentar el
/// MISMO builder del documento del cliente.
///
/// GARANTÍA DE SEGURIDAD: el documento del cliente jamás debe mostrar SALIDAS
/// (gastos, nómina, pagos internos). `listMovimientosByObra` trae TODO (entradas
/// y salidas), así que aquí filtramos EXPLÍCITAMENTE `tipo === 'ENTRADA'` antes
/// de mapear. El builder solo recibe `entradas`, de modo que no puede filtrar de
/// más ni de menos: lo que no entre aquí, no existe para el documento.

import { getObra, listMovimientosByObra } from './obras';
import { listPresupuestoObra } from './presupuesto-obra';
import type {
  EntradaPortal,
  EstadoCuentaObra,
  PartidaPresupuestoPortal,
} from './portal-cliente';
import type { Obra } from './types';

export interface EstadoCuentaObraAdminResult {
  obra: Obra | null;
  estado: EstadoCuentaObra;
  error: string | null;
}

/// Devuelve el estado de cuenta (para el CLIENTE) de una obra, con datos
/// legibles por el ADMIN. Valida el acceso a la obra con `getObra` (RLS staff).
export async function getEstadoCuentaObraAdmin(
  obraId: string,
): Promise<EstadoCuentaObraAdminResult> {
  const [
    { data: obra, error: errObra },
    { data: partidasRaw, error: errPres },
    { data: movimientos, error: errMov },
  ] = await Promise.all([
    getObra(obraId),
    listPresupuestoObra(obraId),
    listMovimientosByObra(obraId),
  ]);

  const vacio: EstadoCuentaObra = {
    costoTotal: 0,
    recibido: 0,
    pendiente: 0,
    pagadoPct: 0,
    partidas: [],
    entradas: [],
  };

  const error = errObra ?? errPres ?? errMov;
  if (error) return { obra: null, estado: vacio, error };
  if (!obra) return { obra: null, estado: vacio, error: null };

  // Partidas del presupuesto → misma forma que espera el builder del cliente.
  const partidas: PartidaPresupuestoPortal[] = partidasRaw.map((p) => ({
    id: p.id,
    concepto: p.concepto,
    unidad: p.unidad,
    cantidad: p.cantidad,
    precio_unitario: p.precio_unitario,
    orden: p.orden,
  }));

  // FILTRO CRÍTICO: solo ENTRADAS. Nunca SALIDAS. Ver nota de cabecera.
  // `listMovimientosByObra` ya viene ordenado por fecha desc, igual que la vía
  // del cliente (`listEntradasObraCliente`), así que el orden del PDF coincide.
  const entradas: EntradaPortal[] = movimientos
    .filter((m) => m.tipo === 'ENTRADA')
    .map((m) => ({
      id: m.id,
      fecha: m.fecha,
      concepto: m.concepto,
      categoria: m.categoria,
      monto: m.monto,
      metodo_pago: m.metodo_pago,
      referencia: m.referencia,
    }));

  // Mismo modelo que `getEstadoCuentaObra`: COSTO TOTAL = Σ presupuesto,
  // RECIBIDO = Σ entradas, PENDIENTE = costo − recibido.
  const costoTotal = partidas.reduce((acc, p) => acc + p.cantidad * p.precio_unitario, 0);
  const recibido = entradas.reduce((acc, e) => acc + e.monto, 0);
  const pendiente = costoTotal - recibido;
  const pagadoPct =
    costoTotal > 0 ? Math.min(100, Math.round((recibido / costoTotal) * 100)) : 0;

  return {
    obra,
    estado: { costoTotal, recibido, pendiente, pagadoPct, partidas, entradas },
    error: null,
  };
}
