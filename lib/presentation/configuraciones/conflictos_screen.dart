import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/format/format.dart';
import '../../core/sync/cloud_providers.dart';
import '../../core/theme/app_colors.dart';
import '../../data/providers.dart';
import '../../data/repositories_obra.dart';

/// Conflictos de jornada por resolver.
///
/// El servidor rechaza que una persona acumule más de 1 jornada en un día
/// (regla de negocio, no un fallo de red). Cuando eso pasa —dos dispositivos
/// capturaron el mismo día en obras distintas sin haberse sincronizado entre
/// ellos— la fila queda en `sync_status='conflict'`: fuera del reintento
/// automático, porque reintentar mil veces no decide nada. Alguien tiene que
/// elegir cuál registro es el correcto, y esa decisión necesita ver los DOS
/// datos con nombres, no un UUID ni un código de Postgres.
///
/// De ahí el formato de cada tarjeta: "en la nube tenemos X, en esta tableta
/// Y", y tres salidas explícitas —Cancelar (decidir luego), Omitir (gana la
/// nube) y Subir (gana lo de aquí y reemplaza)—. "Subir" pide confirmación
/// aparte porque es la única que modifica lo que los demás ya ven.
class ConflictosScreen extends ConsumerWidget {
  const ConflictosScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final repo = ref.watch(asistenciaRepositoryProvider);
    return Scaffold(
      appBar: AppBar(title: const Text('Conflictos por resolver')),
      body: StreamBuilder<List<ConflictoAsistencia>>(
        stream: repo.watchConflictos(),
        builder: (context, snap) {
          if (!snap.hasData) {
            return const Center(child: CircularProgressIndicator());
          }
          final conflictos = snap.data!;
          if (conflictos.isEmpty) return const _SinConflictos();
          return ListView.builder(
            padding: const EdgeInsets.all(12),
            itemCount: conflictos.length + 1,
            itemBuilder: (context, i) {
              if (i == 0) return const _Encabezado();
              return _TarjetaConflicto(conflicto: conflictos[i - 1]);
            },
          );
        },
      ),
    );
  }
}

/// Estado vacío. Es el destino deseado de esta pantalla, así que se celebra en
/// vez de dejar un hueco en blanco.
class _SinConflictos extends StatelessWidget {
  const _SinConflictos();

  @override
  Widget build(BuildContext context) {
    final c = context.colores;
    return Center(
      child: Padding(
        padding: const EdgeInsets.all(32),
        child: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            Icon(Icons.check_circle_outline, size: 56, color: c.success),
            const SizedBox(height: 16),
            Text('Sin conflictos',
                style: Theme.of(context).textTheme.titleMedium),
            const SizedBox(height: 8),
            Text(
              'Todas las asistencias cuadran con la nube.',
              textAlign: TextAlign.center,
              style: TextStyle(color: c.textMuted),
            ),
          ],
        ),
      ),
    );
  }
}

class _Encabezado extends StatelessWidget {
  const _Encabezado();

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.fromLTRB(4, 0, 4, 12),
      child: Text(
        'Estas personas ya tienen jornada completa ese día en otra obra. '
        'Elige cuál registro se queda.',
        style: TextStyle(color: context.colores.textMuted, fontSize: 13),
      ),
    );
  }
}

class _TarjetaConflicto extends ConsumerStatefulWidget {
  const _TarjetaConflicto({required this.conflicto});
  final ConflictoAsistencia conflicto;

  @override
  ConsumerState<_TarjetaConflicto> createState() => _TarjetaConflictoState();
}

class _TarjetaConflictoState extends ConsumerState<_TarjetaConflicto> {
  bool _ocupado = false;

  ConflictoAsistencia get c => widget.conflicto;

