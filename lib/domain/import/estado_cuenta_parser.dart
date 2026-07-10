/// Parser del "estado de cuenta" de una obra (Excel .xlsx o .csv) hacia
/// [ParsedObraData]. Puerto de `web/src/lib/excel/estado-cuenta-excel.ts`
/// (función `parsearExcelObra`): mismo layout de plantilla (encabezado OBRA,
/// partidas del presupuesto, fila de encabezados FECHA|CONCEPTO|CANTIDAD|
/// NOMBRE|CANAL|TIPO|OBSERVACIONES, filas de movimientos), misma detección
/// de columnas, mismo manejo de fechas (serial de Excel → medianoche MX) y
/// mismas advertencias por fila omitida.
///
/// Ambos formatos (.xlsx y .csv) se normalizan primero a una grilla genérica
/// ([_Cell] por celda) y comparten UN solo algoritmo de parseo
/// ([_parsearGrid]); solo cambia el adaptador que produce la grilla.
library;

import 'dart:typed_data';

import 'package:csv/csv.dart';
import 'package:excel/excel.dart' as xlsx;

import 'import_models.dart';
import 'mx_time.dart';
import 'normalizacion.dart';

/// Valor de una celda, ya desambiguado en texto / número / fecha. Es la
/// representación común entre el adaptador de .xlsx (celdas tipadas) y el
/// de .csv (todo texto, con números que el parser de CSV ya detecta).
class _Cell {
  final String? texto;
  final double? numero;

  /// Presente SOLO si la celda de origen es explícitamente una fecha
  /// (celda de Excel con formato fecha). El adaptador CSV nunca la llena:
  /// las fechas en CSV llegan como texto y se interpretan en [_aFechaMs].
  final DateTime? fecha;

  const _Cell({this.texto, this.numero, this.fecha});

  static const vacia = _Cell();
}

/// Fila de un archivo con formato inválido o vacío: nada que parsear.
class FormatoImportNoSoportado implements Exception {
  final String mensaje;
  const FormatoImportNoSoportado(this.mensaje);
  @override
  String toString() => 'FormatoImportNoSoportado: $mensaje';
}

// ── API pública ────────────────────────────────────────────────────────────

/// Parsea un archivo `.xlsx` (bytes crudos) con el layout de la plantilla
/// "estado de cuenta".
ParsedObraData parsearXlsxObra(Uint8List bytes) {
  final wb = xlsx.Excel.decodeBytes(bytes);
  if (wb.tables.isEmpty) {
    throw const FormatoImportNoSoportado(
        'El archivo Excel no contiene hojas.');
  }
  final sheet = wb.tables[wb.tables.keys.first]!;
  final grid = <List<_Cell>>[];
  for (final row in sheet.rows) {
    grid.add(row.map(_celdaDesdeXlsx).toList());
  }
  return _parsearGrid(grid);
}

/// Parsea un archivo `.csv` (contenido como texto, cualquier salto de
/// línea) con el mismo layout de columnas que la plantilla de Excel.
ParsedObraData parsearCsvObra(String contenido) {
  // `CsvToListConverter` matchea el `eol` de forma literal (no autodetecta
  // \n vs \r\n): normalizamos todos los saltos de línea a \n antes de
  // parsear, para aceptar archivos exportados desde Windows/Excel (\r\n),
  // Mac clásico (\r) o Unix/nuestros tests (\n) por igual.
  final normalizado = contenido.replaceAll('\r\n', '\n').replaceAll('\r', '\n');
  final filas = const CsvToListConverter(
    shouldParseNumbers: true,
    eol: '\n',
  ).convert(normalizado);
  final grid = filas.map((fila) {
    return fila.map<_Cell>(_celdaDesdeCsv).toList();
  }).toList();
  return _parsearGrid(grid);
}

// ── Adaptadores: valor crudo de celda → [_Cell] ────────────────────────────

