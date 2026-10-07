import 'dart:io';

import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart' show FilteringTextInputFormatter;
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:image_picker/image_picker.dart';
import 'package:intl/intl.dart';

import '../../core/format/format.dart';
import '../../core/settings/settings_provider.dart' show sharedPreferencesProvider;
import '../../core/sync/cloud_providers.dart';
import '../../core/theme/app_colors.dart';
import '../../core/theme/app_theme.dart';
import '../../data/providers.dart';
import '../../data/repositories_bitacora.dart';
import '../../domain/bitacora/bitacora_reglas.dart';
import '../../domain/import/mx_time.dart' show fechaMxDe;
import '../common/app_snackbar.dart';
import '../common/confirm_dialog.dart';
import 'bitacora_fotos.dart';

/// Formulario de una entrada de bitácora: nueva (con fotos) o edición de una
/// abierta (sin fotos: se agregan desde la tarjeta). Gemelo de
/// `formulario-entrada.tsx` de la web, con sus etiquetas y mensajes.
///
/// Todo se guarda primero en el teléfono, aunque no haya señal; el sync lo sube
/// después. Por eso aquí no hay casilla de "que el cliente la vea": publicarla
/// es una operación aparte y EN LÍNEA, desde la tarjeta
/// (docs/PLAN_BITACORA_MOVIL.md §2.2).
class EntradaFormScreen extends ConsumerStatefulWidget {
  const EntradaFormScreen({super.key, required this.obraId, this.inicial});

  final String obraId;

  /// Si viene, es edición.
  final EntradaConDetalle? inicial;

  @override
  ConsumerState<EntradaFormScreen> createState() => _EntradaFormScreenState();
}

class _EntradaFormScreenState extends ConsumerState<EntradaFormScreen> {
  bool get _editando => widget.inicial != null;

  /// Día de CALENDARIO elegido (sin hora). Se guarda como la medianoche de la
  /// Ciudad de México de ese día, igual que la web.
  late DateTime _dia;
  late String _tipo;
  late String _clima;
  late final TextEditingController _texto;
  late final TextEditingController _conteo;
  final _nuevoNombre = TextEditingController();
  late List<String> _nombres;
  final List<XFile> _fotos = [];

  /// Ya tocó algo: salir sin guardar pregunta antes.
  bool _modificado = false;

  /// Ya tocó la lista de nombres: la sugerencia del pase de lista de hoy, que
  /// llega un instante después de abrir, ya no la pisa.
  bool _tocoNombres = false;

  bool _trayendo = false;
  bool _guardando = false;
  String? _aviso;
  String? _error;

  @override
  void initState() {
    super.initState();
    final e = widget.inicial;
    if (e != null) {
      final f = fechaMxDe(e.entrada.fecha);
      _dia = DateTime(f.year, f.month, f.day);
      _tipo = tiposEntrada.containsKey(e.entrada.tipo) ? e.entrada.tipo : 'AVANCE';
      _clima = climas.containsKey(e.entrada.clima) ? e.entrada.clima : '';
      _texto = TextEditingController(text: e.entrada.texto);
      _nombres = [...e.nombres];
      final conteo = e.entrada.personalPresente;
      _conteo = TextEditingController(
          text: _nombres.isEmpty && conteo != null ? '$conteo' : '');
    } else {
      final hoy = DateTime.now();
      _dia = DateTime(hoy.year, hoy.month, hoy.day);
      _tipo = tiposEntrada.keys.first;
      _clima = '';
      _texto = TextEditingController();
      _conteo = TextEditingController();
      _nombres = [];
      // Como la web: la entrada nueva arranca con quienes pasaron lista hoy.
      _sugerirPersonalDeHoy();
      _recuperarFotoPerdida();
    }
  }

  @override
  void dispose() {
    _texto.dispose();
    _conteo.dispose();
    _nuevoNombre.dispose();
    super.dispose();
  }

  void _marcarModificado() {
    if (!_modificado) setState(() => _modificado = true);
  }

  // ── Personal ──────────────────────────────────────────────────────────

  /// El pase de lista se guarda con la medianoche LOCAL del teléfono
  /// (`Semana.inicioDia`), no con la de México: así se busca.
  int get _diaLocalMs => Semana.inicioDia(_dia);

