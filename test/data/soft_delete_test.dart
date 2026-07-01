import 'package:constructorpro/core/db/app_database.dart';
import 'package:constructorpro/data/repositories.dart';
import 'package:constructorpro/data/repositories_cotizacion.dart';
import 'package:drift/native.dart';
import 'package:flutter_test/flutter_test.dart';

/// Verifica el contrato de soft-delete de Fase 0 (sync nube):
/// 1. delete() NO borra físicamente: marca `deletedAt` + `syncStatus='pending'`.
/// 2. Las lecturas de UI ocultan los tombstones.
/// 3. El borrado en cascada (cotización) tombstonea hijos sin borrarlos.
void main() {
  TestWidgetsFlutterBinding.ensureInitialized();

  late AppDatabase db;

  setUp(() => db = AppDatabase.forTesting(NativeDatabase.memory()));
  tearDown(() => db.close());

  test('Obra: delete() es tombstone, no borrado físico, y se oculta', () async {
    final repo = ObraRepository(db);
    await db.into(db.obras).insert(
        ObrasCompanion.insert(id: 'o1', nombre: 'Obra 1', fechaInicio: 0));

    expect((await repo.watchAll().first).length, 1);

    await repo.delete('o1');

    // Oculta para la UI.
    expect(await repo.watchAll().first, isEmpty);

    // Pero la fila sigue existiendo físicamente, marcada para sync.
    final row = await (db.select(db.obras)..where((t) => t.id.equals('o1')))
        .getSingle();
    expect(row.deletedAt, isNotNull);
    expect(row.syncStatus, 'pending');
  });

  test('Obra: delete() tombstonea en cascada movimientos/asistencias/destajos/equipo',
      () async {
    final repo = ObraRepository(db);
    await db.into(db.obras).insert(
        ObrasCompanion.insert(id: 'o1', nombre: 'Obra 1', fechaInicio: 0));
    await db.into(db.colaboradores).insert(ColaboradoresCompanion.insert(
        id: 'c1', nombre: 'Juan', puestoId: 'p1', tipoPago: 'DIA'));
    await db.into(db.obraColaborador).insert(ObraColaboradorCompanion.insert(
        obraId: 'o1', colaboradorId: 'c1', fechaIngreso: 0));
    await db.into(db.movimientos).insert(MovimientosCompanion.insert(
        id: 'm1',
        obraId: 'o1',
        fecha: 0,
        tipo: 'SALIDA',
        categoria: 'material',
        concepto: 'Cemento',
        monto: 100,
        metodoPago: 'EFECTIVO'));
    await db.into(db.asistencias).insert(AsistenciasCompanion.insert(
        id: 'a1', colaboradorId: 'c1', obraId: 'o1', fecha: 0, fraccion: 1));
    await db.into(db.destajos).insert(DestajosCompanion.insert(
        id: 'd1',
        colaboradorId: 'c1',
        obraId: 'o1',
        fecha: 0,
        concepto: 'Muro',
        monto: 50));

    await repo.delete('o1');

    // Ningún hijo de la obra queda "vivo" (sin tombstone).
    for (final cnt in [
      (db.select(db.movimientos)..where((t) => t.deletedAt.isNull())).get(),
      (db.select(db.asistencias)..where((t) => t.deletedAt.isNull())).get(),
      (db.select(db.destajos)..where((t) => t.deletedAt.isNull())).get(),
      (db.select(db.obraColaborador)..where((t) => t.deletedAt.isNull())).get(),
    ]) {
      expect(await cnt, isEmpty);
    }
  });

  test('Cotización: delete() tombstonea en cascada secciones/partidas/pagos',
      () async {
    final cotRepo = CotizacionRepository(db);
    final secRepo = SeccionRepository(db);
    final partRepo = PartidaRepository(db);
    final pagoRepo = PagoRepository(db);

    await db.into(db.cotizaciones).insert(CotizacionesCompanion.insert(
        id: 'q1', cliente: 'Cli', nombreProyecto: 'Proy', fecha: 0));
    await db.into(db.secciones).insert(
        SeccionesCompanion.insert(id: 's1', cotizacionId: 'q1', nombre: 'Sec'));
    await db.into(db.partidas).insert(PartidasCompanion.insert(
        id: 'pa1',
        seccionId: 's1',
        descripcion: 'Partida',
        cantidad: 1,
        precioUnitario: 100));
    await pagoRepo.add(
        cotId: 'q1', fecha: 0, monto: 50, metodo: 'EFECTIVO', concepto: 'Anticipo');

    expect((await cotRepo.watchAll().first).length, 1);
    expect((await secRepo.watchByCotizacion('q1').first).length, 1);
    expect((await partRepo.watchDeCotizacion('q1').first).length, 1);
    expect((await pagoRepo.watchByCotizacion('q1').first).length, 1);

    await cotRepo.delete('q1');

    // Todo oculto para la UI.
    expect(await cotRepo.watchAll().first, isEmpty);
    expect(await secRepo.watchByCotizacion('q1').first, isEmpty);
    expect(await partRepo.watchDeCotizacion('q1').first, isEmpty);
    expect(await pagoRepo.watchByCotizacion('q1').first, isEmpty);

    // Filas físicas presentes y marcadas (idempotencia del sync).
    expect(
        (await (db.select(db.partidas)..where((t) => t.deletedAt.isNotNull()))
                .get())
            .length,
        1);
    expect(
        (await (db.select(db.pagos)..where((t) => t.deletedAt.isNotNull()))
                .get())
            .length,
        1);
  });
}
