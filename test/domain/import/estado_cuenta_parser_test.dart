import 'package:constructorpro/domain/import/estado_cuenta_parser.dart';
import 'package:constructorpro/domain/import/import_models.dart';
import 'package:constructorpro/domain/import/mx_time.dart';
import 'package:flutter_test/flutter_test.dart';

/// Fixture sintético con el layout de la plantilla "estado de cuenta":
///  fila 1: OBRA: `<nombre>`
///  filas 2..5: 4 partidas del presupuesto (Construcción/Barda/Alberca/Demolición)
///  filas 6..8: COSTO TOTAL / RECIBIDO / PENDIENTE (deben ignorarse)
///  fila 9: en blanco
///  fila 10: encabezados FECHA|CONCEPTO|CANTIDAD|NOMBRE|CANAL|TIPO|OBSERVACIONES
///  filas 11+: 97 movimientos (47 ENTRADA que suman 3,176,450; 50 SALIDA que
///  suman 590,500), seguidos de 2 filas en blanco y una sección de "resumen"
///  que el parser debe ignorar (igual que hace el Excel exportado).
class _Fixture {
  final String csv;
  final double totalEntradas;
  final double totalSalidas;
  final int nEntradas;
  final int nSalidas;

  _Fixture({
    required this.csv,
    required this.totalEntradas,
    required this.totalSalidas,
    required this.nEntradas,
    required this.nSalidas,
  });
}

_Fixture _buildFixture() {
  final buf = StringBuffer();
  buf.writeln('OBRA:,Residencial Los Pinos');
  // Partidas: concepto,cantidad+unidad,PRECIO UNITARIO:,precio,TOTAL,total
  buf.writeln('Construcción,344 m2,PRECIO UNITARIO:,14500,TOTAL,4988000');
  buf.writeln('Barda,35 m2,PRECIO UNITARIO:,7000,TOTAL,245000');
  buf.writeln('Alberca,1,PRECIO UNITARIO:,450000,TOTAL,450000');
  buf.writeln('Demolición,1,PRECIO UNITARIO:,240000,TOTAL,240000');
  buf.writeln('COSTO TOTAL:,,,5923000');
  buf.writeln('RECIBIDO:,,,3176450');
  buf.writeln('PENDIENTE:,,,2746550');
  buf.writeln(''); // fila en blanco separadora
  buf.writeln('FECHA,CONCEPTO,CANTIDAD,NOMBRE,CANAL,TIPO,OBSERVACIONES');

  const nombres = ['Juan Pérez', 'María López', 'Constructora ABC', 'Pedro Ruiz'];
  const canales = ['Transferencia', 'transferencia bancaria', 'EFECTIVO', 'Cheque', 'tarjeta'];
  var fecha = DateTime.utc(2026, 1, 1);
  String fmtFecha(DateTime d) =>
      '${d.day.toString().padLeft(2, '0')}/${d.month.toString().padLeft(2, '0')}/${d.year}';

  // 47 ENTRADA: 46 x 68,000 + 1 x 48,450 = 3,176,450
  var totalEntradas = 0.0;
  const tiposEntrada = ['ENTRADA', 'INGRESO', 'DEPOSITO'];
  for (var i = 0; i < 47; i++) {
    final monto = i < 46 ? 68000.0 : 48450.0;
    totalEntradas += monto;
    final tipo = tiposEntrada[i % tiposEntrada.length];
    buf.writeln(
        '${fmtFecha(fecha)},Anticipo cliente,${monto.toInt()},${nombres[i % nombres.length]},${canales[i % canales.length]},$tipo,Pago $i');
    fecha = fecha.add(const Duration(days: 1));
  }

  // 50 SALIDA: 49 x 12,000 + 1 x 2,500 = 590,500
  var totalSalidas = 0.0;
  const tiposSalida = ['SALIDA', 'EGRESO', 'GASTO', 'PAGO'];
  for (var i = 0; i < 50; i++) {
    final monto = i < 49 ? 12000.0 : 2500.0;
    totalSalidas += monto;
    final tipo = tiposSalida[i % tiposSalida.length];
    buf.writeln(
        '${fmtFecha(fecha)},Material,${monto.toInt()},${nombres[i % nombres.length]},${canales[i % canales.length]},$tipo,Compra $i');
    fecha = fecha.add(const Duration(days: 1));
  }

  // Zona de "resumen" al final del libro (debe ignorarse tras 2 blancos).
  buf.writeln('');
  buf.writeln('');
  buf.writeln('PAGADO POR PERSONA,');
  buf.writeln('NOMBRE,TOTAL PAGADO');
  buf.writeln('Juan Pérez,100000');
  buf.writeln('TOTAL,100000');

  return _Fixture(
    csv: buf.toString(),
    totalEntradas: totalEntradas,
    totalSalidas: totalSalidas,
    nEntradas: 47,
    nSalidas: 50,
  );
}

