import 'dart:io';

import 'package:constructorpro/core/db/app_database.dart';
import 'package:constructorpro/core/modulos/modulos.dart';
import 'package:constructorpro/core/modulos/modulos_provider.dart';
import 'package:constructorpro/core/settings/settings_provider.dart';
import 'package:constructorpro/core/storage/fotos_bitacora_storage.dart';
import 'package:constructorpro/core/sync/bitacora_avisos.dart';
import 'package:constructorpro/core/sync/bitacora_remoto.dart';
import 'package:constructorpro/core/sync/cloud_providers.dart';
import 'package:constructorpro/core/sync/rol_provider.dart';
import 'package:constructorpro/core/theme/app_theme.dart';
import 'package:constructorpro/data/providers.dart';
import 'package:constructorpro/data/repositories_bitacora.dart';
import 'package:constructorpro/domain/bitacora/bitacora_reglas.dart';
import 'package:constructorpro/presentation/bitacora/bitacora_screen.dart';
import 'package:constructorpro/presentation/obras/obra_detail_screen.dart';
import 'package:drift/drift.dart' show Variable, driftRuntimeOptions;
import 'package:drift/native.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_riverpod/misc.dart' show Override;
import 'package:flutter_test/flutter_test.dart';
import 'package:intl/date_symbol_data_local.dart';
import 'package:shared_preferences/shared_preferences.dart';

/// El servidor sin señal: toda llamada falla como falla sin red. La pantalla no
/// debe necesitarlo para enseñar lo que ya está en el teléfono.
class _RemotoSinRed implements BitacoraRemoto {
  @override
  dynamic noSuchMethod(Invocation invocation) =>
      Future<Never>.error(RemotoError('Sin red'));
}

/// Módulos fijos, como si el dueño los hubiera elegido en la web.
class _ModulosFijos extends ModulosNotifier {
  _ModulosFijos(this.inicial);
  final ModulosActivos inicial;

  @override
  ModulosActivos build() => inicial;
}

ModulosActivos _con(Iterable<String> claves) =>
    ModulosActivos(normalizarModulos(claves.toList()), FuenteModulos.servidor);

