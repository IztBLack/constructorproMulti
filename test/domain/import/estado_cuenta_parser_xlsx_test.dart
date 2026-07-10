import 'dart:typed_data';

import 'package:constructorpro/domain/import/estado_cuenta_parser.dart';
import 'package:constructorpro/domain/import/mx_time.dart';
import 'package:excel/excel.dart' as xlsx;
import 'package:flutter_test/flutter_test.dart';

/// Cobertura del path `.xlsx` (además del path `.csv`, cubierto en
/// `estado_cuenta_parser_test.dart`): construye un workbook chico en memoria
/// con el paquete `excel` (celdas TIPADAS: fecha real, número real, texto) y
/// confirma que `parsearXlsxObra` produce el mismo resultado que el path CSV
/// para el mismo contenido lógico.
void main() {
  test('parsearXlsxObra: extrae obra, partidas y movimientos de un .xlsx real', () {
    final wb = xlsx.Excel.createExcel();
    final nombreHoja = wb.getDefaultSheet()!;
    final sheet = wb[nombreHoja];

    void fila(List<xlsx.CellValue?> celdas) {
      sheet.appendRow(celdas);
    }

    fila([xlsx.TextCellValue('OBRA:'), xlsx.TextCellValue('Residencial Los Pinos')]);
    fila([
      xlsx.TextCellValue('Construcción'),
      xlsx.TextCellValue('344 m2'),
      xlsx.TextCellValue('PRECIO UNITARIO:'),
      xlsx.DoubleCellValue(14500),
      xlsx.TextCellValue('TOTAL'),
      xlsx.DoubleCellValue(4988000),
    ]);
    fila([
      xlsx.TextCellValue('Barda'),
      xlsx.TextCellValue('35 m2'),
      xlsx.TextCellValue('PRECIO UNITARIO:'),
      xlsx.DoubleCellValue(7000),
      xlsx.TextCellValue('TOTAL'),
      xlsx.DoubleCellValue(245000),
    ]);
    fila([xlsx.TextCellValue('COSTO TOTAL:'), null, null, xlsx.DoubleCellValue(5233000)]);
    fila([]); // fila en blanco separadora
    fila([
      xlsx.TextCellValue('FECHA'),
      xlsx.TextCellValue('CONCEPTO'),
      xlsx.TextCellValue('CANTIDAD'),
      xlsx.TextCellValue('NOMBRE'),
      xlsx.TextCellValue('CANAL'),
      xlsx.TextCellValue('TIPO'),
      xlsx.TextCellValue('OBSERVACIONES'),
    ]);
    fila([
      xlsx.DateCellValue(year: 2026, month: 3, day: 10),
      xlsx.TextCellValue('Anticipo'),
      xlsx.DoubleCellValue(100000),
      xlsx.TextCellValue('Juan Pérez'),
      xlsx.TextCellValue('Transferencia'),
      xlsx.TextCellValue('ENTRADA'),
      xlsx.TextCellValue('primer pago'),
    ]);
    fila([
      xlsx.DateCellValue(year: 2026, month: 3, day: 12),
      xlsx.TextCellValue('Material'),
      xlsx.DoubleCellValue(25000),
      xlsx.TextCellValue('Proveedor XYZ'),
      xlsx.TextCellValue('efectivo'),
      xlsx.TextCellValue('EGRESO'),
      xlsx.TextCellValue('cemento'),
    ]);

    final bytes = wb.encode();
    expect(bytes, isNotNull);

    final parsed = parsearXlsxObra(Uint8List.fromList(bytes!));

    expect(parsed.obraNombre, 'Residencial Los Pinos');
    expect(parsed.partidas, hasLength(2));
    expect(parsed.partidas.map((p) => p.concepto), containsAll(['CONSTRUCCIÓN', 'BARDA']));

    expect(parsed.movimientos, hasLength(2));
    final entrada = parsed.movimientos.firstWhere((m) => m.tipo == 'ENTRADA');
    expect(entrada.monto, 100000);
    expect(entrada.nombre, 'Juan Pérez');
    expect(entrada.metodoPago, 'Transferencia');
    expect(entrada.fecha, medianocheMx(2026, 3, 10));

    final salida = parsed.movimientos.firstWhere((m) => m.tipo == 'SALIDA');
    expect(salida.monto, 25000);
    expect(salida.metodoPago, 'Efectivo'); // normalizado desde 'efectivo'
    expect(salida.fecha, medianocheMx(2026, 3, 12));
  });
}
