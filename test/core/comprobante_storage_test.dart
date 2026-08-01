import 'package:constructorpro/core/storage/comprobante_storage.dart';
import 'package:flutter_test/flutter_test.dart';

/// `rutaComprobante` es PURA (no toca red ni Supabase), así que se prueba
/// directo. Lo crítico: la ruta SIEMPRE arranca con `<empresa>/<obra>/…` porque
/// de eso depende la RLS del bucket privado, y el nombre es un uuid + la
/// extensión dada (sin punto).
void main() {
  group('ComprobanteStorage.rutaComprobante', () {
    // uuid v4 canónico: 8-4-4-4-12 hex, con el '4' de versión.
    final uuidRe = RegExp(
      r'^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$',
    );

    test('formato <empresaId>/<obraId>/<uuid>.<ext>', () {
      final ruta = ComprobanteStorage.rutaComprobante('emp1', 'obraA', 'jpg');
      final partes = ruta.split('/');

      expect(partes, hasLength(3));
      expect(partes[0], 'emp1');
      expect(partes[1], 'obraA');

      final archivo = partes[2];
      expect(archivo.endsWith('.jpg'), isTrue);

      final uuid = archivo.substring(0, archivo.length - '.jpg'.length);
      expect(uuidRe.hasMatch(uuid), isTrue,
          reason: 'el nombre debe ser un uuid v4 válido');
    });

    test('respeta la extensión recibida (sin punto extra)', () {
      final ruta = ComprobanteStorage.rutaComprobante('e', 'o', 'pdf');
      expect(ruta.endsWith('.pdf'), isTrue);
      // No debe haber punto doble ni punto colgante antes de la extensión.
      expect(ruta.contains('..'), isFalse);
    });

    test('cada llamada genera un uuid distinto (sin colisión)', () {
      final a = ComprobanteStorage.rutaComprobante('e', 'o', 'png');
      final b = ComprobanteStorage.rutaComprobante('e', 'o', 'png');
      expect(a, isNot(equals(b)));
    });
  });
}