  Future<void> _sugerirPersonalDeHoy() async {
    final repo = ref.read(bitacoraRepositoryProvider);
    try {
      final nombres = await repo.personalSugerido(
          obraId: widget.obraId,
          diaLocalMs: _diaLocalMs,
          diaMexicoMs: medianocheMexicoMs(_dia));
      if (!mounted || _tocoNombres || nombres.isEmpty) return;
      setState(() => _nombres = nombres);
    } catch (_) {
      // Es solo una sugerencia: sin ella se anotan a mano.
    }
  }

  Future<void> _traerDelPaseDeLista() async {
    final repo = ref.read(bitacoraRepositoryProvider);
    setState(() {
      _trayendo = true;
      _aviso = null;
    });
    try {
      final nombres = await repo.personalSugerido(
          obraId: widget.obraId,
          diaLocalMs: _diaLocalMs,
          diaMexicoMs: medianocheMexicoMs(_dia));
      if (!mounted) return;
      if (nombres.isEmpty) {
        setState(() => _aviso =
            'Ese día no hay pase de lista en esta obra. Puedes anotar los '
            'nombres o solo cuántos eran.');
        return;
      }
      setState(() {
        _nombres = nombres;
        _conteo.clear();
        _tocoNombres = true;
        _modificado = true;
      });
    } catch (_) {
      if (mounted) {
        setState(() => _aviso = 'No se pudo leer el pase de lista.');
      }
    } finally {
      if (mounted) setState(() => _trayendo = false);
    }
  }

  void _agregarNombre() {
    final n = _nuevoNombre.text.trim();
    if (n.isEmpty) return;
    setState(() {
      if (!_nombres.any((x) => x.toLowerCase() == n.toLowerCase())) {
        _nombres = [..._nombres, n];
      }
      _nuevoNombre.clear();
      _tocoNombres = true;
      _modificado = true;
    });
  }

  void _quitarNombre(String n) {
    setState(() {
      _nombres = _nombres.where((x) => x != n).toList();
      _tocoNombres = true;
      _modificado = true;
    });
  }

  // ── Fotos ─────────────────────────────────────────────────────────────

  /// Android puede destruir la pantalla mientras la cámara está abierta (poca
  /// memoria): la foto no regresa al `pickImage` y hay que pedirla aparte.
  ///
  /// `retrieveLostData` es de TODA la app: la foto perdida pudo ser el logo,
  /// una cotización o un comprobante. Solo se adjunta si la cámara se abrió
  /// desde aquí ([_marcaCamara]); si no, se consume y se descarta — mejor
  /// perderla que meter una foto ajena en la evidencia de la obra.
  Future<void> _recuperarFotoPerdida() async {
    if (kIsWeb || defaultTargetPlatform != TargetPlatform.android) return;
    final prefs = ref.read(sharedPreferencesProvider);
    final eraDeAqui = prefs.getString(_marcaCamara) == 'nueva';
    try {
      await prefs.remove(_marcaCamara);
      final r = await ImagePicker().retrieveLostData();
      if (r.isEmpty || !mounted || !eraDeAqui) return;
      final archivos = r.files ?? [if (r.file != null) r.file!];
      if (archivos.isEmpty) return;
      setState(() {
        _agregarFotos(archivos);
        _modificado = true;
      });
      showAppSnack(context, 'Se recuperó la foto que estabas tomando.',
          tone: SnackTone.success);
    } catch (_) {
      // Sin nada que recuperar o sin el plugin: no hay nada que hacer.
    }
  }

  void _agregarFotos(List<XFile> nuevas) {
    final cupo = fotosRestantes(_fotos.length);
    if (nuevas.length > cupo) {
      _aviso = 'Se tomaron las primeras $maxFotosPorEntrada fotos (es el '
          'máximo por entrada).';
    }
    _fotos.addAll(nuevas.take(cupo));
  }

  /// Marca que la cámara se abrió desde este formulario (ver
  /// [_recuperarFotoPerdida]).
  static const _marcaCamara = 'bitacora_camara_abierta';

  Future<void> _elegirFotos(ImageSource origen) async {
    final prefs = ref.read(sharedPreferencesProvider);
    final camara = origen == ImageSource.camera;
    try {
      if (camara) await prefs.setString(_marcaCamara, 'nueva');
      final elegidas = await elegirFotosBitacora(origen,
          restantes: fotosRestantes(_fotos.length));
      if (camara) await prefs.remove(_marcaCamara);
      if (!mounted || elegidas.isEmpty) return;
      setState(() {
        _agregarFotos(elegidas);
        _modificado = true;
      });
    } catch (_) {
      if (camara) await prefs.remove(_marcaCamara);
      if (!mounted) return;
      showAppSnack(
        context,
        origen == ImageSource.camera
            ? 'No se pudo abrir la cámara. Revisa que la app tenga permiso.'
            : 'No se pudo abrir la galería. Revisa que la app tenga permiso.',
        tone: SnackTone.danger,
      );
    }
  }

