import 'package:constructorpro/core/db/app_database.dart';
import 'package:constructorpro/core/settings/settings_provider.dart';
import 'package:constructorpro/data/providers.dart';
import 'package:constructorpro/domain/logic/presupuesto_calculator.dart';
import 'package:constructorpro/domain/models/models.dart' as dom;
import 'package:drift/drift.dart' show Value;
import 'package:drift/native.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:shared_preferences/shared_preferences.dart';

/// Regla "el IVA global no re-cotiza el pasado": cada cotización congela su
/// tasa al crearse (columna `iva_porcentaje`), y el total se calcula con esa
/// tasa —no con el valor global vigente—. Si esto se rompiera, cambiar el IVA
/// por defecto recalcularía el total de toda cotización histórica.
void main() {
  TestWidgetsFlutterBinding.ensureInitialized();

  late AppDatabase db;
  late ProviderContainer container;

  setUp(() async {
    SharedPreferences.setMockInitialValues({});
    final prefs = await SharedPreferences.getInstance();
    db = AppDatabase.forTesting(NativeDatabase.memory());
    container = ProviderContainer(
      overrides: [sharedPreferencesProvider.overrideWithValue(prefs)],
    );
  });

  tearDown(() async {
    container.dispose();
    await db.close();
  });

  test('el total usa la tasa congelada de la cotización, no el global', () async {
    // Cotización creada con IVA congelado al 16%.
    await db.into(db.cotizaciones).insert(CotizacionesCompanion.insert(
          id: 'c1',
          cliente: 'Cliente',
          nombreProyecto: 'Proyecto',
          fecha: 0,
          ivaEnabled: const Value(true),
          ivaPorcentaje: const Value(16),
        ));

    // Después alguien baja el IVA global por defecto a 8%.
    await container.read(ivaPorcentajeProvider.notifier).set(8.0);
    expect(container.read(ivaPorcentajeProvider), 8.0);

    // Se relee la cotización de la BD: su tasa sigue siendo la del alta.
    final cot =
        await (db.select(db.cotizaciones)..where((t) => t.id.equals('c1')))
            .getSingle();
    expect(cot.ivaPorcentaje, 16.0);

    // El cálculo se hace con la tasa de la cotización (16%), NO con el 8% global.
    const partidas = [dom.Partida(cantidad: 1, precioUnitario: 1000)];
    final t = const PresupuestoCalculator().calcular(
      partidas: partidas,
      ivaEnabled: cot.ivaEnabled,
      ivaPercentage: cot.ivaPorcentaje,
    );

    expect(t.iva, 160.0, reason: '16% de 1000, la tasa congelada');
    expect(t.total, 1160.0);
    expect(t.total, isNot(1080.0), reason: 'el 8% global no debe recotizar');
  });
}
