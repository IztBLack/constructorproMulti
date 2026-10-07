import 'package:constructorpro/core/sync/cuenta_local.dart';
import 'package:constructorpro/core/sync/sync_metadata.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:shared_preferences/shared_preferences.dart';

/// Capa 1 del cambio de cuenta (`docs/PLAN_CAMBIO_DE_CUENTA.md`): el teléfono
/// sabe de quién son sus datos, y entrar con otra empresa se detecta aunque
/// "Cerrar sesión" haya borrado `empresa_id`.
void main() {
  const a = 'empresa-a';
  const b = 'empresa-b';

  group('clasificarEntrada', () {
    test('misma cuenta: el dueño es la empresa que entra', () {
      expect(clasificarEntrada(empresaNueva: a, dueno: a, empresasEnBase: {a}),
          TipoEntrada.mismaCuenta);
    });

    test('otra cuenta: el dueño es otra empresa', () {
      expect(clasificarEntrada(empresaNueva: b, dueno: a),
          TipoEntrada.cambioDeCuenta);
    });

    test('primer login sin cuenta previa: adopta las filas sin empresa', () {
      // Base con datos capturados sin cuenta (empresa ''), que no se listan.
      expect(clasificarEntrada(empresaNueva: a), TipoEntrada.mismaCuenta);
    });

    test('el bug de origen: cerró sesión (sin empresa_id) y entra otra cuenta',
        () {
      // Teléfono de antes de la 1.5.1: sin dueño ni empresa de sesión. Solo
      // las filas delatan que los datos son de A.
      expect(clasificarEntrada(empresaNueva: b, empresasEnBase: {a}),
          TipoEntrada.cambioDeCuenta);
    });

    test('teléfono ya mezclado: hay filas de otra empresa además de la propia',
        () {
      expect(clasificarEntrada(empresaNueva: b, dueno: b, empresasEnBase: {a, b}),
          TipoEntrada.cambioDeCuenta);
    });

    test('teléfono de antes de la 1.5.1 con sesión: usa empresa_id de prefs', () {
      expect(clasificarEntrada(empresaNueva: a, empresaSesion: a),
          TipoEntrada.mismaCuenta);
      expect(clasificarEntrada(empresaNueva: b, empresaSesion: a),
          TipoEntrada.cambioDeCuenta);
    });
  });

  group('CuentaLocal', () {
    Future<CuentaLocal> con(Map<String, Object> valores) async {
      SharedPreferences.setMockInitialValues(valores);
      return CuentaLocal(await SharedPreferences.getInstance());
    }

    test('el dueño sobrevive a borrar empresa_id (cerrar sesión)', () async {
      SharedPreferences.setMockInitialValues({});
      final prefs = await SharedPreferences.getInstance();
      final cuenta = CuentaLocal(prefs);
      await prefs.setString('empresa_id', a);
      await cuenta.fijarDueno(a, nombre: 'Casas A', correo: 'a@ejemplo.com');

      await prefs.remove('empresa_id');

      expect(cuenta.dueno, a);
      expect(cuenta.duenoNombre, 'Casas A');
      expect(cuenta.duenoCorreo, 'a@ejemplo.com');
    });

    test('permiteSincronizar: solo a la empresa dueña', () async {
      final cuenta = await con({CuentaLocal.kDueno: a});
      expect(await cuenta.permiteSincronizar(a), isTrue);
      expect(await cuenta.permiteSincronizar(b), isFalse);
    });

    test('permiteSincronizar migra el teléfono de antes de la 1.5.1', () async {
      final cuenta = await con({CuentaLocal.kEmpresaSesion: a});
      expect(await cuenta.permiteSincronizar(a), isTrue);
      expect(cuenta.dueno, a, reason: 'queda fijado para la próxima vez');
    });

    test('permiteSincronizar sin dueño ni sesión que coincida: espera', () async {
      // Recién entró una cuenta y aún no se revisa la base: subir ahora podría
      // mandar filas de la cuenta anterior a esta.
      final cuenta = await con({});
      expect(await cuenta.permiteSincronizar(b), isFalse);
    });

    test('olvidarDueno deja la base sin dueño', () async {
      final cuenta = await con({
        CuentaLocal.kDueno: a,
        CuentaLocal.kDuenoNombre: 'Casas A',
        CuentaLocal.kDuenoCorreo: 'a@ejemplo.com',
      });
      await cuenta.olvidarDueno();
      expect(cuenta.dueno, isNull);
      expect(cuenta.duenoNombre, isNull);
      expect(cuenta.duenoCorreo, isNull);
    });
  });

  group('SyncMetadata', () {
    test('resetAll borra los cursores de TODAS las tablas, sin lista a mano',
        () async {
      SharedPreferences.setMockInitialValues({
        'sync_cursor_obras_ts': 5,
        'sync_cursor_obras_id': 'x',
        'sync_cursor_tabla_futura_ts': 9,
        'empresa_id': a,
      });
      final prefs = await SharedPreferences.getInstance();
      await SyncMetadata(prefs).resetAll();

      expect(prefs.getKeys().where((k) => k.startsWith('sync_cursor_')), isEmpty);
      expect(prefs.getString('empresa_id'), a, reason: 'solo cursores');
    });

    test('filas ajenas se acumulan y se limpian', () async {
      SharedPreferences.setMockInitialValues({});
      final m = SyncMetadata(await SharedPreferences.getInstance());
      await m.sumarFilasAjenas(70);
      await m.sumarFilasAjenas(2);
      expect(m.filasAjenas, 72);
      await m.limpiarFilasAjenas();
      expect(m.filasAjenas, 0);
    });

    test('última subida completa', () async {
      SharedPreferences.setMockInitialValues({});
      final m = SyncMetadata(await SharedPreferences.getInstance());
      expect(m.ultimaSubidaCompleta, isNull);
      final t = DateTime(2026, 10, 7, 14, 32);
      await m.marcarSubidaCompleta(t);
      expect(m.ultimaSubidaCompleta, t);
    });
  });
}
