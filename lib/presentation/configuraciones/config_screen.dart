import 'dart:io';

import 'package:file_picker/file_picker.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:path/path.dart' as p;
import 'package:path_provider/path_provider.dart';
import 'package:share_plus/share_plus.dart';

import '../../core/crash/crash_logger.dart';
import '../../core/modulos/modulos.dart';
import '../../core/modulos/modulos_provider.dart';
import '../../core/settings/settings_provider.dart';
import '../../core/sync/cloud_providers.dart';
import '../../core/sync/rol_provider.dart';
import '../../core/theme/app_colors.dart';
import '../../core/theme/app_theme.dart';
import '../../data/demo_data.dart';
import '../../data/providers.dart';
import '../common/app_badge.dart';
import '../common/empty_state_view.dart';
import '../common/lista_agrupada.dart';
import '../common/sync_status_action.dart';
import '../onboarding/tutorial_screen.dart';
import 'borrar_datos_screen.dart';
import 'catalogo_screen.dart';
import 'cloud_sync_screen.dart';
import 'estado_nube.dart';
import 'modulos_screen.dart';
import 'pdf_config_screen.dart';
import 'puestos_screen.dart';
import '../../domain/numeros.dart';
import '../common/app_snackbar.dart';

/// Ajustes (antes "Configuración"): el modelo de la línea de diseño del móvil.
/// Ver `docs/DISENO_MOVIL.md` y `docs/PLAN_AJUSTES_REDISENO.md`.
///
/// Arriba lo que importa (la cuenta y si todo está en la nube), después los
/// grupos con su valor a la vista, y al final UNA sola fila para borrar. El
/// buscador filtra todas las filas por título, subtítulo y sinónimos.
class ConfigScreen extends ConsumerStatefulWidget {
  const ConfigScreen({super.key});

  @override
  ConsumerState<ConfigScreen> createState() => _ConfigScreenState();
}

/// Una fila de Ajustes con su grupo y lo que la encuentra en el buscador.
class _Entrada {
  const _Entrada(
    this.grupo,
    this.fila, {
    required this.buscar,
    this.soloEnBusqueda = false,
  });

  final String grupo;
  final Widget fila;

  /// Título, subtítulo y sinónimos ("impuesto" encuentra el IVA).
  final String buscar;

  /// Solo aparece al buscar: lo que en la pantalla ya está en otra forma (la
  /// nube vive en la tarjeta de cuenta, que se oculta al buscar).
  final bool soloEnBusqueda;
}

class _ConfigScreenState extends ConsumerState<ConfigScreen> {
  final _busqueda = TextEditingController();
  String _consulta = '';

  static const _dias = [
    '',
    'Lunes',
    'Martes',
    'Miércoles',
    'Jueves',
    'Viernes',
    'Sábado',
    'Domingo',
  ];

  @override
  void dispose() {
    _busqueda.dispose();
    super.dispose();
  }

  /// Minúsculas y sin acentos: "catalogo" encuentra "Catálogo".
  static String _normalizar(String s) {
    const con = 'áéíóúüñ';
    const sin = 'aeiouun';
    final b = StringBuffer();
    for (final ch in s.toLowerCase().split('')) {
      final i = con.indexOf(ch);
      b.write(i < 0 ? ch : sin[i]);
    }
    return b.toString();
  }

  void _abrir(Widget pantalla) =>
      Navigator.of(context).push(MaterialPageRoute(builder: (_) => pantalla));

