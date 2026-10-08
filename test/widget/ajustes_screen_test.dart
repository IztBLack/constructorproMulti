import 'package:constructorpro/core/db/app_database.dart';
import 'package:constructorpro/core/modulos/modulos.dart';
import 'package:constructorpro/core/modulos/modulos_provider.dart';
import 'package:constructorpro/core/settings/settings_provider.dart';
import 'package:constructorpro/core/sync/cloud_providers.dart';
import 'package:constructorpro/core/sync/rol_provider.dart';
import 'package:constructorpro/core/sync/sync_status.dart';
import 'package:constructorpro/core/theme/app_theme.dart';
import 'package:constructorpro/data/maintenance_repository.dart';
import 'package:constructorpro/data/providers.dart';
import 'package:constructorpro/presentation/common/lista_agrupada.dart';
import 'package:constructorpro/presentation/configuraciones/borrar_datos_screen.dart';
import 'package:constructorpro/presentation/configuraciones/config_screen.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:drift/native.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:supabase_flutter/supabase_flutter.dart';

/// Ajustes rediseñado (`docs/PLAN_AJUSTES_REDISENO.md`): la cuenta arriba, los
/// valores a la vista, el buscador y UNA sola fila para borrar.
class _ModulosFijos extends ModulosNotifier {
  _ModulosFijos(this.inicial);
  final ModulosActivos inicial;

  @override
  ModulosActivos build() => inicial;
}

/// Registra qué borrado se pidió, sin tocar ninguna base.
class _MantenimientoEspia extends MaintenanceRepository {
  _MantenimientoEspia()
      : super(AppDatabase.forTesting(NativeDatabase.memory()));
  final llamadas = <String>[];

  @override
  Future<void> deleteAllObras() async => llamadas.add('obras');
}

