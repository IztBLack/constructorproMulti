import 'dart:io';
import 'dart:typed_data';

import 'package:shared_preferences/shared_preferences.dart';

/// Configuración de personalización de los reportes PDF (equivalente a
/// PdfPreferencesManager del proyecto Kotlin), persistida en SharedPreferences.
class PdfConfig {
  final String empresaNombre;
  final String empresaContacto;
  final String colorHex; // ej. '#1A3A5C'
  final String pieDePagina;
  final String watermark;
  final bool mayusculas;
  final String? logoPath;
  final String? firmaPath;

  const PdfConfig({
    this.empresaNombre = 'ConstructorPro',
    this.empresaContacto = '',
    this.colorHex = '#1A3A5C',
    this.pieDePagina = '',
    this.watermark = '',
    this.mayusculas = false,
    this.logoPath,
    this.firmaPath,
  });

  /// Bytes del logo (si existe el archivo).
  Uint8List? get logoBytes {
    if (logoPath == null) return null;
    final f = File(logoPath!);
    return f.existsSync() ? f.readAsBytesSync() : null;
  }

  Uint8List? get firmaBytes {
    if (firmaPath == null) return null;
    final f = File(firmaPath!);
    return f.existsSync() ? f.readAsBytesSync() : null;
  }
}

class PdfPrefs {
  static Future<PdfConfig> load() async {
    final p = await SharedPreferences.getInstance();
    return PdfConfig(
      empresaNombre: p.getString('pdf_empresa') ?? 'ConstructorPro',
      empresaContacto: p.getString('pdf_contacto') ?? '',
      colorHex: p.getString('pdf_color') ?? '#1A3A5C',
      pieDePagina: p.getString('pdf_pie') ?? '',
      watermark: p.getString('pdf_watermark') ?? '',
      mayusculas: p.getBool('pdf_mayusculas') ?? false,
      logoPath: p.getString('pdf_logo'),
      firmaPath: p.getString('pdf_firma'),
    );
  }

  static Future<void> save(PdfConfig c) async {
    final p = await SharedPreferences.getInstance();
    await p.setString('pdf_empresa', c.empresaNombre);
    await p.setString('pdf_contacto', c.empresaContacto);
    await p.setString('pdf_color', c.colorHex);
    await p.setString('pdf_pie', c.pieDePagina);
    await p.setString('pdf_watermark', c.watermark);
    await p.setBool('pdf_mayusculas', c.mayusculas);
    if (c.logoPath != null) await p.setString('pdf_logo', c.logoPath!);
    if (c.firmaPath != null) await p.setString('pdf_firma', c.firmaPath!);
  }

  static Future<void> clearLogo() async {
    final p = await SharedPreferences.getInstance();
    await p.remove('pdf_logo');
  }

  static Future<void> clearFirma() async {
    final p = await SharedPreferences.getInstance();
    await p.remove('pdf_firma');
  }
}
