/// Lee una nota de material pegada de WhatsApp y la convierte en renglones.
///
/// Gemelo de `web/src/lib/listas/leer-nota.ts`; los casos compartidos están en
/// `web/src/lib/listas/casos.json`. El formato es el que ya usan en obra:
///
///     Través
///     4 10:45
///     1 2:80 chica
///     Pasillo
///     2 3:55 estribo 25
///     4:10 1
///     2 3mt
///
/// Reglas (docs/PLAN_LISTAS_MATERIAL.md §6):
/// - Una línea sin números es el NOMBRE DE UNA SECCIÓN («Través» → «Trabes»).
///   Una que termina en «:» también, aunque traiga números («Planta 2:»).
/// - `:`, `.` o `,` entre dígitos es el punto decimal: `10:45` = 10.45 m.
/// - Sufijo `m`/`mt`/`mts` = largo en metros; `cm` = largo en centímetros.
/// - De dos números, el LARGO es el que trae decimal o sufijo y la CANTIDAD el
///   entero; así `4:10 1` es 1 pieza de 4.10 m.
/// - `estribo 25`, `@25` o `c/25` es la separación de estribos en cm.
/// - Las palabras sueltas de una pieza son su nota («chica»).
/// - Una línea con un solo número y palabras es material suelto (LIBRE):
///   «30 bultos de cemento».
///
/// Lo que no se entiende NO se descarta: sale con [RenglonLeido.duda] para que
/// la persona lo revise antes de guardar.
library;

import 'listas_calculo.dart';

class RenglonLeido {
  const RenglonLeido({
    required this.linea,
    required this.seccion,
    required this.tipo,
    required this.cantidad,
    this.largo,
    this.separacionCm,
    this.unidad = '',
    this.descripcion = '',
    this.nota = '',
    this.duda,
  });

  /// La línea tal como venía, para enseñarla junto a la interpretación.
  final String linea;
  final String seccion;
  final TipoRenglonLista tipo;
  final double cantidad;
  final double? largo;
  final double? separacionCm;
  final String unidad;
  final String descripcion;
  final String nota;

  /// Null si se entendió sin ambigüedad; si no, en palabras de obra, qué hay
  /// que revisar.
  final String? duda;
}

/// Nombres de sección que se corrigen al leerlos (sin acentos, minúsculas).
const Map<String, String> _seccionesConocidas = {
  'traves': 'Trabes',
  'trabe': 'Trabes',
  'trabes': 'Trabes',
  'castillo': 'Castillos',
  'castillos': 'Castillos',
  'cadena': 'Cadenas',
  'cadenas': 'Cadenas',
  'dala': 'Dalas',
  'dalas': 'Dalas',
};

/// Unidades que se reconocen en el material suelto.
const Set<String> _unidades = {
  'bulto', 'bultos', 'saco', 'sacos', 'pza', 'pzas', 'pieza', 'piezas',
  'kg', 'kilo', 'kilos', 'ton', 'm3', 'm2', 'ml', 'rollo', 'rollos',
  'viaje', 'viajes', 'tramo', 'tramos', 'lata', 'latas', 'cubeta',
  'cubetas', 'litro', 'litros', 'lt', 'lts', 'millar', 'millares',
};

const Set<String> _palabrasEstribo = {'estribo', 'estribos', 'est', 'estr'};

final RegExp _numero = RegExp(
  r'^(\d+(?:[:.,]\d+)?)(mts|mt|m|metros|metro|cm)?$',
  caseSensitive: false,
);
final RegExp _separacionPegada = RegExp(r'^(?:@|c/)(\d+(?:[:.,]\d+)?)$',
    caseSensitive: false);
final RegExp _vineta = RegExp(r'^[-*•·]+\s*');

String _sinAcentos(String s) {
  const de = 'áéíóúüñÁÉÍÓÚÜÑ';
  const a = 'aeiouunAEIOUUN';
  final b = StringBuffer();
  for (final c in s.split('')) {
    final i = de.indexOf(c);
    b.write(i >= 0 ? a[i] : c);
  }
  return b.toString();
}

double _aNumero(String s) =>
    double.parse(s.replaceAll(':', '.').replaceAll(',', '.'));

String _nombreSeccion(String crudo) {
  final limpio = crudo.replaceAll(RegExp(r':\s*$'), '').trim();
  final clave = _sinAcentos(limpio).toLowerCase();
  final conocido = _seccionesConocidas[clave];
  if (conocido != null) return conocido;
  if (limpio.isEmpty) return '';
  return limpio[0].toUpperCase() + limpio.substring(1);
}

class _Num {
  _Num(this.valor, {required this.decimal, this.sufijo});
  final double valor;
  final bool decimal;
  final String? sufijo;

  bool get pareceLargo => decimal || sufijo != null;

  /// En metros, si el sufijo es `cm` se convierte.
  double get comoLargo => sufijo == 'cm' ? valor / 100 : valor;
}

