import 'package:constructorpro/core/sync/sync_service.dart';
import 'package:constructorpro/domain/sync/rechazos_sync.dart';
import 'package:flutter_test/flutter_test.dart';

/// U1 de la auditoría de UX: el rechazo del servidor se explica en palabras de
/// obra y se sabe si se arregla solo. El mensaje real del teléfono de pruebas
/// era `cuadrilla_miembro: {"code":"42501", … USING expression …}`.
void main() {
  group('clasificarRechazoSync', () {
    test('RLS (42501 o el texto) es falta de permiso', () {
      expect(clasificarRechazoSync(code: '42501', message: 'x'),
          CausaRechazo.sinPermiso);
      expect(
          clasificarRechazoSync(
              message: 'new row violates row-level security policy'),
          CausaRechazo.sinPermiso);
    });

    test('códigos de datos, relación, duplicado y versión', () {
      expect(clasificarRechazoSync(code: '23514', message: ''),
          CausaRechazo.datosInvalidos);
      expect(clasificarRechazoSync(code: '23503', message: ''),
          CausaRechazo.faltaRelacion);
      expect(clasificarRechazoSync(code: '23505', message: ''),
          CausaRechazo.duplicado);
      expect(clasificarRechazoSync(code: 'PGRST204', message: ''),
          CausaRechazo.appDesactualizada);
    });

    test('lo desconocido o de red es pasajero (null), nunca definitivo', () {
      expect(clasificarRechazoSync(message: 'SocketException: timed out'), isNull);
      // «permission denied» suelto también lo dice un socket que falla.
      expect(clasificarRechazoSync(message: 'permission denied'), isNull);
    });
  });

  test('esRechazoDeFilaExistente distingue USING (fila existe) de WITH CHECK',
      () {
    expect(
        esRechazoDeFilaExistente('new row violates row-level security policy '
            '(USING expression) for table "cuadrilla_miembro"'),
        isTrue);
    expect(
        esRechazoDeFilaExistente('new row violates row-level security policy '
            'for table "obras"'),
        isFalse);
  });

  test('esDeOtraEmpresa: las filas sin empresa no son ajenas', () {
    expect(esDeOtraEmpresa('a', 'b'), isTrue);
    expect(esDeOtraEmpresa('b', 'b'), isFalse);
    expect(esDeOtraEmpresa('', 'b'), isFalse);
    expect(esDeOtraEmpresa(null, 'b'), isFalse);
  });

  test('solo la falta de relación se reintenta sola', () {
    for (final c in CausaRechazo.values) {
      expect(seReintentaSola(c), c == CausaRechazo.faltaRelacion, reason: '$c');
      expect(explicarRechazoSync(c), isNotEmpty);
      expect(accionRechazoSync(c), isNotEmpty);
    }
    expect(
        const RechazoSync(tabla: 'obras', causa: null, detalleTecnico: '')
            .seReintenta,
        isTrue);
  });

  test('toda tabla del sync tiene nombre en palabras de la app', () {
    // Si se agrega una tabla al sync sin nombre, la pantalla diría
    // "nota obra renglon" (el respaldo) en vez de "renglones de notas".
    for (final t in SyncService.pushOrder) {
      expect(nombreTablaSync(t), isNot(contains('_')), reason: t);
      if (t.contains('_')) {
        expect(nombreTablaSync(t), isNot(t.replaceAll('_', ' ')),
            reason: '$t usa el nombre de respaldo');
      }
    }
  });
}
