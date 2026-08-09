import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_riverpod/legacy.dart'; // StateProvider

import '../../data/providers.dart';
import 'cloud_providers.dart';
import 'sync_service.dart';

/// En qué punto está la sincronización, en orden de prioridad para mostrar. La
/// UI elige UN solo estado —el más importante— para no abrumar con varios
/// avisos a la vez.
enum SyncFase {
  /// Sin sesión o sin empresa vinculada: la nube no aplica. El indicador se
  /// apaga en vez de mentir con "0 pendientes" (que sonaría a "todo al día").
  desconectado,

  /// Hay filas que fallaron al subir (`sync_status='error'`). Es lo más urgente:
  /// algo no llegó al servidor y no se va a arreglar solo con esperar.
  error,

  /// Hay filas que el servidor rechazó por una regla de negocio
  /// (`sync_status='conflict'`, p. ej. "1 jornada/día"). No es un fallo de
  /// sistema: necesita que una persona decida en la pantalla de conflictos.
  conflicto,

  /// Un sync está corriendo ahora mismo.
  sincronizando,

  /// Todo escrito localmente ya subió y no hay nada en curso.
  alDia,

  /// Hay cambios locales esperando a subir. Estado normal y transitorio: el
  /// sync automático los toma en el próximo ciclo.
  pendiente,
}

/// Foto del estado de sincronización para el indicador de la barra superior.
class SyncStatus {
  const SyncStatus({
    required this.fase,
    required this.pendientes,
    required this.errores,
    this.conflictos = 0,
  });

  final SyncFase fase;

  /// Filas rechazadas por una regla de negocio del servidor
  /// (`sync_status='conflict'`). Se resuelven a mano, no reintentando.
  final int conflictos;

  /// Filas locales con cambios sin subir (`sync_status='pending'`). Cuenta las
  /// altas nuevas y las ediciones por igual.
  final int pendientes;

  /// Filas cuyo último intento de subida falló (`sync_status='error'`).
  final int errores;
}

/// Bandera "hay un sync corriendo", alimentada por [SyncService.onActividad].
/// Es un [StateProvider] y no un estado dentro del servicio para que la UI
/// pueda observarlo sin acoplarse al motor de sync.
final syncEnCursoProvider = StateProvider<bool>((_) => false);

/// Conteo reactivo de filas sin sincronizar (pendientes y con error) sumado
/// sobre TODAS las tablas que participan del sync.
///
/// Reusa [SyncService.pushOrder] como única lista de tablas: si mañana se agrega
/// una tabla al sync, aparece aquí sola, sin una segunda lista que mantener en
/// paralelo. Es un `.watch()` de Drift, así que el número baja al vuelo conforme
/// el push vacía la cola, sin sondeo.
final _conteoSinSyncProvider =
    StreamProvider<({int pendientes, int errores, int conflictos})>((ref) {
  final db = ref.watch(databaseProvider);

  // Un solo SELECT que suma, por tabla, cuántas filas hay en cada estado. Se
  // arma desde la lista de tablas para no repetir el nombre de cada una a mano.
  final piezasPend = SyncService.pushOrder
      .map((t) => "(SELECT COUNT(*) FROM $t WHERE sync_status='pending')")
      .join(' + ');
  final piezasErr = SyncService.pushOrder
      .map((t) => "(SELECT COUNT(*) FROM $t WHERE sync_status='error')")
      .join(' + ');
  final piezasConf = SyncService.pushOrder
      .map((t) => "(SELECT COUNT(*) FROM $t WHERE sync_status='conflict')")
      .join(' + ');
  final sql = 'SELECT ($piezasPend) AS pendientes, ($piezasErr) AS errores, '
      '($piezasConf) AS conflictos';

  // `readsFrom` = todas las tablas del sync, para que el stream se re-emita
  // cuando cualquiera de ellas cambie (una escritura local o el fin de un pull).
  final nombres = SyncService.pushOrder.toSet();
  final tablas =
      db.allTables.where((t) => nombres.contains(t.actualTableName)).toSet();

  return db.customSelect(sql, readsFrom: tablas).watch().map((rows) {
    final r = rows.first;
    return (
      pendientes: r.read<int>('pendientes'),
      errores: r.read<int>('errores'),
      conflictos: r.read<int>('conflictos'),
    );
  });
});

/// Estado de sincronización listo para pintar en la barra superior.
///
/// Combina tres fuentes: si hay sesión/empresa (la nube aplica o no), si un sync
/// corre ahora, y cuántas filas quedan sin subir. La prioridad de [SyncFase]
/// decide cuál gana cuando varias son ciertas a la vez —un error pesa más que
/// un "sincronizando", que pesa más que la cuenta de pendientes.
final syncStatusProvider = Provider<SyncStatus>((ref) {
  final hayUsuario = ref.watch(currentUserProvider) != null;
  final empresaId = ref.watch(empresaIdProvider);
  final enCurso = ref.watch(syncEnCursoProvider);
  final conteo = ref.watch(_conteoSinSyncProvider).asData?.value ??
      (pendientes: 0, errores: 0, conflictos: 0);

  // Sin sesión o sin empresa: la nube no aplica. No se mira la cuenta local
  // (que sería "todo pending" por el default de la columna) para no confundir
  // "trabajo offline sin cuenta" con "cambios esperando subir".
  if (!hayUsuario || empresaId == null) {
    return const SyncStatus(
        fase: SyncFase.desconectado, pendientes: 0, errores: 0);
  }

  final SyncFase fase;
  if (conteo.errores > 0) {
    fase = SyncFase.error;
  } else if (conteo.conflictos > 0) {
    // Debajo de `error` (un fallo de sistema es más urgente) pero encima de
    // `sincronizando`: un conflicto no se resuelve esperando, hay que decidirlo.
    fase = SyncFase.conflicto;
  } else if (enCurso) {
    fase = SyncFase.sincronizando;
  } else if (conteo.pendientes > 0) {
    fase = SyncFase.pendiente;
  } else {
    fase = SyncFase.alDia;
  }

  return SyncStatus(
    fase: fase,
    pendientes: conteo.pendientes,
    errores: conteo.errores,
    conflictos: conteo.conflictos,
  );
});
