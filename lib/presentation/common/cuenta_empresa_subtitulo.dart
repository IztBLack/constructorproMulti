import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/sync/cloud_providers.dart';
import '../../core/theme/app_colors.dart';

/// Título de pantalla con una segunda línea que dice **con qué cuenta y en qué
/// empresa** estás trabajando.
///
/// En una app donde varias personas comparten dispositivos de obra y una misma
/// persona puede tener acceso a más de una empresa, "¿esto a dónde se está
/// guardando?" es una pregunta legítima y constante. Tenerlo a la vista en el
/// home la responde sin abrir Configuración, y evita el error caro: capturar
/// media semana de nómina con la cuenta equivocada.
///
/// Ambos nombres salen de la base (metadata del usuario y tabla `empresas`),
/// nunca de constantes: si un administrador renombra la empresa en la web, todos
/// los dispositivos lo reflejan solos. Si no hay sesión —la app funciona
/// offline sin cuenta— la segunda línea simplemente no se dibuja, en vez de
/// mostrar un hueco o un identificador.
class TituloConCuenta extends ConsumerWidget {
  const TituloConCuenta(this.titulo, {super.key});

  final String titulo;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final cuenta = ref.watch(cuentaNombreProvider);
    // El nombre confirmado por el servidor manda; si aún no llega (o no hay red)
    // se usa el último conocido. El UUID nunca se muestra aquí.
    final empresa = ref.watch(empresaNombreProvider).asData?.value ??
        ref.watch(empresaNombreCacheProvider);

    final partes = [
      if (cuenta != null && cuenta.isNotEmpty) cuenta,
      if (empresa != null && empresa.isNotEmpty) empresa,
    ];
    if (partes.isEmpty) return Text(titulo);

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      mainAxisAlignment: MainAxisAlignment.center,
      mainAxisSize: MainAxisSize.min,
      children: [
        Text(titulo),
        Text(
          partes.join(' · '),
          maxLines: 1,
          overflow: TextOverflow.ellipsis,
          style: Theme.of(context)
              .textTheme
              .labelSmall
              ?.copyWith(color: context.colores.textMuted),
        ),
      ],
    );
  }
}