  @override
  Widget build(BuildContext context) {
    final modulos = ref.watch(modulosProvider);
    final usaEquipo = modulos.usa(ClaveModulo.equipo);
    final usaCotizaciones = modulos.usa(ClaveModulo.cotizaciones);
    final conSesion = ref.watch(currentUserProvider) != null;
    final entradas = _entradas(
      usaEquipo: usaEquipo,
      usaCotizaciones: usaCotizaciones,
      conSesion: conSesion,
      modulos: modulos,
    );

    final consulta = _normalizar(_consulta.trim());
    final buscando = consulta.isNotEmpty;

    final contenido = <Widget>[
      _buscador(),
      const SizedBox(height: 16),
      if (buscando)
        ..._resultados(entradas, consulta)
      else ...[
        const _TarjetaCuenta(),
        for (final grupo in _gruposEnOrden(entradas)) ...[
          const SizedBox(height: 24),
          GrupoLista(
            // El grupo de borrar va sin título: una fila sola al final.
            titulo: grupo.isEmpty ? null : grupo,
            children: [
              for (final e in entradas)
                if (e.grupo == grupo && !e.soloEnBusqueda) e.fila,
            ],
          ),
        ],
      ],
    ];

    return Scaffold(
      body: CustomScrollView(
        slivers: [
          // Barra normal, como las otras pestañas (Obras, Equipo, Inicio). La
          // `.large` dejaba ~150 dp vacíos arriba del título en el teléfono.
          const SliverAppBar(
            pinned: true,
            title: Text('Ajustes'),
            actions: [SyncStatusAction()],
          ),
          SliverToBoxAdapter(
            child: Center(
              child: ConstrainedBox(
                // En la tableta las filas no se estiran a 800+ dp.
                constraints: const BoxConstraints(maxWidth: 720),
                child: Padding(
                  padding: const EdgeInsets.fromLTRB(16, 0, 16, 32),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.stretch,
                    children: contenido,
                  ),
                ),
              ),
            ),
          ),
        ],
      ),
    );
  }

  List<String> _gruposEnOrden(List<_Entrada> entradas) {
    final vistos = <String>[];
    for (final e in entradas) {
      if (!e.soloEnBusqueda && !vistos.contains(e.grupo)) vistos.add(e.grupo);
    }
    return vistos;
  }

  List<Widget> _resultados(List<_Entrada> entradas, String consulta) {
    final hallados = [
      for (final e in entradas)
        if (_normalizar(e.buscar).contains(consulta)) e,
    ];
    if (hallados.isEmpty) {
      return const [
        SizedBox(height: 24),
        EmptyStateView(
          icon: Icons.search_off,
          title: 'Ningún ajuste se llama así',
          hint: 'Prueba con otra palabra, como "IVA", "respaldo" o "tema".',
        ),
      ];
    }
    return [
      GrupoLista(
        titulo: 'Resultados',
        children: [for (final e in hallados) e.fila],
      ),
    ];
  }

  Widget _buscador() {
    final c = context.colores;
    final borde = OutlineInputBorder(
      borderRadius: BorderRadius.circular(AppTheme.radiusXl),
      borderSide: BorderSide.none,
    );
    return TextField(
      controller: _busqueda,
      onChanged: (v) => setState(() => _consulta = v),
      textInputAction: TextInputAction.search,
      decoration: InputDecoration(
        hintText: 'Buscar un ajuste',
        prefixIcon: const Icon(Icons.search),
        suffixIcon: _consulta.isEmpty
            ? null
            : IconButton(
                tooltip: 'Borrar la búsqueda',
                icon: const Icon(Icons.close),
                onPressed: () => setState(() {
                  _busqueda.clear();
                  _consulta = '';
                }),
              ),
        filled: true,
        fillColor: c.surfaceMuted,
        border: borde,
        enabledBorder: borde,
        focusedBorder: borde,
      ),
    );
  }

  // ---------------------------------------------------------------------------
  // Las filas. El orden aquí es el orden en pantalla.
  // ---------------------------------------------------------------------------
  List<_Entrada> _entradas({
    required bool usaEquipo,
    required bool usaCotizaciones,
    required bool conSesion,
    required ModulosActivos modulos,
  }) {
    const empresa = 'Tu empresa';
    const preferencias = 'Preferencias de este teléfono';
    const partes = 'Módulos';
    const datos = 'Datos y respaldo';
    const ayuda = 'Ayuda';
    const borrar = '';

    final puestos = ref.watch(puestosProvider).asData?.value.length;
    final conceptos = ref.watch(catalogoCountProvider).asData?.value;
    final iva = ref.watch(ivaPorcentajeProvider);
    final themeMode = ref.watch(themeModeProvider);
    final rem = ref.watch(reminderProvider);
    final enElMovil = modulosDelMovil;
    final prendidas = [
      for (final m in enElMovil)
        if (modulos.usa(m.clave)) m,
    ];
    // Cuatro fichas y "+N": la lista completa vive en su pantalla.
    const fichasVisibles = 4;

    return [
      _Entrada(
        '',
        FilaLista(
          icono: Icons.cloud_outlined,
          tono: BadgeTone.info,
          titulo: 'Nube y sincronización',
          subtitulo: 'Tu cuenta, subir cambios y cerrar sesión',
          onTap: () => _abrir(const CloudSyncScreen()),
        ),
        buscar:
            'Nube y sincronización cuenta sesión subir sincronizar '
            'vincular código cerrar sesión',
        soloEnBusqueda: true,
      ),
      _Entrada(
        empresa,
        FilaLista(
          icono: Icons.picture_as_pdf_outlined,
          tono: BadgeTone.info,
          titulo: 'Documentos PDF',
          subtitulo: 'Logo, color, marca de agua y empresa',
          onTap: () => _abrir(const PdfConfigScreen()),
        ),
        buscar:
            'Documentos PDF logo color marca de agua firma empresa '
            'personalizar',
      ),
      if (usaEquipo)
        _Entrada(
          empresa,
          FilaLista(
            icono: Icons.badge_outlined,
            tono: BadgeTone.success,
            titulo: 'Puestos y salarios',
            subtitulo: 'Salario por día de cada puesto',
            valor: puestos?.toString(),
            etiquetaValor: puestos == null ? null : '$puestos puestos',
            onTap: () => _abrir(const PuestosScreen()),
          ),
          buscar: 'Puestos y salarios sueldo raya oficio',
        ),
      if (usaCotizaciones)
        _Entrada(
          empresa,
          FilaLista(
            icono: Icons.menu_book_outlined,
            tono: BadgeTone.warning,
            titulo: 'Catálogo de conceptos',
            subtitulo: 'Precios para cotizar',
            valor: conceptos?.toString(),
            etiquetaValor: conceptos == null ? null : '$conceptos conceptos',
            onTap: () => _abrir(const CatalogoScreen()),
          ),
          buscar: 'Catálogo de conceptos precios cotizar',
        ),
      if (usaCotizaciones)
        _Entrada(
          empresa,
          FilaLista(
            icono: Icons.percent,
            titulo: 'IVA por defecto',
            // Cada cotización congela su tasa al crearse; cambiar este valor
            // solo afecta a las que se creen de aquí en adelante.
            subtitulo: 'Solo para cotizaciones nuevas',
            valor: '${iva.toStringAsFixed(0)} %',
            etiquetaValor: '${iva.toStringAsFixed(0)} por ciento',
            onTap: _editarIva,
          ),
          buscar: 'IVA por defecto impuesto cotizaciones',
        ),
      _Entrada(
        preferencias,
        _BloqueApariencia(
          seleccion: themeMode,
          onCambio: (m) => ref.read(themeModeProvider.notifier).set(m),
        ),
        buscar: 'Apariencia tema oscuro claro modo noche',
      ),
      // El recordatorio es de la raya: sin equipo no hay nómina que pagar.
      // Dos filas, como en la guía: la fila del interruptor solo prende o
      // apaga (toda la fila, como SwitchListTile), y el día y la hora tienen
      // la suya. Una sola fila con dos toques distintos confunde a TalkBack.
      if (usaEquipo)
        _Entrada(
          preferencias,
          FilaLista(
            icono: Icons.notifications_none,
            tono: BadgeTone.warning,
            titulo: 'Recordatorio de nómina',
            subtitulo: 'Un aviso cada semana para pagar la raya',
            onTap: () => _alternarRecordatorio(!rem.enabled),
            trailing: Switch(
              value: rem.enabled,
              onChanged: _alternarRecordatorio,
            ),
          ),
          buscar: 'Recordatorio de nómina aviso notificación raya semana',
        ),
      if (usaEquipo && rem.enabled)
        _Entrada(
          preferencias,
          FilaLista(
            icono: Icons.schedule,
            tono: BadgeTone.warning,
            titulo: 'Día y hora del aviso',
            valor:
                '${_dias[rem.weekday]} '
                '${rem.hour.toString().padLeft(2, '0')}:00',
            onTap: () => _programar(rem.weekday, rem.hour),
          ),
          buscar: 'Día y hora del aviso recordatorio nómina',
        ),
      _Entrada(
        partes,
        FilaLista(
          icono: Icons.widgets_outlined,
          tono: BadgeTone.info,
          titulo: 'Partes de la app',
          subtitulo: conSesion
              ? '${prendidas.length} de ${enElMovil.length} prendidas · '
                    'las elige la oficina'
              : 'Sin cuenta se ven todas',
          debajo: Wrap(
            spacing: 6,
            runSpacing: 6,
            children: [
              for (final m in prendidas.take(fichasVisibles)) _Ficha(m.nombre),
              if (prendidas.length > fichasVisibles)
                _Ficha('+${prendidas.length - fichasVisibles} más'),
            ],
          ),
          onTap: () => _abrir(const ModulosScreen()),
        ),
        buscar: 'Partes de la app módulos disponibles en la web',
      ),
      // Los datos de prueba solo tienen sentido sin cuenta: en una cuenta real
      // mezclarían ejemplos con obras de verdad.
      if (!conSesion)
        _Entrada(
          datos,
          FilaLista(
            icono: Icons.science_outlined,
            titulo: 'Cargar datos de ejemplo',
            subtitulo: '4 obras, equipo y cotizaciones para conocer la app',
            onTap: _cargarDemo,
          ),
          buscar: 'Cargar datos de ejemplo prueba demo',
        ),
      _Entrada(
        datos,
        FilaLista(
          icono: Icons.download_outlined,
          titulo: 'Guardar un respaldo',
          subtitulo: 'Archivo con todo lo de este teléfono',
          onTap: _exportarRespaldo,
        ),
        buscar: 'Guardar un respaldo exportar copia zip',
      ),
      _Entrada(
        datos,
        FilaLista(
          icono: Icons.settings_backup_restore,
          titulo: 'Restaurar un respaldo',
          subtitulo: 'Reemplaza lo que hay en el teléfono',
          onTap: _importarRespaldo,
        ),
        buscar: 'Restaurar un respaldo importar recuperar',
      ),
      _Entrada(
        ayuda,
        FilaLista(
          icono: Icons.school_outlined,
          tono: BadgeTone.info,
          titulo: 'Tutorial de uso',
          subtitulo: 'Cómo funciona cada parte de la app',
          onTap: () => Navigator.of(context).push(
            MaterialPageRoute(
              fullscreenDialog: true,
              builder: (_) => const TutorialScreen(),
            ),
          ),
        ),
        buscar: 'Tutorial de uso ayuda aprender guía',
      ),
      _Entrada(
        ayuda,
        FilaLista(
          icono: Icons.feedback_outlined,
          titulo: 'Enviar registro de errores',
          subtitulo: 'Para soporte, si la app se cerró sola',
          onTap: _compartirCrash,
        ),
        buscar: 'Enviar registro de errores reportar problema falla soporte',
      ),
      _Entrada(
        borrar,
        FilaLista(
          icono: Icons.delete_outline,
          peligro: true,
          titulo: 'Borrar datos del teléfono',
          subtitulo: 'Obras, equipo, cotizaciones o todo',
          onTap: () => _abrir(const BorrarDatosScreen()),
        ),
        buscar:
            'Borrar datos del teléfono eliminar restablecer vaciar '
            'zona de peligro',
      ),
    ];
  }

  // ---------------------------------------------------------------------------
  // Acciones (las mismas de antes; solo cambió dónde se tocan)
  // ---------------------------------------------------------------------------
  Future<void> _alternarRecordatorio(bool v) async {
    final ok = await ref.read(reminderProvider.notifier).setEnabled(v);
    if (!ok && mounted) {
      showAppSnack(context, 'El teléfono no dio permiso para avisar. Actívalo en '
            'los ajustes del teléfono.');
    }
  }

  Future<void> _programar(int weekday, int hour) async {
    final dia = await showDialog<int>(
      context: context,
      builder: (ctx) => SimpleDialog(
        title: const Text('Día del recordatorio'),
        children: List.generate(7, (i) => i + 1)
            .map(
              (d) => SimpleDialogOption(
                onPressed: () => Navigator.pop(ctx, d),
                child: Text(_dias[d]),
              ),
            )
            .toList(),
      ),
    );
    if (dia == null || !mounted) return;
    final t = await showTimePicker(
      context: context,
      initialTime: TimeOfDay(hour: hour, minute: 0),
    );
    if (t == null || !mounted) return;
    await ref.read(reminderProvider.notifier).setSchedule(dia, t.hour);
  }

  Future<void> _editarIva() async {
    final actual = ref.read(ivaPorcentajeProvider);
    final ctrl = TextEditingController(text: actual.toStringAsFixed(0));
    final v = await showDialog<double>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: const Text('IVA por defecto'),
        content: TextField(
          controller: ctrl,
          autofocus: true,
          keyboardType: const TextInputType.numberWithOptions(decimal: true),
          decoration: const InputDecoration(
            labelText: 'Porcentaje',
            suffixText: '%',
          ),
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(ctx),
            child: const Text('Cancelar'),
          ),
          FilledButton(
            onPressed: () =>
                Navigator.pop(ctx, leerNumero(ctrl.text)),
            child: const Text('Guardar'),
          ),
        ],
      ),
    );
    // Sin `dispose` aquí: el diálogo sigue en pantalla durante su animación
    // de salida y su campo todavía usa el controlador.
    if (v != null && mounted) {
      await ref.read(ivaPorcentajeProvider.notifier).set(v);
    }
  }

  Future<void> _cargarDemo() async {
    final creado = await DemoData.generar(ref.read(databaseProvider));
    if (!mounted) return;
    showAppSnack(context, creado
              ? 'Datos de ejemplo cargados.'
              : 'Ya hay datos; no se cargaron ejemplos.');
  }

  Future<void> _exportarRespaldo() async {
    try {
      // ZIP completo: datos + archivos adjuntos (fotos/planos).
      final bytes = await ref.read(backupServiceProvider).exportToZipBytes();
      final dir = await getTemporaryDirectory();
      final file = File(p.join(dir.path, 'RespaldoConstructorPro.zip'));
      await file.writeAsBytes(bytes);
      await Share.shareXFiles([
        XFile(file.path),
      ], text: 'Respaldo ConstructorPro');
    } catch (e) {
      // El detalle técnico va al registro, no a la pantalla: a quien está en
      // la obra no le dice nada y asusta.
      debugPrint('[ConfigScreen] exportar respaldo: $e');
      if (mounted) {
        showAppSnack(context, 'No se pudo crear el respaldo. Intenta de nuevo; '
              'tus datos siguen en el teléfono.', tone: SnackTone.danger);
      }
    }
  }

  Future<void> _importarRespaldo() async {
    final result = await FilePicker.platform.pickFiles(
      type: FileType.custom,
      allowedExtensions: ['zip', 'json'],
    );
    if (result == null || result.files.single.path == null) return;
    if (!mounted) return;

    final ok = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: const Text('Restaurar un respaldo'),
        content: const Text(
          'Esto REEMPLAZA todo lo que hay en el teléfono por '
          'lo del respaldo. ¿Continuar?',
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(ctx, false),
            child: const Text('Cancelar'),
          ),
          FilledButton(
            onPressed: () => Navigator.pop(ctx, true),
            child: const Text('Restaurar'),
          ),
        ],
      ),
    );
    if (ok != true || !mounted) return;

    try {
      final ruta = result.files.single.path!;
      final svc = ref.read(backupServiceProvider);
      // ZIP (nuevo, con archivos) o JSON suelto (respaldos viejos / app Kotlin).
      if (ruta.toLowerCase().endsWith('.zip')) {
        await svc.importFromZipBytes(await File(ruta).readAsBytes());
      } else {
        await svc.importFromJson(await File(ruta).readAsString());
      }
      if (mounted) {
        showAppSnack(context, 'Respaldo restaurado.', tone: SnackTone.success);
      }
    } catch (e) {
      debugPrint('[ConfigScreen] restaurar respaldo: $e');
      if (mounted) {
        showAppSnack(context, 'No se pudo restaurar el respaldo. Revisa que el '
              'archivo sea un respaldo de ConstructorPro.', tone: SnackTone.danger);
      }
    }
  }

  Future<void> _compartirCrash() async {
    final logs = await CrashLogger.getLogs();
    if (!mounted) return;
    if (logs.isEmpty) {
      showAppSnack(context, 'No hay errores registrados: la app no ha fallado.', tone: SnackTone.warning);
      return;
    }
    await Share.shareXFiles([
      XFile(logs.first.path),
    ], text: 'Reporte de error ConstructorPro');
  }
}

