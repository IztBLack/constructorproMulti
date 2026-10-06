import 'dart:typed_data';

import 'package:supabase_flutter/supabase_flutter.dart';

/// Lo que el sync de la bitácora necesita del servidor, detrás de una interfaz.
///
/// Existe por las pruebas: el push de la bitácora toma decisiones según lo que
/// responde el servidor (¿ya existía?, ¿0 filas?, ¿cerrada?), y esas decisiones
/// son justo lo que hay que probar. Con un servidor falso que aplica las mismas
/// reglas que 0041 se pueden ejercer sin levantar Supabase
/// (`test/core/bitacora_sync_test.dart`).
abstract class BitacoraRemoto {
  /// INSERT simple (no upsert: ver docs/PLAN_BITACORA_MOVIL.md §2.2). Devuelve
  /// [columnas] de la fila insertada.
  Future<Map<String, dynamic>> insertar(
      String tabla, Map<String, dynamic> fila, String columnas);

  /// Lee una fila por id, o null si no existe o la RLS no la deja ver.
  Future<Map<String, dynamic>?> leer(String tabla, String id, String columnas);

  /// UPDATE condicional: solo si el servidor sigue teniendo el
  /// `server_updated_at` que conoce este teléfono. Devuelve las filas tocadas;
  /// una lista VACÍA no es éxito (RLS o alguien más la cambió).
  Future<List<Map<String, dynamic>>> actualizarSiNoCambio(
    String tabla,
    String id,
    int serverUpdatedAt,
    Map<String, dynamic> cambios,
    String columnas,
  );

  /// UPDATE sin condición de sello. Solo para publicar al cliente, que es el
  /// único cambio que no compite con las ediciones de texto.
  Future<List<Map<String, dynamic>>> actualizar(
      String tabla, String id, Map<String, dynamic> cambios, String columnas);

  /// Sube un archivo al bucket `bitacora` SIN sobrescribir.
  Future<void> subirArchivo(String path, Uint8List bytes, String mime);

  Future<void> borrarArchivo(String path);

  Future<Uint8List> descargarArchivo(String path);
}

/// Fallo del servidor ya traducido a lo que el sync necesita distinguir.
class RemotoError implements Exception {
  RemotoError(this.message, {this.code, this.yaExiste = false, this.denegado = false});

  final String message;

  /// SQLSTATE de Postgres (`23505`, `42501`, `P0001`…) cuando lo hay.
  final String? code;

  /// El archivo o la fila ya existían (Storage 409 / Duplicate, Postgres 23505).
  final bool yaExiste;

  /// Storage negó el permiso (403 / RLS de `storage.objects`).
  final bool denegado;

  @override
  String toString() => 'RemotoError(${code ?? '-'}): $message';
}

/// La implementación real, sobre Supabase.
class SupabaseBitacoraRemoto implements BitacoraRemoto {
  SupabaseBitacoraRemoto(this.client);

  final SupabaseClient client;

  static const bucket = 'bitacora';

  Never _traducir(Object e) {
    if (e is PostgrestException) {
      throw RemotoError(e.message,
          code: e.code, yaExiste: e.code == '23505');
    }
    if (e is StorageException) {
      // `statusCode` es un String que toma primero el del cuerpo JSON: el
      // duplicado llega como '409' aunque el HTTP real sea 400.
      final dup = e.statusCode == '409' ||
          e.error == 'Duplicate' ||
          e.message.toLowerCase().contains('already exists');
      final denegado = e.statusCode == '403' ||
          e.message.toLowerCase().contains('row-level security');
      throw RemotoError(e.message,
          code: e.statusCode, yaExiste: dup, denegado: denegado);
    }
    throw RemotoError(e.toString());
  }

  @override
  Future<Map<String, dynamic>> insertar(
      String tabla, Map<String, dynamic> fila, String columnas) async {
    try {
      return await client.from(tabla).insert(fila).select(columnas).single();
    } catch (e) {
      _traducir(e);
    }
  }

  @override
  Future<Map<String, dynamic>?> leer(
      String tabla, String id, String columnas) async {
    try {
      return await client.from(tabla).select(columnas).eq('id', id).maybeSingle();
    } catch (e) {
      _traducir(e);
    }
  }

  @override
  Future<List<Map<String, dynamic>>> actualizarSiNoCambio(
    String tabla,
    String id,
    int serverUpdatedAt,
    Map<String, dynamic> cambios,
    String columnas,
  ) async {
    try {
      final r = await client
          .from(tabla)
          .update(cambios)
          .eq('id', id)
          .eq('server_updated_at', serverUpdatedAt)
          .select(columnas);
      return (r as List).cast<Map<String, dynamic>>();
    } catch (e) {
      _traducir(e);
    }
  }

  @override
  Future<List<Map<String, dynamic>>> actualizar(String tabla, String id,
      Map<String, dynamic> cambios, String columnas) async {
    try {
      final r =
          await client.from(tabla).update(cambios).eq('id', id).select(columnas);
      return (r as List).cast<Map<String, dynamic>>();
    } catch (e) {
      _traducir(e);
    }
  }

  @override
  Future<void> subirArchivo(String path, Uint8List bytes, String mime) async {
    try {
      await client.storage.from(bucket).uploadBinary(path, bytes,
          fileOptions: FileOptions(contentType: mime, upsert: false));
    } catch (e) {
      _traducir(e);
    }
  }

  @override
  Future<void> borrarArchivo(String path) async {
    try {
      await client.storage.from(bucket).remove([path]);
    } catch (e) {
      _traducir(e);
    }
  }

  @override
  Future<Uint8List> descargarArchivo(String path) async {
    try {
      return await client.storage.from(bucket).download(path);
    } catch (e) {
      _traducir(e);
    }
  }
}
