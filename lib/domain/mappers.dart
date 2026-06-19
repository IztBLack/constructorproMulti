import '../core/db/app_database.dart';
import 'models/models.dart' as dom;

/// Convierte filas Drift (clases generadas) a los modelos de dominio puros que
/// consumen los calculadores (NominaCalculator, FlujoCalculator, etc.).

dom.TipoPago _tipoPago(String s) =>
    s == 'DIA' ? dom.TipoPago.dia : dom.TipoPago.destajo;

dom.Puesto puestoToDomain(Puesto r) =>
    dom.Puesto(id: r.id, nombre: r.nombre, salarioDiaDefault: r.salarioDiaDefault);

dom.Colaborador colaboradorToDomain(Colaborador r) => dom.Colaborador(
      id: r.id,
      nombre: r.nombre,
      puestoId: r.puestoId,
      tipoPago: _tipoPago(r.tipoPago),
      salarioPersonalizado: r.salarioPersonalizado,
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
    );

dom.Partida partidaToDomain(Partida r) =>
    dom.Partida(cantidad: r.cantidad, precioUnitario: r.precioUnitario);
