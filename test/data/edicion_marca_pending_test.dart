import 'package:constructorpro/core/db/app_database.dart';
import 'package:constructorpro/data/repositories.dart';
import 'package:constructorpro/data/repositories_cotizacion.dart';
import 'package:constructorpro/data/repositories_cuadrilla.dart';
import 'package:constructorpro/data/repositories_obra.dart';
import 'package:drift/drift.dart' show Value;
import 'package:drift/native.dart';
import 'package:flutter_test/flutter_test.dart';

/// ¿Se sincronizan las EDICIONES, no solo las altas y los borrados?
///
/// El motor de push sube únicamente filas con `sync_status = 'pending'`. El
/// default de la columna solo aplica al INSERT de una fila nueva; en un UPDATE
/// no se re-aplica. Así que sin algo que remarque `pending` al editar, corregir
/// una asistencia o cambiar el estado de una cotización se quedaría callado en
/// el teléfono — pérdida silenciosa de datos.
///
/// Ese "algo" es el trigger `trg_<tabla>_mark_pending` (migración v3), un
/// `AFTER UPDATE` con `WHEN NEW.sync_status = OLD.sync_status` que vuelve a poner
/// `pending` en cada edición de la app sin dispararse en las escrituras del
/// propio sync. Estas pruebas ejercen los MÉTODOS DE REPOSITORIO reales (no un
/// UPDATE crudo) para confirmar que el trigger cubre las tres formas de
/// escritura que usan: `insertOnConflictUpdate` (upsert), `.write` de un solo
/// campo, y el UPDATE dentro de una transacción.
///
/// Existen porque un comentario viejo en `sync_service.dart` afirmaba que "las
/// ediciones aún no remarcan pending". Si eso vuelve a ser cierto —por quitar el
/// trigger o cambiar su guardia— estas pruebas fallan en vez de que el usuario
/// descubra en campo que sus correcciones no subieron.
void main() {
  TestWidgetsFlutterBinding.ensureInitialized();

  late AppDatabase db;
  setUp(() => db = AppDatabase.forTesting(NativeDatabase.memory()));
  tearDown(() => db.close());

  /// Marca las filas de una tabla como ya sincronizadas, imitando el estado tras
  /// un push exitoso. Va por SQL directo a propósito: los repositorios nunca
  /// escriben 'synced' (eso es potestad del sync), así que es la única forma de
  /// montar el escenario "ya subido" que haría visible el bug si el trigger
  /// faltara.
  Future<void> sincronizada(String tabla) =>
      db.customStatement("UPDATE $tabla SET sync_status = 'synced'");

  Future<String> estado(String tabla, String id) async {
    final row = await db
        .customSelect("SELECT sync_status FROM $tabla WHERE id = '$id'")
        .getSingle();
    return row.read<String>('sync_status');
  }

  test('upsert (insertOnConflictUpdate) al EDITAR una obra la deja pending',
      () async {
    final repo = ObraRepository(db);
    await repo.upsert(
        const ObrasCompanion(id: Value('o1'), nombre: Value('A'), fechaInicio: Value(0)));
    await sincronizada('obras');
    expect(await estado('obras', 'o1'), 'synced');

    // Editar el nombre reusando el mismo id → cae en la rama ON CONFLICT UPDATE.
    await repo.upsert(
        const ObrasCompanion(id: Value('o1'), nombre: Value('B'), fechaInicio: Value(0)));

    expect(await estado('obras', 'o1'), 'pending',
        reason: 'editar por upsert debe re-marcar pending para que suba');
  });

  test('cambiar el estado de una cotización la deja pending', () async {
    final cotRepo = CotizacionRepository(db);
    await cotRepo.upsert(const CotizacionesCompanion(
        id: Value('c1'),
        cliente: Value('X'),
        nombreProyecto: Value('P'),
        fecha: Value(0)));
    await sincronizada('cotizaciones');

    await cotRepo.cambiarEstado('c1', 'ENVIADA');

    expect(await estado('cotizaciones', 'c1'), 'pending');
  });

  test('ajustar precios en lote deja cada partida pending', () async {
    // Cotización → sección → partida.
    await CotizacionRepository(db).upsert(const CotizacionesCompanion(
        id: Value('c1'),
        cliente: Value('X'),
        nombreProyecto: Value('P'),
        fecha: Value(0)));
    await SeccionRepository(db).insert('c1', 'Sec', 0);
    final secId = (await db.customSelect(
            "SELECT id FROM secciones WHERE cotizacion_id = 'c1'")
        .getSingle())
        .read<String>('id');
    final partRepo = PartidaRepository(db);
    await partRepo.upsert(PartidasCompanion.insert(
        id: 'p1',
        seccionId: secId,
        descripcion: 'D',
        cantidad: 1,
        precioUnitario: 100));
    await sincronizada('partidas');

    final n = await partRepo.ajustarPrecios('c1', 1.10);

    expect(n, 1);
    expect(await estado('partidas', 'p1'), 'pending');
  });

  test('corregir la fracción de una asistencia existente la deja pending',
      () async {
    final repo = AsistenciaRepository(db);
    await repo.setFraccion(
        obraId: 'o1', colaboradorId: 'k1', fecha: 100, fraccion: 1.0);
    await sincronizada('asistencias');
    final id = (await db.customSelect("SELECT id FROM asistencias").getSingle())
        .read<String>('id');
    expect(await estado('asistencias', id), 'synced');

    // Mismo (obra, colaborador, fecha) → rama UPDATE, corrige a media jornada.
    await repo.setFraccion(
        obraId: 'o1', colaboradorId: 'k1', fecha: 100, fraccion: 0.5);

    expect(await estado('asistencias', id), 'pending',
        reason: 'el pase de lista es la acción de campo más usada; '
            'corregir una fracción DEBE volver a sincronizar');
  });

  test('editar una partida de presupuesto de obra (upsert) la deja pending',
      () async {
    final repo = ObraPresupuestoRepository(db);
    await repo.upsert(id: 'pp1', obraId: 'o1', concepto: 'C', precioUnitario: 50);
    await sincronizada('obra_presupuesto');

    await repo.upsert(id: 'pp1', obraId: 'o1', concepto: 'C', precioUnitario: 75);

    expect(await estado('obra_presupuesto', 'pp1'), 'pending');
  });

  test('activar/desactivar una cuadrilla la deja pending', () async {
    final repo = CuadrillaRepository(db);
    await repo.upsert(
        const CuadrillasCompanion(id: Value('q1'), nombre: Value('Cuadrilla')));
    await sincronizada('cuadrillas');

    await repo.setActiva('q1', false);

    expect(await estado('cuadrillas', 'q1'), 'pending');
  });
}
