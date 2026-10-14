import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:home_widget/home_widget.dart';
import 'package:quick_actions/quick_actions.dart';

import '../../core/db/app_database.dart';
import '../../core/modulos/modulos_provider.dart';
import '../../core/sync/rol_provider.dart';
import '../../core/widgets_inicio/enlaces_inicio.dart';
import '../../core/widgets_inicio/resumen_widgets.dart';
import '../../core/widgets_inicio/widgets_inicio_service.dart';
import '../../data/providers.dart';
import '../asistencia/pase_lista_screen.dart';
import '../bitacora/bitacora_screen.dart';
import '../bitacora/entrada_form_screen.dart';
import '../common/app_snackbar.dart';
import '../common/app_spacing.dart';
import '../common/lista_agrupada.dart';
import '../notas/notas_obra_screen.dart';
import '../obras/obra_detail_screen.dart';

/// Abre la app en la pantalla que pide un widget de la pantalla de inicio o un
/// atajo del ícono, y publica los atajos que le tocan al rol.
///
/// Se mezcla en el estado de [HomeShell]: es la primera pantalla con
/// `Navigator`, y vive mientras la app esté abierta.
mixin AbrirDesdeInicio<T extends ConsumerStatefulWidget> on ConsumerState<T> {
  StreamSubscription<Uri?>? _clics;
  final _atajos = const QuickActions();

  void iniciarEnlacesInicio() {
    if (!WidgetsInicioController.soportado) return;
    // La app se abrió tocando un widget (estaba cerrada).
    unawaited(HomeWidget.initiallyLaunchedFromHomeWidget().then(abrirEnlace));
    // Se tocó un widget con la app ya abierta.
    _clics = HomeWidget.widgetClicked.listen(abrirEnlace);
    unawaited(_atajos.initialize((tipo) => _abrir(leerAtajo(tipo))));
    _publicarAtajos();
    ref.listenManual(rolUsuarioProvider, (_, _) => _publicarAtajos());
    ref.listenManual(modulosProvider, (_, _) => _publicarAtajos());
  }

  void cerrarEnlacesInicio() => _clics?.cancel();

  PermisosWidgets _permisos() => permisosWidgets(
        rol: ref.read(rolUsuarioProvider).asData?.value,
        usa: ref.read(modulosProvider).usa,
      );

  /// Los atajos del ícono: solo los que el rol puede usar (Android admite 4).
  void _publicarAtajos() {
    final p = _permisos();
    unawaited(_atajos.setShortcutItems([
      if (p.accionPase)
        const ShortcutItem(
          type: 'pase-lista',
          localizedTitle: 'Pasar lista',
          icon: 'ic_atajo_pase',
        ),
      if (p.accionBitacora)
        const ShortcutItem(
          type: 'entrada-bitacora',
          localizedTitle: 'Entrada de bitácora',
          icon: 'ic_atajo_bitacora',
        ),
      if (p.accionNota)
        const ShortcutItem(
          type: 'nota-nueva',
          localizedTitle: 'Nota nueva',
          icon: 'ic_atajo_nota',
        ),
      if (p.accionGasto)
        const ShortcutItem(
          type: 'gasto-caja',
          localizedTitle: 'Gasto de caja',
          icon: 'ic_atajo_gasto',
        ),
    ]).catchError((Object e) {
      debugPrint('[atajos] no se pudieron publicar: $e');
    }));
  }

  void abrirEnlace(Uri? uri) => _abrir(leerEnlaceInicio(uri));

  /// ¿El rol de hoy puede llegar ahí? El widget pudo pintarse con otro rol o
  /// con un módulo que ya se apagó.
  bool _permitido(DestinoInicio d, PermisosWidgets p) => switch (d) {
        DestinoInicio.paseLista => p.paseLista,
        DestinoInicio.bitacora => p.avisosBitacora,
        DestinoInicio.entradaBitacora => p.accionBitacora,
        DestinoInicio.notas => p.avisosNotas,
        DestinoInicio.notaNueva => p.accionNota,
        DestinoInicio.gastoCaja => p.accionGasto,
        DestinoInicio.obra => p.obrasHoy,
      };

  Future<void> _abrir(EnlaceInicio? enlace) async {
    if (enlace == null) return;
    // Al arrancar desde el widget, esperar a que exista el primer frame.
    await WidgetsBinding.instance.endOfFrame;
    if (!mounted) return;

    if (!_permitido(enlace.destino, _permisos())) {
      showAppSnack(context, 'Esa opción no está disponible con tu cuenta.');
      return;
    }

    Obra? obra;
    if (enlace.destino.requiereObra) {
      obra = await _obraPara(enlace);
      if (obra == null || !mounted) return;
    }

    final o = obra;
    final Widget pantalla = switch (enlace.destino) {
      DestinoInicio.paseLista => const PaseListaScreen(),
      DestinoInicio.bitacora =>
        BitacoraScreen(obraId: o!.id, obraNombre: o.nombre),
      DestinoInicio.entradaBitacora => EntradaFormScreen(obraId: o!.id),
      DestinoInicio.notas => NotasObraScreen(obraId: o!.id, obraNombre: o.nombre),
      DestinoInicio.notaNueva =>
        NotasObraScreen(obraId: o!.id, obraNombre: o.nombre, crearAlAbrir: true),
      DestinoInicio.gastoCaja => ObraDetailScreen(
          obra: o!,
          pestanaInicial: PestanaObra.caja,
          abrirSalida: true,
        ),
      DestinoInicio.obra => ObraDetailScreen(obra: o!),
    };
    if (!mounted) return;
    unawaited(Navigator.of(context).push(MaterialPageRoute<void>(builder: (_) => pantalla)));
  }

  /// La obra del enlace; si no trae, la única activa o la que se elija.
  /// Para dinero (gasto) y para lo que queda escrito (bitácora, notas) es
  /// mejor preguntar que adivinar.
  Future<Obra?> _obraPara(EnlaceInicio enlace) async {
    final obras = await ref.read(obrasProvider.future);
    if (!mounted) return null;
    if (enlace.obraId != null) {
      final o = obras.where((o) => o.id == enlace.obraId).firstOrNull;
      if (o == null) {
        showAppSnack(context, 'Esa obra ya no está en este teléfono.');
      }
      return o;
    }
    final activas = obras.where((o) => o.activa).toList();
    if (activas.isEmpty) {
      showAppSnack(context, 'No hay obras activas.');
      return null;
    }
    if (activas.length == 1) return activas.first;
    return showModalBottomSheet<Obra>(
      context: context,
      showDragHandle: true,
      isScrollControlled: true,
      builder: (ctx) => SafeArea(
        child: ListView(
          shrinkWrap: true,
          padding: const EdgeInsets.fromLTRB(
              AppSpacing.lg, 0, AppSpacing.lg, AppSpacing.lg),
          children: [
            GrupoLista(
              titulo: '¿En qué obra?',
              children: [
                for (final o in activas)
                  FilaLista(
                    titulo: o.nombre,
                    icono: Icons.foundation_outlined,
                    onTap: () => Navigator.pop(ctx, o),
                  ),
              ],
            ),
          ],
        ),
      ),
    );
  }
}
