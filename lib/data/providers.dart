import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../core/db/app_database.dart';
import 'backup/backup_service.dart';
import 'repositories.dart';
import 'repositories_obra.dart';

/// Instancia única de la base de datos Drift.
final databaseProvider = Provider<AppDatabase>((ref) {
  final db = AppDatabase();
  ref.onDispose(db.close);
  return db;
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

typedef RangoObra = ({String obraId, int start, int end});

final asistenciasRangoProvider =
    StreamProvider.family<List<Asistencia>, RangoObra>((ref, r) => ref
        .watch(asistenciaRepositoryProvider)
        .watchRango(r.obraId, r.start, r.end));

final destajosRangoProvider =
    StreamProvider.family<List<Destajo>, RangoObra>((ref, r) =>
        ref.watch(destajoRepositoryProvider).watchRango(r.obraId, r.start, r.end));