  /// Omitir: gana la nube pero el dato local NO se borra. Se avisa de la
  /// consecuencia —el día queda con doble jornada en este dispositivo— porque
  /// afecta la nómina que se calcula aquí, y callarlo sería el tipo de detalle
  /// que se descubre semanas después en un pago mal hecho.
  Future<void> _omitir() async {
    final confirmar = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: const Text('¿Conservar el dato solo aquí?'),
        content: Text(
          'No se subirá a la nube, pero se queda guardado en este dispositivo.\n\n'
          'Ojo: ${c.colaborador} quedará con 2 jornadas ese día en la nómina de '
          'esta tableta (en la nube tendrá 1). Si no lo quieres, usa Eliminar.',
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.of(ctx).pop(false),
            child: const Text('Cancelar'),
          ),
          FilledButton(
            onPressed: () => Navigator.of(ctx).pop(true),
            child: const Text('Conservar aquí'),
          ),
        ],
      ),
    );
    if (confirmar != true || !mounted) return;

    setState(() => _ocupado = true);
    final messenger = ScaffoldMessenger.of(context);
    await ref.read(asistenciaRepositoryProvider).omitirConflicto(c.id);
    if (!mounted) return;
    setState(() => _ocupado = false);
    messenger.showSnackBar(SnackBar(
      content: Text('Se conservó el registro de la nube para ${c.colaborador}.'),
    ));
  }

  /// Eliminar: descarta el registro capturado aquí. Es la salida limpia —deja el
  /// día cuadrado con la nube— y por eso su diálogo es el más simple de los tres.
  Future<void> _eliminar() async {
    final confirmar = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: const Text('¿Eliminar este registro?'),
        content: Text(
          'Se borra de este dispositivo la asistencia de ${c.colaborador} en '
          '${c.obraLocal} del ${Fmt.dayName(c.fecha)}.\n\n'
          'Queda la de la nube (${c.obraRival ?? 'la otra obra'}), así que el '
          'día vuelve a tener 1 jornada. No afecta a nadie más.',
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.of(ctx).pop(false),
            child: const Text('Cancelar'),
          ),
          FilledButton(
            style: FilledButton.styleFrom(
                backgroundColor: context.colores.danger),
            onPressed: () => Navigator.of(ctx).pop(true),
            child: const Text('Eliminar'),
          ),
        ],
      ),
    );
    if (confirmar != true || !mounted) return;

    setState(() => _ocupado = true);
    final messenger = ScaffoldMessenger.of(context);
    await ref.read(asistenciaRepositoryProvider).eliminarConflicto(c.id);
    if (!mounted) return;
    setState(() => _ocupado = false);
    messenger.showSnackBar(SnackBar(
      content: Text('Se eliminó el registro de ${c.colaborador} en ${c.obraLocal}.'),
    ));
  }

  /// Subir: gana lo capturado aquí y reemplaza lo de la nube. Confirma antes,
  /// porque es la única acción de esta pantalla que cambia lo que los demás ven.
  Future<void> _subir() async {
    final rival = c.obraRival ?? 'el registro de la nube';
    final confirmar = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: const Text('¿Reemplazar el registro?'),
        content: Text(
          'En la nube ${c.colaborador} aparece en $rival el '
          '${Fmt.dayName(c.fecha)}.\n\n'
          'Si subes este registro, esa asistencia se da de baja y queda '
          '${c.obraLocal} (${_jornada(c.fraccion)}) en su lugar.',
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.of(ctx).pop(false),
            child: const Text('Cancelar'),
          ),
          FilledButton(
            onPressed: () => Navigator.of(ctx).pop(true),
            child: const Text('Reemplazar'),
          ),
        ],
      ),
    );
    if (confirmar != true || !mounted) return;

    setState(() => _ocupado = true);
    final messenger = ScaffoldMessenger.of(context);
    final repo = ref.read(asistenciaRepositoryProvider);
    await repo.reemplazarConConflicto(c);
    // Sube en el acto: la baja del rival va primero (orden del push), así el
    // servidor acepta este registro sin volver a rechazarlo.
    await ref.read(syncServiceProvider).syncAll();
    if (!mounted) return;
    setState(() => _ocupado = false);
    messenger.showSnackBar(
      SnackBar(content: Text('Se subió ${c.obraLocal} para ${c.colaborador}.')),
    );
  }

  static String _jornada(double f) =>
      f == 1.0 ? '1 jornada' : '${f.toStringAsFixed(2)} jornada';

  @override
  Widget build(BuildContext context) {
    final col = context.colores;
    return Card(
      margin: const EdgeInsets.only(bottom: 12),
      child: Padding(
        padding: const EdgeInsets.all(14),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              children: [
                CircleAvatar(
                  backgroundColor: col.warningSoft,
                  child: Icon(Icons.person_outline, color: col.warning),
                ),
                const SizedBox(width: 12),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(c.colaborador,
                          style: const TextStyle(
                              fontWeight: FontWeight.w600, fontSize: 15)),
                      Text(Fmt.dayName(c.fecha),
                          style:
                              TextStyle(color: col.textMuted, fontSize: 12.5)),
                    ],
                  ),
                ),
              ],
            ),
            const SizedBox(height: 12),
            _FilaDato(
              icono: Icons.cloud_done_outlined,
              etiqueta: 'En la nube (lo que tenemos)',
              valor: c.obraRival == null
                  ? 'Otra obra que no bajó a este dispositivo'
                  : '${c.obraRival} · ${_jornada(c.fraccionRival ?? 1.0)}',
              color: col.textMuted,
              fondo: col.surfaceMuted,
            ),
            const SizedBox(height: 8),
            _FilaDato(
              icono: Icons.tablet_android_outlined,
              etiqueta: 'En este dispositivo (el dato nuevo)',
              valor: '${c.obraLocal} · ${_jornada(c.fraccion)}',
              color: col.info,
              fondo: col.infoSoft,
            ),
            const SizedBox(height: 12),
            if (_ocupado)
              const Center(
                child: Padding(
                  padding: EdgeInsets.symmetric(vertical: 8),
                  child: SizedBox(
                      width: 22,
                      height: 22,
                      child: CircularProgressIndicator(strokeWidth: 2)),
                ),
              )
            else ...[
              // Dos filas: cuatro acciones en una sola dejarían los toques por
              // debajo del mínimo cómodo en un teléfono. Arriba las dos que
              // resuelven de verdad (Eliminar deja el día cuadrado; Subir
              // reemplaza en la nube); abajo las de salida sin resolver.
              Row(
                children: [
                  Expanded(
                    child: OutlinedButton.icon(
                      onPressed: _eliminar,
                      style: OutlinedButton.styleFrom(
                          foregroundColor: col.danger),
                      icon: const Icon(Icons.delete_outline, size: 18),
                      label: const Text('Eliminar'),
                    ),
                  ),
                  const SizedBox(width: 8),
                  Expanded(
                    child: FilledButton.icon(
                      onPressed: _subir,
                      icon: const Icon(Icons.cloud_upload_outlined, size: 18),
                      label: const Text('Subir'),
                    ),
                  ),
                ],
              ),
              Row(
                children: [
                  Expanded(
                    child: TextButton(
                      onPressed: () => Navigator.of(context).maybePop(),
                      child: const Text('Cancelar'),
                    ),
                  ),
                  const SizedBox(width: 8),
                  Expanded(
                    child: TextButton(
                      onPressed: _omitir,
                      style: TextButton.styleFrom(
                          foregroundColor: col.textMuted),
                      child: const Text('Omitir'),
                    ),
                  ),
                ],
              ),
            ],
          ],
        ),
      ),
    );
  }
}

/// Una de las dos versiones del dato en disputa.
class _FilaDato extends StatelessWidget {
  const _FilaDato({
    required this.icono,
    required this.etiqueta,
    required this.valor,
    required this.color,
    required this.fondo,
  });

  final IconData icono;
  final String etiqueta;
  final String valor;
  final Color color;
  final Color fondo;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 9),
      decoration: BoxDecoration(
        color: fondo,
        borderRadius: BorderRadius.circular(10),
      ),
      child: Row(
        children: [
          Icon(icono, size: 20, color: color),
          const SizedBox(width: 10),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(etiqueta, style: TextStyle(fontSize: 11, color: color)),
                Text(valor, style: const TextStyle(fontSize: 13.5)),
              ],
            ),
          ),
        ],
      ),
    );
  }
}
