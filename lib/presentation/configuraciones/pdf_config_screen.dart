import 'dart:io';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:image_picker/image_picker.dart';
import 'package:path/path.dart' as p;
import 'package:path_provider/path_provider.dart';

import '../../core/storage/app_paths.dart';

import '../../core/pdf/pdf_config.dart';
import '../../core/pdf/textos_finales.dart';
import '../../data/providers.dart';

class PdfConfigScreen extends ConsumerStatefulWidget {
  const PdfConfigScreen({super.key});

  @override
  ConsumerState<PdfConfigScreen> createState() => _PdfConfigScreenState();
}

class _PdfConfigScreenState extends ConsumerState<PdfConfigScreen> {
  final _empresa = TextEditingController();
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
    _empresa.dispose();
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
    final c = await PdfPrefs.load();
    _empresa.text = c.empresaNombre;
    _contacto.text = c.empresaContacto;
    _color.text = c.colorHex;
    _pie.text = c.pieDePagina;
    _watermark.text = c.watermark;
    _firmaIzq.text = c.firmaIzquierda;
    _firmaDer.text = c.firmaDerecha;
    _mayusculas = c.mayusculas;
    _compacto = c.modoCompacto;
    _logoPath = c.logoPath;
    _firmaPath = c.firmaPath;

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
    await PdfPrefs.save(PdfConfig(
      empresaNombre: _empresa.text.trim().isEmpty ? 'ConstructorPro' : _empresa.text.trim(),
      empresaContacto: _contacto.text.trim(),
      colorHex: _color.text.trim().isEmpty ? '#1A3A5C' : _color.text.trim(),
      pieDePagina: _pie.text.trim(),
      watermark: _watermark.text.trim(),
      mayusculas: _mayusculas,
      modoCompacto: _compacto,
      firmaIzquierda: _firmaIzq.text.trim().isEmpty ? 'Autorizado por Obra' : _firmaIzq.text.trim(),
      firmaDerecha: _firmaDer.text.trim().isEmpty ? 'Aceptado por Cliente' : _firmaDer.text.trim(),
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
          TextField(controller: _empresa, decoration: const InputDecoration(labelText: 'Nombre de la empresa')),
          const SizedBox(height: 8),
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
