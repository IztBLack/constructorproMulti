import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/settings/settings_provider.dart';

/// Una página del tutorial.
class _Paso {
  final IconData icon;
  final String titulo;
  final String descripcion;
  const _Paso(this.icon, this.titulo, this.descripcion);
}

const _pasos = <_Paso>[
  _Paso(Icons.handyman, 'Bienvenido a ConstructorPro',
      'Tu asistente para administrar obras, equipo, asistencia, gastos y cotizaciones, todo desde el celular o la tablet — incluso sin internet.'),
  _Paso(Icons.foundation, 'Obras',
      'Da de alta cada obra con su cliente y ubicación. Dentro de cada obra controlas el equipo asignado, la asistencia, la nómina y el flujo de caja.'),
  _Paso(Icons.fact_check, 'Asistencia y pase de lista',
      'Pasa lista por día con un toque (falta, ½, ¾ o completo). Si un trabajador estuvo en otra obra ese día, lo verás marcado. Puedes mover a alguien a otra obra desde el pase de lista.'),
  _Paso(Icons.description, 'Cotizaciones',
      'Arma presupuestos por secciones y partidas, apóyate en el catálogo de conceptos, aplica IVA o descuento, registra pagos y exporta el PDF para tu cliente.'),
  _Paso(Icons.people, 'Equipo',
      'Administra a tus colaboradores, sus puestos y salarios, asígnalos a obras y consulta su historial. Marca inactivo en vez de borrar para conservar registros.'),
  _Paso(Icons.insights, 'Resumen',
      'Revisa de un vistazo ingresos, egresos, saldo por obra y el "pipeline" (valor de cotizaciones pendientes). Exporta reportes globales en PDF.'),
  _Paso(Icons.settings, 'Configuración y respaldos',
      'Personaliza el PDF, activa el recordatorio de nómina, exporta/importa respaldos y carga datos de prueba. Puedes volver a ver este tutorial cuando quieras.'),
];

/// Tutorial de uso con opción de omitir. Se muestra en el primer arranque y es
/// reabrible desde Configuración.
class TutorialScreen extends ConsumerStatefulWidget {
  const TutorialScreen({super.key});

  @override
  ConsumerState<TutorialScreen> createState() => _TutorialScreenState();
}

class _TutorialScreenState extends ConsumerState<TutorialScreen> {
  final _controller = PageController();
  int _pagina = 0;

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  Future<void> _terminar() async {
    await ref.read(tutorialVistoProvider.notifier).marcarVisto();
    if (mounted) Navigator.of(context).maybePop();
  }

  @override
  Widget build(BuildContext context) {
    final cs = Theme.of(context).colorScheme;
    final esUltima = _pagina == _pasos.length - 1;

    return Scaffold(
      body: SafeArea(
        child: Column(
          children: [
            Align(
              alignment: Alignment.centerRight,
              child: TextButton(
                onPressed: _terminar,
                child: const Text('Omitir'),
              ),
            ),
            Expanded(
              child: PageView.builder(
                controller: _controller,
                itemCount: _pasos.length,
                onPageChanged: (i) => setState(() => _pagina = i),
                itemBuilder: (context, i) {
                  final p = _pasos[i];
                  return Padding(
                    padding: const EdgeInsets.symmetric(horizontal: 32),
                    child: Column(
                      mainAxisAlignment: MainAxisAlignment.center,
                      children: [
                        CircleAvatar(
                          radius: 56,
                          backgroundColor: cs.primaryContainer,
                          child: Icon(p.icon, size: 56, color: cs.onPrimaryContainer),
                        ),
                        const SizedBox(height: 32),
                        Text(p.titulo,
                            textAlign: TextAlign.center,
                            style: Theme.of(context).textTheme.headlineSmall),
                        const SizedBox(height: 16),
                        Text(p.descripcion,
                            textAlign: TextAlign.center,
                            style: Theme.of(context).textTheme.bodyLarge?.copyWith(
                                color: cs.onSurfaceVariant)),
                      ],
                    ),
                  );
                },
              ),
            ),
            // Indicador de páginas
            Row(
              mainAxisAlignment: MainAxisAlignment.center,
              children: List.generate(_pasos.length, (i) {
                final activo = i == _pagina;
                return AnimatedContainer(
                  duration: const Duration(milliseconds: 200),
                  margin: const EdgeInsets.symmetric(horizontal: 4),
                  width: activo ? 22 : 8,
                  height: 8,
                  decoration: BoxDecoration(
                    color: activo ? cs.primary : cs.outlineVariant,
                    borderRadius: BorderRadius.circular(4),
                  ),
                );
              }),
            ),
            Padding(
              padding: const EdgeInsets.all(24),
              child: Row(
                children: [
                  if (!esUltima)
                    TextButton(
                      onPressed: () => _controller.animateToPage(
                        _pasos.length - 1,
                        duration: const Duration(milliseconds: 300),
                        curve: Curves.easeOut,
                      ),
                      child: const Text('Saltar al final'),
                    ),
                  const Spacer(),
                  FilledButton(
                    onPressed: esUltima
                        ? _terminar
                        : () => _controller.nextPage(
                              duration: const Duration(milliseconds: 300),
                              curve: Curves.easeOut,
                            ),
                    child: Text(esUltima ? 'Comenzar' : 'Siguiente'),
                  ),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }
}