/// Apariencia: título y el selector a TODO el ancho de la tarjeta. No es una
/// `FilaLista` porque el selector tiene tres opciones con su propio nombre para
/// TalkBack (fundirlas en la fila las volvería un solo botón), y en el ancho del
/// texto de una fila "Automática" no cabe.
class _BloqueApariencia extends StatelessWidget {
  const _BloqueApariencia({required this.seleccion, required this.onCambio});

  final ThemeMode seleccion;
  final ValueChanged<ThemeMode> onCambio;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.fromLTRB(16, 12, 16, 16),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Row(
            children: [
              const MosaicoIcono(Icons.contrast, tono: BadgeTone.accent),
              const SizedBox(width: 14),
              Expanded(
                child: Semantics(
                  header: true,
                  child: Text(
                    'Apariencia',
                    style: Theme.of(context).textTheme.bodyLarge?.copyWith(
                      fontWeight: FontWeight.w500,
                    ),
                  ),
                ),
              ),
            ],
          ),
          const SizedBox(height: 12),
          SegmentedButton<ThemeMode>(
            showSelectedIcon: false,
            segments: const [
              ButtonSegment(value: ThemeMode.system, label: Text('Automática')),
              ButtonSegment(value: ThemeMode.light, label: Text('Clara')),
              ButtonSegment(value: ThemeMode.dark, label: Text('Oscura')),
            ],
            selected: {seleccion},
            onSelectionChanged: (s) => onCambio(s.first),
          ),
        ],
      ),
    );
  }
}

