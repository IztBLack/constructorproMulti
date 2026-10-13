import 'dart:io';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:image_picker/image_picker.dart';
import 'package:path/path.dart' as p;
import 'package:path_provider/path_provider.dart';

import '../../core/storage/app_paths.dart';

import '../../core/pdf/pdf_config.dart';
import '../../core/pdf/textos_finales.dart';
import '../../core/sync/cloud_providers.dart';
import '../../data/pdf_config_service.dart';
import '../../data/providers.dart';
import '../common/app_snackbar.dart';
import '../../core/theme/app_colors.dart';
import '../../core/theme/app_theme.dart';
import '../common/app_badge.dart';
import '../common/app_spacing.dart';
import '../common/lista_agrupada.dart';

class PdfConfigScreen extends ConsumerStatefulWidget {
  const PdfConfigScreen({super.key});

  @override
  ConsumerState<PdfConfigScreen> createState() => _PdfConfigScreenState();
}

class _PdfConfigScreenState extends ConsumerState<PdfConfigScreen> {
  final _contacto = TextEditingController();
  final _color = TextEditingController();
  final _pie = TextEditingController();
  final _watermark = TextEditingController();
  final _firmaIzq = TextEditingController();
  final _firmaDer = TextEditingController();

  /// Un controlador por tipo de documento para el párrafo final GENERAL. A
  /// diferencia del resto de esta pantalla —que es la copia local del aspecto—,
  /// estos textos se comparten con la web (`empresa_config.pdf_textos`).
  final _textos = {
    for (final t in TipoDocumento.values) t: TextEditingController(),
  };

  bool _mayusculas = false;
  bool _compacto = false;
  String? _logoPath;
  String? _firmaPath;
  bool _cargado = false;

  @override
  void initState() {
    super.initState();
    _load();
  }

  @override
  void dispose() {
    _contacto.dispose();
    _color.dispose();
    _pie.dispose();
    _watermark.dispose();
    _firmaIzq.dispose();
    _firmaDer.dispose();
    for (final c in _textos.values) {
      c.dispose();
    }
    super.dispose();
  }

  Future<void> _load() async {
    // El ASPECTO es de la empresa y se baja del servidor (la oficina manda);
    // solo el logo y la firma siguen siendo archivos de este dispositivo.
    final a = await ref.read(pdfConfigServiceProvider).refrescar();
    final locales = await PdfPrefs.load();
    _contacto.text = a.empresaContacto;
    _color.text = a.colorHex;
    _pie.text = a.pieDePagina;
    _watermark.text = a.watermark;
    _firmaIzq.text = a.firmaIzquierda;
    _firmaDer.text = a.firmaDerecha;
    _mayusculas = a.mayusculas;
    _compacto = a.modoCompacto;
    _logoPath = locales.logoPath;
    _firmaPath = locales.firmaPath;

    // Los textos generales se pintan del caché al instante y se refrescan
    // contra Supabase enseguida: si alguien los cambió desde la web, aquí se
    // ve el valor al día sin tener que cerrar la pantalla.
    final servicio = ref.read(textosPdfServiceProvider);
    for (final t in TipoDocumento.values) {
      _textos[t]!.text = servicio.textoDe(t);
    }
    setState(() => _cargado = true);

    final frescos = await servicio.refrescar();
    if (!mounted) return;
    for (final t in TipoDocumento.values) {
      final v = frescos[t] ?? '';
      // No se pisa lo que el usuario ya esté escribiendo en ese campo.
      if (_textos[t]!.text.isEmpty && v.isNotEmpty) _textos[t]!.text = v;
    }
  }

  Future<String?> _pickImage(String nombre) async {
    final picked = await ImagePicker().pickImage(source: ImageSource.gallery);
    if (picked == null) return null;
    final dir = await getApplicationDocumentsDirectory();
    final dest = File(p.join(dir.path, '$nombre${p.extension(picked.path)}'));
    await File(picked.path).copy(dest.path);
    // Se persiste el nombre relativo (no la ruta absoluta). Ver AppPaths.
    return AppPaths.toStored(dest.path);
  }