  // ── Día ───────────────────────────────────────────────────────────────

  Future<void> _elegirDia() async {
    final hoy = DateTime.now();
    final ultimo = DateTime(hoy.year, hoy.month, hoy.day);
    final d = await showDatePicker(
      context: context,
      initialDate: _dia.isAfter(ultimo) ? ultimo : _dia,
      firstDate: DateTime(2020),
      // Como la web (`max={hoy}`): la bitácora cuenta lo que ya pasó.
      lastDate: ultimo,
      helpText: 'Día de la entrada',
    );
    if (d == null || !mounted) return;
    setState(() {
      _dia = DateTime(d.year, d.month, d.day);
      _modificado = true;
    });
  }

  // ── Guardar ───────────────────────────────────────────────────────────

  Future<void> _guardar() async {
    if (_guardando) return;
    setState(() => _error = null);

    final errorTexto = validarTexto(_texto.text);
    if (errorTexto != null) {
      setState(() => _error = errorTexto);
      return;
    }
    int? conteo;
    final conteoCrudo = _conteo.text.trim();
    if (_nombres.isEmpty && conteoCrudo.isNotEmpty) {
      conteo = int.tryParse(conteoCrudo);
      if (conteo == null) {
        setState(() => _error = 'El número de personas debe ser un entero.');
        return;
      }
      final errorPersonal = validarPersonal(conteo);
      if (errorPersonal != null) {
        setState(() => _error = errorPersonal);
        return;
      }
    }

    // Todo lo de `ref` antes del primer `await`.
    final repo = ref.read(bitacoraRepositoryProvider);
    // Sin cuenta todavía la bitácora sigue funcionando: el sync arma la ruta de
    // las fotos con la empresa del momento de subir.
    final empresaId = ref.read(empresaIdProvider) ?? '';
    final fecha = medianocheMexicoMs(_dia);

    setState(() => _guardando = true);
    // Tras guardar, la pantalla sigue montada ~300 ms mientras se va: si
    // `_guardando` volviera a false, un segundo toque crearía OTRA entrada
    // igual y el segundo pop sacaría también la bitácora.
    var listo = false;
    try {
      if (_editando) {
        await repo.editarEntrada(
          widget.inicial!.entrada.id,
          fecha: fecha,
          tipo: _tipo,
          texto: _texto.text,
          clima: _clima,
          nombres: _nombres,
          personalPresente: conteo,
        );
        listo = true;
        if (!mounted) return;
        showAppSnack(context, 'Cambios guardados.', tone: SnackTone.success);
        Navigator.of(context).pop();
        return;
      }

      final id = await repo.crearEntrada(
        obraId: widget.obraId,
        empresaId: empresaId,
        fecha: fecha,
        tipo: _tipo,
        texto: _texto.text,
        clima: _clima,
        nombres: _nombres,
        personalPresente: conteo,
      );
      // La entrada ya quedó: una foto que falla no la deshace (como la web).
      listo = true;
      var guardadas = 0;
      for (final foto in _fotos) {
        try {
          await repo.agregarFoto(
            entradaId: id,
            obraId: widget.obraId,
            empresaId: empresaId,
            origen: foto.path,
          );
          guardadas++;
        } catch (_) {
          // Se cuenta abajo y se avisa.
        }
      }
      if (!mounted) return;
      if (guardadas < _fotos.length) {
        showAppSnack(
          context,
          'La entrada se guardó con $guardadas de ${_fotos.length} fotos. Las '
          'demás se pueden agregar desde la entrada.',
          tone: SnackTone.warning,
          duracion: const Duration(seconds: 6),
        );
      } else {
        showAppSnack(context, 'Entrada guardada.', tone: SnackTone.success);
      }
      Navigator.of(context).pop();
    } on ArgumentError catch (e) {
      if (mounted) setState(() => _error = '${e.message}');
    } on StateError {
      if (mounted) setState(() => _error = 'Esta entrada ya no existe.');
    } catch (_) {
      if (mounted) {
        setState(() => _error = 'No se pudo guardar. Intenta de nuevo.');
      }
    } finally {
      if (mounted && !listo) setState(() => _guardando = false);
    }
  }

