import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../data/providers.dart';
import '../colaboradores/colaboradores_screen.dart';

/// Aviso global de gente a medio registrar. Gemelo de `AvisoIncompletos` de la
/// web (`web/src/components/equipo/aviso-incompletos.tsx`).
///
/// Vive en el shell y no en una pantalla porque el pendiente es del negocio:
/// quien da de alta a alguien en la obra no suele ser quien completa sus datos.
///
/// VIDA DEL AVISO
///  · Se calcula de los DATOS (quién tiene el puesto "Por definir"), no de lo
///    que pasó en esta sesión. Por eso vuelve a salir al abrir la app de nuevo
///    mientras el pendiente siga ahí.
///  · "Más tarde" lo oculta mientras la app siga abierta; al reiniciarla vuelve.
///    Un descarte permanente convertiría el aviso en algo que se apaga una vez y
///    nunca regresa, que es justo como se pierden estos pendientes.
///  · Desaparece solo cuando ya no queda nadie incompleto.
class AvisoIncompletos extends ConsumerStatefulWidget {
  const AvisoIncompletos({super.key});

  @override
  ConsumerState<AvisoIncompletos> createState() => _AvisoIncompletosState();
}

class _AvisoIncompletosState extends ConsumerState<AvisoIncompletos> {
  bool _oculto = false;

  @override
  Widget build(BuildContext context) {
    final cs = Theme.of(context).colorScheme;
    final incompletos = ref.watch(incompletosProvider).asData?.value ?? [];

    if (_oculto || incompletos.isEmpty) return const SizedBox.shrink();

    final nombres = incompletos.take(3).map((c) => c.nombre).toList();
    final resto = incompletos.length - nombres.length;

    return Material(
      color: cs.tertiaryContainer,
      child: Padding(
        padding: const EdgeInsets.fromLTRB(14, 10, 8, 10),
        child: Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
          Icon(Icons.warning_amber_rounded, color: cs.onTertiaryContainer),
          const SizedBox(width: 10),
          Expanded(
            child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
              Text(
                incompletos.length == 1
                    ? 'Tienes 1 colaborador con información incompleta'
                    : 'Tienes ${incompletos.length} colaboradores con información incompleta',
                style: TextStyle(
                    fontWeight: FontWeight.bold, color: cs.onTertiaryContainer),
              ),
              const SizedBox(height: 2),
              Text(
                '${nombres.join(', ')}${resto > 0 ? ' y $resto más' : ''}',
                style: TextStyle(fontSize: 12, color: cs.onTertiaryContainer),
              ),
              const SizedBox(height: 2),
              // Se dice la consecuencia, no solo el hecho: sin esto el aviso es
              // ruido y se aprende a ignorarlo.
              Text(
                'Sin puesto ni sueldo, la nómina los cuenta en \$0.',
                style: TextStyle(fontSize: 11, color: cs.onTertiaryContainer),
              ),
              const SizedBox(height: 6),
              Wrap(spacing: 8, children: [
                FilledButton(
                  style: FilledButton.styleFrom(
                    visualDensity: VisualDensity.compact,
                    backgroundColor: cs.onTertiaryContainer,
                    foregroundColor: cs.tertiaryContainer,
                  ),
                  onPressed: () => Navigator.of(context).push(MaterialPageRoute(
                    // Se abre la lista del equipo ya filtrada a los pendientes:
                    // llegar a la pantalla y tener que buscarlos a mano sería
                    // dejar el trabajo a medias.
                    builder: (_) => const ColaboradoresScreen(soloIncompletos: true),
                  )),
                  child: const Text('Ir a completar'),
                ),
                TextButton(
                  style: TextButton.styleFrom(
                    visualDensity: VisualDensity.compact,
                    foregroundColor: cs.onTertiaryContainer,
                  ),
                  onPressed: () => setState(() => _oculto = true),
                  child: const Text('Dejar para más tarde'),
                ),
              ]),
            ]),
          ),
        ]),
      ),
    );
  }
}