void main() {
  late SharedPreferences prefs;

  setUp(() async {
    SharedPreferences.setMockInitialValues({'iva_pct': 16.0});
    prefs = await SharedPreferences.getInstance();
  });

  Future<void> montar(WidgetTester t,
      {ModulosActivos modulos = ModulosActivos.porDefecto,
      ThemeData? tema,
      User? usuario,
      SyncStatus estado = const SyncStatus(
          fase: SyncFase.desconectado, pendientes: 0, errores: 0),
      double escalaTexto = 1,
      Size tamano = const Size(1080, 4800),
      MaintenanceRepository? mantenimiento}) async {
    // Alto de sobra: la pantalla es un solo scroll y aquí se quiere verla toda.
    t.view.physicalSize = tamano;
    t.view.devicePixelRatio = 2.5;
    addTearDown(t.view.reset);
    await t.pumpWidget(ProviderScope(
      overrides: [
        sharedPreferencesProvider.overrideWithValue(prefs),
        modulosProvider.overrideWith(() => _ModulosFijos(modulos)),
        // Sin Supabase: la sesión, el rol y la empresa se fijan aquí.
        currentUserProvider.overrideWithValue(usuario),
        rolUsuarioProvider
            .overrideWith((ref) async => usuario == null ? null : 'admin'),
        empresaNombreProvider
            .overrideWith((ref) async => 'Edificaciones Valle del Norte'),
        empresaNombreCacheProvider.overrideWithValue(null),
        syncStatusProvider.overrideWithValue(estado),
        if (mantenimiento != null)
          maintenanceRepositoryProvider.overrideWithValue(mantenimiento),
        puestosProvider.overrideWith((ref) => Stream.value(const [])),
        catalogoCountProvider.overrideWith((ref) => Stream.value(28)),
      ],
      child: MaterialApp(
        theme: tema ?? AppTheme.light,
        builder: (context, hijo) => MediaQuery(
          data: MediaQuery.of(context)
              .copyWith(textScaler: TextScaler.linear(escalaTexto)),
          child: hijo!,
        ),
        home: const ConfigScreen(),
      ),
    ));
    await t.pumpAndSettle();
  }

  testWidgets('la cuenta va arriba y los valores se ven sin entrar', (t) async {
    await montar(t);

    expect(find.text('Ajustes'), findsWidgets);
    expect(find.text('Sin cuenta conectada'), findsOneWidget);
    expect(find.text('Conectar con la nube'), findsOneWidget);
    for (final grupo in [
      'Tu empresa',
      'Preferencias de este teléfono',
      'Módulos',
      'Datos y respaldo',
      'Ayuda',
    ]) {
      expect(find.text(grupo), findsOneWidget, reason: grupo);
    }
    expect(find.text('16 %'), findsOneWidget);
    expect(find.text('28'), findsOneWidget);
  });

  testWidgets('una sola fila roja: las acciones de borrar viven en su pantalla',
      (t) async {
    await montar(t);

    final peligrosas = t
        .widgetList<FilaLista>(find.byType(FilaLista))
        .where((f) => f.peligro)
        .toList();
    expect(peligrosas.map((f) => f.titulo), ['Borrar datos del teléfono']);
    expect(find.text('Dejar el teléfono como nuevo'), findsNothing);

    await t.ensureVisible(find.text('Borrar datos del teléfono'));
    await t.pumpAndSettle();
    await t.tap(find.text('Borrar datos del teléfono'));
    await t.pumpAndSettle();
    expect(find.byType(BorrarDatosScreen), findsOneWidget);
    expect(find.text('Dejar el teléfono como nuevo'), findsOneWidget);
  });

  testWidgets('sin cuenta se ofrecen los datos de ejemplo', (t) async {
    await montar(t);
    expect(find.text('Cargar datos de ejemplo'), findsOneWidget);
  });

  testWidgets('el buscador encuentra por sinónimo y sin acentos', (t) async {
    await montar(t);

    await t.enterText(find.byType(TextField), 'impuesto');
    await t.pumpAndSettle();
    expect(find.text('IVA por defecto'), findsOneWidget);
    expect(find.text('Guardar un respaldo'), findsNothing);
    expect(find.text('Resultados'), findsOneWidget);

    await t.enterText(find.byType(TextField), 'catalogo');
    await t.pumpAndSettle();
    expect(find.text('Catálogo de conceptos'), findsOneWidget);

    await t.enterText(find.byType(TextField), 'xyz');
    await t.pumpAndSettle();
    expect(find.text('Ningún ajuste se llama así'), findsOneWidget);
  });

  testWidgets('lo de un módulo apagado no se pinta', (t) async {
    await montar(t,
        modulos: ModulosActivos(
            normalizarModulos(const ['obras']), FuenteModulos.servidor));

    expect(find.text('Puestos y salarios'), findsNothing);
    expect(find.text('Recordatorio de nómina'), findsNothing);
    expect(find.text('IVA por defecto'), findsNothing);
    expect(find.text('Documentos PDF'), findsOneWidget);
  });

  testWidgets('también se arma en el tema oscuro', (t) async {
    await montar(t, tema: AppTheme.dark);
    expect(find.text('Tu empresa'), findsOneWidget);
    expect(t.takeException(), isNull);
  });
  testWidgets('TalkBack puede elegir cada opción de Apariencia', (t) async {
    final semantica = t.ensureSemantics();
    await montar(t);
    // Cada segmento es su propio nodo tocable (no se funden en la fila).
    for (final opcion in ['Automática', 'Clara', 'Oscura']) {
      expect(find.bySemanticsLabel(RegExp('^$opcion')), findsOneWidget,
          reason: opcion);
    }
    semantica.dispose();
  });

  testWidgets('recordatorio: la fila del interruptor solo alterna', (t) async {
    await montar(t);
    expect(find.text('Día y hora del aviso'), findsNothing);
    // Una sola acción por fila: el Switch y el toque de la fila hacen lo mismo
    // (sin chevron). El día y la hora tienen su propia fila (prueba de abajo).
    // No se toca: prenderlo llama al plugin de notificaciones, que en pruebas
    // no existe.
    final fila = t.widget<FilaLista>(find.ancestor(
        of: find.text('Recordatorio de nómina'),
        matching: find.byType(FilaLista)));
    expect(fila.trailing, isA<Switch>());
    expect(fila.onTap, isNotNull);
  });

  testWidgets('con el recordatorio prendido, el día y la hora van en su fila',
      (t) async {
    SharedPreferences.setMockInitialValues(
        {'iva_pct': 16.0, 'rem_enabled': true});
    prefs = await SharedPreferences.getInstance();
    await montar(t);
    expect(find.text('Día y hora del aviso'), findsOneWidget);
    expect(find.text('Lunes 08:00'), findsOneWidget);
  });

  testWidgets('el buscador encuentra la nube aunque viva en la tarjeta',
      (t) async {
    await montar(t);
    expect(find.text('Nube y sincronización'), findsNothing);
    await t.enterText(find.byType(TextField), 'nube');
    await t.pumpAndSettle();
    expect(find.text('Nube y sincronización'), findsOneWidget);
  });

  testWidgets('con texto al 200 % nada se desborda', (t) async {
    await montar(t, escalaTexto: 2, tamano: const Size(1080, 12000));
    expect(t.takeException(), isNull);
    expect(find.text('Automática'), findsOneWidget);
  });

  testWidgets('con sesión: nombre, empresa, rol y nube; sin datos de ejemplo',
      (t) async {
    final usuario = User(
      id: 'u-1',
      appMetadata: const {},
      userMetadata: const {'nombre': 'Ana Torres'},
      aud: 'authenticated',
      createdAt: '2026-01-01T00:00:00Z',
    );
    await montar(t,
        usuario: usuario,
        estado: const SyncStatus(
            fase: SyncFase.alDia, pendientes: 0, errores: 0));

    expect(find.text('Ana Torres'), findsOneWidget);
    expect(find.text('AT'), findsOneWidget);
    expect(find.text('Edificaciones Valle del Norte'), findsOneWidget);
    expect(find.text('Admin'), findsOneWidget);
    expect(find.text('Todo está en la nube'), findsOneWidget);
    expect(find.text('Cargar datos de ejemplo'), findsNothing);
  });

  group('Borrar datos del teléfono', () {
    Future<void> abrir(WidgetTester t) async {
      await t.ensureVisible(find.text('Borrar datos del teléfono'));
      await t.pumpAndSettle();
      await t.tap(find.text('Borrar datos del teléfono'));
      await t.pumpAndSettle();
    }

    Future<void> confirmarObras(WidgetTester t, String palabra) async {
      await t.tap(find.text('Borrar todas las obras'));
      await t.pumpAndSettle();
      await t.enterText(find.byType(TextField), palabra);
      await t.tap(find.text('Borrar obras'));
      await t.pumpAndSettle();
    }

    testWidgets('con la palabra equivocada no se borra nada', (t) async {
      final espia = _MantenimientoEspia();
      await montar(t, mantenimiento: espia);
      await abrir(t);
      await confirmarObras(t, 'borra');
      expect(espia.llamadas, isEmpty);
      expect(find.text('La palabra no coincide. No se borró nada.'),
          findsOneWidget);
    });

    testWidgets('con la palabra correcta se borra lo que dice el botón',
        (t) async {
      final espia = _MantenimientoEspia();
      await montar(t, mantenimiento: espia);
      await abrir(t);
      await confirmarObras(t, 'borrar');
      expect(espia.llamadas, ['obras']);
    });

    testWidgets('sin cuenta avisa que nada tiene copia en la nube', (t) async {
      await montar(t, mantenimiento: _MantenimientoEspia());
      await abrir(t);
      expect(find.textContaining('nada de esto tiene copia en la nube'),
          findsOneWidget);
    });
  });
}