void main() {
  final fixture = _buildFixture();

  group('parsearCsvObra', () {
    late ParsedObraData parsed;

    setUpAll(() {
      parsed = parsearCsvObra(fixture.csv);
    });

    test('extrae el nombre de la obra', () {
      expect(parsed.obraNombre, 'Residencial Los Pinos');
    });

    test('extrae las 4 partidas del presupuesto', () {
      expect(parsed.partidas, hasLength(4));
      // El parser uppercasea CONCEPTO de partidas (paridad con el web:
      // estado-cuenta-excel.ts hace `toStr(...).toUpperCase()` antes de
      // limpiar el concepto).
      final porConcepto = {for (final p in parsed.partidas) p.concepto: p};

      expect(porConcepto['CONSTRUCCIÓN'], isNotNull);
      expect(porConcepto['CONSTRUCCIÓN']!.cantidad, 344);
      expect(porConcepto['CONSTRUCCIÓN']!.unidad, 'm2');
      expect(porConcepto['CONSTRUCCIÓN']!.precioUnitario, 14500);

      expect(porConcepto['BARDA']!.cantidad, 35);
      expect(porConcepto['BARDA']!.unidad, 'm2');
      expect(porConcepto['BARDA']!.precioUnitario, 7000);

      expect(porConcepto['ALBERCA']!.cantidad, 1);
      expect(porConcepto['ALBERCA']!.precioUnitario, 450000);

      expect(porConcepto['DEMOLICIÓN']!.cantidad, 1);
      expect(porConcepto['DEMOLICIÓN']!.precioUnitario, 240000);
    });

    test('no confunde las filas COSTO TOTAL/RECIBIDO/PENDIENTE con partidas', () {
      final conceptos = parsed.partidas.map((p) => p.concepto).toSet();
      expect(conceptos.any((c) => c.contains('COSTO TOTAL')), isFalse);
      expect(conceptos.any((c) => c.contains('RECIBIDO')), isFalse);
      expect(conceptos.any((c) => c.contains('PENDIENTE')), isFalse);
    });

    test('extrae exactamente 97 movimientos (47 ENTRADA + 50 SALIDA)', () {
      expect(parsed.movimientos, hasLength(97));
      final entradas = parsed.movimientos.where((m) => m.tipo == 'ENTRADA');
      final salidas = parsed.movimientos.where((m) => m.tipo == 'SALIDA');
      expect(entradas.length, fixture.nEntradas);
      expect(salidas.length, fixture.nSalidas);
    });

    test('los totales de ENTRADA/SALIDA cuadran con la suma esperada', () {
      final sumaEntradas = parsed.movimientos
          .where((m) => m.tipo == 'ENTRADA')
          .fold<double>(0, (s, m) => s + m.monto);
      final sumaSalidas = parsed.movimientos
          .where((m) => m.tipo == 'SALIDA')
          .fold<double>(0, (s, m) => s + m.monto);

      expect(sumaEntradas, closeTo(3176450, 0.001));
      expect(sumaSalidas, closeTo(590500, 0.001));
      expect(sumaEntradas, closeTo(fixture.totalEntradas, 0.001));
      expect(sumaSalidas, closeTo(fixture.totalSalidas, 0.001));
    });

    test('normaliza TIPO (INGRESO/DEPOSITO→ENTRADA, EGRESO/GASTO/PAGO→SALIDA)', () {
      expect(parsed.movimientos.every((m) => m.tipo == 'ENTRADA' || m.tipo == 'SALIDA'),
          isTrue);
    });

    test('normaliza CANAL a metodoPago conocido', () {
      final metodos = parsed.movimientos.map((m) => m.metodoPago).toSet();
      // 'transferencia bancaria' y 'Transferencia' → 'Transferencia'; etc.
      expect(metodos, containsAll(['Transferencia', 'Efectivo', 'Cheque', 'Tarjeta']));
      expect(metodos.contains('transferencia bancaria'), isFalse);
    });

    test('ancla fecha a medianoche de México de la fecha de calendario', () {
      final primero = parsed.movimientos.first;
      expect(primero.fecha, medianocheMx(2026, 1, 1));
    });

    test('ignora la sección de resumen tras las filas en blanco', () {
      expect(
        parsed.movimientos.any((m) => m.categoria.contains('PAGADO POR PERSONA')),
        isFalse,
      );
      expect(parsed.movimientos.any((m) => m.nombre == 'TOTAL'), isFalse);
    });

    test('no genera advertencias en un archivo bien formado', () {
      expect(parsed.advertencias, isEmpty);
    });
  });

  group('parsearCsvObra: filas inválidas generan advertencias y se omiten', () {
    test('fila con TIPO no reconocido se omite con advertencia', () {
      const csv = 'OBRA:,Obra X\n'
          'FECHA,CONCEPTO,CANTIDAD,NOMBRE,CANAL,TIPO,OBSERVACIONES\n'
          '01/01/2026,Anticipo,1000,Juan,Efectivo,ENTRADA,ok\n'
          '02/01/2026,Ajuste,500,Juan,Efectivo,RARO,raro\n';
      final parsed = parsearCsvObra(csv);
      expect(parsed.movimientos, hasLength(1));
      expect(parsed.advertencias, hasLength(1));
      expect(parsed.advertencias.first, contains('TIPO'));
    });

    test('fila con monto cero o inválido se omite con advertencia', () {
      const csv = 'OBRA:,Obra X\n'
          'FECHA,CONCEPTO,CANTIDAD,NOMBRE,CANAL,TIPO,OBSERVACIONES\n'
          '01/01/2026,Anticipo,0,Juan,Efectivo,ENTRADA,cero\n'
          '02/01/2026,Anticipo,1000,Juan,Efectivo,ENTRADA,ok\n';
      final parsed = parsearCsvObra(csv);
      expect(parsed.movimientos, hasLength(1));
      expect(parsed.advertencias.first, contains('monto inválido'));
    });

    test('fila sin fecha válida se omite con advertencia', () {
      const csv = 'OBRA:,Obra X\n'
          'FECHA,CONCEPTO,CANTIDAD,NOMBRE,CANAL,TIPO,OBSERVACIONES\n'
          'fecha-mala,Anticipo,1000,Juan,Efectivo,ENTRADA,mal\n'
          '02/01/2026,Anticipo,1000,Juan,Efectivo,ENTRADA,ok\n';
      final parsed = parsearCsvObra(csv);
      expect(parsed.movimientos, hasLength(1));
      expect(parsed.advertencias.first, contains('fecha inválida'));
    });

    test('sin fila de encabezados: advertencia y cero movimientos', () {
      const csv = 'OBRA:,Obra X\nsolo,texto,sin,encabezados\n';
      final parsed = parsearCsvObra(csv);
      expect(parsed.movimientos, isEmpty);
      expect(parsed.advertencias, isNotEmpty);
    });
  });
}
