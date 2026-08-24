/// ASPECTO COMPARTIDO DE LOS PDF (paridad web, migración 0017).
///
/// Contacto, color, pie de página, marca de agua, MAYÚSCULAS, modo compacto y
/// rótulos de firma son de la EMPRESA, no del teléfono: viven en el jsonb
/// `empresa_config.pdf_config` y los editan igual la web y el móvil. Antes cada
/// celular guardaba los suyos en SharedPreferences, así que dos dispositivos
/// podían emitir el mismo documento con distinto color y distinto contacto sin
/// que nadie se enterara.
///
/// La oficina manda: al refrescar, lo que diga el servidor pisa la caché. La
/// caché existe para poder imprimir sin señal, no para discutirle al servidor.
///
/// QUÉ NO VIVE AQUÍ
///   · `empresaNombre` → sale de `empresas.nombre` (`empresaNombreProvider`).
///     Es el nombre de la empresa, no una preferencia de impresión.
///   · `logoPath` / `firmaPath` → archivos; siguen siendo locales del
///     dispositivo hasta que se muden al bucket de Storage.
library;

import 'dart:convert';

import 'package:flutter/foundation.dart';
import 'package:shared_preferences/shared_preferences.dart';

import '../core/pdf/pdf_config.dart';
import '../core/sync/supabase_config.dart';

/// Los campos del jsonb, con las MISMAS claves que usa la web
/// (`PdfConfig` en `web/src/lib/data/empresa-config.ts`). Si divergen, cada
/// plataforma escribiría su propio rincón del objeto y el "aspecto compartido"
/// dejaría de serlo sin dar ningún error.
class AspectoPdf {
  const AspectoPdf({
    this.empresaContacto = '',
    this.colorHex = '#0369A1',
    this.pieDePagina = '',
    this.watermark = '',
    this.mayusculas = false,
    this.modoCompacto = false,
    this.firmaIzquierda = '',
    this.firmaDerecha = '',
  });

  final String empresaContacto;
  final String colorHex;
  final String pieDePagina;
  final String watermark;
  final bool mayusculas;
  final bool modoCompacto;
  final String firmaIzquierda;
  final String firmaDerecha;

  /// Por defecto se usan los MISMOS valores que la web
  /// (`PDF_CONFIG_POR_DEFECTO`), no los que traía el móvil (#1A3A5C y firmas
  /// con texto). Si cada plataforma conserva sus defaults, dos empresas recién
  /// creadas imprimen distinto según desde dónde se emita el primer documento.
  static const web = AspectoPdf();

  static AspectoPdf desdeJson(Map<String, dynamic> o) {
    String str(Object? v) => v is String ? v : '';
    final color = str(o['colorHex']);
    return AspectoPdf(
      empresaContacto: str(o['empresaContacto']),
      // Se valida antes de usarlo: este valor termina dentro de un atributo de
      // estilo del documento. Misma comprobación que hace la web.
      colorHex: RegExp(r'^#[0-9a-fA-F]{6}$').hasMatch(color) ? color : web.colorHex,
      pieDePagina: str(o['pieDePagina']),
      watermark: str(o['watermark']),
      mayusculas: o['mayusculas'] == true,
      modoCompacto: o['modoCompacto'] == true,
      firmaIzquierda: str(o['firmaIzquierda']),
      firmaDerecha: str(o['firmaDerecha']),
    );
  }

  Map<String, dynamic> aJson() => {
        'empresaContacto': empresaContacto,
        'colorHex': colorHex,
        'pieDePagina': pieDePagina,
        'watermark': watermark,
        'mayusculas': mayusculas,
        'modoCompacto': modoCompacto,
        'firmaIzquierda': firmaIzquierda,
        'firmaDerecha': firmaDerecha,
      };

  /// Compone el `PdfConfig` que consume el generador de documentos: el aspecto
  /// compartido, más las dos cosas que no viven en él.
  PdfConfig aPdfConfig({
    required String empresaNombre,
    String? logoPath,
    String? firmaPath,
  }) =>
      PdfConfig(
        empresaNombre: empresaNombre,
        empresaContacto: empresaContacto,
        colorHex: colorHex,
        pieDePagina: pieDePagina,
        watermark: watermark,
        mayusculas: mayusculas,
        modoCompacto: modoCompacto,
        firmaIzquierda: firmaIzquierda,
        firmaDerecha: firmaDerecha,
        logoPath: logoPath,
        firmaPath: firmaPath,
      );
}

class PdfConfigService {
  PdfConfigService(this.prefs);

  final SharedPreferences prefs;

  static const _cacheKey = 'pdf_aspecto_cache';

  AspectoPdf get aspecto {
    final raw = prefs.getString(_cacheKey);
    if (raw == null || raw.isEmpty) return AspectoPdf.web;
    try {
      return AspectoPdf.desdeJson(json.decode(raw) as Map<String, dynamic>);
    } catch (_) {
      return AspectoPdf.web;
    }
  }

  Future<void> _guardarCache(AspectoPdf a) async {
    await prefs.setString(_cacheKey, json.encode(a.aJson()));
  }

  /// Baja el aspecto del servidor y refresca la caché. Silencioso sin red o sin
  /// sesión: se conserva lo cacheado, que es mejor que imprimir con otro color.
  Future<AspectoPdf> refrescar() async {
    if (SupabaseConfig.currentUser == null) return aspecto;
    try {
      final row = await SupabaseConfig.client
          .from('empresa_config')
          .select('pdf_config')
          .maybeSingle();
      final crudo = row?['pdf_config'];
      if (crudo is Map) {
        final a = AspectoPdf.desdeJson(Map<String, dynamic>.from(crudo));
        await _guardarCache(a);
        return a;
      }
    } catch (e) {
      debugPrint('[PdfConfig] refrescar falló: $e');
    }
    return aspecto;
  }

  /// Guarda el aspecto: caché de inmediato y servidor si hay sesión, para que la
  /// web y los demás dispositivos lo reciban.
  ///
  /// Escribe SOLO la columna `pdf_config`; el párrafo final vive en
  /// `pdf_textos` y lo lleva [TextosPdfService]. Separarlos es lo que evita que
  /// guardar el color borre las condiciones, y al revés.
  Future<AspectoPdf> guardar(AspectoPdf a) async {
    await _guardarCache(a);
    if (SupabaseConfig.currentUser != null) {
      try {
        await SupabaseConfig.client.from('empresa_config').update({
          'pdf_config': a.aJson(),
          'updated_at': DateTime.now().millisecondsSinceEpoch,
        }).eq('empresa_id', await _empresaId());
      } catch (e) {
        debugPrint('[PdfConfig] guardar no se subió (quedó local): $e');
      }
    }
    return a;
  }

  Future<String> _empresaId() async {
    final rows = await SupabaseConfig.client
        .from('usuarios_empresa')
        .select('empresa_id')
        .limit(1);
    if (rows.isEmpty) return '';
    return (rows.first['empresa_id'] ?? '') as String;
  }
}
