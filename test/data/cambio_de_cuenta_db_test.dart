import 'package:constructorpro/core/db/app_database.dart';
import 'package:drift/drift.dart' hide isNotNull;
import 'package:drift/native.dart';
import 'package:flutter_test/flutter_test.dart';

/// La base local en un cambio de cuenta (`docs/PLAN_CAMBIO_DE_CUENTA.md`).
///
/// El teléfono de pruebas acumuló 72 rechazos porque el sellado reetiquetaba
/// las filas de la cuenta anterior como de la nueva. Aquí se fija que:
/// - el sellado solo adopta filas SIN empresa;
/// - se puede saber qué empresas hay en la base y cuánto no ha subido;
/// - vaciar deja la base como recién instalada, en TODAS las tablas.
void main() {
  TestWidgetsFlutterBinding.ensureInitialized();

  late AppDatabase db;
  setUp(() => db = AppDatabase.forTesting(NativeDatabase.memory()));
  tearDown(() => db.close());

  const a = 'empresa-a';
  const b = 'empresa-b';

  Future<void> obra(String id, {String empresa = '', String estado = 'pending'}) =>
      db.into(db.obras).insert(ObrasCompanion.insert(
            id: id,
            nombre: id,
            fechaInicio: 0,
            empresaId: Value(empresa),
            syncStatus: Value(estado),
          ));

  Future<String> empresaDe(String id) async =>
      (await (db.select(db.obras)..where((o) => o.id.equals(id))).getSingle())
          .empresaId;

  group('sellarEmpresaId', () {
    test('adopta las filas sin empresa y deja intactas las de otra empresa',
        () async {
      await obra('sin-cuenta');
      await obra('de-a', empresa: a, estado: 'synced');

      await db.sellarEmpresaId(b);

      expect(await empresaDe('sin-cuenta'), b);
      // Antes se reetiquetaba como de B: el origen de los 72 rechazos.
      expect(await empresaDe('de-a'), a);
    });

    test('también sella tablas que la lista vieja no cubría (bitácora)',
        () async {
      await obra('o1');
      await db.into(db.bitacoraEntrada).insert(BitacoraEntradaCompanion.insert(
          id: 'e1', obraId: 'o1', fecha: 0));

      await db.sellarEmpresaId(b);

      final e = await db.select(db.bitacoraEntrada).getSingle();
      expect(e.empresaId, b);
    });

    test('no sella el catálogo base sembrado (nunca se sube)', () async {
      await db.sellarEmpresaId(b);
      final sellados = await (db.select(db.catalogoConceptos)
            ..where((c) => c.empresaId.equals(b)))
          .get();
      expect(sellados, isEmpty);
    });
  });

  test('empresasEnBase lista las empresas presentes, sin las vacías', () async {
    await obra('o1');
    await obra('o2', empresa: a);
    await db.into(db.puestos).insert(PuestosCompanion.insert(
        id: 'p1', nombre: 'p', empresaId: const Value(b)));

    expect(await db.empresasEnBase(), {a, b});
  });

  group('contarSinSubir', () {
    test('cuenta pending, error, conflict y ajena; no synced ni skipped',
        () async {
      await obra('p', estado: 'pending');
      await obra('e', estado: 'error');
      await obra('c', estado: 'conflict');
      // Apartada: puede ser trabajo propio de alguien que perdió el acceso.
      await obra('a', estado: 'ajena');
      await obra('s', estado: 'synced');
      await obra('k', estado: 'skipped'); // id viejo: nunca iba a subir

      expect(await db.contarSinSubir(), 4);
    });

    test('en la bitácora cuenta también skipped: es evidencia rechazada',
        () async {
      await obra('o1', estado: 'synced');
      await db.into(db.bitacoraEntrada).insert(BitacoraEntradaCompanion.insert(
          id: 'e1', obraId: 'o1', fecha: 0, syncStatus: const Value('skipped')));

      expect(await db.contarSinSubir(), 1);
    });

    test('vigilarApartadas cuenta las filas ajenas de todas las tablas',
        () async {
      await obra('a1', estado: 'ajena');
      await obra('ok', estado: 'synced');
      expect(await db.vigilarApartadas().first, 1);
    });

    test('no cuenta el catálogo base sembrado, que nace pending', () async {
      final semilla = await db.select(db.catalogoConceptos).get();
      expect(semilla, isNotEmpty, reason: 'la base nueva siembra el catálogo');
      expect(await db.contarSinSubir(), 0);
    });

    test('cuenta las fotos de bitácora sin subir', () async {
      await obra('o1', estado: 'synced');
      await db.into(db.bitacoraEntrada).insert(BitacoraEntradaCompanion.insert(
          id: 'e1', obraId: 'o1', fecha: 0, syncStatus: const Value('synced')));
      await db.into(db.bitacoraFoto).insert(BitacoraFotoCompanion.insert(
          id: 'f1', entradaId: 'e1', path: 'x/f1.jpg'));

      expect(await db.contarSinSubir(), 1);
    });
  });

  group('vaciarDatosLocales', () {
    test('deja TODAS las tablas vacías salvo el catálogo base resembrado',
        () async {
      final semilla = (await db.select(db.catalogoConceptos).get()).length;
      await obra('o1', empresa: a);
      await db.into(db.puestos).insert(PuestosCompanion.insert(
          id: 'p1', nombre: 'p', empresaId: const Value(a)));
      await db.into(db.bitacoraEntrada).insert(BitacoraEntradaCompanion.insert(
          id: 'e1', obraId: 'o1', fecha: 0, empresaId: const Value(a)));
      await db.into(db.catalogoConceptos).insert(CatalogoConceptosCompanion.insert(
          id: 'mio',
          clave: 'X-1',
          descripcion: 'concepto propio',
          unidad: 'pza',
          categoria: 'otro',
          esPersonalizado: const Value(true),
          empresaId: const Value(a)));

      await db.vaciarDatosLocales();

      // Recorre la lista de la base, no una a mano: una tabla nueva queda
      // revisada sola, y si `vaciarDatosLocales` dejara de cubrirla, falla.
      for (final t in db.allTables) {
        final n = await db
            .customSelect('SELECT COUNT(*) AS n FROM ${t.actualTableName}')
            .getSingle();
        final esperado = t.actualTableName == 'catalogo_conceptos' ? semilla : 0;
        expect(n.read<int>('n'), esperado, reason: t.actualTableName);
      }
      expect(await db.empresasEnBase(), isEmpty);
      expect(await db.contarSinSubir(), 0);
    });
  });
}
