/// Clasificador de duplicados para el import de movimientos.
///
/// Llave de duplicado (contrato compartido con el web):
/// `fecha(día) + monto + categoria + tipo + nombre`, todos normalizados
/// (trim, colapsar espacios internos, comparación case-insensitive). Filas
/// que matchean la llave contra un movimiento YA existente en la obra =
/// "Duplicado"; el resto = "Nuevo".
///
/// Opera sobre el tipo de fila generado por Drift (`Movimiento`, de la tabla
/// `Movimientos` en `core/db/app_database.dart`) para los EXISTENTES —así el
/// caller puede pasar directo el resultado de
/// `MovimientoRepository.watchByObra(obraId)`— y sobre [ExcelMovimiento]
/// para los datos recién parseados del archivo.
library;

import '../../core/db/app_database.dart' show Movimiento;
import 'import_models.dart';
import 'mx_time.dart';
import 'normalizacion.dart';

enum EstadoImportMovimiento { nuevo, duplicado }

class MovimientoClasificado {
  final ExcelMovimiento movimiento;
  final EstadoImportMovimiento estado;

  const MovimientoClasificado({
    required this.movimiento,
    required this.estado,
  });

  bool get esDuplicado => estado == EstadoImportMovimiento.duplicado;
  bool get esNuevo => estado == EstadoImportMovimiento.nuevo;
}

/// Llave de duplicado normalizada, común a movimientos existentes (Drift) y
/// a movimientos parseados ([ExcelMovimiento]).
String _llave({
  required int fecha,
  required double monto,
  required String categoria,
  required String tipo,
  required String nombre,
}) {
  // El monto se redondea a centavos para evitar falsos "Nuevo" por ruido de
  // punto flotante (ej. 1000.0000000001 vs 1000.0).
  final montoCentavos = (monto * 100).round();
  return [
    claveDiaMx(fecha),
    montoCentavos.toString(),
    claveNormalizada(categoria),
    claveNormalizada(tipo),
    claveNormalizada(nombre),
  ].join('|');
}

/// Clasifica cada movimiento parseado como Nuevo o Duplicado, comparando
/// contra los movimientos ya existentes de la obra (no eliminados).
List<MovimientoClasificado> clasificarMovimientos({
  required List<Movimiento> existentes,
  required List<ExcelMovimiento> parsed,
}) {
  final llavesExistentes = existentes
      .where((m) => m.deletedAt == null)
      .map((m) => _llave(
            fecha: m.fecha,
            monto: m.monto,
            categoria: m.categoria,
            tipo: m.tipo,
            nombre: m.nombre,
          ))
      .toSet();

  return parsed.map((m) {
    final llave = _llave(
      fecha: m.fecha,
      monto: m.monto,
      categoria: m.categoria,
      tipo: m.tipo,
      nombre: m.nombre,
    );
    final estado = llavesExistentes.contains(llave)
        ? EstadoImportMovimiento.duplicado
        : EstadoImportMovimiento.nuevo;
    return MovimientoClasificado(movimiento: m, estado: estado);
  }).toList();
}
