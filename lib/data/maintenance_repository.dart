import '../core/db/app_database.dart';

/// Borrados masivos para la "Zona de peligro" de Configuración.
class MaintenanceRepository {
  final AppDatabase db;
  MaintenanceRepository(this.db);

  Future<void> deleteAllObras() async {
    await db.transaction(() async {
      await db.delete(db.movimientos).go();
      await db.delete(db.asistencias).go();
      await db.delete(db.destajos).go();
      await db.delete(db.obraColaborador).go();
      await db.delete(db.obras).go();
    });
  }

  Future<void> deleteAllColaboradores() async {
    await db.transaction(() async {
      await db.delete(db.asistencias).go();
      await db.delete(db.destajos).go();
      await db.delete(db.obraColaborador).go();
      await db.delete(db.colaboradores).go();
    });
  }

  Future<void> deleteAllCotizaciones() async {
    await db.transaction(() async {
      await db.delete(db.partidas).go();
      await db.delete(db.secciones).go();
      await db.delete(db.pagos).go();
      await db.delete(db.archivosCotizacion).go();
      await db.delete(db.cotizaciones).go();
    });
  }

  Future<void> vaciarCatalogo() => db.delete(db.catalogoConceptos).go();

  Future<void> restablecerTodo() async {
    await db.transaction(() async {
      await db.delete(db.movimientos).go();
      await db.delete(db.pagos).go();
      await db.delete(db.partidas).go();
      await db.delete(db.secciones).go();
      await db.delete(db.archivosCotizacion).go();
      await db.delete(db.asistencias).go();
      await db.delete(db.destajos).go();
      await db.delete(db.obraColaborador).go();
      await db.delete(db.cotizaciones).go();
      await db.delete(db.colaboradores).go();
      await db.delete(db.obras).go();
      await db.delete(db.puestos).go();
      await db.delete(db.catalogoConceptos).go();
    });
  }
}
