import 'package:constructorpro/core/db/app_database.dart';
import 'package:constructorpro/data/repositories.dart';
import 'package:constructorpro/data/repositories_cotizacion.dart';
import 'package:constructorpro/data/repositories_nota_obra.dart';
import 'package:drift/drift.dart' show Value;
import 'package:drift/native.dart';
import 'package:flutter_test/flutter_test.dart';

/// Guardar el párrafo final en los TRES documentos que lo llevan.
///
/// La tarjeta es una sola (`TextoFinalCard`) pero cada pantalla le pasa su
/// propia forma de guardar, y esa es la parte que la prueba de widget NO cubre:
/// allí el callback es falso, así que comprueba que se llama, no que el texto
/// llegue a la tabla. Lo segundo es lo que decide si el párrafo aparece en el
/// PDF que se manda.
///
/// LO QUE ESTABA ROTO. La cotización guardaba con un `insertOnConflictUpdate`
/// de un companion con solo el `id` y el texto, y eso no funciona: Drift valida
/// la integridad del INSERT antes de mirar el conflicto, así que lanza
/// `InvalidDataException` por las columnas obligatorias que faltan aunque la
/// fila fuera a resolverse como UPDATE. Llevaba así desde que existe la tarjeta
/// —se veía bien y "Guardar" no guardaba nada—, y salió al escribir esta prueba
/// para la obra, que copiaba el mismo patrón. La nota se salvó por casualidad:
/// su repositorio ya escribía con `update`. Ahora las tres van por ahí.
///
/// También se fija que quede `pending`: un párrafo que no sube es un documento
/// que sigue saliendo distinto según quién lo mande, que es el problema entero.
void main() {
  TestWidgetsFlutterBinding.ensureInitialized();

  late AppDatabase db;
  setUp(() => db = AppDatabase.forTesting(NativeDatabase.memory()));
  tearDown(() => db.close());

  Future<({String? texto, String estado})> leer(String tabla, String id) async {
    final f = await db
        .customSelect("SELECT texto_final, sync_status FROM $tabla WHERE id='$id'")
        .getSingle();
    return (
      texto: f.read<String?>('texto_final'),
      estado: f.read<String>('sync_status'),
    );
  }

  /// Deja la fila en `synced`, como estaría tras un sync, para que el `pending`
  /// que se compruebe después venga de la escritura y no del alta.
  Future<void> sincronizada(String tabla, String id) =>
      db.customStatement("UPDATE $tabla SET sync_status='synced' WHERE id='$id'");

  test('la obra guarda su párrafo y queda por subir', () async {
    final repo = ObraRepository(db);
    await db.into(db.obras).insert(
        ObrasCompanion.insert(id: 'o1', nombre: 'Alfaro', fechaInicio: 5));
    await sincronizada('obras', 'o1');

    await repo.setTextoFinal('o1', 'Le informamos su avance de pagos.');

    final tras = await leer('obras', 'o1');
    expect(tras.texto, 'Le informamos su avance de pagos.');
    expect(tras.estado, 'pending');

    // Y lo que NO se tocó sigue en pie: escribir el párrafo no puede reescribir
    // la obra entera con los huecos del companion.
    final o = await db
        .customSelect("SELECT nombre, fecha_inicio FROM obras WHERE id='o1'")
        .getSingle();
    expect(o.read<String>('nombre'), 'Alfaro');
    expect(o.read<int>('fecha_inicio'), 5);
  });

  test('la obra vuelve al texto general con null', () async {
    final repo = ObraRepository(db);
    await db.into(db.obras).insert(ObrasCompanion.insert(
        id: 'o1',
        nombre: 'Alfaro',
        fechaInicio: 5,
        textoFinal: const Value('El mío.')));

    await repo.setTextoFinal('o1', null);

    // NULL y no cadena vacía: vacío sería "documento sin párrafo", y lo que se
    // pide al restaurar es volver a seguir el general.
    expect((await leer('obras', 'o1')).texto, isNull);
  });

  test('la nota guarda su párrafo y queda por subir', () async {
    final repo = NotaObraRepository(db);
    await db.into(db.obras).insert(
        ObrasCompanion.insert(id: 'o1', nombre: 'Alfaro', fechaInicio: 5));
    final id = await repo.crear(
      obraId: 'o1',
      empresaId: 'e1',
      destinatario: 'ORLANDO RAMOZ',
      orden: 100,
    );
    await sincronizada('nota_obra', id);

    await repo.actualizar(NotaObraCompanion(
      id: Value(id),
      textoFinal: const Value('Lo acordado de palabra.'),
    ));

    final tras = await leer('nota_obra', id);
    expect(tras.texto, 'Lo acordado de palabra.');
    expect(tras.estado, 'pending');
    // El destinatario, que alimenta el texto integrado, sigue ahí.
    final n = await db
        .customSelect("SELECT destinatario FROM nota_obra WHERE id='$id'")
        .getSingle();
    expect(n.read<String>('destinatario'), 'ORLANDO RAMOZ');
  });

  test('la cotización guarda su párrafo y queda por subir', () async {
    final repo = CotizacionRepository(db);
    await db.into(db.cotizaciones).insert(CotizacionesCompanion.insert(
        id: 'q1', cliente: 'Sr. Ramírez', nombreProyecto: 'Casa', fecha: 5));
    await sincronizada('cotizaciones', 'q1');

    await repo.setTextoFinal('q1', 'Precios firmes hasta el 30 de septiembre.');

    final tras = await leer('cotizaciones', 'q1');
    expect(tras.texto, 'Precios firmes hasta el 30 de septiembre.');
    expect(tras.estado, 'pending');
    final q = await db
        .customSelect("SELECT cliente, nombre_proyecto FROM cotizaciones WHERE id='q1'")
        .getSingle();
    expect(q.read<String>('cliente'), 'Sr. Ramírez');
    expect(q.read<String>('nombre_proyecto'), 'Casa');
  });
}
