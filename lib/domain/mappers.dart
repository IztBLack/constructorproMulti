import 'package:drift/drift.dart';

import '../core/db/app_database.dart';
import 'models/models.dart' as dom;

/// Convierte filas Drift (clases generadas) a los modelos de dominio puros que
/// consumen los calculadores (NominaCalculator, FlujoCalculator, etc.).

dom.TipoPago _tipoPago(String s) =>
    s == 'DIA' ? dom.TipoPago.dia : dom.TipoPago.destajo;

dom.Puesto puestoToDomain(Puesto r) =>
    dom.Puesto(id: r.id, nombre: r.nombre, salarioDiaDefault: r.salarioDiaDefault);

/// El sueldo llega POR SEPARADO (`sueldo`) porque desde el esquema v10 no vive
/// en `colaboradores`, sino en `colaborador_sueldo`, para que la RLS pueda
/// negárselo al rol `colaborador` (ver la tabla `ColaboradorSueldo`).
///
/// Que sea opcional no es laxitud: **null es el caso normal** de quien no tiene
/// sueldo capturado, y también el de un dispositivo cuyo usuario no tiene
/// permiso para verlo. En los dos casos la nómina cae al salario del puesto, que
/// es exactamente lo que debe pasar.
dom.Colaborador colaboradorToDomain(
  Colaborador r, {
  ColaboradorSueldoRow? sueldo,
}) =>
    dom.Colaborador(
      id: r.id,
      nombre: r.nombre,
      puestoId: r.puestoId,
      tipoPago: _tipoPago(r.tipoPago),
      salarioPersonalizado: sueldo?.salarioPersonalizado,
    );

dom.Asistencia asistenciaToDomain(Asistencia r) => dom.Asistencia(
      colaboradorId: r.colaboradorId,
      obraId: r.obraId,
      fecha: r.fecha,
      fraccion: r.fraccion,
    );

dom.Destajo destajoToDomain(Destajo r) => dom.Destajo(
      colaboradorId: r.colaboradorId,
      obraId: r.obraId,
      fecha: r.fecha,
      monto: r.monto,
    );

dom.Movimiento movimientoToDomain(Movimiento r) => dom.Movimiento(
      tipo: r.tipo == 'ENTRADA'
          ? dom.TipoMovimiento.entrada
          : dom.TipoMovimiento.salida,
      monto: r.monto,
      nombre: r.nombre,
    );

/// Reverso de [movimientoToDomain]: companion PARCIAL (solo los campos que
/// modela `dom.Movimiento`: tipo, monto, nombre) para actualizaciones. Los
/// altas completas (obraId, fecha, categoria, metodoPago, etc.) se hacen vía
/// `MovimientoRepository.add` / `insertBatch`, que trabajan directo con
/// `ExcelMovimiento`/parámetros explícitos, no con este modelo reducido.
MovimientosCompanion movimientoToCompanion(dom.Movimiento m) =>
    MovimientosCompanion(
      tipo: Value(
          m.tipo == dom.TipoMovimiento.entrada ? 'ENTRADA' : 'SALIDA'),
      monto: Value(m.monto),
      nombre: Value(m.nombre),
    );

dom.Partida partidaToDomain(Partida r) =>
    dom.Partida(cantidad: r.cantidad, precioUnitario: r.precioUnitario);

dom.PartidaPresupuesto partidaPresupuestoToDomain(ObraPresupuestoRow r) =>
    dom.PartidaPresupuesto(
      id: r.id,
      obraId: r.obraId,
      concepto: r.concepto,
      seccion: r.seccion,
      unidad: r.unidad,
      cantidad: r.cantidad,
      precioUnitario: r.precioUnitario,
      orden: r.orden,
    );

/// Reverso de [partidaPresupuestoToDomain]: companion completo, apto para
/// `insertOnConflictUpdate` (a diferencia de `dom.Movimiento`, el dominio de
/// `PartidaPresupuesto` mapea 1:1 con la tabla, así que sí trae todo).
ObraPresupuestoCompanion partidaPresupuestoToCompanion(
        dom.PartidaPresupuesto p) =>
    ObraPresupuestoCompanion(
      id: Value(p.id),
      obraId: Value(p.obraId),
      concepto: Value(p.concepto),
      seccion: Value(p.seccion),
      unidad: Value(p.unidad),
      cantidad: Value(p.cantidad),
      precioUnitario: Value(p.precioUnitario),
      orden: Value(p.orden),
    );