_Cell _celdaDesdeXlsx(xlsx.Data? data) {
  final v = data?.value;
  if (v == null) return _Cell.vacia;
  switch (v) {
    case xlsx.TextCellValue():
      return _Cell(texto: v.toString());
    case xlsx.IntCellValue():
      return _Cell(numero: v.value.toDouble(), texto: v.value.toString());
    case xlsx.DoubleCellValue():
      return _Cell(numero: v.value, texto: v.value.toString());
    case xlsx.BoolCellValue():
      return _Cell(texto: v.value.toString());
    case xlsx.DateCellValue():
      return _Cell(fecha: DateTime.utc(v.year, v.month, v.day));
    case xlsx.DateTimeCellValue():
      return _Cell(
          fecha: DateTime.utc(
              v.year, v.month, v.day, v.hour, v.minute, v.second));
    case xlsx.TimeCellValue():
      return _Cell(texto: v.toString());
    case xlsx.FormulaCellValue():
      return _Cell(texto: v.formula);
  }
}

_Cell _celdaDesdeCsv(Object? v) {
  if (v == null) return _Cell.vacia;
  if (v is num) return _Cell(numero: v.toDouble(), texto: _numATexto(v));
  return _Cell(texto: v.toString());
}

String _numATexto(num v) {
  // Evita "344.0" cuando el CSV trae un entero (el parser de CANTIDAD de
  // partidas hace match sobre el texto, ej. "344 m2").
  if (v is int || v == v.roundToDouble()) return v.toInt().toString();
  return v.toString();
}

// ── Helpers de celda (equivalentes a toStr/toNumber/toDateMs del web) ──────

String _texto(_Cell? c) {
  if (c == null) return '';
  if (c.texto != null) return c.texto!.trim();
  if (c.fecha != null) return c.fecha!.toIso8601String();
  return '';
}

double? _numero(_Cell? c) {
  if (c == null) return null;
  if (c.numero != null) return c.numero;
  final t = c.texto;
  if (t == null || t.trim().isEmpty) return null;
  final limpio = t.replaceAll(',', '').replaceAll(r'$', '').trim();
  return double.tryParse(limpio);
}

/// Serial de fecha de Excel (días desde 1899-12-30) → epoch ms UTC.
int _excelSerialAMs(double serial) {
  const msPorDia = 86400000;
  return ((serial - 25569) * msPorDia).round();
}

/// Convierte el valor de una celda a epoch ms anclado a medianoche MX de su
/// fecha de calendario. Acepta celdas de fecha tipadas (xlsx), seriales
/// numéricos, epoch ms crudo, o strings en formatos comunes (ISO, DD/MM/YYYY,
/// DD-MM-YYYY).
int? _aFechaMs(_Cell? c) {
  if (c == null) return null;
  DateTime? base;
  if (c.fecha != null) {
    base = c.fecha;
  } else if (c.numero != null) {
    final n = c.numero!;
    if (n > 25569 && n < 73049) {
      base = DateTime.fromMillisecondsSinceEpoch(_excelSerialAMs(n),
          isUtc: true);
    } else if (n > 1000000000000) {
      base = DateTime.fromMillisecondsSinceEpoch(n.round(), isUtc: true);
    }
  } else if (c.texto != null && c.texto!.trim().isNotEmpty) {
    base = _parsearFechaTexto(c.texto!.trim());
  }
  if (base == null) return null;
  return medianocheMx(base.year, base.month, base.day);
}

