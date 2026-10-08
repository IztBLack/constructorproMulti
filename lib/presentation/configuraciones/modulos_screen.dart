import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/modulos/modulos.dart';
import '../../core/modulos/modulos_provider.dart';
import '../../core/sync/cloud_providers.dart';
import '../../core/sync/rol_provider.dart';
import '../../core/theme/app_colors.dart';
import '../common/app_badge.dart';
import '../common/lista_agrupada.dart';

/// Ajustes → Partes de la app: qué módulos usa la empresa en este teléfono y
/// cuáles están prendidos solo en la web.
///
/// Solo informa. En el celular NO hay interruptores, ni para el admin: se
/// cambian en la web (Ajustes → Módulos), que avisa de las dependencias y
/// confirma antes de apagar.
class ModulosScreen extends ConsumerWidget {
  const ModulosScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final modulos = ref.watch(modulosProvider);
    final conSesion = ref.watch(currentUserProvider) != null;
    final rol = ref.watch(rolUsuarioProvider).asData?.value;
    final c = context.colores;

    final String quienDecide;
    if (!conSesion) {
      quienDecide =
          'Sin cuenta conectada se ven todas las partes que tiene el '
          'celular.';
    } else if (rol == 'admin') {
      quienDecide =
          'Las prendes o apagas desde la web, en Ajustes → Módulos. '
          'Aquí se aplican solas. Apagar una parte la oculta; tus datos se '
          'conservan.';
    } else {
      quienDecide =
          'Las elige el administrador de tu empresa desde la web. '
          'Si te falta alguna, pídesela.';
    }

    return Scaffold(
      appBar: AppBar(title: const Text('Partes de la app')),
      body: LayoutBuilder(
        builder: (context, caja) => ListView(
          padding: margenesDeLista(context, caja.maxWidth),
          children: [
            Text(
              quienDecide,
              style: Theme.of(
                context,
              ).textTheme.bodyMedium?.copyWith(color: c.textMuted),
            ),
            const SizedBox(height: 24),
            GrupoLista(
              titulo: 'En este teléfono',
              children: [
                for (final m in modulosDelMovil)
                  FilaLista(
                    titulo: m.nombre,
                    subtitulo: m.descripcion,
                    trailing: modulos.usa(m.clave)
                        ? const AppBadge(
                            'Prendida',
                            tone: BadgeTone.success,
                            icon: Icons.check,
                          )
                        : const AppBadge('Apagada'),
                  ),
              ],
            ),
            // Lo que la empresa prendió en la web y el celular todavía no
            // tiene. Sin enlace: no hay pantalla a la cual mandar.
            if (modulos.soloEnLaWeb.isNotEmpty) ...[
              const SizedBox(height: 24),
              GrupoLista(
                titulo: 'Disponibles en la web',
                children: [
                  for (final m in modulos.soloEnLaWeb)
                    FilaLista(
                      icono: Icons.language,
                      tono: BadgeTone.info,
                      titulo: m.nombre,
                      subtitulo: m.descripcion,
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
