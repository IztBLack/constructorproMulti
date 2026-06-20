/// Porta `TextImportParser.kt`: convierte texto pegado (una partida por línea)
/// en conceptos estructurados, detectando unidad, cantidad y precio.
class ParsedConcepto {
  String nombre;
  String unidad;
  double cantidad;
  double precioUnitario;
  ParsedConcepto({
    required this.nombre,
    required this.unidad,
    required this.cantidad,
    required this.precioUnitario,
  });
}

class TextImportParser {
  static const _unidades = [
    'm2', 'm3', 'ml', 'm', 'pza', 'lote', 'kg', 'ton', 'dia', 'hr', 'jornada'
  ];

  static String _sinAcentos(String s) {
    const from = 'áéíóúüñÁÉÍÓÚÜÑ';
    const to = 'aeiouunAEIOUUN';
    var r = s;
    for (var i = 0; i < from.length; i++) {
      r = r.replaceAll(from[i], to[i]);
    }
    return r;
  }

  static List<ParsedConcepto> parse(String text) {
    return text
        .split('\n')
        .map((l) => l.trim())
        .where((l) => l.isNotEmpty)
        .map(_parseLine)
        .where((p) => p != null && p.nombre.trim().isNotEmpty)
        .cast<ParsedConcepto>()
        .toList();
  }

  static ParsedConcepto? _parseLine(String line) {
    var remaining = line;
    var unidad = 'pza';
    var precio = 0.0;
    var cantidad = 1.0;

    // 1. Unidad
    final words = line.split(RegExp(r'\s+'));
    for (var i = 0; i < words.length; i++) {
      final w = _sinAcentos(words[i]).toLowerCase().replaceAll(RegExp(r'[^a-z0-9]'), '');
      if (_unidades.contains(w)) {
        unidad = w;
        remaining = remaining.replaceFirst(words[i], '');
        break;
      }
    }

    // 2. Números (admite $ y comas de miles)
    final numberRegex = RegExp(
        r'(?<=\s|^)[$]?([0-9]{1,3}(?:,[0-9]{3})*(?:\.[0-9]+)?|[0-9]+(?:\.[0-9]+)?)(?=\s|$)');
    final matches = numberRegex.allMatches(remaining).toList();
    final numeros = <({String original, double valor})>[];
    for (final m in matches) {
      final original = m.group(0)!;
      final valor = double.tryParse(original.replaceAll(r'$', '').replaceAll(',', ''));
      if (valor != null) numeros.add((original: original, valor: valor));
    }

    if (numeros.isNotEmpty) {
      if (numeros.length == 1) {
        precio = numeros.first.valor;
        remaining = remaining.replaceFirst(numeros.first.original, '');
      } else {
        final dollar = numeros.where((n) => n.original.contains(r'$'));
        if (dollar.isNotEmpty) {
          precio = dollar.first.valor;
          remaining = remaining.replaceFirst(dollar.first.original, '');
          final qList = numeros.where((n) => n != dollar.first);
          if (qList.isNotEmpty) {
            cantidad = qList.first.valor;
            remaining = remaining.replaceFirst(qList.first.original, '');
          }
        } else {
          // primero = cantidad, último = precio
          cantidad = numeros.first.valor;
          precio = numeros.last.valor;
          remaining = remaining.replaceFirst(numeros.first.original, '');
          if (numeros.first != numeros.last) {
            remaining = remaining.replaceFirst(numeros.last.original, '');
          }
        }
      }
    }

    var nombre = remaining
        .replaceAll(RegExp(r'^[\s\-\*\.]+|[\s\-\*\.]+$'), '')
        .replaceAll(RegExp(r'\s{2,}'), ' ')
        .trim();
    if (nombre.isNotEmpty) {
      nombre = nombre[0].toUpperCase() + nombre.substring(1);
    }

    return ParsedConcepto(
        nombre: nombre, unidad: unidad, cantidad: cantidad, precioUnitario: precio);
  }
}