/// Lee todas las líneas de [texto]. [seccionInicial] es la sección para lo que
/// venga antes del primer encabezado (vacía = «Sin sección»).
List<RenglonLeido> leerNotaMaterial(String texto, {String seccionInicial = ''}) {
  final salida = <RenglonLeido>[];
  var seccion = seccionInicial;
  for (final bruta in texto.split(RegExp(r'\r?\n'))) {
    final linea = bruta.trim().replaceFirst(_vineta, '').trim();
    if (linea.isEmpty) continue;
    final esEncabezado =
        !RegExp(r'\d').hasMatch(linea) || RegExp(r':\s*$').hasMatch(linea);
    if (esEncabezado) {
      seccion = _nombreSeccion(linea);
      continue;
    }
    salida.add(_leerLinea(linea, bruta.trim(), seccion));
  }
  return salida;
}

RenglonLeido _leerLinea(String linea, String original, String seccion) {
  final tokens = linea.split(RegExp(r'\s+'));
  final numeros = <_Num>[];
  final palabras = <String>[];
  double? separacion;

  for (var i = 0; i < tokens.length; i++) {
    final t = tokens[i];
    final tl = _sinAcentos(t).toLowerCase();

    final pegada = _separacionPegada.firstMatch(t);
    if (pegada != null) {
      separacion = _aNumero(pegada.group(1)!);
      continue;
    }
    if (_palabrasEstribo.contains(tl) && i + 1 < tokens.length) {
      final sig = _numero.firstMatch(tokens[i + 1]);
      if (sig != null) {
        separacion = _aNumero(sig.group(1)!);
        i++;
        continue;
      }
    }
    final m = _numero.firstMatch(t);
    if (m != null) {
      final cifra = m.group(1)!;
      numeros.add(_Num(
        _aNumero(cifra),
        decimal: RegExp(r'[:.,]').hasMatch(cifra),
        sufijo: switch (m.group(2)?.toLowerCase()) {
          null => null,
          'cm' => 'cm',
          _ => 'm',
        },
      ));
      continue;
    }
    palabras.add(t);
  }

  final texto = palabras.join(' ');

  if (numeros.isEmpty) {
    return RenglonLeido(
      linea: original,
      seccion: seccion,
      tipo: TipoRenglonLista.libre,
      cantidad: 0,
      descripcion: linea,
      separacionCm: separacion,
      duda: 'No encontré cantidad ni medida.',
    );
  }

  if (numeros.length == 1) {
    final n = numeros.first;
    if (n.pareceLargo) {
      return RenglonLeido(
        linea: original,
        seccion: seccion,
        tipo: TipoRenglonLista.pieza,
        cantidad: 1,
        largo: n.comoLargo,
        separacionCm: separacion,
        nota: texto,
        duda: 'No trae cantidad: se puso 1 pieza.',
      );
    }
    // Un entero y palabras: material suelto. La primera palabra es la unidad
    // si se reconoce («30 bultos de cemento»).
    var unidad = '';
    var descripcion = texto;
    if (palabras.isNotEmpty &&
        _unidades.contains(_sinAcentos(palabras.first).toLowerCase())) {
      unidad = palabras.first.toLowerCase();
      descripcion = palabras
          .skip(1)
          .skipWhile((p) => p.toLowerCase() == 'de')
          .join(' ');
    }
    return RenglonLeido(
      linea: original,
      seccion: seccion,
      tipo: TipoRenglonLista.libre,
      cantidad: n.valor,
      unidad: unidad,
      descripcion: descripcion,
      separacionCm: separacion,
      duda: palabras.isEmpty ? 'Solo trae un número: ¿cantidad o medida?' : null,
    );
  }

  // Dos o más números: uno es la cantidad y otro el largo.
  final largos = numeros.where((n) => n.pareceLargo).toList();
  final enteros = numeros.where((n) => !n.pareceLargo).toList();
  _Num cantidad;
  _Num largo;
  String? duda;
  if (largos.length == 1 && enteros.isNotEmpty) {
    largo = largos.first;
    cantidad = enteros.first;
  } else {
    // Sin pista (dos enteros o dos decimales): cantidad primero, como se
    // escribe casi siempre, y se pide revisar.
    cantidad = numeros[0];
    largo = numeros[1];
    duda = 'Revisa cuál es la cantidad y cuál el largo.';
  }
  final sobrantes = numeros
      .where((n) => !identical(n, cantidad) && !identical(n, largo))
      .map((n) => numeroCorto(n.valor));
  if (sobrantes.isNotEmpty) {
    duda ??= 'Traía más números de los que se esperaban.';
  }
  if (cantidad.valor != cantidad.valor.roundToDouble()) {
    duda ??= 'La cantidad no es un número entero de piezas.';
  }
  return RenglonLeido(
    linea: original,
    seccion: seccion,
    tipo: TipoRenglonLista.pieza,
    cantidad: cantidad.valor,
    largo: largo.comoLargo,
    separacionCm: separacion,
    nota: [texto, ...sobrantes].where((s) => s.isNotEmpty).join(' '),
    duda: duda,
  );
}
