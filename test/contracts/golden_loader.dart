/// Cargador de los VECTORES DORADOS de `contracts/`.
///
/// Los mismos JSON los lee vitest desde `web/src/lib/contracts/golden.ts`. Un
/// caso escrito una vez se ejecuta dos veces —contra el Dart del móvil y contra
/// el TypeScript de la web— y si una plataforma se desvía fallan las dos
/// suites. El porqué de todo esto está en `contracts/README.md`.
///
/// La regla de oro: **un caso nuevo se agrega en el JSON, no aquí**.
library;

import 'dart:convert';
import 'dart:io';

import 'package:flutter_test/flutter_test.dart';

/// Raíz del repositorio (la carpeta que contiene `contracts/`).
///
/// `flutter test` corre desde la raíz, pero no se da por hecho: se sube desde
/// el directorio actual hasta encontrarla. Así el cargador sirve igual si
/// alguien lanza las pruebas desde un subdirectorio o desde el IDE.
Directory _raizRepo() {
  var dir = Directory.current.absolute;
  for (var i = 0; i < 10; i++) {
    // Se busca `contracts/README.md` y no la carpeta a secas: hay más de una
    // carpeta `contracts` en el repo (esta misma, sin ir más lejos) y una
    // coincidencia temprana daría por raíz un subdirectorio.
    if (File('${dir.path}/contracts/README.md').existsSync()) return dir;
    final padre = dir.parent;
    if (padre.path == dir.path) break;
    dir = padre;
  }
  throw StateError(
    'No se encontró la carpeta contracts/ subiendo desde '
    '${Directory.current.path}. ¿Se corrió flutter test fuera del repo?',
  );
}

/// Un archivo `.golden.json` ya cargado.
class ArchivoGolden {
  ArchivoGolden({
    required this.contrato,
    required this.descripcion,
    required this.casos,
  });

  /// Ruta lógica del contrato (`"notas-obra/totales-nota"`). Sale en los
  /// mensajes de error para saber qué archivo hay que abrir.
  final String contrato;
  final String descripcion;
  final List<CasoGolden> casos;
}

/// Un caso del contrato: entrada, salida esperada y el porqué de su existencia.
class CasoGolden {
  CasoGolden({
    required this.contrato,
    required this.nombre,
    required this.descripcion,
    required this.entrada,
    required this.esperado,
    required this.tolerancia,
  });

  final String contrato;

  /// Identificador estable en kebab-case. Es el nombre del test.
  final String nombre;

  /// Por qué existe el caso. Se imprime junto al fallo: un número sin su
  /// historia se borra en el primer refactor.
  final String descripcion;

  final MapaGolden entrada;
  final MapaGolden esperado;

  /// Margen para comparar flotantes. `null` = comparación exacta.
  final double? tolerancia;

  /// Lo que se le pasa a `test(...)` como nombre: el identificador, a secas.
  /// La descripción no va aquí —haría ilegible la salida de `flutter test`—
  /// sino en [printOnFailure], que solo se imprime cuando el caso falla, que es
  /// justo cuando hace falta saber por qué existía.
  String get titulo => nombre;

  /// Deja el porqué del caso en la salida del fallo. Se llama al entrar al test.
  void anotaElPorque() => printOnFailure('$contrato » $nombre: $descripcion');

  /// Matcher para un número esperado, respetando la [tolerancia] del caso.
  Matcher coincide(num valorEsperado) => tolerancia == null
      ? equals(valorEsperado)
      : closeTo(valorEsperado, tolerancia!);
}

/// Envoltura tipada sobre un objeto del JSON.
///
/// `jsonDecode` devuelve `Map<String, dynamic>` y ahí se pierde el tipo: un
/// `123000` llega como `int` y un `0.5` como `double`, así que cada test
/// acabaría salpicado de `as double` y `.toDouble()`. Estos accesores hacen esa
/// conversión en un solo lugar y fallan con el nombre del campo cuando no está.
class MapaGolden {
  MapaGolden(this._crudo, this._ruta);

  final Map<String, dynamic> _crudo;

  /// Dónde vive este mapa (`"notas-obra/totales-nota » entrada"`), para que el
  /// error diga qué abrir.
  final String _ruta;

  bool contiene(String campo) => _crudo.containsKey(campo);

  dynamic operator [](String campo) => _crudo[campo];

