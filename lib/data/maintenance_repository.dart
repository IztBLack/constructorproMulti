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

  /// Deja el teléfono como recién instalado. Antes era una lista a mano que se
  /// quedó vieja (no borraba cuadrillas, notas, caja, presupuesto ni
  /// bitácora); ahora recorre todas las tablas de la base.
  Future<void> restablecerTodo() => db.vaciarDatosLocales();
}
