import 'dart:io';

import 'package:constructorpro/core/db/app_database.dart';
import 'package:constructorpro/core/storage/app_paths.dart';
import 'package:constructorpro/data/backup/backup_service.dart';
import 'package:drift/native.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:path/path.dart' as p;

void main() {
  // Necesario para que el seed del catálogo (rootBundle) funcione en el test.
  TestWidgetsFlutterBinding.ensureInitialized();

  test('Respaldo ZIP: roundtrip restaura datos y binarios en "otro dispositivo"',
      () async {
    final origen = await Directory.systemTemp.createTemp('cp_backup_origen');
    AppPaths.documentsDir = origen.path;

    final db = AppDatabase.forTesting(NativeDatabase.memory());
    await db.into(db.obras).insert(
        ObrasCompanion.insert(id: 'o1', nombre: 'Obra 1', fechaInicio: 0));
    await db.into(db.puestos).insert(
        PuestosCompanion.insert(id: 'p1', nombre: 'Maestro'));
    await db.into(db.colaboradores).insert(ColaboradoresCompanion.insert(
        id: 'c1', nombre: 'Juan', puestoId: 'p1', tipoPago: 'DIA'));
    await db.into(db.cotizaciones).insert(CotizacionesCompanion.insert(
        id: 'q1', cliente: 'Cliente', nombreProyecto: 'Proyecto', fecha: 0));

    // Adjunto real en el directorio de documentos; se persiste su nombre relativo.
    final foto = File(p.join(origen.path, 'foto1.jpg'))
      ..writeAsBytesSync([1, 2, 3, 4]);
    await db.into(db.archivosCotizacion).insert(ArchivosCotizacionCompanion.insert(
        id: 'a1',
        cotizacionId: 'q1',
        tipo: 'IMAGEN',
        nombre: 'foto1.jpg',
        uri: AppPaths.toStored(foto.path),
        fechaAgregado: 0));

    final zip = await BackupService(db).exportToZipBytes();
    expect(zip, isNotEmpty);

    // Simula otro dispositivo: el archivo original ya no existe y el directorio
    // de documentos es distinto (como el sandbox de iOS tras reinstalar).
    foto.deleteSync();
    final destino = await Directory.systemTemp.createTemp('cp_backup_destino');
    AppPaths.documentsDir = destino.path;
    final db2 = AppDatabase.forTesting(NativeDatabase.memory());

    await BackupService(db2).importFromZipBytes(zip);

    // Datos restaurados.
    expect((await db2.select(db2.obras).get()).length, 1);
    final archivos = await db2.select(db2.archivosCotizacion).get();
    expect(archivos.length, 1);

    // El binario se restauró en el nuevo directorio y es resoluble.
    final restaurado = File(AppPaths.resolve(archivos.first.uri));
    expect(restaurado.existsSync(), isTrue);
    expect(restaurado.readAsBytesSync(), [1, 2, 3, 4]);

    await db.close();
    await db2.close();
  });

  test('Importar respaldo de otra app es rechazado sin borrar datos', () async {
    final dir = await Directory.systemTemp.createTemp('cp_backup_foraneo');
    AppPaths.documentsDir = dir.path;
    final db = AppDatabase.forTesting(NativeDatabase.memory());
    await db.into(db.obras).insert(
        ObrasCompanion.insert(id: 'o1', nombre: 'Obra existente', fechaInicio: 0));

    // JSON con la firma de otra app: debe rechazarse.
    const ajeno = '{"app":"OtraApp","obras":[],"colaboradores":[],"cotizaciones":[]}';
    expect(
      () => BackupService(db).importFromJson(ajeno),
      throwsA(isA<FormatException>()),
    );
    // Los datos no se tocaron.
    expect((await db.select(db.obras).get()).length, 1);

    await db.close();
  });
}