/// Interpreta fechas en texto: ISO (`YYYY-MM-DD[THH:mm...]`), `DD/MM/YYYY` y
/// `DD-MM-YYYY` (convención mexicana, la que usa la plantilla exportada).
DateTime? _parsearFechaTexto(String s) {
  final iso = RegExp(r'^(\d{4})-(\d{1,2})-(\d{1,2})');
  final mIso = iso.firstMatch(s);
  if (mIso != null) {
    final y = int.parse(mIso.group(1)!);
    final mo = int.parse(mIso.group(2)!);
    final d = int.parse(mIso.group(3)!);
    if (mo >= 1 && mo <= 12 && d >= 1 && d <= 31) {
      return DateTime.utc(y, mo, d);
    }
  }
  final dmy = RegExp(r'^(\d{1,2})[/-](\d{1,2})[/-](\d{4})');
  final mDmy = dmy.firstMatch(s);
  if (mDmy != null) {
    final d = int.parse(mDmy.group(1)!);
    final mo = int.parse(mDmy.group(2)!);
    final y = int.parse(mDmy.group(3)!);
    if (mo >= 1 && mo <= 12 && d >= 1 && d <= 31) {
      return DateTime.utc(y, mo, d);
    }
  }
  return DateTime.tryParse(s);
}

// ── Algoritmo compartido: grilla → ParsedObraData ──────────────────────────

_Cell? _celda(List<List<_Cell>> grid, int fila, int col) {
  if (fila < 0 || fila >= grid.length) return null;
  final row = grid[fila];
  if (col < 0 || col >= row.length) return null;
  return row[col];
}