  Future<void> _guardar() async {
    // El aspecto sube: lo comparten la web y todos los dispositivos.
    await ref.read(pdfAspectoProvider.notifier).guardar(AspectoPdf(
          empresaContacto: _contacto.text.trim(),
          colorHex: _color.text.trim().isEmpty
              ? AspectoPdf.web.colorHex
              : _color.text.trim(),
          pieDePagina: _pie.text.trim(),
          watermark: _watermark.text.trim(),
          mayusculas: _mayusculas,
          modoCompacto: _compacto,
          firmaIzquierda: _firmaIzq.text.trim(),
          firmaDerecha: _firmaDer.text.trim(),
        ));

    // El logo y la firma son archivos de ESTE teléfono y se quedan locales.
    final previos = await PdfPrefs.load();
    await PdfPrefs.save(PdfConfig(
      empresaNombre: previos.empresaNombre,
      logoPath: _logoPath,
      firmaPath: _firmaPath,
    ));

    // Estos SÍ suben: son de la empresa, no del dispositivo.
    for (final t in TipoDocumento.values) {
      await ref.read(textosPdfProvider.notifier).setTexto(t, _textos[t]!.text);
    }

    if (mounted) {
      showAppSnack(context, 'Configuración de PDF guardada.');
      Navigator.pop(context);
    }
  }

  /// Foto de lo que había al cargar: para saber si salir pierde algo.
  String _foto = '';

  String _fotoActual() => [
        _contacto.text,
        _color.text,
        _pie.text,
        _watermark.text,
        _firmaIzq.text,
        _firmaDer.text,
        '$_mayusculas',
        '$_compacto',
      ].join('\u0001');

  bool get _hayCambios => _cargado && _fotoActual() != _foto;