/// Ficha de una parte prendida bajo "Partes de la app".
class _Ficha extends StatelessWidget {
  const _Ficha(this.texto);

  final String texto;

  @override
  Widget build(BuildContext context) {
    final c = context.colores;
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
      // Con borde: en el tema oscuro el fondo atenuado casi no se distingue de
      // la tarjeta.
      decoration: BoxDecoration(
        color: c.surfaceMuted,
        border: Border.all(color: c.border),
        borderRadius: BorderRadius.circular(999),
      ),
      child: Text(
        texto,
        style: Theme.of(context).textTheme.labelMedium?.copyWith(color: c.text),
      ),
    );
  }
}

/// La cabecera de Ajustes: quién eres, de qué empresa, con qué rol, y si lo
/// del teléfono ya está en la nube. Es lo que se pregunta al abrir esta
/// pantalla, por eso va antes que cualquier opción. Lleva a Nube y
/// sincronización.
class _TarjetaCuenta extends ConsumerWidget {
  const _TarjetaCuenta();

  static String _rol(String? rol) => switch (rol) {
    'admin' => 'Admin',
    'supervisor' => 'Supervisor',
    'residente' => 'Residente',
    'contador' => 'Contador',
    'colaborador' => 'Colaborador',
    'compras' => 'Compras',
    'almacen' => 'Almacén',
    _ => '',
  };

