import 'package:constructorpro/core/db/app_database.dart';
import 'package:constructorpro/domain/import/dedup_movimientos.dart';
import 'package:constructorpro/domain/import/import_models.dart';
import 'package:constructorpro/domain/import/mx_time.dart';
import 'package:drift/drift.dart';
import 'package:drift/native.dart';
import 'package:flutter_test/flutter_test.dart';

/// Inserta una fila `Movimiento` (Drift) directo en una BD en memoria, para
/// poder pasarle filas "reales" al clasificador tal como lo haría
/// `MovimientoRepository.watchByObra(obraId)`.
Future<Movimiento> _insertar(
  AppDatabase db, {
  required String id,
  required int fecha,
  required double monto,
  required String categoria,
  required String tipo,
  String nombre = '',
}) async {
  await db.into(db.movimientos).insert(MovimientosCompanion.insert(
        id: id,
        obraId: 'o1',
        fecha: fecha,
        tipo: tipo,
        categoria: categoria,
        concepto: categoria,
        monto: monto,
        metodoPago: 'Efectivo',
        nombre: Value(nombre),
      ));
  return (db.select(db.movimientos)..where((t) => t.id.equals(id)))
      .getSingle();
}

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();

  late AppDatabase db;
  setUp(() => db = AppDatabase.forTesting(NativeDatabase.memory()));
  tearDown(() => db.close());

  final diaUno = medianocheMx(2026, 1, 15);

  test('fila idéntica (fecha+monto+categoria+tipo+nombre) se marca Duplicado', () async {
    await _insertar(
      db,
      id: 'm1',
      fecha: diaUno,
      monto: 1000,
      categoria: 'Anticipo',
      tipo: 'ENTRADA',
      nombre: 'Juan Pérez',
    );
    final existentes = await db.select(db.movimientos).get();

    final parsed = [
      const ExcelMovimiento(
        fecha: 0, // se sobreescribe abajo
        categoria: 'Anticipo',
        monto: 1000,
        nombre: 'Juan Pérez',
        metodoPago: 'Efectivo',
        tipo: 'ENTRADA',
        referencia: '',
      ),
    ];
    final conFecha = [
      ExcelMovimiento(
        fecha: diaUno,
        categoria: parsed.first.categoria,
        monto: parsed.first.monto,
        nombre: parsed.first.nombre,
        metodoPago: parsed.first.metodoPago,
        tipo: parsed.first.tipo,
        referencia: parsed.first.referencia,
      ),
    ];

    final resultado = clasificarMovimientos(existentes: existentes, parsed: conFecha);
    expect(resultado, hasLength(1));
    expect(resultado.first.estado, EstadoImportMovimiento.duplicado);
  });

  test('normaliza espacios y mayúsculas/minúsculas al comparar la llave', () async {
    await _insertar(
      db,
      id: 'm1',
      fecha: diaUno,
      monto: 1000,
      categoria: '  anticipo   cliente ',
      tipo: 'ENTRADA',
      nombre: 'juan   PÉREZ',
    );
    final existentes = await db.select(db.movimientos).get();

    final parsed = [
      ExcelMovimiento(
        fecha: diaUno,
        categoria: 'Anticipo Cliente',
        monto: 1000,
        nombre: 'Juan Pérez',
        metodoPago: 'Efectivo',
        tipo: 'ENTRADA',
        referencia: '',
      ),
    ];

    final resultado = clasificarMovimientos(existentes: existentes, parsed: parsed);
    expect(resultado.first.estado, EstadoImportMovimiento.duplicado);
  });

  test('difiere en monto, categoria, tipo o nombre → Nuevo', () async {
    await _insertar(
      db,
      id: 'm1',
      fecha: diaUno,
      monto: 1000,
      categoria: 'Anticipo',
      tipo: 'ENTRADA',
      nombre: 'Juan Pérez',
    );
    final existentes = await db.select(db.movimientos).get();

    ExcelMovimiento base({
      double monto = 1000,
      String categoria = 'Anticipo',
      String tipo = 'ENTRADA',
      String nombre = 'Juan Pérez',
    }) =>
        ExcelMovimiento(
          fecha: diaUno,
          categoria: categoria,
          monto: monto,
          nombre: nombre,
          metodoPago: 'Efectivo',
          tipo: tipo,
          referencia: '',
        );

    final variantes = [
      base(monto: 1000.01),
      base(categoria: 'Otro concepto'),
      base(tipo: 'SALIDA'),
      base(nombre: 'Otra persona'),
    ];

    final resultado = clasificarMovimientos(existentes: existentes, parsed: variantes);
    expect(resultado.every((r) => r.estado == EstadoImportMovimiento.nuevo), isTrue);
  });

  test('mismo día pero distinta hora/ancla de fecha sigue matcheando (compara por día MX)', () async {
    // Simula un movimiento existente cuyo epoch NO está anclado a medianoche
    // MX exacta (por ejemplo, capturado en la app con hora local del
    // dispositivo) pero cae en el mismo día calendario de México.
    final mismodiaConHora = diaUno + const Duration(hours: 10).inMilliseconds;
    await _insertar(
      db,
      id: 'm1',
      fecha: mismodiaConHora,
      monto: 500,
      categoria: 'Material',
      tipo: 'SALIDA',
      nombre: 'Proveedor X',
    );
    final existentes = await db.select(db.movimientos).get();

    final parsed = [
      ExcelMovimiento(
        fecha: diaUno, // medianoche MX exacta del mismo día calendario
        categoria: 'Material',
        monto: 500,
        nombre: 'Proveedor X',
        metodoPago: '',
        tipo: 'SALIDA',
        referencia: '',
      ),
    ];

    final resultado = clasificarMovimientos(existentes: existentes, parsed: parsed);
    expect(resultado.first.estado, EstadoImportMovimiento.duplicado);
  });

  test('movimientos tombstoneados (deletedAt) no cuentan como existentes', () async {
    await _insertar(
      db,
      id: 'm1',
      fecha: diaUno,
      monto: 1000,
      categoria: 'Anticipo',
      tipo: 'ENTRADA',
      nombre: 'Juan Pérez',
    );
    await (db.update(db.movimientos)..where((t) => t.id.equals('m1'))).write(
        MovimientosCompanion(
            deletedAt: Value(DateTime.now().millisecondsSinceEpoch)));
    final existentes = await db.select(db.movimientos).get();

    final parsed = [
      ExcelMovimiento(
        fecha: diaUno,
        categoria: 'Anticipo',
        monto: 1000,
        nombre: 'Juan Pérez',
        metodoPago: 'Efectivo',
        tipo: 'ENTRADA',
        referencia: '',
      ),
    ];

    final resultado = clasificarMovimientos(existentes: existentes, parsed: parsed);
    expect(resultado.first.estado, EstadoImportMovimiento.nuevo);
  });
}
