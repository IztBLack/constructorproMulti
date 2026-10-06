import 'package:constructorpro/core/db/app_database.dart';
import 'package:drift/native.dart';
import 'package:flutter_test/flutter_test.dart';

/// Los índices de la base LOCAL.
///
/// Hasta la auditoría de septiembre de 2026 no había ninguno: toda consulta que
/// no fuera por clave primaria recorría la tabla entera. No se notaba porque
/// las tablas son pequeñas, y no se notaba tampoco que faltaran — que es lo
/// que este archivo viene a evitar.
///
/// Se comprueban tres cosas distintas:
///   1. Que EXISTEN, y con el nombre esperado (si alguien renombra uno, aquí
///      salta).
///   2. Que SQLite REALMENTE los usa en las consultas de la app. Un índice que
///      existe pero que el planificador ignora no sirve de nada, y es
///      exactamente el fallo que no se ve mirando el esquema.
///   3. Que instalarlos dos veces no rompe nada, porque corren en cada
///      arranque.
void main() {
  TestWidgetsFlutterBinding.ensureInitialized();

  late AppDatabase db;
  setUp(() => db = AppDatabase.forTesting(NativeDatabase.memory()));
  tearDown(() => db.close());

  Future<Set<String>> indices() async {
    final filas = await db
        .customSelect("SELECT name FROM sqlite_master WHERE type='index'")
        .get();
    return filas.map((f) => f.read<String>('name')).toSet();
  }

  /// El plan que SQLite elige para una consulta.
  Future<String> plan(String sql) async {
    final filas = await db.customSelect('EXPLAIN QUERY PLAN $sql').get();
    return filas.map((f) => f.data['detail'].toString()).join(' | ');
  }

  test('los índices de consulta están instalados al abrir la base', () async {
    final creados = await indices();

    // La lista completa, escrita a mano a propósito: si alguien añade un índice
    // al código sin añadirlo aquí, este test no lo detecta —pero si alguien
    // BORRA uno, sí. Que es el caso que importa.
    const esperados = {
      'idx_asistencias_obra_fecha',
      'idx_asistencias_colab_fecha',
      'idx_destajos_obra_fecha',
      'idx_destajos_colab_fecha',
      'idx_movimientos_obra_fecha',
      'idx_movimientos_partida',
      'idx_movimientos_cotizacion',
      'idx_secciones_cotizacion',
      'idx_partidas_seccion',
      'idx_pagos_cotizacion',
      'idx_archivos_cotizacion_cot',
      'idx_obra_colaborador_obra',
      'idx_obra_colaborador_colab',
      'idx_obra_presupuesto_obra',
      'idx_nota_renglon_nota',
    };

    expect(creados, containsAll(esperados));
  });

  test('la consulta de la nómina semanal USA el índice, no barre la tabla',
      () async {
    // Es la consulta de `AsistenciaRepository.watchRango`: la que corre en cada
    // repintado de la pestaña de nómina y de asistencia.
    final detalle = await plan(
      "SELECT * FROM asistencias "
      "WHERE obra_id = 'o1' AND fecha >= 0 AND fecha < 100 "
      "AND deleted_at IS NULL",
    );

    expect(detalle, contains('idx_asistencias_obra_fecha'),
        reason: 'sin el índice, cada repintado recorre la tabla entera');
    expect(detalle, isNot(contains('SCAN asistencias')),
        reason: 'SCAN a secas significa recorrido completo');
  });

  test('la caja de una obra usa su índice', () async {
    final detalle = await plan(
      "SELECT * FROM movimientos "
      "WHERE obra_id = 'o1' AND deleted_at IS NULL ORDER BY fecha DESC",
    );
    expect(detalle, contains('idx_movimientos_obra_fecha'));
  });

  test('las partidas de una sección salen ya ordenadas por el índice', () async {
    final detalle = await plan(
      "SELECT * FROM partidas "
      "WHERE seccion_id = 's1' AND deleted_at IS NULL ORDER BY orden",
    );
    expect(detalle, contains('idx_partidas_seccion'));
    // El `orden` va dentro del índice justamente para esto: si apareciera un
    // paso de ordenación, el índice estaría a medias.
    expect(detalle.toUpperCase(), isNot(contains('USE TEMP B-TREE FOR ORDER BY')));
  });

  test('el equipo de una obra y las obras de una persona: los dos sentidos',
      () async {
    expect(
      await plan("SELECT * FROM obra_colaborador WHERE obra_id = 'o1' "
          "AND deleted_at IS NULL"),
      contains('idx_obra_colaborador_obra'),
    );
    // Éste es el que la clave primaria compuesta NO cubre: sin índice propio,
    // "¿en qué obras ha estado esta persona?" recorre la tabla.
    expect(
      await plan("SELECT * FROM obra_colaborador WHERE colaborador_id = 'c1' "
          "AND deleted_at IS NULL"),
      contains('idx_obra_colaborador_colab'),
    );
  });

  test('son parciales: sólo cubren las filas vivas', () async {
    final sql = await db
        .customSelect(
          "SELECT sql FROM sqlite_master WHERE type='index' "
          "AND name='idx_asistencias_obra_fecha'",
        )
        .getSingle();

    // Los tombstones (`deleted_at` no nulo) se quedan para siempre porque el
    // sync los necesita. Fuera del índice, no lo engordan.
    expect(sql.read<String>('sql'), contains('WHERE deleted_at IS NULL'));
  });

  test('instalarlos otra vez no falla: corren en cada arranque', () async {
    final antes = await indices();

    // Segunda apertura sobre la MISMA base en memoria no es posible aquí, así
    // que se ejerce la idempotencia del SQL directamente, que es lo que
    // `beforeOpen` repite en cada arranque.
    await db.customStatement(
      'CREATE INDEX IF NOT EXISTS idx_asistencias_obra_fecha '
      'ON asistencias (obra_id, fecha) WHERE deleted_at IS NULL',
    );

    expect(await indices(), antes, reason: 'no se duplica ni se recrea');
  });
}
