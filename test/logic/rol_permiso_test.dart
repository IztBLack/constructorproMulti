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

  /// Los sueldos van al revés: LISTA BLANCA. Aquí no se protege una acción sino
  /// la exhibición del salario de cada persona, así que un rol nuevo tiene que
  /// pedir el permiso en vez de heredarlo.
  ///
  /// Gobierna los DOS módulos que enseñan la raya —nómina y proyección—. Tenían
  /// permisos distintos hasta agosto de 2026 y por eso un colaborador de campo
  /// podía bajarse el PDF de nómina con el sueldo de todos.
  group('puedeVerSueldosSegunRol', () {
    test('socio, supervisor y contador sí', () {
      expect(puedeVerSueldosSegunRol('admin'), isTrue);
      expect(puedeVerSueldosSegunRol('supervisor'), isTrue);
      // El contador entró el 2026-08-17: 0022 lo define como el tesorero que ve
      // los montos a pagar, y sin la raya no puede hacer su trabajo.
      expect(puedeVerSueldosSegunRol('contador'), isTrue);
    });

    test('colaborador y cliente no', () {
      expect(puedeVerSueldosSegunRol('colaborador'), isFalse);
      expect(puedeVerSueldosSegunRol('cliente'), isFalse);
    });

    test('un rol que no existe todavía queda FUERA por omisión', () {
      expect(puedeVerSueldosSegunRol('rol_que_no_existe'), isFalse);
      expect(puedeVerSueldosSegunRol('auditor'), isFalse);
    });

    test('sin sesión (null/vacío) sí: es la instalación local del dueño', () {
      expect(puedeVerSueldosSegunRol(null), isTrue);
      expect(puedeVerSueldosSegunRol(''), isTrue);
    });
  });
}
