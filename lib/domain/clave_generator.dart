/// Porta `ClaveGenerator.kt`: genera claves de partida (ej. MUR-001) a partir
/// de la descripción, usando un diccionario palabra-clave → prefijo.
class ClaveGenerator {
  // Frases compuestas primero (se evalúan por longitud descendente).
  static const Map<String, String> _diccionario = {
    'mano de obra': 'MO',
    'impermeabilizante': 'IMP',
    'electrosoldada': 'IE',
    'trazo': 'PRE', 'nivelacion': 'PRE', 'despalme': 'PRE',
    'excavacion': 'EXC', 'acarreo': 'ACA', 'relleno': 'REL',
    'compactacion': 'COM', 'afine': 'AFI', 'retiro': 'RET',
    'demolicion': 'DEM', 'limpieza': 'LIM', 'carga': 'CAR',
    'plantilla': 'PLA', 'zapata': 'ZAP', 'contratrabe': 'CTR',
    'cimentacion': 'CIM', 'membrana': 'MEM', 'polietileno': 'MEM',
    'refuerzo': 'REF',
    'losa': 'LOSA', 'nervadura': 'NER', 'caset': 'LOSA', 'reticular': 'LOSA',
    'muro': 'MUR', 'block': 'MUR', 'tabique': 'MUR', 'novablock': 'MUR',
    'firme': 'FIR', 'dentellon': 'DEN', 'desplante': 'DES',
    'aplanado': 'APL', 'emboquillado': 'EMB', 'enjarre': 'ENJ',
    'fino': 'FIN', 'chaflan': 'CHA', 'azotea': 'AZ', 'pretil': 'AZ',
    'tinaco': 'TIN', 'cisterna': 'CIS', 'alberca': 'ALB', 'barda': 'BAR',
    'castillo': 'CAS', 'columna': 'COL', 'dala': 'DAL', 'trabe': 'TRA', 'viga': 'VIG',
    'plafon': 'PLF', 'tablaroca': 'TAB', 'durock': 'DUR', 'pintura': 'PIN',
    'alisado': 'ALI', 'estuco': 'EST', 'ceramica': 'CER', 'porcelanato': 'POR',
    'piso': 'PIS', 'loseta': 'LOS', 'zocalo': 'ZOC', 'azulejo': 'AZU',
    'recubrimiento': 'REC',
    'electrica': 'IE', 'electrico': 'IE', 'luminaria': 'IE', 'contacto': 'IE',
    'cableado': 'IE', 'cable': 'IE', 'tablero': 'IE', 'interruptor': 'IE',
    'circuito': 'IE', 'canalizacion': 'IE',
    'sanitaria': 'IS', 'hidraulica': 'IS', 'tuberia': 'IS', 'drenaje': 'IS',
    'registro': 'REG', 'pozo': 'POZ', 'inodoro': 'IS', 'lavabo': 'IS',
    'regadera': 'IS', 'wc': 'IS',
    'escalera': 'ESC', 'forjado': 'ESC', 'rampa': 'RAM',
    'canceleria': 'CAN', 'cancel': 'CAN', 'vidrio': 'VID',
    'puerta': 'PTA', 'ventana': 'VEN', 'madera': 'MAD', 'mueble': 'MUE',
    'carpinteria': 'CAR',
    'herreria': 'HER', 'acero': 'ACE', 'soldadura': 'SOL', 'perfil': 'PER',
    'lamina': 'LAM', 'fierro': 'FIE',
    'aire acondicionado': 'AC', 'minisplit': 'AC', 'ducto': 'AC',
    'jardinera': 'JAR', 'andador': 'AND', 'estacionamiento': 'EST',
    'suministro': 'SUM', 'fabricacion': 'FAB', 'instalacion': 'INST',
    'colocacion': 'COLOC', 'construccion': 'CONS', 'habilitado': 'HAB',
    'vaciado': 'VAC', 'cimbrado': 'CIM', 'armado': 'ARM', 'vibrado': 'VIB',
    'bombeado': 'BOM', 'impermeabilizar': 'IMP',
  };

  static String _sinAcentos(String s) {
    const from = 'áéíóúüñ';
    const to = 'aeiouun';
    var r = s.toLowerCase();
    for (var i = 0; i < from.length; i++) {
      r = r.replaceAll(from[i], to[i]);
    }
    return r;
  }

  /// Genera la clave para [descripcion] evitando colisiones con [clavesExistentes].
  static String generar(String descripcion, List<String> clavesExistentes) {
    final desc = _sinAcentos(descripcion);
    // Buscar prefijo: claves del diccionario por longitud descendente.
    final keys = _diccionario.keys.toList()
      ..sort((a, b) => b.length.compareTo(a.length));
    var prefijo = 'GEN';
    for (final k in keys) {
      if (desc.contains(k)) {
        prefijo = _diccionario[k]!;
        break;
      }
    }
    // Siguiente número para ese prefijo.
    var maxNum = 0;
    final re = RegExp('^$prefijo-(\\d+)\$');
    for (final c in clavesExistentes) {
      final m = re.firstMatch(c.trim().toUpperCase());
      if (m != null) {
        final n = int.tryParse(m.group(1)!) ?? 0;
        if (n > maxNum) maxNum = n;
      }
    }
    final num = (maxNum + 1).toString().padLeft(3, '0');
    return '$prefijo-$num';
  }
}
