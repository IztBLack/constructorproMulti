/// TEXTO GENERAL DEL PIE DE LOS PDF (paridad web, migración 0033).
///
/// El párrafo de condiciones que va al final de cada documento tiene un texto
/// GENERAL por tipo, compartido por toda la empresa, y los dos lados lo editan:
/// lo que se escriba en la web aparece en el celular y al revés.
///
/// Vive en `empresa_config.pdf_textos` (jsonb) y se lee/escribe DIRECTO contra
/// Supabase —el motor de sync de Drift no maneja jsonb—, con caché en
/// SharedPreferences para que el PDF salga bien sin señal. Es exactamente el
/// mismo trato que [OrdenModoService] le da a `ui_orden`.
///
/// POR QUÉ UNA COLUMNA APARTE Y NO EL JSONB `pdf_config`
/// El móvil guarda su copia del ASPECTO del PDF (nombre, color, firmas) en
/// SharedPreferences, con valores propios. Si para subir el texto escribiera
/// `pdf_config` entero, borraría el color y el contacto configurados desde la
/// web. Escribiendo solo `pdf_textos`, eso no puede pasar.
library;

import 'dart:convert';

import 'package:flutter/foundation.dart';
import 'package:shared_preferences/shared_preferences.dart';

import '../core/pdf/textos_finales.dart';
import '../core/sync/supabase_config.dart';

/// Claves del jsonb. Son las MISMAS cadenas que usa la web
/// (`TipoDocumento` en `web/src/lib/pdf/textos-finales.ts`): si divergen, cada
/// plataforma leería su propio rincón del objeto y el texto "compartido"
/// dejaría de serlo sin dar ningún error.
String claveDe(TipoDocumento t) => switch (t) {
      TipoDocumento.cotizacion => 'cotizacion',
      TipoDocumento.nota => 'nota',
      TipoDocumento.estadoCuenta => 'estado_cuenta',
    };

TipoDocumento? tipoDeClave(String k) => switch (k) {
      'cotizacion' => TipoDocumento.cotizacion,
      'nota' => TipoDocumento.nota,
      'estado_cuenta' => TipoDocumento.estadoCuenta,
      _ => null,
    };

class TextosPdfService {
  TextosPdfService(this.prefs);

  final SharedPreferences prefs;

  static const _cacheKey = 'pdf_textos_cache';

  Map<String, String> _leerCache() {
    final raw = prefs.getString(_cacheKey);
    if (raw == null || raw.isEmpty) return {};
    try {
      final m = json.decode(raw) as Map<String, dynamic>;
      return m.map((k, v) => MapEntry(k, v.toString()));
    } catch (_) {
      return {};
    }
  }

  Future<void> _guardarCache(Map<String, String> m) async {
    await prefs.setString(_cacheKey, json.encode(m));
  }

  /// Los textos generales cacheados, listos para `resolverTextoFinal`.
  Map<TipoDocumento, String> get textos {
    final out = <TipoDocumento, String>{};
    _leerCache().forEach((k, v) {
      final t = tipoDeClave(k);
      if (t != null && v.trim().isNotEmpty) out[t] = v;
    });
    return out;
  }

  String textoDe(TipoDocumento tipo) => _leerCache()[claveDe(tipo)] ?? '';

  /// Baja `pdf_textos` del servidor y refresca la caché. Silencioso si no hay
  /// red ni sesión: se conserva lo cacheado, que es mejor que un PDF sin las
  /// condiciones de la empresa.
  Future<Map<TipoDocumento, String>> refrescar() async {
    if (SupabaseConfig.currentUser == null) return textos;
    try {
      final row = await SupabaseConfig.client
          .from('empresa_config')
          .select('pdf_textos')
          .maybeSingle();
      final crudo = row?['pdf_textos'];
      if (crudo is Map) {
        await _guardarCache(
          crudo.map((k, v) => MapEntry(k.toString(), v.toString())),
        );
      }
    } catch (e) {
      debugPrint('[TextosPdf] refrescar falló: $e');
    }
    return textos;
  }

  /// Fija el texto general de un tipo: escribe la caché de inmediato (respuesta
  /// instantánea y offline) y lo sube para que la web y los demás dispositivos
  /// lo reciban. Vacío BORRA la clave — vacío significa "usa el integrado", no
  /// "documento sin párrafo".
  Future<Map<TipoDocumento, String>> setTexto(
    TipoDocumento tipo,
    String texto,
  ) async {
    final m = _leerCache();
    final limpio = texto.trim();
    if (limpio.isEmpty) {
      m.remove(claveDe(tipo));
    } else {
      m[claveDe(tipo)] = limpio.length > largoMaximoTextoFinal
          ? limpio.substring(0, largoMaximoTextoFinal)
          : limpio;
    }
    await _guardarCache(m);

    if (SupabaseConfig.currentUser != null) {
      try {
        await SupabaseConfig.client.from('empresa_config').update({
          'pdf_textos': m,
          'updated_at': DateTime.now().millisecondsSinceEpoch,
        }).eq('empresa_id', await _empresaId());
      } catch (e) {
        debugPrint('[TextosPdf] setTexto no se subió (se guardó local): $e');
      }
    }
    return textos;
  }

  Future<String> _empresaId() async {
    // limit(1) y no maybeSingle, igual que SyncService y OrdenModoService: no
    // debe lanzar si el usuario estuviera vinculado a más de una empresa.
    final rows = await SupabaseConfig.client
        .from('usuarios_empresa')
        .select('empresa_id')
        .limit(1);
    if (rows.isEmpty) return '';
    return (rows.first['empresa_id'] ?? '') as String;
  }
}
