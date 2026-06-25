import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_riverpod/legacy.dart'; // StateProvider

import '../core/db/app_database.dart';
import '../core/settings/settings_provider.dart'; // sharedPreferencesProvider
import 'backup/backup_service.dart';
import 'maintenance_repository.dart';
import 'repositories.dart';
import 'repositories_obra.dart';
import 'repositories_cotizacion.dart';

/// Pestaña seleccionada del shell inferior (para accesos rápidos del dashboard).
final homeTabProvider = StateProvider<int>((ref) => 0);

/// IVA por defecto (%) configurable, persistido en SharedPreferences.
/// Notifier síncrono: la UI lee el valor directo (sin AsyncValue) y `set()`
/// actualiza el estado y notifica a todos los observadores sin invalidación manual.
final ivaPorcentajeProvider =
    NotifierProvider<IvaNotifier, double>(IvaNotifier.new);

class IvaNotifier extends Notifier<double> {
  static const _key = 'iva_pct';

  @override
  double build() => ref.read(sharedPreferencesProvider).getDouble(_key) ?? 16.0;

  Future<void> set(double v) async {
    state = v;
    await ref.read(sharedPreferencesProvider).setDouble(_key, v);
  }
}

/// Instancia única de la base de datos Drift. Se sobreescribe en main() con la
/// instancia real; lanzar por defecto evita abrir una SEGUNDA conexión SQLite al
/// mismo archivo si algún punto de entrada olvidara el override.
final databaseProvider = Provider<AppDatabase>((ref) {
  throw UnimplementedError(
      'databaseProvider debe sobreescribirse en main() (ver main.dart).');
});

// ---------------- Repositorios ----------------
final obraRepositoryProvider = Provider<ObraRepository>(
    (ref) => ObraRepository(ref.watch(databaseProvider)));

final puestoRepositoryProvider = Provider<PuestoRepository>(
    (ref) => PuestoRepository(ref.watch(databaseProvider)));

final colaboradorRepositoryProvider = Provider<ColaboradorRepository>(
    (ref) => ColaboradorRepository(ref.watch(databaseProvider)));

final backupServiceProvider = Provider<BackupService>(
    (ref) => BackupService(ref.watch(databaseProvider)));

final asistenciaRepositoryProvider = Provider<AsistenciaRepository>(
    (ref) => AsistenciaRepository(ref.watch(databaseProvider)));

final destajoRepositoryProvider = Provider<DestajoRepository>(
    (ref) => DestajoRepository(ref.watch(databaseProvider)));

final movimientoRepositoryProvider = Provider<MovimientoRepository>(
    (ref) => MovimientoRepository(ref.watch(databaseProvider)));

// ---------------- Streams ----------------
final obrasProvider = StreamProvider<List<Obra>>(
    (ref) => ref.watch(obraRepositoryProvider).watchAll());

final puestosProvider = StreamProvider<List<Puesto>>(
    (ref) => ref.watch(puestoRepositoryProvider).watchAll());

final colaboradoresProvider = StreamProvider<List<Colaborador>>(
    (ref) => ref.watch(colaboradorRepositoryProvider).watchAll());

/// colaboradorId → obras activas asignadas (un colaborador puede tener varias).
final colaboradorObrasProvider = StreamProvider<Map<String, List<Obra>>>(
    (ref) => ref.watch(colaboradorRepositoryProvider).watchObrasPorColaborador());

/// Conteo de conceptos en el catálogo (para verificar el seed).
final catalogoCountProvider = FutureProvider<int>(
    (ref) => ref.watch(databaseProvider).contarCatalogo());

// ---------------- Providers por obra (familia) ----------------
final colaboradoresPorObraProvider =
    StreamProvider.family<List<Colaborador>, String>((ref, obraId) =>
        ref.watch(colaboradorRepositoryProvider).watchActivosPorObra(obraId));

final movimientosPorObraProvider =
    StreamProvider.family<List<Movimiento>, String>((ref, obraId) =>
        ref.watch(movimientoRepositoryProvider).watchByObra(obraId));

final movimientosTodosProvider = StreamProvider<List<Movimiento>>(
    (ref) => ref.watch(movimientoRepositoryProvider).watchAll());

typedef RangoObra = ({String obraId, int start, int end});

final asistenciasRangoProvider =
    StreamProvider.family<List<Asistencia>, RangoObra>((ref, r) => ref
        .watch(asistenciaRepositoryProvider)
        .watchRango(r.obraId, r.start, r.end));

final destajosRangoProvider =
    StreamProvider.family<List<Destajo>, RangoObra>((ref, r) =>
        ref.watch(destajoRepositoryProvider).watchRango(r.obraId, r.start, r.end));

// ---------------- Cotizaciones / Presupuesto ----------------
final cotizacionRepositoryProvider = Provider<CotizacionRepository>(
    (ref) => CotizacionRepository(ref.watch(databaseProvider)));
final seccionRepositoryProvider = Provider<SeccionRepository>(
    (ref) => SeccionRepository(ref.watch(databaseProvider)));
final partidaRepositoryProvider = Provider<PartidaRepository>(
    (ref) => PartidaRepository(ref.watch(databaseProvider)));
final pagoRepositoryProvider = Provider<PagoRepository>(
    (ref) => PagoRepository(ref.watch(databaseProvider)));
final catalogoRepositoryProvider = Provider<CatalogoRepository>(
    (ref) => CatalogoRepository(ref.watch(databaseProvider)));

final archivoRepositoryProvider = Provider<ArchivoRepository>(
    (ref) => ArchivoRepository(ref.watch(databaseProvider)));

final archivosProvider = StreamProvider.family<List<ArchivoCotizacion>, String>(
    (ref, cotId) => ref.watch(archivoRepositoryProvider).watchByCotizacion(cotId));

final maintenanceRepositoryProvider = Provider<MaintenanceRepository>(
    (ref) => MaintenanceRepository(ref.watch(databaseProvider)));

final catalogoTodoProvider = StreamProvider<List<CatalogoConcepto>>(
    (ref) => ref.watch(catalogoRepositoryProvider).watchAll());

final cotizacionesProvider = StreamProvider<List<Cotizacion>>(
    (ref) => ref.watch(cotizacionRepositoryProvider).watchAll());

/// Valor total de cotizaciones pendientes (BORRADOR/ENVIADA) — KPI "Pipeline".
final pipelineValueProvider = StreamProvider<double>(
    (ref) => ref.watch(cotizacionRepositoryProvider).watchPipeline());

final seccionesProvider = StreamProvider.family<List<Seccion>, String>(
    (ref, cotId) => ref.watch(seccionRepositoryProvider).watchByCotizacion(cotId));

final partidasDeCotizacionProvider = StreamProvider.family<List<Partida>, String>(
    (ref, cotId) => ref.watch(partidaRepositoryProvider).watchDeCotizacion(cotId));

final pagosProvider = StreamProvider.family<List<Pago>, String>(
    (ref, cotId) => ref.watch(pagoRepositoryProvider).watchByCotizacion(cotId));

/// Movimientos ligados a una cotización (avance por partida).
final movimientosDeCotizacionProvider =
    StreamProvider.family<List<Movimiento>, String>((ref, cotId) =>
        ref.watch(movimientoRepositoryProvider).watchPorCotizacion(cotId));

/// Cotización ligada a una obra (para ligar gastos a partidas).
final cotizacionDeObraProvider = FutureProvider.family<Cotizacion?, String>(
    (ref, obraId) => ref.watch(cotizacionRepositoryProvider).cotizacionDeObra(obraId));