/// La pantalla de la bitácora con la base EN MEMORIA y lo que toca la nube
/// sustituido: sin sesión de Supabase, sin red y con el rol que se le diga.
/// Lo que se comprueba es lo que lee quien está en la obra: el día, la entrada
/// con su estado de subida, los botones que le tocan a su rol y los avisos de
/// lo que el servidor no aceptó.
void main() {
  setUpAll(() async {
    await initializeDateFormatting('es_MX');
    // Cada prueba abre su propia base en memoria (y cierra la anterior).
    driftRuntimeOptions.dontWarnAboutMultipleDatabases = true;
  });

  late AppDatabase db;
  late SharedPreferences prefs;
  late BitacoraRepository repo;
  // Nunca se escribe ahí: estas pruebas no toman fotos.
  final storage =
      FotosBitacoraStorage(baseDir: () async => Directory('no-existe'));

  // 6-oct-2026 (martes) en México.
  final fecha = medianocheMexicoMs(DateTime(2026, 10, 6));

  setUp(() async {
    SharedPreferences.setMockInitialValues({});
    prefs = await SharedPreferences.getInstance();
    db = AppDatabase.forTesting(NativeDatabase.memory());
    // Se abre (y migra) aquí, con el reloj real: abrirla por primera vez dentro
    // del reloj falso de `testWidgets` no termina nunca.
    await db.customSelect('SELECT 1').get();
    repo = BitacoraRepository(db, storage);
  });

  /// `testWidgets` que al final desmonta la pantalla y cierra la base: Drift
  /// cierra sus consultas vivas con un temporizador de cero que hay que dejar
  /// correr, o la prueba falla por "Timer still pending".
  void prueba(String nombre, Future<void> Function(WidgetTester t) cuerpo) {
    testWidgets(nombre, (t) async {
      await cuerpo(t);
      await t.pumpWidget(const SizedBox());
      await t.pump(Duration.zero);
      await t.runAsync(() => db.close());
    });
  }

  List<Override> nube({String? rol}) => [
        databaseProvider.overrideWithValue(db),
        sharedPreferencesProvider.overrideWithValue(prefs),
        fotosBitacoraStorageProvider.overrideWithValue(storage),
        bitacoraRemotoProvider.overrideWithValue(_RemotoSinRed()),
        currentUserProvider.overrideWithValue(null),
        empresaIdProvider.overrideWithValue('emp-1'),
        rolUsuarioProvider.overrideWith((ref) async => rol),
      ];

  Widget montar({String? rol}) => ProviderScope(
        overrides: nube(rol: rol),
        child: MaterialApp(
          theme: AppTheme.light,
          home: const BitacoraScreen(obraId: 'obra-1', obraNombre: 'Casa Norte'),
        ),
      );

  /// La base y las preferencias se tocan FUERA del reloj falso de
  /// `testWidgets`: ahí un `await` de Drift no avanza solo y la prueba se
  /// quedaría esperando para siempre.
  Future<T> real<T>(WidgetTester t, Future<T> Function() f) async =>
      (await t.runAsync(f)) as T;

  Future<String> crearIncidencia() => repo.crearEntrada(
        obraId: 'obra-1',
        empresaId: 'emp-1',
        fecha: fecha,
        tipo: 'INCIDENCIA',
        texto: 'Se coló la losa del eje 3.',
        clima: 'LLUVIA',
        nombres: const ['Ana', 'Beto'],
      );

  /// Como si el servidor ya la tuviera: sellada por la oficina hace una hora.
  Future<void> confirmar(String id) => db.customUpdate(
        "UPDATE bitacora_entrada SET sync_status = 'synced', "
        "server_updated_at = 1, registrada_en = ?, autor_id = 'u-oficina', "
        "autor_nombre = 'Oficina' WHERE id = ?",
        variables: [
          Variable(DateTime.now().millisecondsSinceEpoch - 3600000),
          Variable(id),
        ],
        updates: {db.bitacoraEntrada},
      );

  group('línea de tiempo', () {
    prueba('muestra el día, la entrada con su tipo y texto, y "Por subir" '
        'mientras no llega al servidor', (t) async {
      await real(t, crearIncidencia);
      await t.pumpWidget(montar(rol: 'residente'));
      await t.pumpAndSettle();

      expect(find.text('Martes, 6 de octubre de 2026'), findsOneWidget);
      expect(find.text('Incidencia'), findsOneWidget);
      expect(find.text('Se coló la losa del eje 3.'), findsOneWidget);
      expect(find.text('Clima: Lluvia'), findsOneWidget);
      expect(find.text('Personal: 2 personas'), findsOneWidget);
      expect(find.text('Por subir'), findsOneWidget);
      // Nace sin publicar al cliente.
      expect(find.text('La ve el cliente'), findsNothing);
      expect(find.textContaining('Registrada en este teléfono'), findsOneWidget);
    });

    prueba('el residente captura y corrige lo suyo que aún no sube',
        (t) async {
      await real(t, crearIncidencia);
      await t.pumpWidget(montar(rol: 'residente'));
      await t.pumpAndSettle();

      expect(find.byType(FloatingActionButton), findsOneWidget);
      expect(find.text('Nueva entrada'), findsOneWidget);

      await t.tap(find.byTooltip('Acciones de la entrada'));
      await t.pumpAndSettle();
      expect(find.text('Editar'), findsOneWidget);
      expect(find.text('Agregar fotos'), findsOneWidget);
      expect(find.text('Agregar aclaración'), findsOneWidget);
      expect(find.text('Borrar'), findsOneWidget);
      // Publicar exige que el servidor ya la tenga.
      expect(find.text('Mostrar al cliente'), findsNothing);
    });

    prueba('el contador solo lee: sin "Nueva entrada" ni acciones',
        (t) async {
      await real(t, crearIncidencia);
      await t.pumpWidget(montar(rol: 'contador'));
      await t.pumpAndSettle();

      expect(find.text('Se coló la losa del eje 3.'), findsOneWidget);
      expect(find.byType(FloatingActionButton), findsNothing);
      expect(find.byTooltip('Acciones de la entrada'), findsNothing);
    });

    prueba('sin entradas lo dice y propone anotar el día', (t) async {
      await t.pumpWidget(montar(rol: 'residente'));
      await t.pumpAndSettle();

      expect(find.text('Sin entradas todavía.'), findsOneWidget);
      expect(find.textContaining('Anota lo que pasó hoy'), findsOneWidget);
    });

    prueba('una entrada ya en el servidor y cerrada solo admite '
        'aclaraciones (y publicarla, al admin)', (t) async {
      final id = await real(t, crearIncidencia);
      await real(
        t,
        () => db.customUpdate(
          "UPDATE bitacora_entrada SET sync_status = 'synced', "
          "server_updated_at = 1, registrada_en = ?, autor_id = 'u-oficina', "
          "autor_nombre = 'Oficina' WHERE id = ?",
          variables: [
            // Hace dos días: ya cerró.
            Variable(DateTime.now().millisecondsSinceEpoch - 2 * 86400000),
            Variable(id),
          ],
          updates: {db.bitacoraEntrada},
        ),
      );
      await t.pumpWidget(montar(rol: 'admin'));
      await t.pumpAndSettle();

      expect(find.text('Por subir'), findsNothing);
      expect(find.textContaining('Registró Oficina'), findsOneWidget);
      expect(find.textContaining('Cerrada · solo aclaraciones'), findsOneWidget);

      await t.tap(find.byTooltip('Acciones de la entrada'));
      await t.pumpAndSettle();
      expect(find.text('Agregar aclaración'), findsOneWidget);
      expect(find.text('Mostrar al cliente'), findsOneWidget);
      expect(find.text('Editar'), findsNothing);
      expect(find.text('Borrar'), findsNothing);
    });
  });

  group('avisos de lo que no subió', () {
    Future<void> avisoDeEdicion(String id) => AvisosBitacora(prefs).agregar(
          AvisoBitacora(
            id: 'aviso-1',
            filaId: id,
            tabla: 'bitacora_entrada',
            obraId: 'obra-1',
            entradaId: id,
            rechazo: RechazoBitacora.cambiada,
            texto: 'Eran 4 m³, no 3.',
            fechaEntrada: fecha,
            creadoEn: 0,
          ),
        );

    prueba('el texto rechazado se puede agregar como aclaración',
        (t) async {
      final id = await real(t, crearIncidencia);
      await real(t, () => confirmar(id));
      await real(t, () => avisoDeEdicion(id));

      await t.pumpWidget(montar(rol: 'residente'));
      await t.pumpAndSettle();

      expect(find.text('Tu cambio no se subió'), findsOneWidget);
      expect(find.text(explicarRechazo(RechazoBitacora.cambiada)),
          findsOneWidget);
      expect(find.text('Eran 4 m³, no 3.'), findsOneWidget);

      await t.tap(find.text('Agregar como aclaración'));
      await t.pumpAndSettle();

      // El aviso se fue y el texto quedó como aclaración de la entrada.
      expect(find.text('Tu cambio no se subió'), findsNothing);
      expect(find.text('Aclaraciones'), findsOneWidget);
      expect(find.text('Eran 4 m³, no 3.'), findsOneWidget);
      final aclaraciones =
          await real(t, () => db.select(db.bitacoraAclaracion).get());
      expect(aclaraciones.single.entradaId, id);
      expect(aclaraciones.single.texto, 'Eran 4 m³, no 3.');
      expect(AvisosBitacora(prefs).deObra('obra-1'), isEmpty);
    });

    prueba('quien no aclara solo puede descartarlo', (t) async {
      final id = await real(t, crearIncidencia);
      await real(t, () => confirmar(id));
      await real(t, () => avisoDeEdicion(id));

      await t.pumpWidget(montar(rol: 'colaborador'));
      await t.pumpAndSettle();

      expect(find.text('Agregar como aclaración'), findsNothing);
      await t.tap(find.text('Descartar'));
      await t.pumpAndSettle();
      expect(find.text('Tu cambio no se subió'), findsNothing);
      expect(await real(t, () => db.select(db.bitacoraAclaracion).get()),
          isEmpty);
    });
  });

  group('menú de la obra', () {
    const obra = Obra(
      empresaId: 'emp-1',
      createdAt: 0,
      updatedAt: 0,
      syncStatus: 'synced',
      orden: 0,
      id: 'obra-1',
      nombre: 'Casa Norte',
      cliente: '',
      ubicacion: '',
      fechaInicio: 0,
      activa: true,
    );

    Widget montarObra(ModulosActivos m, {String? rol}) => ProviderScope(
          overrides: [
            ...nube(rol: rol),
            modulosProvider.overrideWith(() => _ModulosFijos(m)),
          ],
          child: MaterialApp(
            theme: AppTheme.light,
            home: const ObraDetailScreen(obra: obra),
          ),
        );

    Future<void> abrirMenu(WidgetTester t) async {
      await t.tap(find.byTooltip('Más acciones'));
      await t.pumpAndSettle();
    }

    prueba('con el módulo prendido aparece "Bitácora"', (t) async {
      await t.pumpWidget(montarObra(_con(['bitacora']), rol: 'residente'));
      await t.pumpAndSettle();
      await abrirMenu(t);
      expect(find.text('Bitácora'), findsOneWidget);
    });

    prueba('con el módulo apagado no aparece', (t) async {
      await t.pumpWidget(montarObra(_con(['notas']), rol: 'admin'));
      await t.pumpAndSettle();
      await abrirMenu(t);
      expect(find.text('Notas de trato'), findsOneWidget);
      expect(find.text('Bitácora'), findsNothing);
    });

    prueba('compras no la ve aunque el módulo esté prendido', (t) async {
      await t.pumpWidget(
          montarObra(_con(['bitacora', 'notas']), rol: 'compras'));
      await t.pumpAndSettle();
      await abrirMenu(t);
      expect(find.text('Notas de trato'), findsOneWidget);
      expect(find.text('Bitácora'), findsNothing);
    });

    test('la regla del menú: módulo prendido y rol que la ve', () {
      final con = _con(['bitacora']);
      expect(bitacoraEnMenuDeObra(con, 'supervisor'), isTrue);
      expect(bitacoraEnMenuDeObra(con, 'contador'), isTrue);
      expect(bitacoraEnMenuDeObra(con, null), isTrue);
      expect(bitacoraEnMenuDeObra(con, 'almacen'), isFalse);
      expect(bitacoraEnMenuDeObra(ModulosActivos.porDefecto, 'admin'), isFalse);
    });
  });
}
