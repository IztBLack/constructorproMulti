/// Lee un número tecleado por una persona en México: «1,500», «$1,500.50»,
/// «1500», « 12.5 % ».
///
/// `double.tryParse` rechaza la coma de miles y el signo de pesos: un precio
/// escrito «1,250» se guardaba como 0 sin avisar (catálogo, destajo, ajustes).
///
/// Reglas:
/// - Se quitan `$`, `%`, espacios y la coma de MILES (una coma seguida de
///   exactamente 3 dígitos).
/// - Una sola coma con 1 o 2 dígitos detrás y sin punto se toma como decimal
///   («12,5» → 12.5): así lo escribe quien trae el teclado en otro idioma.
/// - Cualquier otra cosa → `null` (el campo dice «Monto inválido»).
double? leerNumero(String? texto) {
  if (texto == null) return null;
  var s = texto.trim().replaceAll(RegExp(r'[\s$%]'), '');
  if (s.isEmpty) return null;
  final decimalConComa = RegExp(r'^-?\d+,\d{1,2}$');
  if (!s.contains('.') && decimalConComa.hasMatch(s)) {
    return double.tryParse(s.replaceAll(',', '.'));
  }
  // Comas solo como separador de miles: 1,234,567.89
  if (s.contains(',')) {
    final entero = s.split('.').first.replaceFirst('-', '');
    if (!RegExp(r'^\d{1,3}(,\d{3})+$').hasMatch(entero)) return null;
    s = s.replaceAll(',', '');
  }
  final n = double.tryParse(s);
  if (n == null || n.isNaN || n.isInfinite) return null;
  return n;
}

/// Un número listo para un campo de edición: «3500», no «3500.0»; «583.33».
/// Null → vacío.
String numeroParaEditar(double? n) {
  if (n == null) return '';
  if (n == n.roundToDouble()) return n.toStringAsFixed(0);
  return n.toStringAsFixed(2).replaceFirst(RegExp(r'0+$'), '');
}