  static String _iniciales(String nombre) {
    // De un correo, solo lo de antes de la @ ("mario.h@…" → "MH", no "MG").
    final base = nombre.contains('@') ? nombre.split('@').first : nombre;
    final partes = base
        .split(RegExp(r'[\s._-]+'))
        .where((s) => s.isNotEmpty)
        .take(2)
        .map((s) => s[0].toUpperCase());
    return partes.join();
  }

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final c = context.colores;
    final texto = Theme.of(context).textTheme;
    final user = ref.watch(currentUserProvider);

    void abrirNube() => Navigator.of(
      context,
    ).push(MaterialPageRoute(builder: (_) => const CloudSyncScreen()));

    final String nombre;
    final String detalle;
    final String rol;
    if (user == null) {
      nombre = 'Sin cuenta conectada';
      detalle = 'Tus datos están solo en este teléfono';
      rol = '';
    } else {
      nombre = ref.watch(cuentaNombreProvider) ?? 'Tu cuenta';
      detalle =
          ref.watch(empresaNombreProvider).asData?.value ??
          ref.watch(empresaNombreCacheProvider) ??
          'Sin empresa vinculada';
      rol = _rol(ref.watch(rolUsuarioProvider).asData?.value);
    }

    final estado = estadoNube(ref, conSesion: user != null);
    final paleta = paletaDeTono(c, estado.tono);