ParsedObraData _parsearGrid(List<List<_Cell>> grid) {
  final advertencias = <String>[];
  var obraNombre = '';
  final partidas = <ExcelPartida>[];
  final movimientos = <ExcelMovimiento>[];

  // ── 1. Nombre de la obra (fila 1 [índice 0], col B [índice 1]) ──────────
  {
    final a1 = _texto(_celda(grid, 0, 0)).toUpperCase();
    final b1 = _texto(_celda(grid, 0, 1));
    if (a1.contains('OBRA')) {
      obraNombre = b1;
    }
    if (obraNombre.isEmpty) {
      obraNombre = b1.isNotEmpty ? b1 : 'Obra sin nombre';
    }
  }

  // ── 2. Buscar fila de encabezados del libro de movimientos ──────────────
  var headerRow = -1;
  var colFecha = -1;
  var colConcepto = -1;
  var colCantidad = -1;
  var colNombre = -1;
  var colCanal = -1;
  var colTipo = -1;
  var colObs = -1;

  for (var r = 0; r < grid.length; r++) {
    var hasFecha = false;
    var hasConcepto = false;
    final row = grid[r];
    for (var c = 0; c < row.length; c++) {
      final v = _texto(row[c]).toUpperCase();
      if (v == 'FECHA') {
        hasFecha = true;
        colFecha = c;
      } else if (v == 'CONCEPTO') {
        hasConcepto = true;
        colConcepto = c;
      } else if (v == 'CANTIDAD') {
        colCantidad = c;
      } else if (v == 'NOMBRE') {
        colNombre = c;
      } else if (v == 'CANAL') {
        colCanal = c;
      } else if (v == 'TIPO') {
        colTipo = c;
      } else if (v == 'OBSERVACIONES' || v == 'OBS') {
        colObs = c;
      }
    }
    if (hasFecha && hasConcepto) {
      headerRow = r;
      break;
    }
  }

  // ── 3. Parsear partidas (filas 1..headerRow-1, índice 0-based) ──────────
  if (headerRow > 1) {
    for (var r = 1; r < headerRow; r++) {
      final a = _texto(_celda(grid, r, 0)).toUpperCase();

      if (a.contains('COSTO TOTAL') ||
          a.contains('RECIBIDO') ||
          a.contains('PENDIENTE') ||
          a.isEmpty) {
        continue;
      }

      // Formato: A=concepto, B=cantidad+unidad, C="PRECIO UNITARIO:",
      // D=precio, E="TOTAL", F=total.
      final bRaw = _texto(_celda(grid, r, 1));
      final dCell = _celda(grid, r, 3);
      final fCell = _celda(grid, r, 5);

      final precioUnitario = _numero(dCell);
      final totalPartida = _numero(fCell);

      if (a.isEmpty ||
          ((precioUnitario == null || precioUnitario == 0) &&
              (totalPartida == null || totalPartida == 0))) {
        continue;
      }

      // Parsear cantidad y unidad de col B (ej "344 m2", "1", "3.5 ml").
      var cantidad = 1.0;
      var unidad = '';
      if (bRaw.isNotEmpty) {
        final match = RegExp(r'^([\d,.]+)\s*(.*)$').firstMatch(bRaw);
        if (match != null) {
          final n = double.tryParse(match.group(1)!.replaceAll(',', ''));
          if (n != null) cantidad = n;
          unidad = match.group(2)!.trim();
        } else {
          final n = _numero(_celda(grid, r, 1));
          if (n != null) cantidad = n;
        }
      }

      // Derivar precio unitario si falta: total / cantidad.
      double? pu = precioUnitario;
      if ((pu == null || pu == 0) && totalPartida != null && cantidad > 0) {
        pu = totalPartida / cantidad;
      }
      pu ??= totalPartida ?? 0;

      final conceptoLimpio =
          colapsarEspacios(a.replaceAll(RegExp(r':$'), ''));
      if (conceptoLimpio.isEmpty) continue;

      partidas.add(ExcelPartida(
        concepto: conceptoLimpio,
        unidad: unidad,
        cantidad: cantidad,
        precioUnitario: pu,
      ));
    }
  } else if (headerRow == -1) {
    advertencias.add(
        'No se encontró la fila de encabezados (FECHA | CONCEPTO ...). No se importaron movimientos.');
  }

  // ── 4. Parsear movimientos (filas después de headerRow) ─────────────────
  if (headerRow != -1) {
    var blancasConsecutivas = 0;

    for (var r = headerRow + 1; r < grid.length; r++) {
      final fechaVal = colFecha >= 0 ? _celda(grid, r, colFecha) : null;
      final conceptoVal =
          colConcepto >= 0 ? _celda(grid, r, colConcepto) : null;
      final cantidadVal =
          colCantidad >= 0 ? _celda(grid, r, colCantidad) : null;
      final nombreVal = colNombre >= 0 ? _celda(grid, r, colNombre) : null;
      final canalVal = colCanal >= 0 ? _celda(grid, r, colCanal) : null;
      final tipoVal = colTipo >= 0 ? _celda(grid, r, colTipo) : null;
      final obsVal = colObs >= 0 ? _celda(grid, r, colObs) : null;

      final fechaMs = _aFechaMs(fechaVal);
      final concepto = _texto(conceptoVal);
      final monto = _numero(cantidadVal);
      final tipoStr = _texto(tipoVal);

      // Fila en blanco: cuenta para detener (zona de resúmenes al final).
      if (fechaMs == null && concepto.isEmpty && monto == null) {
        blancasConsecutivas++;
        if (blancasConsecutivas >= 2) break; // a diferencia del web: aquí SÍ podemos cortar.
        continue;
      }
      if (blancasConsecutivas >= 2) break;
      blancasConsecutivas = 0;

      if (fechaMs == null) {
        if (concepto.isNotEmpty || monto != null) {
          advertencias.add('Fila ${r + 1}: se omitió (fecha inválida o ausente).');
        }
        continue;
      }

      if (monto == null || monto <= 0) {
        advertencias.add('Fila ${r + 1}: se omitió (monto inválido o cero).');
        continue;
      }

      final tipo = normalizarTipo(tipoStr);
      if (tipo == null) {
        advertencias.add('Fila ${r + 1}: TIPO "$tipoStr" no reconocido, se omitió.');
        continue;
      }

      movimientos.add(ExcelMovimiento(
        fecha: fechaMs,
        categoria: concepto,
        monto: monto,
        nombre: _texto(nombreVal),
        metodoPago: normalizarMetodoPago(_texto(canalVal)),
        tipo: tipo,
        referencia: _texto(obsVal),
      ));
    }
  }

  return ParsedObraData(
    obraNombre: obraNombre,
    partidas: partidas,
    movimientos: movimientos,
    advertencias: advertencias,
  );
}
