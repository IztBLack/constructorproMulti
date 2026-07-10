/// Reconciliación de presupuesto (partidas) al importar un estado de cuenta.
///
/// Empareja partidas por `concepto` normalizado y clasifica cada una:
///  - Igual: concepto + cantidad + precioUnitario coinciden.
///  - Conflicto: mismo concepto, pero cantidad y/o precioUnitario difieren
///    (se exponen ambos valores para que la UI decida qué conservar).
///  - Nueva: el concepto solo existe en el archivo importado.
///  - SoloPortal: el concepto solo existe en la obra (Drift). NUNCA se
///    borra automáticamente.
///
/// Opera sobre `ObraPresupuestoRow` (fila Drift de la tabla
/// `ObraPresupuesto`, `core/db/app_database.dart`) para lo EXISTENTE y sobre
/// [ExcelPartida] para lo recién parseado.
library;

import '../../core/db/app_database.dart' show ObraPresupuestoRow;
import 'import_models.dart';
import 'normalizacion.dart';

enum EstadoPartida { igual, conflicto, nueva, soloPortal }

class PartidaReconciliada {
  final String concepto;
  final EstadoPartida estado;

  /// Valores del archivo importado (null si el concepto es SoloPortal).
  final ExcelPartida? deArchivo;

  /// Fila existente en el portal/obra (null si el concepto es Nueva).
  final ObraPresupuestoRow? deObra;

  const PartidaReconciliada({
    required this.concepto,
    required this.estado,
    this.deArchivo,
    this.deObra,
  });
}

/// Compara con tolerancia de punto flotante (centavos) para no marcar
/// "Conflicto" por ruido de redondeo.
bool _casiIgual(double a, double b) => (a - b).abs() < 0.005;

/// Reconcilia las partidas existentes de la obra contra las parseadas del
/// archivo, emparejando por concepto normalizado (trim + colapsar espacios +
/// case-insensitive).
List<PartidaReconciliada> reconciliarPresupuesto({
  required List<ObraPresupuestoRow> existentes,
  required List<ExcelPartida> parsed,
}) {
  final existentesVivas =
      existentes.where((p) => p.deletedAt == null).toList();

  final porConceptoObra = <String, ObraPresupuestoRow>{
    for (final p in existentesVivas) claveNormalizada(p.concepto): p,
  };
  final porConceptoArchivo = <String, ExcelPartida>{
    for (final p in parsed) claveNormalizada(p.concepto): p,
  };

  final resultado = <PartidaReconciliada>[];
  final conceptosVistos = <String>{};

  // Recorre en el orden del archivo primero (Igual/Conflicto/Nueva).
  for (final p in parsed) {
    final clave = claveNormalizada(p.concepto);
    if (!conceptosVistos.add(clave)) continue; // concepto repetido en el archivo
    final existente = porConceptoObra[clave];
    if (existente == null) {
      resultado.add(PartidaReconciliada(
        concepto: p.concepto,
        estado: EstadoPartida.nueva,
        deArchivo: p,
      ));
      continue;
    }
    final igual = _casiIgual(p.cantidad, existente.cantidad) &&
        _casiIgual(p.precioUnitario, existente.precioUnitario);
    resultado.add(PartidaReconciliada(
      concepto: p.concepto,
      estado: igual ? EstadoPartida.igual : EstadoPartida.conflicto,
      deArchivo: p,
      deObra: existente,
    ));
  }

  // Lo que quedó solo en el portal (nunca se borra).
  for (final p in existentesVivas) {
    final clave = claveNormalizada(p.concepto);
    if (porConceptoArchivo.containsKey(clave)) continue; // ya emparejado arriba
    resultado.add(PartidaReconciliada(
      concepto: p.concepto,
      estado: EstadoPartida.soloPortal,
      deObra: p,
    ));
  }

  return resultado;
}
