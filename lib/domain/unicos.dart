/// Quita repetidos de una lista conservando el orden de la primera aparición.
///
/// Para el catálogo de conceptos: cada teléfono sembraba el catálogo base con
/// ids nuevos y los subía, así que en el servidor la misma clave llegó a estar
/// 6 veces. [llave] dice qué es «el mismo» (la clave normalizada) y, entre
/// repetidos, gana el de mayor [preferencia] (p. ej. el que ya está en la
/// nube, o el editado más reciente).
List<T> unicos<T>(
  Iterable<T> items, {
  required String Function(T) llave,
  required int Function(T) preferencia,
}) {
  final elegidos = <String, T>{};
  final orden = <String>[];
  for (final it in items) {
    final k = llave(it);
    final previo = elegidos[k];
    if (previo == null) {
      elegidos[k] = it;
      orden.add(k);
    } else if (preferencia(it) > preferencia(previo)) {
      elegidos[k] = it;
    }
  }
  return [for (final k in orden) elegidos[k] as T];
}

/// Llave de un concepto de catálogo: la clave sin espacios ni mayúsculas; si
/// no tiene clave, la descripción.
String llaveConcepto(String clave, String descripcion) {
  final c = clave.trim().toUpperCase();
  return c.isNotEmpty ? 'c:$c' : 'd:${descripcion.trim().toLowerCase()}';
}
