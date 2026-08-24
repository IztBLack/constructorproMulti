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
      ScaffoldMessenger.of(context)
          .showSnackBar(const SnackBar(content: Text('Configuración de PDF guardada.')));
      Navigator.pop(context);
    }
  }

  @override
  Widget build(BuildContext context) {
    if (!_cargado) {
      return const Scaffold(body: Center(child: CircularProgressIndicator()));
    }
    return Scaffold(
      appBar: AppBar(title: const Text('Personalizar PDF')),
      body: ListView(
        padding: const EdgeInsets.all(16),
        children: [
          // El nombre no se edita aquí: sale del registro de la empresa, que es
          // la misma fuente que usa la web. Tener dos campos hacía que un mismo
          // documento saliera con nombres distintos según de dónde se emitiera.
          _AvisoCompartido(),
          const SizedBox(height: 12),
          TextField(
            controller: _contacto,
            maxLines: 2,
            decoration: const InputDecoration(
                labelText: 'Contacto (teléfono, correo, dirección)'),
          ),
          const SizedBox(height: 8),
          TextField(
            controller: _color,
            decoration: const InputDecoration(
                labelText: 'Color de marca (HEX)', hintText: '#1A3A5C'),
          ),
          const SizedBox(height: 8),
          TextField(controller: _pie, decoration: const InputDecoration(labelText: 'Pie de página')),
          const SizedBox(height: 8),
          TextField(
            controller: _watermark,
            decoration: const InputDecoration(
                labelText: 'Marca de agua (diagonal)', hintText: 'Ej: COTIZACIÓN'),
          ),
          SwitchListTile(
            contentPadding: EdgeInsets.zero,
            title: const Text('Texto en MAYÚSCULAS'),
            value: _mayusculas,
            onChanged: (v) => setState(() => _mayusculas = v),
          ),
          SwitchListTile(
            contentPadding: EdgeInsets.zero,
            title: const Text('Modo compacto'),
            subtitle: const Text('Márgenes reducidos'),
            value: _compacto,
            onChanged: (v) => setState(() => _compacto = v),
          ),
          const SizedBox(height: 8),
          TextField(controller: _firmaIzq, decoration: const InputDecoration(labelText: 'Firma izquierda')),
          const SizedBox(height: 8),
          TextField(controller: _firmaDer, decoration: const InputDecoration(labelText: 'Firma derecha')),
          const Divider(),
          ListTile(
            contentPadding: EdgeInsets.zero,
            leading: const Icon(Icons.image_outlined),
            title: Text(_logoPath == null ? 'Logo: sin asignar' : 'Logo asignado'),
            trailing: Wrap(spacing: 4, children: [
              TextButton(
                onPressed: () async {
                  final path = await _pickImage('pdf_logo');
                  if (path != null) setState(() => _logoPath = path);
                },
                child: const Text('Elegir'),
              ),
              if (_logoPath != null)
                IconButton(
                  icon: const Icon(Icons.clear),
                  onPressed: () async {
                    await PdfPrefs.clearLogo();
                    setState(() => _logoPath = null);
                  },
                ),
            ]),
          ),
          ListTile(
            contentPadding: EdgeInsets.zero,
            leading: const Icon(Icons.draw_outlined),
            title: Text(_firmaPath == null ? 'Firma: sin asignar' : 'Firma asignada'),
            trailing: Wrap(spacing: 4, children: [
              TextButton(
                onPressed: () async {
                  final path = await _pickImage('pdf_firma');
                  if (path != null) setState(() => _firmaPath = path);
                },
                child: const Text('Elegir'),
              ),
              if (_firmaPath != null)
                IconButton(
                  icon: const Icon(Icons.clear),
                  onPressed: () async {
                    await PdfPrefs.clearFirma();
                    setState(() => _firmaPath = null);
                  },
                ),
            ]),
          ),
          const SizedBox(height: 16),
          FilledButton.icon(
            onPressed: _guardar,
            icon: const Icon(Icons.save),
            label: const Text('Guardar'),
          ),
        ],
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
            style: TextStyle(fontSize: 12, color: cs.onSurfaceVariant),
          ),
        ],
      ),
    );
  }
}
