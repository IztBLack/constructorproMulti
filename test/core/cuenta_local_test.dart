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

    test('teléfono ya mezclado con dueño conocido: NO es cambio de cuenta', () {
      // Las filas ajenas apartadas se quedan en la base. Si contaran, abrir la
      // pantalla de nube preguntaría (o vaciaría) cada vez, y "Volver a esa
      // cuenta" mandaría a la persona a su propia cuenta en bucle. Las
      // resuelve "Rehacer la copia".
      expect(clasificarEntrada(empresaNueva: b, dueno: b, empresasEnBase: {a, b}),
          TipoEntrada.mismaCuenta);
      expect(clasificarEntrada(empresaNueva: b, empresaSesion: b, empresasEnBase: {a, b}),
          TipoEntrada.mismaCuenta);
    });

    test('otro usuario de la misma empresa es cambio de cuenta', () {
      // Un admin bajó sueldos; entra alguien de compras: no son sus datos.
      expect(
          clasificarEntrada(
              empresaNueva: a, dueno: a, duenoUsuario: 'admin', usuarioNuevo: 'compras'),
          TipoEntrada.cambioDeCuenta);
      expect(
          clasificarEntrada(
              empresaNueva: a, dueno: a, duenoUsuario: 'admin', usuarioNuevo: 'admin'),
          TipoEntrada.mismaCuenta);
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

    test('permiteSincronizar: solo a la empresa y el usuario dueños', () async {
      final cuenta = await con({
        CuentaLocal.kDueno: a,
        CuentaLocal.kDuenoUsuario: 'u1',
      });
      expect(await cuenta.permiteSincronizar(a, 'u1'), isTrue);
      expect(await cuenta.permiteSincronizar(b, 'u1'), isFalse);
      expect(await cuenta.permiteSincronizar(a, 'u2'), isFalse);
    });

    test('un dueño sin usuario guardado adopta al que sincroniza', () async {
      final cuenta = await con({CuentaLocal.kDueno: a});
      expect(await cuenta.permiteSincronizar(a, 'u1'), isTrue);
      expect(cuenta.duenoUsuario, 'u1');
    });

    test('permiteSincronizar migra el teléfono de antes de la 1.5.1', () async {
      final cuenta = await con({CuentaLocal.kEmpresaSesion: a});
      expect(await cuenta.permiteSincronizar(a, 'u1'), isTrue);
      expect(cuenta.dueno, a, reason: 'queda fijado para la próxima vez');
      expect(cuenta.duenoUsuario, 'u1');
    });

    test('permiteSincronizar sin dueño ni sesión que coincida: espera', () async {
      // Recién entró una cuenta y aún no se revisa la base: subir ahora podría
      // mandar filas de la cuenta anterior a esta.
      final cuenta = await con({});
      expect(await cuenta.permiteSincronizar(b, 'u1'), isFalse);
    });

    test('olvidarDueno deja la base sin dueño', () async {
      final cuenta = await con({
        CuentaLocal.kDueno: a,
        CuentaLocal.kDuenoNombre: 'Casas A',
        CuentaLocal.kDuenoCorreo: 'a@ejemplo.com',
        CuentaLocal.kDuenoUsuario: 'u1',
      });
      await cuenta.olvidarDueno();
      expect(cuenta.duenoUsuario, isNull);
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
