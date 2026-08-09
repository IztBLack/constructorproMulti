import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/sync/sync_status.dart';
import '../../core/theme/app_colors.dart';
import '../configuraciones/cloud_sync_screen.dart';
import '../configuraciones/conflictos_screen.dart';

/// Indicador de sincronización para el `actions:` de un `AppBar`.
///
/// Es la pieza que le faltaba a una app offline-first: sin ella, el usuario no
/// tiene forma de saber si lo que capturó ya llegó a la nube o sigue solo en el
/// teléfono, y el único rastro del sync vivía enterrado en la pantalla de
/// Configuración. Aquí queda a la vista y a un toque.
///
/// Muestra UN solo estado —el de mayor prioridad de [SyncFase]— para no
/// convertirse en un tablero de luces. Cuando todo está al día se **oculta**: un
/// icono permanente de "ok" se vuelve ruido que se deja de ver, y entonces
/// tampoco se nota cuando cambia a algo que sí importa. Aparece solo cuando hay
/// algo que decir (subiendo, pendientes, error) o cuando conviene recordar que
/// no hay nube (sin sesión).
class SyncStatusAction extends ConsumerWidget {
  const SyncStatusAction({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final estado = ref.watch(syncStatusProvider);
    final c = context.colores;

    // "Al día" no dibuja nada: el estado bueno es el silencioso.
    if (estado.fase == SyncFase.alDia) return const SizedBox.shrink();

    final (IconData icono, Color color, String etiqueta, String detalle) =
        switch (estado.fase) {
      SyncFase.error => (
        Icons.error_outline,
        c.danger,
        '${estado.errores}',
        '${estado.errores} cambio(s) no se pudieron subir. '
            'Toca para revisar la sincronización.',
      ),
      // Ámbar, no rojo: no está roto, espera una decisión tuya. Lleva a la
      // pantalla de conflictos, donde se elige qué registro se queda.
      SyncFase.conflicto => (
        Icons.rule,
        c.warning,
        '${estado.conflictos}',
        '${estado.conflictos} asistencia(s) en conflicto. '
            'Toca para elegir cuál se queda.',
      ),
      SyncFase.sincronizando => (
        Icons.sync,
        c.info,
        '',
        'Sincronizando con la nube…',
      ),
      SyncFase.pendiente => (
        Icons.cloud_upload_outlined,
        c.textMuted,
        '${estado.pendientes}',
        '${estado.pendientes} cambio(s) esperando subir a la nube.',
      ),
      SyncFase.desconectado => (
        Icons.cloud_off_outlined,
        c.textFaint,
        '',
        'Sin conexión a la nube. Tus datos están a salvo en este teléfono.',
      ),
      // Inalcanzable (se filtró arriba), pero el switch debe ser exhaustivo.
      SyncFase.alDia => (Icons.cloud_done_outlined, c.success, '', ''),
    };

    final hijo = estado.fase == SyncFase.sincronizando
        ? _IconoGirando(color: color)
        : Icon(icono, color: color, size: 22);

    return IconButton(
      // El tooltip es el que le pone nombre al control para lectores de
      // pantalla: el icono solo no dice nada.
      tooltip: detalle,
      // Un conflicto se resuelve en su propia pantalla; mandar al usuario a la
      // de nube lo dejaría a un toque más de lo único que puede hacer.
      onPressed: () => Navigator.of(context).push(
        MaterialPageRoute(
          builder: (_) => estado.fase == SyncFase.conflicto
              ? const ConflictosScreen()
              : const CloudSyncScreen(),
        ),
      ),
      icon: etiqueta.isEmpty
          ? hijo
          : Row(
              mainAxisSize: MainAxisSize.min,
              children: [
                hijo,
                const SizedBox(width: 4),
                Text(
                  etiqueta,
                  style: Theme.of(context)
                      .textTheme
                      .labelMedium
                      ?.copyWith(color: color, fontWeight: FontWeight.w600),
                ),
              ],
            ),
    );
  }
}

/// El icono de sincronización rotando mientras corre el sync. Da la única señal
/// de "está pasando algo" en una operación que si no sería invisible.
class _IconoGirando extends StatefulWidget {
  const _IconoGirando({required this.color});
  final Color color;

  @override
  State<_IconoGirando> createState() => _IconoGirandoState();
}

class _IconoGirandoState extends State<_IconoGirando>
    with SingleTickerProviderStateMixin {
  late final AnimationController _ctrl = AnimationController(
    vsync: this,
    duration: const Duration(milliseconds: 1100),
  )..repeat();

  @override
  void dispose() {
    _ctrl.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return RotationTransition(
      turns: _ctrl,
      child: Icon(Icons.sync, color: widget.color, size: 22),
    );
  }
}