  Never _falta(String campo, String tipo) => throw StateError(
        'El campo "$campo" de $_ruta no es $tipo (vale ${_crudo[campo]}). '
        'Revisa el .golden.json.',
      );

  /// Número obligatorio, siempre como `double`.
  double numero(String campo) {
    final v = _crudo[campo];
    if (v is num) return v.toDouble();
    _falta(campo, 'un número');
  }

  /// Número que el contrato permite ausente o nulo.
  double? numeroOpcional(String campo) {
    final v = _crudo[campo];
    if (v == null) return null;
    if (v is num) return v.toDouble();
    _falta(campo, 'un número o null');
  }

  /// Entero obligatorio (índices, años, días).
  int entero(String campo) {
    final v = _crudo[campo];
    if (v is int) return v;
    if (v is double && v == v.roundToDouble()) return v.toInt();
    _falta(campo, 'un entero');
  }

  String texto(String campo) {
    final v = _crudo[campo];
    if (v is String) return v;
    _falta(campo, 'una cadena');
  }

  String? textoOpcional(String campo) {
    final v = _crudo[campo];
    if (v == null) return null;
    if (v is String) return v;
    _falta(campo, 'una cadena o null');
  }

  bool bandera(String campo) {
    final v = _crudo[campo];
    if (v is bool) return v;
    _falta(campo, 'un booleano');
  }

  /// Objeto anidado.
  MapaGolden mapa(String campo) {
    final v = _crudo[campo];
    if (v is Map) {
      return MapaGolden(Map<String, dynamic>.from(v), '$_ruta.$campo');
    }
    _falta(campo, 'un objeto');
  }

  /// Objeto anidado opcional (`null` en el JSON = ausente).
  MapaGolden? mapaOpcional(String campo) {
    final v = _crudo[campo];
    if (v == null) return null;
    return mapa(campo);
  }

  /// Lista de objetos anidados (renglones, colaboradores, items…).
  List<MapaGolden> lista(String campo) {
    final v = _crudo[campo];
    if (v is List) {
      var i = 0;
      return v.map((e) {
        final ruta = '$_ruta.$campo[${i++}]';
        if (e is Map) return MapaGolden(Map<String, dynamic>.from(e), ruta);
        throw StateError('$ruta no es un objeto.');
      }).toList();
    }
    _falta(campo, 'una lista');
  }

  /// Pares clave→texto (los textos de empresa por tipo de documento).
  Map<String, String> mapaDeTextos(String campo) {
    final v = _crudo[campo];
    if (v == null) return const {};
    if (v is Map) {
      return {
        for (final e in v.entries) e.key.toString(): e.value.toString(),
      };
    }
    _falta(campo, 'un objeto de textos o null');
  }
}

/// Carga `contracts/<rutaRelativa>` (por ejemplo `"nomina/semana"`).
///
/// La extensión `.golden.json` se agrega sola: los tests nombran contratos, no
/// archivos.
ArchivoGolden cargarContrato(String rutaRelativa) {
  final archivo = File('${_raizRepo().path}/contracts/$rutaRelativa.golden.json');
  if (!archivo.existsSync()) {
    throw StateError('No existe el contrato ${archivo.path}');
  }

  final crudo = jsonDecode(archivo.readAsStringSync()) as Map<String, dynamic>;
  final contrato = crudo['contrato'] as String? ?? rutaRelativa;
  final casos = (crudo['casos'] as List).map((c) {
    final m = Map<String, dynamic>.from(c as Map);
    final nombre = m['nombre'] as String;
    return CasoGolden(
      contrato: contrato,
      nombre: nombre,
      descripcion: m['descripcion'] as String? ?? '',
      entrada: MapaGolden(
        Map<String, dynamic>.from(m['entrada'] as Map),
        '$contrato » $nombre » entrada',
      ),
      esperado: MapaGolden(
        Map<String, dynamic>.from(m['esperado'] as Map),
        '$contrato » $nombre » esperado',
      ),
      tolerancia: (m['tolerancia'] as num?)?.toDouble(),
    );
  }).toList();

  if (casos.isEmpty) {
    // Un contrato vacío pasaría en verde sin probar nada, que es peor que no
    // tenerlo: parecería cubierto.
    throw StateError('El contrato $contrato no tiene casos.');
  }

  return ArchivoGolden(
    contrato: contrato,
    descripcion: crudo['descripcion'] as String? ?? '',
    casos: casos,
  );
}