    return Material(
      color: c.surface,
      clipBehavior: Clip.antiAlias,
      shape: RoundedRectangleBorder(
        borderRadius: BorderRadius.circular(AppTheme.radiusXl),
        side: BorderSide(color: c.border),
      ),
      child: Padding(
        padding: const EdgeInsets.all(12),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Padding(
              padding: const EdgeInsets.fromLTRB(4, 6, 4, 12),
              child: Row(
                children: [
                  ExcludeSemantics(
                    child: CircleAvatar(
                      radius: 26,
                      backgroundColor: c.textStrong,
                      foregroundColor: c.surface,
                      child: user == null
                          ? const Icon(Icons.person_outline)
                          : Text(
                              _iniciales(nombre),
                              style: texto.titleMedium?.copyWith(
                                color: c.surface,
                                fontWeight: FontWeight.w600,
                              ),
                            ),
                    ),
                  ),
                  const SizedBox(width: 14),
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(
                          nombre,
                          style: texto.titleMedium?.copyWith(
                            fontWeight: FontWeight.w600,
                          ),
                        ),
                        Text(
                          detalle,
                          style: texto.bodyMedium?.copyWith(color: c.textMuted),
                        ),
                      ],
                    ),
                  ),
                  if (rol.isNotEmpty) AppBadge(rol, tone: BadgeTone.accent),
                ],
              ),
            ),
            Material(
              color: paleta.fondo,
              borderRadius: BorderRadius.circular(AppTheme.radiusLg),
              clipBehavior: Clip.antiAlias,
              child: MergeSemantics(
                child: Semantics(
                  button: true,
                  child: InkWell(
                    onTap: abrirNube,
                    child: ConstrainedBox(
                      constraints: const BoxConstraints(
                        minHeight: AppTheme.touchTarget + 8,
                      ),
                      child: Padding(
                        padding: const EdgeInsets.symmetric(
                          horizontal: 12,
                          vertical: 10,
                        ),
                        child: Row(
                          children: [
                            ExcludeSemantics(
                              child: Icon(estado.icono, color: paleta.texto),
                            ),
                            const SizedBox(width: 12),
                            Expanded(
                              child: Column(
                                crossAxisAlignment: CrossAxisAlignment.start,
                                children: [
                                  Text(
                                    estado.titulo,
                                    style: texto.bodyLarge?.copyWith(
                                      fontWeight: FontWeight.w600,
                                      color: c.textStrong,
                                    ),
                                  ),
                                  Text(
                                    estado.detalle,
                                    style: texto.bodySmall?.copyWith(
                                      color: c.text,
                                    ),
                                  ),
                                ],
                              ),
                            ),
                            ExcludeSemantics(
                              child: Icon(
                                Icons.chevron_right,
                                size: 20,
                                color: c.text,
                              ),
                            ),
                          ],
                        ),
                      ),
                    ),
                  ),
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }

}
