import 'package:constructorpro/core/sync/rol_provider.dart';
import 'package:flutter_test/flutter_test.dart';

/// La decisión de permiso del gate de rol es PURA (sin red), así que se prueba
/// directo. Lo crítico es la regla conservadora: solo se restringe con un rol
/// CONOCIDO de solo-lectura; cualquier otra cosa concede acceso, para no
/// bloquear a un admin por un fallo de red o un valor que no supimos leer.
void main() {
  group('puedeEditarOperacionSegunRol', () {
    test('contador y colaborador NO pueden editar operación', () {
      expect(puedeEditarOperacionSegunRol('contador'), isFalse);
      expect(puedeEditarOperacionSegunRol('colaborador'), isFalse);
    });

    test('admin y supervisor SÍ pueden editar', () {
      expect(puedeEditarOperacionSegunRol('admin'), isTrue);
      expect(puedeEditarOperacionSegunRol('supervisor'), isTrue);
    });

    test('desconocido / null / vacío → acceso total (conservador)', () {
      expect(puedeEditarOperacionSegunRol(null), isTrue);
      expect(puedeEditarOperacionSegunRol(''), isTrue);
      expect(puedeEditarOperacionSegunRol('cliente'), isTrue);
      expect(puedeEditarOperacionSegunRol('rol_que_no_existe'), isTrue);
    });
  });
}
