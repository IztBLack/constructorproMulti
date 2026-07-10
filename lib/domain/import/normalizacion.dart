/// Normalizaciones compartidas por el parser de import, el clasificador de
/// duplicados y la reconciliación de presupuesto. Espeja las funciones
/// homónimas de `web/src/lib/excel/estado-cuenta-excel.ts`.
library;

/// Recorta espacios y colapsa espacios internos múltiples a uno solo. Base
/// de la comparación "normalizada" del contrato de duplicados (trim +
/// collapse whitespace + case-insensitive).
String colapsarEspacios(String s) => s.trim().replaceAll(RegExp(r'\s+'), ' ');

/// Clave de comparación normalizada: recorta, colapsa espacios y pasa a
/// mayúsculas (case-insensitive). Usar para comparar, NO para mostrar.
String claveNormalizada(String s) => colapsarEspacios(s).toUpperCase();

/// Normaliza TIPO de movimiento: acepta variantes en español y
/// mayúsculas/minúsculas. Devuelve null si no se reconoce (fila inválida).
String? normalizarTipo(String raw) {
  final s = raw.toUpperCase().trim();
  if (s == 'ENTRADA' || s == 'INGRESO' || s == 'DEPOSITO' || s == 'DEPÓSITO') {
    return 'ENTRADA';
  }
  if (s == 'SALIDA' || s == 'EGRESO' || s == 'GASTO' || s == 'PAGO') {
    return 'SALIDA';
  }
  return null;
}

/// Normaliza metodo_pago a un set conocido; si no matchea ningún patrón,
/// conserva el valor original (recortado).
String normalizarMetodoPago(String raw) {
  final s = raw.trim();
  if (s.isEmpty) return '';
  final u = s.toUpperCase();
  if (u.contains('TRANSFER') || u.contains('TRANSF')) return 'Transferencia';
  if (u.contains('CHEQUE')) return 'Cheque';
  if (u.contains('EFECTIVO') || u.contains('CASH')) return 'Efectivo';
  if (u.contains('TARJETA') || u.contains('CARD')) return 'Tarjeta';
  return s;
}
