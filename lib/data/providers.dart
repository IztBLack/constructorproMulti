import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../core/db/app_database.dart';
import 'backup/backup_service.dart';
import 'repositories.dart';

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
