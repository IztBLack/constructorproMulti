import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/format/format.dart';
import '../../core/sync/cloud_providers.dart';
import '../../core/sync/sync_status.dart';
import '../common/app_badge.dart';

/// Lo que se dice de la nube, en el mismo orden de prioridad que el
/// indicador del `AppBar` ([SyncFase]).
({IconData icono, BadgeTone tono, String titulo, String detalle}) estadoNube(
  WidgetRef ref, {
  required bool conSesion,
}) {
  if (!conSesion) {
    return (
      icono: Icons.cloud_off_outlined,
      tono: BadgeTone.info,
      titulo: 'Conectar con la nube',
      detalle: 'Para sincronizar con la web y no perder nada',
    );
  }
  final s = ref.watch(syncStatusProvider);
  ref.watch(syncEnCursoProvider);
  final ultima = ref.read(syncMetadataProvider).ultimaSubidaCompleta;
  final cuandoSubio = ultima == null
      ? 'Aún no hay una subida completa'
      : 'Última subida completa: ${Fmt.cuando(ultima)}';
  return switch (s.fase) {
    SyncFase.alDia => (
      icono: Icons.cloud_done_outlined,
      tono: BadgeTone.success,
      titulo: 'Todo está en la nube',
      detalle: cuandoSubio,
    ),
    SyncFase.pendiente => (
      icono: Icons.cloud_upload_outlined,
      tono: BadgeTone.neutral,
      titulo: '${s.pendientes} cambio(s) por subir',
      detalle: 'Se suben solos cuando hay señal',
    ),
    SyncFase.sincronizando => (
      icono: Icons.sync,
      tono: BadgeTone.info,
      titulo: 'Sincronizando…',
      detalle: cuandoSubio,
    ),
    SyncFase.error => (
      icono: Icons.error_outline,
      tono: BadgeTone.danger,
      titulo: '${s.errores} cambio(s) no se pudieron subir',
      detalle: 'Toca para ver qué hacer',
    ),
    SyncFase.conflicto => (
      icono: Icons.rule,
      tono: BadgeTone.warning,
      titulo: '${s.conflictos} conflicto(s) por resolver',
      detalle: 'Toca para elegir cuál se queda',
    ),
    SyncFase.cuentaPorConfirmar => (
      icono: Icons.manage_accounts_outlined,
      tono: BadgeTone.warning,
      titulo: 'Falta confirmar la cuenta',
      detalle: 'Este teléfono tiene datos de otra cuenta',
    ),
    SyncFase.desconectado => (
      icono: Icons.link_off,
      tono: BadgeTone.warning,
      titulo: 'Cuenta sin empresa vinculada',
      detalle: 'Toca para vincularla con tu código',
    ),
  };
}
