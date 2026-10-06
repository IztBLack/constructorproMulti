import 'package:constructorpro/core/db/app_database.dart';
import 'package:constructorpro/core/sync/pull_paginado.dart';
import 'package:drift/drift.dart' show Variable;
import 'package:drift/native.dart';
import 'package:flutter_test/flutter_test.dart';

/// El PULL paginado: las tres cosas que estaban rotas y no se veían.
///
/// 1. **No paginaba.** `.limit(1000)` sin bucle. Y 1 000 es justo el `max_rows`
///    de PostgREST en este proyecto, así que era a la vez el tope del cliente y
///    el del servidor: un móvil nuevo contra una empresa con historia decía
///    "sincronizado" con la mitad de los datos.
/// 2. **Perdía filas empatadas en el borde de página.** El cursor era
///    `server_updated_at > X`. Dos filas selladas en el mismo milisegundo, una
///    al final de una página y otra al principio de la siguiente, y la segunda
///    no se traía nunca más.
/// 3. **N+1 local.** Un SELECT y un INSERT por fila, sin transacción.
///
/// Lo que se fija aquí es la lógica pura (cursor, filtro, SQL, LWW) contra una
/// base real, sin fingir Supabase — el mismo enfoque de
/// `relleno_columna_nueva_test` y `sync_push_retry_test`.
void main() {
  TestWidgetsFlutterBinding.ensureInitialized();

  group('filtroCursorPull — el contrato con PostgREST', () {
    test('sin cursor no filtra: la primera sincronización se lo trae todo', () {
      expect(filtroCursorPull(const CursorPull.inicio(), ['id']), isNull);
    });

    test('PK simple: timestamp mayor, o mismo timestamp con id mayor', () {
      final filtro = filtroCursorPull(
        const CursorPull(100, {'id': 'aaa'}),
        ['id'],
      );

      // Ésta es la traducción literal de "la fila siguiente en el orden
      // (server_updated_at, id)". Se comprueba la cadena exacta porque es un
      // contrato con el servidor: si cambia, cambia qué filas llegan.
      expect(
        filtro,
        'server_updated_at.gt.100,'
        'and(server_updated_at.eq.100,id.gt.aaa)',
      );
    });

    test('PK compuesta: una cláusula por columna, en cascada', () {
      // `obra_colaborador` tiene PK (obra_id, colaborador_id). Un cursor que
      // asumiera una columna `id` funcionaría en 18 de las 21 tablas — y
      // fallaría en silencio justo en las tres que no la tienen.
      final filtro = filtroCursorPull(
        const CursorPull(7, {'obra_id': 'o1', 'colaborador_id': 'c1'}),
        ['obra_id', 'colaborador_id'],
      );

      expect(
        filtro,
        'server_updated_at.gt.7,'
        'and(server_updated_at.eq.7,obra_id.gt.o1),'
        'and(server_updated_at.eq.7,obra_id.eq.o1,colaborador_id.gt.c1)',
      );
    });

    test('EL CASO QUE SE PERDÍA: el empate en el borde de página', () {
      // Escenario real: la página anterior terminó en la fila (ts=100, id=b).
      // En el servidor hay OTRA fila con el MISMO ts=100 y id=c.
      //
      // Con el filtro viejo —`server_updated_at.gt.100`— esa fila quedaba
      // fuera para siempre: su ts no es mayor que 100.
      // Con el nuevo, la segunda cláusula la incluye.
      final filtro = filtroCursorPull(
        const CursorPull(100, {'id': 'b'}),
        ['id'],
      )!;

      expect(filtro, contains('and(server_updated_at.eq.100,id.gt.b)'),
          reason: 'sin esta cláusula, la fila (100, c) no se traería nunca');

      // Y la fila ya aplicada (100, b) NO vuelve: `gt`, no `gte`. Con `gte` el
      // cursor no avanzaría y el pull se quedaría pidiendo la misma página.
      expect(filtro, isNot(contains('id.gte.')));
    });

    test('una PK con coma reventaría el filtro: se detecta, no se cuela', () {
      // Las PK de este esquema son uuid, así que esto no debería pasar nunca.
      // Se comprueba porque el fallo sería SILENCIOSO: una coma parte el filtro
      // en dos condiciones y traería filas de más, sin ningún error.
      expect(
        () => filtroCursorPull(const CursorPull(1, {'id': 'a,b'}), ['id']),
        throwsArgumentError,
      );
    });
  });

  group('sqlEstadoLocalDePagina — un SELECT en vez de N', () {
    late AppDatabase db;
    setUp(() => db = AppDatabase.forTesting(NativeDatabase.memory()));
    tearDown(() => db.close());

    test('PK simple: trae el estado de las filas de la página, y sólo esas',
        () async {
      for (final id in ['o1', 'o2', 'o3']) {
        await db.customStatement(
          "INSERT INTO obras (id, nombre, cliente, ubicacion, fecha_inicio, "
          "activa, created_at, updated_at, sync_status) "
          "VALUES ('$id', '$id', '', '', 0, 1, 0, 42, 'pending')",
        );
      }

      final sql = sqlEstadoLocalDePagina('obras', ['id'], 2);
      expect(sql, 'SELECT id, sync_status, updated_at FROM obras WHERE id IN (?, ?)');

      final filas = await db
          .customSelect(sql, variables: [Variable('o1'), Variable('o3')])
          .get();

      expect(filas.length, 2);
      expect(filas.map((f) => f.data['id']).toSet(), {'o1', 'o3'});
      expect(filas.first.data['updated_at'], 42);
      expect(filas.first.data['sync_status'], 'pending');
    });

    test('PK compuesta: OR de ANDs, y funciona contra la base real', () async {
      await db.customStatement(
        "INSERT INTO obras (id, nombre, cliente, ubicacion, fecha_inicio, "
        "activa, created_at, updated_at, sync_status) "
        "VALUES ('o1', 'o1', '', '', 0, 1, 0, 0, 'synced')",
      );
      await db.customStatement(
        "INSERT INTO puestos (id, nombre, salario_dia_default, created_at, "
        "updated_at, sync_status) VALUES ('p1', 'Albañil', 0, 0, 0, 'synced')",
      );
      for (final c in ['c1', 'c2']) {
        await db.customStatement(
          "INSERT INTO colaboradores (id, nombre, puesto_id, tipo_pago, telefono, "
          "contacto_nombre, contacto_telefono, contacto_parentesco, activo, "
          "created_at, updated_at, sync_status) "
          "VALUES ('$c', '$c', 'p1', 'DIA', '', '', '', '', 1, 0, 0, 'synced')",
        );
        await db.customStatement(
          "INSERT INTO obra_colaborador (obra_id, colaborador_id, fecha_ingreso, "
          "created_at, updated_at, sync_status) "
          "VALUES ('o1', '$c', 0, 0, 7, 'pending')",
        );
      }

      final pk = ['obra_id', 'colaborador_id'];
      final sql = sqlEstadoLocalDePagina('obra_colaborador', pk, 1);
      expect(
        sql,
        'SELECT obra_id, colaborador_id, sync_status, updated_at '
        'FROM obra_colaborador WHERE (obra_id = ? AND colaborador_id = ?)',
      );

      final filas = await db
          .customSelect(sql, variables: [Variable('o1'), Variable('c2')])
          .get();

      expect(filas.length, 1, reason: 'la PK compuesta identifica una sola fila');
      expect(filas.single.data['colaborador_id'], 'c2');
      expect(filas.single.data['updated_at'], 7);
    });
  });

  group('claveDeFila — cruzar servidor y local sin depender del orden', () {
    test('PK simple y compuesta producen claves distinguibles', () {
      expect(claveDeFila({'id': 'x'}, ['id']), 'x');
      expect(
        claveDeFila({'obra_id': 'o1', 'colaborador_id': 'c1'},
            ['obra_id', 'colaborador_id']),
        'o1${separadorClave}c1',
      );
    });

    test('el separador no es un espacio: dos PK distintas no colisionan', () {
      // Con un espacio como separador, ('a b', 'c') y ('a', 'b c') darían la
      // MISMA clave, y en el mapa de estado local una fila pisaría a la otra:
      // el LWW decidiría con los datos de la fila equivocada. Los uuid de hoy
      // no llevan espacios, pero la propiedad tiene que sostenerse sola.
      final pk = ['a', 'b'];
      expect(
        claveDeFila({'a': 'x y', 'b': 'z'}, pk),
        isNot(claveDeFila({'a': 'x', 'b': 'y z'}, pk)),
      );
    });

    test('un null en la PK no revienta ni colisiona con la cadena vacía', () {
      expect(
        claveDeFila({'obra_id': null, 'colaborador_id': 'c1'},
            ['obra_id', 'colaborador_id']),
        '${separadorClave}c1',
      );
    });
  });

  group('ganaLoLocal — la regla de LWW', () {
    test('una fila ya sincronizada nunca gana: el servidor manda', () {
      expect(
        ganaLoLocal(
            syncStatusLocal: 'synced',
            updatedAtLocal: 999,
            updatedAtServidor: 1),
        isFalse,
      );
    });

    test('pending y más nueva que el servidor: gana lo local', () {
      expect(
        ganaLoLocal(
            syncStatusLocal: 'pending',
            updatedAtLocal: 100,
            updatedAtServidor: 50),
        isTrue,
      );
    });

    test('pending pero más vieja: gana el servidor', () {
      expect(
        ganaLoLocal(
            syncStatusLocal: 'pending',
            updatedAtLocal: 50,
            updatedAtServidor: 100),
        isFalse,
      );
    });

    test('EL CASO DE LA WEB: updated_at nulo del servidor NO deja ganar a local',
        () {
      // La web escribe a Supabase sin `updated_at` de cliente; sólo el trigger
      // sella `server_updated_at`. Si un null se tratara como 0, cualquier fila
      // local pendiente ganaría y los cambios de la oficina se perderían sin
      // dejar rastro. El centinela lo trata como "muy nuevo".
      expect(
        ganaLoLocal(
            syncStatusLocal: 'pending',
            updatedAtLocal: 9999999,
            updatedAtServidor: null),
        isFalse,
      );
    });
  });

  group('tamaño de página', () {
    test('por debajo del max_rows=1000 de PostgREST', () {
      // Pedir 1 000 justos deja el bucle sin poder distinguir "página llena"
      // de "el servidor me recortó": las dos darían exactamente 1 000 filas.
      expect(tamanoPaginaPull, lessThan(1000));
    });
  });
}
