import 'dart:convert';

import 'package:constructorpro/core/modulos/modulos.dart';
import 'package:constructorpro/core/modulos/modulos_provider.dart';
import 'package:constructorpro/core/settings/settings_provider.dart';
import 'package:constructorpro/core/sync/cloud_providers.dart';
import 'package:constructorpro/core/sync/sync_status.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:supabase_flutter/supabase_flutter.dart' show User;

/// Lectura de `empresa_config.modulos` con caché. Lo que se fija aquí es la
/// regla de oro: el móvil NUNCA se queda vacío por falta de red o de cuenta.
void main() {
  const empresa = 'emp-1';
  final usuario = User(
    id: 'u-1',
    appMetadata: const {},
    userMetadata: const {},
    aud: 'authenticated',
    createdAt: '2026-01-01T00:00:00Z',
  );

  Future<SharedPreferences> prefsCon([Map<String, Object> v = const {}]) {
    SharedPreferences.setMockInitialValues(v);
    return SharedPreferences.getInstance();
  }

  String cache(String empresaId, List<String> modulos) =>
      json.encode({'empresaId': empresaId, 'modulos': modulos});

  group('ModulosService', () {
    test('sin sesión: todo prendido y sin tocar la red', () async {
      var llamadas = 0;
      final s = ModulosService(await prefsCon(), lector: (_) async {
        llamadas++;
        return ['obras'];
      });
      final r = await s.refrescar(conSesion: false, empresaId: empresa);
      expect(r, ModulosActivos.porDefecto);
      expect(llamadas, 0);
    });

    test('con sesión pero sin empresa vinculada: todo prendido', () async {
      final s = ModulosService(await prefsCon(), lector: (_) async => ['obras']);
      final r = await s.refrescar(conSesion: true, empresaId: null);
      expect(r, ModulosActivos.porDefecto);
    });

    test('lee del servidor, resuelve dependencias y lo cachea', () async {
      final prefs = await prefsCon();
      final s = ModulosService(prefs, lector: (id) async {
        expect(id, empresa);
        return ['obras', 'cuadrillas'];
      });
      final r = await s.refrescar(conSesion: true, empresaId: empresa);
      expect(r.fuente, FuenteModulos.servidor);
      expect(r.activos,
          {ClaveModulo.obras, ClaveModulo.cuadrillas, ClaveModulo.equipo});
      // La caché sale igual y marcada como caché.
      final c = s.leerCache(empresa);
      expect(c.fuente, FuenteModulos.cache);
      expect(c.activos, r.activos);
    });

    test('sin red: se queda con la última lista de ESA empresa', () async {
      final prefs = await prefsCon({
        ModulosService.cacheKey: cache(empresa, ['obras', 'caja']),
      });
      final s = ModulosService(prefs,
          lector: (_) async => throw Exception('sin red'));
      final r = await s.refrescar(conSesion: true, empresaId: empresa);
      expect(r, const ModulosActivos(
          {ClaveModulo.obras, ClaveModulo.caja}, FuenteModulos.cache));
    });

    test('sin red y sin caché: todo prendido', () async {
      final s = ModulosService(await prefsCon(),
          lector: (_) async => throw Exception('sin red'));
      final r = await s.refrescar(conSesion: true, empresaId: empresa);
      expect(r, ModulosActivos.porDefecto);
    });

    test('la caché de OTRA empresa no se aplica', () async {
      final prefs = await prefsCon({
        ModulosService.cacheKey: cache('otra', ['obras']),
      });
      final s = ModulosService(prefs);
      expect(s.leerCache(empresa), ModulosActivos.porDefecto);
    });

    test('caché corrupta: todo prendido', () async {
      final prefs = await prefsCon({ModulosService.cacheKey: '{no es json'});
      expect(ModulosService(prefs).leerCache(empresa),
          ModulosActivos.porDefecto);
    });

    test('sin fila o sin dato en el servidor: todo prendido y se limpia la '
        'caché vieja', () async {
      final prefs = await prefsCon({
        ModulosService.cacheKey: cache(empresa, ['obras']),
      });
      final s = ModulosService(prefs, lector: (_) async => null);
      final r = await s.refrescar(conSesion: true, empresaId: empresa);
      expect(r, ModulosActivos.porDefecto);
      expect(prefs.getString(ModulosService.cacheKey), isNull);
    });
  });

  group('modulosProvider', () {
    Future<ProviderContainer> contenedor({
      required User? user,
      required String? empresaId,
      required LectorModulos lector,
      Map<String, Object> prefs = const {},
    }) async {
      final p = await prefsCon(prefs);
      final c = ProviderContainer(overrides: [
        sharedPreferencesProvider.overrideWithValue(p),
        currentUserProvider.overrideWithValue(user),
        empresaIdProvider.overrideWithValue(empresaId),
        modulosServiceProvider
            .overrideWithValue(ModulosService(p, lector: lector)),
      ]);
      addTearDown(c.dispose);
      return c;
    }

    test('arranca de la caché (síncrono) y luego confirma con el servidor',
        () async {
      final c = await contenedor(
        user: usuario,
        empresaId: empresa,
        prefs: {ModulosService.cacheKey: cache(empresa, ['obras', 'caja'])},
        lector: (_) async => ['obras', 'notas'],
      );
      final inicial = c.read(modulosProvider);
      expect(inicial.fuente, FuenteModulos.cache);
      expect(inicial.usa(ClaveModulo.caja), isTrue);

      await Future<void>.delayed(Duration.zero);
      await Future<void>.delayed(Duration.zero);
      final despues = c.read(modulosProvider);
      expect(despues.fuente, FuenteModulos.servidor);
      expect(despues.usa(ClaveModulo.caja), isFalse);
      expect(despues.usa(ClaveModulo.notas), isTrue);
    });

    test('modo offline puro (sin cuenta): todo prendido aunque haya caché',
        () async {
      final c = await contenedor(
        user: null,
        empresaId: empresa,
        prefs: {ModulosService.cacheKey: cache(empresa, ['obras'])},
        lector: (_) async => ['obras'],
      );
      expect(c.read(modulosProvider), ModulosActivos.porDefecto);
      await Future<void>.delayed(Duration.zero);
      expect(c.read(modulosProvider), ModulosActivos.porDefecto);
    });

    test('al terminar un sync vuelve a leer (llega lo que cambió en la web)',
        () async {
      var respuesta = ['obras', 'caja'];
      final c = await contenedor(
        user: usuario,
        empresaId: empresa,
        lector: (_) async => respuesta,
      );
      c.listen(modulosProvider, (_, _) {});
      await Future<void>.delayed(Duration.zero);
      expect(c.read(modulosProvider).usa(ClaveModulo.cotizaciones), isFalse);

      respuesta = ['obras', 'cotizaciones'];
      c.read(syncEnCursoProvider.notifier).state = true;
      c.read(syncEnCursoProvider.notifier).state = false;
      await Future<void>.delayed(Duration.zero);
      await Future<void>.delayed(Duration.zero);
      expect(c.read(modulosProvider).usa(ClaveModulo.cotizaciones), isTrue);
      expect(c.read(modulosProvider).usa(ClaveModulo.caja), isFalse);
    });
  });
}