  Future<void> _salirSinGuardar() async {
    final salir = await confirmDialog(
      context,
      title: _editando ? 'Descartar cambios' : 'Descartar entrada',
      message: _editando
          ? '¿Salir sin guardar? Se pierden los cambios.'
          : '¿Salir sin guardar? Se pierde lo que escribiste y las fotos.',
      actionLabel: 'Salir sin guardar',
    );
    if (salir && mounted) Navigator.of(context).pop();
  }

  // ── Pantalla ──────────────────────────────────────────────────────────

  @override
  Widget build(BuildContext context) {
    final c = context.colores;
    final textTheme = Theme.of(context).textTheme;
    final diaTexto = _capitalizar(
        DateFormat("EEEE, d 'de' MMMM 'de' y", 'es_MX').format(_dia));

    return PopScope(
      canPop: !_modificado || _guardando,
      onPopInvokedWithResult: (didPop, _) {
        if (!didPop) _salirSinGuardar();
      },
      child: Scaffold(
        appBar: AppBar(
          title: Text(_editando ? 'Editar entrada' : 'Nueva entrada'),
        ),
        body: SafeArea(
          child: ListView(
            padding: const EdgeInsets.fromLTRB(16, 12, 16, 32),
            children: [
              // ── Día ──
              Text('Día', style: textTheme.labelLarge?.copyWith(color: c.text)),
              const SizedBox(height: 4),
              OutlinedButton.icon(
                onPressed: _guardando ? null : _elegirDia,
                icon: const Icon(Icons.calendar_today_outlined),
                label: Align(
                  alignment: Alignment.centerLeft,
                  child: Text(diaTexto),
                ),
                style: OutlinedButton.styleFrom(
                  minimumSize: const Size.fromHeight(AppTheme.touchTarget),
                ),
              ),
              const SizedBox(height: 16),

              // ── Tipo y clima ──
              DropdownButtonFormField<String>(
                initialValue: _tipo,
                decoration: const InputDecoration(labelText: 'Tipo'),
                items: [
                  for (final t in tiposEntrada.entries)
                    DropdownMenuItem(value: t.key, child: Text(t.value)),
                ],
                onChanged: _guardando
                    ? null
                    : (v) => setState(() {
                          _tipo = v ?? _tipo;
                          _modificado = true;
                        }),
              ),
              const SizedBox(height: 12),
              DropdownButtonFormField<String>(
                initialValue: _clima,
                decoration: const InputDecoration(labelText: 'Clima'),
                items: [
                  for (final cl in climas.entries)
                    DropdownMenuItem(value: cl.key, child: Text(cl.value)),
                ],
                onChanged: _guardando
                    ? null
                    : (v) => setState(() {
                          _clima = v ?? '';
                          _modificado = true;
                        }),
              ),
              const SizedBox(height: 16),

              // ── Texto ──
              TextField(
                controller: _texto,
                enabled: !_guardando,
                minLines: 4,
                maxLines: 10,
                maxLength: maxLargoTexto,
                textCapitalization: TextCapitalization.sentences,
                keyboardType: TextInputType.multiline,
                onChanged: (_) => _marcarModificado(),
                decoration: const InputDecoration(
                  labelText: '¿Qué pasó?',
                  hintText:
                      'Ej.: Se coló la losa del eje 3. Llegaron 8 m³ de concreto, '
                      'faltó 1.',
                  alignLabelWithHint: true,
                ),
                // El contador de letras de la web ("12 de 5000 letras").
                buildCounter: (context,
                        {required currentLength,
                        required isFocused,
                        required maxLength}) =>
                    Text('$currentLength de $maxLength letras',
                        style: textTheme.bodySmall?.copyWith(color: c.textMuted)),
              ),
              const SizedBox(height: 12),

              // ── Personal ──
              _SeccionPersonal(
                nombres: _nombres,
                conteo: _conteo,
                nuevoNombre: _nuevoNombre,
                trayendo: _trayendo,
                habilitado: !_guardando,
                onTraer: _traerDelPaseDeLista,
                onAgregar: _agregarNombre,
                onQuitar: _quitarNombre,
                onConteo: _marcarModificado,
              ),

              // ── Fotos: solo al crear, como la web ──
              if (!_editando) ...[
                const SizedBox(height: 16),
                _SeccionFotos(
                  fotos: _fotos,
                  habilitado: !_guardando,
                  onCamara: () => _elegirFotos(ImageSource.camera),
                  onGaleria: () => _elegirFotos(ImageSource.gallery),
                  onQuitar: (i) => setState(() {
                    _fotos.removeAt(i);
                    _aviso = null;
                  }),
                ),
              ],

              const SizedBox(height: 16),
              Text(
                'Después de 24 horas la entrada queda cerrada: ya no se cambia '
                'ni se borra, solo se le agregan aclaraciones.',
                style: textTheme.bodySmall?.copyWith(color: c.textMuted),
              ),

              // Avisos y errores, anunciados al lector de pantalla.
              if (_aviso != null) ...[
                const SizedBox(height: 12),
                Semantics(
                  liveRegion: true,
                  child: Text(_aviso!,
                      style: textTheme.bodyMedium?.copyWith(color: c.warning)),
                ),
              ],
              if (_error != null) ...[
                const SizedBox(height: 12),
                Semantics(
                  liveRegion: true,
                  child: Text(_error!,
                      style: textTheme.bodyMedium?.copyWith(color: c.danger)),
                ),
              ],

              const SizedBox(height: 16),
              FilledButton(
                onPressed: _guardando ? null : _guardar,
                style: FilledButton.styleFrom(
                  minimumSize: const Size.fromHeight(AppTheme.touchTarget),
                ),
                child: Text(_guardando
                    ? 'Guardando…'
                    : _editando
                        ? 'Guardar cambios'
                        : 'Guardar entrada'),
              ),
              const SizedBox(height: 8),
              TextButton(
                onPressed:
                    _guardando ? null : () => Navigator.of(context).maybePop(),
                child: const Text('Cancelar'),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

String _capitalizar(String s) =>
    s.isEmpty ? s : s[0].toUpperCase() + s.substring(1);

/// "Personal presente": nombres del pase de lista (editables) o solo cuántos.
class _SeccionPersonal extends StatelessWidget {
  const _SeccionPersonal({
    required this.nombres,
    required this.conteo,
    required this.nuevoNombre,
    required this.trayendo,
    required this.habilitado,
    required this.onTraer,
    required this.onAgregar,
    required this.onQuitar,
    required this.onConteo,
  });

  final List<String> nombres;
  final TextEditingController conteo;
  final TextEditingController nuevoNombre;
  final bool trayendo;
  final bool habilitado;
  final VoidCallback onTraer;
  final VoidCallback onAgregar;
  final ValueChanged<String> onQuitar;
  final VoidCallback onConteo;

  @override
  Widget build(BuildContext context) {
    final c = context.colores;
    final textTheme = Theme.of(context).textTheme;
    final cuantos = nombres.length;

    return DecoratedBox(
      decoration: BoxDecoration(
        borderRadius: BorderRadius.circular(AppTheme.radiusLg),
        border: Border.all(color: c.border),
      ),
      child: Padding(
        padding: const EdgeInsets.all(12),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text('Personal presente',
                style: textTheme.titleSmall?.copyWith(color: c.textStrong)),
            const SizedBox(height: 8),
            Wrap(
              spacing: 12,
              runSpacing: 4,
              crossAxisAlignment: WrapCrossAlignment.center,
              children: [
                OutlinedButton.icon(
                  onPressed: habilitado && !trayendo ? onTraer : null,
                  icon: const Icon(Icons.fact_check_outlined),
                  label: Text(trayendo ? 'Leyendo…' : 'Traer del pase de lista'),
                ),
                Text(
                  cuantos > 0
                      ? '$cuantos ${cuantos == 1 ? 'persona' : 'personas'}'
                      : 'Sin nombres',
                  style: textTheme.bodySmall?.copyWith(color: c.textMuted),
                ),
              ],
            ),
            if (nombres.isNotEmpty) ...[
              const SizedBox(height: 8),
              Semantics(
                label: 'Personas anotadas',
                container: true,
                child: Wrap(
                  spacing: 8,
                  runSpacing: 4,
                  children: [
                    for (final n in nombres)
                      InputChip(
                        label: Text(n),
                        onDeleted: habilitado ? () => onQuitar(n) : null,
                        deleteButtonTooltipMessage: 'Quitar a $n',
                      ),
                  ],
                ),
              ),
            ],
            const SizedBox(height: 8),
            Row(
              crossAxisAlignment: CrossAxisAlignment.end,
              children: [
                Expanded(
                  child: TextField(
                    controller: nuevoNombre,
                    enabled: habilitado,
                    textCapitalization: TextCapitalization.words,
                    textInputAction: TextInputAction.done,
                    onSubmitted: (_) => onAgregar(),
                    decoration: const InputDecoration(
                      labelText: 'Agregar a alguien',
                      hintText: 'Nombre',
                    ),
                  ),
                ),
                const SizedBox(width: 8),
                OutlinedButton(
                  onPressed: habilitado ? onAgregar : null,
                  style: OutlinedButton.styleFrom(
                    minimumSize: const Size(0, AppTheme.touchTarget),
                  ),
                  child: const Text('Agregar'),
                ),
              ],
            ),
            if (nombres.isEmpty) ...[
              const SizedBox(height: 12),
              SizedBox(
                width: 200,
                child: TextField(
                  controller: conteo,
                  enabled: habilitado,
                  keyboardType: TextInputType.number,
                  inputFormatters: [FilteringTextInputFormatter.digitsOnly],
                  onChanged: (_) => onConteo(),
                  decoration:
                      const InputDecoration(labelText: 'O solo cuántos eran'),
                ),
              ),
            ],
          ],
        ),
      ),
    );
  }
}

/// Fotos de una entrada nueva: cámara o galería, hasta [maxFotosPorEntrada].
class _SeccionFotos extends StatelessWidget {
  const _SeccionFotos({
    required this.fotos,
    required this.habilitado,
    required this.onCamara,
    required this.onGaleria,
    required this.onQuitar,
  });

  final List<XFile> fotos;
  final bool habilitado;
  final VoidCallback onCamara;
  final VoidCallback onGaleria;
  final ValueChanged<int> onQuitar;

  @override
  Widget build(BuildContext context) {
    final c = context.colores;
    final textTheme = Theme.of(context).textTheme;
    final hayLugar = fotos.length < maxFotosPorEntrada;

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text('Fotos', style: textTheme.titleSmall?.copyWith(color: c.textStrong)),
        const SizedBox(height: 8),
        Wrap(
          spacing: 8,
          runSpacing: 8,
          children: [
            OutlinedButton.icon(
              onPressed: habilitado && hayLugar ? onCamara : null,
              icon: const Icon(Icons.photo_camera_outlined),
              label: const Text('Cámara'),
            ),
            OutlinedButton.icon(
              onPressed: habilitado && hayLugar ? onGaleria : null,
              icon: const Icon(Icons.photo_library_outlined),
              label: const Text('Galería'),
            ),
          ],
        ),
        const SizedBox(height: 4),
        Text(
          '${fotos.length} de $maxFotosPorEntrada. Se reducen antes de subir '
          'para gastar menos datos.',
          style: textTheme.bodySmall?.copyWith(color: c.textMuted),
        ),
        if (fotos.isNotEmpty) ...[
          const SizedBox(height: 8),
          Wrap(
            spacing: 8,
            runSpacing: 8,
            children: [
              for (var i = 0; i < fotos.length; i++)
                _MiniaturaNueva(
                  ruta: fotos[i].path,
                  numero: i + 1,
                  onQuitar: habilitado ? () => onQuitar(i) : null,
                ),
            ],
          ),
        ],
      ],
    );
  }
}

/// Miniatura de una foto recién tomada, con su botón para quitarla.
class _MiniaturaNueva extends StatelessWidget {
  const _MiniaturaNueva({
    required this.ruta,
    required this.numero,
    required this.onQuitar,
  });

  final String ruta;
  final int numero;
  final VoidCallback? onQuitar;

  @override
  Widget build(BuildContext context) {
    final c = context.colores;
    return SizedBox(
      width: 88,
      height: 88,
      child: Stack(
        fit: StackFit.expand,
        children: [
          ClipRRect(
            borderRadius: BorderRadius.circular(AppTheme.radiusMd),
            child: Semantics(
              image: true,
              label: 'Foto $numero',
              child: Image.file(
                File(ruta),
                fit: BoxFit.cover,
                cacheWidth: 240,
                errorBuilder: (_, _, _) => ColoredBox(
                  color: c.surfaceMuted,
                  child: Icon(Icons.image_outlined, color: c.textMuted),
                ),
              ),
            ),
          ),
          Positioned(
            top: 0,
            right: 0,
            child: IconButton.filledTonal(
              onPressed: onQuitar,
              tooltip: 'Quitar la foto $numero',
              icon: const Icon(Icons.close, size: 18),
              visualDensity: VisualDensity.compact,
            ),
          ),
        ],
      ),
    );
  }
}