  /// Antes, salir con la flecha tiraba lo escrito sin avisar: solo guardaba el
  /// botón del fondo.
  Future<bool> _confirmarSalida() async {
    if (!_hayCambios) return true;
    final r = await showDialog<String>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: const Text('¿Guardar los cambios?'),
        content: const Text(
            'Cambiaste el aspecto de los PDF y todavía no se guarda.'),
        actions: [
          TextButton(
              onPressed: () => Navigator.pop(ctx, 'tirar'),
              child: const Text('Salir sin guardar')),
          FilledButton(
              onPressed: () => Navigator.pop(ctx, 'guardar'),
              child: const Text('Guardar cambios')),
        ],
      ),
    );
    if (r == 'guardar') {
      await _guardar();
      return false; // _guardar ya cierra la pantalla
    }
    return r == 'tirar';
  }

  @override
  Widget build(BuildContext context) {
    if (!_cargado) {
      return Scaffold(
        appBar: AppBar(title: const Text('Documentos PDF')),
        body: const Center(child: CircularProgressIndicator()),
      );
    }
    if (_foto.isEmpty) _foto = _fotoActual();
    final t = Theme.of(context).textTheme;
    final c = context.colores;
    Widget titulo(String texto) => Padding(
          padding: const EdgeInsets.only(
              left: AppSpacing.xs, bottom: AppSpacing.sm),
          child: Text(texto, style: t.labelLarge?.copyWith(color: c.textMuted)),
        );

    return PopScope(
      canPop: false,
      onPopInvokedWithResult: (didPop, _) async {
        if (didPop) return;
        if (await _confirmarSalida() && context.mounted) {
          Navigator.of(context).pop();
        }
      },
      child: Scaffold(
        appBar: AppBar(
          title: const Text('Documentos PDF'),
          actions: [
            TextButton(onPressed: _guardar, child: const Text('Guardar')),
          ],
        ),
        body: LayoutBuilder(
          builder: (context, box) => ListView(
            padding: margenesDeLista(context, box.maxWidth),
            children: [
              // El nombre no se edita aquí: sale del registro de la empresa,
              // la misma fuente que usa la web.
              _AvisoCompartido(),
              const SizedBox(height: AppSpacing.xl),
              titulo('Encabezado y pie'),
              TextField(
                controller: _contacto,
                maxLines: 2,
                textCapitalization: TextCapitalization.sentences,
                decoration: const InputDecoration(
                    labelText: 'Contacto (teléfono, correo, dirección)'),
              ),
              AppSpacing.gapMd,
              TextField(
                controller: _pie,
                textCapitalization: TextCapitalization.sentences,
                decoration: const InputDecoration(labelText: 'Pie de página'),
              ),
              AppSpacing.gapMd,
              TextField(
                controller: _watermark,
                textCapitalization: TextCapitalization.characters,
                decoration: const InputDecoration(
                    labelText: 'Marca de agua (diagonal)',
                    hintText: 'Ej. COTIZACIÓN'),
              ),
              const SizedBox(height: AppSpacing.xl),
              titulo('Formato'),
              TextField(
                controller: _color,
                decoration: const InputDecoration(
                    labelText: 'Color de marca (HEX)', hintText: '#1A3A5C'),
              ),
              AppSpacing.gapMd,
              GrupoLista(
                children: [
                  FilaLista(
                    icono: Icons.text_fields,
                    titulo: 'Texto en mayúsculas',
                    trailing: Switch(
                      value: _mayusculas,
                      onChanged: (v) => setState(() => _mayusculas = v),
                    ),
                    onTap: () => setState(() => _mayusculas = !_mayusculas),
                  ),
                  FilaLista(
                    icono: Icons.compress,
                    titulo: 'Modo compacto',
                    subtitulo: 'Márgenes reducidos',
                    trailing: Switch(
                      value: _compacto,
                      onChanged: (v) => setState(() => _compacto = v),
                    ),
                    onTap: () => setState(() => _compacto = !_compacto),
                  ),
                ],
              ),
              const SizedBox(height: AppSpacing.xl),
              titulo('Firmas'),
              TextField(
                controller: _firmaIzq,
                textCapitalization: TextCapitalization.words,
                decoration: const InputDecoration(labelText: 'Firma izquierda'),
              ),
              AppSpacing.gapMd,
              TextField(
                controller: _firmaDer,
                textCapitalization: TextCapitalization.words,
                decoration: const InputDecoration(labelText: 'Firma derecha'),
              ),
              const SizedBox(height: AppSpacing.xl),
              titulo('Imágenes de este teléfono'),
              GrupoLista(
                children: [
                  FilaLista(
                    icono: Icons.image_outlined,
                    tono: BadgeTone.info,
                    titulo: 'Logo',
                    valor: _logoPath == null ? 'Sin asignar' : 'Asignado',
                    trailing: _logoPath == null
                        ? null
                        : IconButton(
                            icon: const Icon(Icons.clear),
                            tooltip: 'Quitar logo',
                            onPressed: () async {
                              await PdfPrefs.clearLogo();
                              if (!mounted) return;
                              setState(() => _logoPath = null);
                            },
                          ),
                    onTap: () async {
                      final path = await _pickImage('pdf_logo');
                      if (path != null && mounted) {
                        setState(() => _logoPath = path);
                      }
                    },
                  ),
                  FilaLista(
                    icono: Icons.draw_outlined,
                    tono: BadgeTone.info,
                    titulo: 'Imagen de firma',
                    valor: _firmaPath == null ? 'Sin asignar' : 'Asignada',
                    trailing: _firmaPath == null
                        ? null
                        : IconButton(
                            icon: const Icon(Icons.clear),
                            tooltip: 'Quitar firma',
                            onPressed: () async {
                              await PdfPrefs.clearFirma();
                              if (!mounted) return;
                              setState(() => _firmaPath = null);
                            },
                          ),
                    onTap: () async {
                      final path = await _pickImage('pdf_firma');
                      if (path != null && mounted) {
                        setState(() => _firmaPath = path);
                      }
                    },
                  ),
                ],
              ),
              const SizedBox(height: AppSpacing.xl),
              FilledButton(
                style: FilledButton.styleFrom(
                    minimumSize: const Size.fromHeight(AppTheme.touchTarget)),
                onPressed: _guardar,
                child: const Text('Guardar cambios'),
              ),
              const SizedBox(height: AppSpacing.xl),
            ],
          ),
        ),
      ),
    );
  }
}

/// Aclara que esta pantalla ya no es "las preferencias de mi teléfono": lo que
/// se cambie aquí lo verá también la oficina.
class _AvisoCompartido extends ConsumerWidget {
  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final cs = Theme.of(context).colorScheme;
    final nombre = ref.watch(empresaNombreProvider).asData?.value;

    return Container(
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(
        color: cs.surfaceContainerHighest,
        borderRadius: BorderRadius.circular(10),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(nombre ?? 'Tu empresa',
              style: const TextStyle(fontWeight: FontWeight.bold)),
          const SizedBox(height: 4),
          Text(
            'Esta configuración es de la empresa: se comparte con la web y con '
            'los demás dispositivos. El nombre se cambia en los ajustes de la '
            'empresa. El logo y la firma sí son de este teléfono.',
            style: Theme.of(context).textTheme.bodySmall?.copyWith(color: cs.onSurfaceVariant),
          ),
        ],
      ),
    );
  }
}
