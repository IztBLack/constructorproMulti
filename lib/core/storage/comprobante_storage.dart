import 'dart:io';
import 'dart:typed_data';

import 'package:supabase_flutter/supabase_flutter.dart';
import 'package:uuid/uuid.dart';

import '../sync/supabase_config.dart';

const _uuid = Uuid();

/// Servicio de Storage para los **comprobantes** de un movimiento de caja
/// (imagen o PDF del recibo/factura).
///
/// El bucket `comprobantes` es **PRIVADO** (migración 0024 del servidor): no se
/// sirve por URL pública, hay que pedir una URL firmada de vida corta para ver
/// el archivo. La ruta SIEMPRE empieza por `<empresa_id>/…` porque la RLS del
/// bucket valida, contra ese primer segmento, que el usuario pertenezca a esa
/// empresa y tenga rol de oficina. Si la ruta no arranca con la empresa correcta
/// la subida la rechaza el servidor.
///
/// ALCANCE v1 (deliberado): esta capa sube EN LÍNEA, en el momento. No hay cola
/// offline: quien llama debe garantizar que hay red + sesión + empresa antes de
/// invocar [subir]. La cola offline (subir en diferido al recuperar la red,
/// espejando el `sync_status='pending'` del resto de la app) queda como mejora
/// futura; no se implementa aquí para no arrastrar esa complejidad todavía.
class ComprobanteStorage {
  ComprobanteStorage._();

  static const String bucket = 'comprobantes';

  /// Construye la ruta de destino dentro del bucket. Función PURA (sin red), por
  /// eso es testeable de forma directa.
  ///
  /// Formato: `<empresaId>/<obraId>/<uuid>.<ext>`. El `uuid` evita colisiones y
  /// no filtra el nombre original del archivo. [ext] llega SIN punto (p. ej.
  /// `jpg`, `pdf`).
  static String rutaComprobante(String empresaId, String obraId, String ext) =>
      '$empresaId/$obraId/${_uuid.v4()}.$ext';

  /// Content-type a partir de la extensión (sin punto). Solo los formatos que
  /// aceptamos como comprobante; cualquier otro cae a `application/octet-stream`.
  static String _contentType(String ext) {
    switch (ext.toLowerCase()) {
      case 'jpg':
      case 'jpeg':
        return 'image/jpeg';
      case 'png':
        return 'image/png';
      case 'webp':
        return 'image/webp';
      case 'pdf':
        return 'application/pdf';
      default:
        return 'application/octet-stream';
    }
  }

  /// Sube [archivo] al bucket privado y devuelve la RUTA guardada (lo que se
  /// persiste en `movimientos.comprobante_uri`). La extensión se deriva del
  /// nombre del archivo local. Requiere red; propaga la excepción de Storage si
  /// la subida falla para que la UI muestre un aviso.
  static Future<String> subir({
    required String empresaId,
    required String obraId,
    required File archivo,
  }) async {
    // Extensión sin el punto; en minúsculas para un content-type estable.
    final nombre = archivo.path;
    final punto = nombre.lastIndexOf('.');
    final ext = punto == -1 ? '' : nombre.substring(punto + 1).toLowerCase();

    final ruta = rutaComprobante(empresaId, obraId, ext);
    final bytes = await archivo.readAsBytes();

    await SupabaseConfig.client.storage.from(bucket).uploadBinary(
          ruta,
          bytes,
          fileOptions: FileOptions(contentType: _contentType(ext)),
        );
    return ruta;
  }

  /// URL firmada temporal para VER el archivo (el bucket es privado, no hay URL
  /// pública). Vence a los [segundos] indicados (por defecto 1 hora), suficiente
  /// para abrirlo una vez sin dejar un enlace permanente.
  static Future<String> urlFirmada(String ruta, {int segundos = 3600}) =>
      SupabaseConfig.client.storage.from(bucket).createSignedUrl(ruta, segundos);

  /// Descarga los bytes del archivo. Para las IMÁGENES basta [urlFirmada] con
  /// `Image.network`, pero `pdfx` necesita los BYTES (no sabe abrir una URL
  /// remota por sí solo y el bucket es privado, así que no hay URL pública que
  /// pasarle). Requiere red; propaga la excepción si falla.
  static Future<Uint8List> descargar(String ruta) =>
      SupabaseConfig.client.storage.from(bucket).download(ruta);
}
