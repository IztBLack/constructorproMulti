import 'package:constructorpro/core/db/app_database.dart';
import 'package:constructorpro/presentation/notas/campo_a_nombre_de.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';

/// El campo «A nombre de» de una nota de obra (Supabase 0034).
///
/// Lo que se vigila son las tres decisiones que el dueño cerró y que no se leen
/// solas en el código: que buscar ignore acentos y mayúsculas, que reescribir el
/// nombre a mano DESLIGUE la nota del padrón, y que la casilla del apartado
/// «Para» solo se ofrezca cuando no hay nombre —con nombre no hay nada que
/// decidir, el PDF siempre lo imprime—.
void main() {
  Colaborador quien(String id, String nombre) => Colaborador(
        empresaId: 'e1',
        createdAt: 0,
        updatedAt: 0,
        syncStatus: 'synced',
        orden: 100,
        id: id,
        nombre: nombre,
        puestoId: 'p1',
        tipoPago: 'DIA',
        telefono: '',
        contactoNombre: '',
        contactoTelefono: '',
        contactoParentesco: '',
        activo: true,
      );

  final padron = [
    quien('c1', 'MARTÍN RAMÍREZ'),
    quien('c2', 'ENRIQUE LÓPEZ'),
  ];

  /// Monta el campo y devuelve lo último que reportó hacia afuera.
  Future<({TextEditingController texto, List<String?> ligas, List<bool> paras})>
      montar(
    WidgetTester tester, {
    String inicial = '',
    String? colaboradorIdInicial,
    bool mostrarPara = true,
  }) async {
    final texto = TextEditingController(text: inicial);
    final ligas = <String?>[];
    final paras = <bool>[];

    await tester.pumpWidget(MaterialApp(
      home: Scaffold(
        body: CampoANombreDe(
          controller: texto,
          colaboradores: padron,
          colaboradorIdInicial: colaboradorIdInicial,
          onColaborador: ligas.add,
          mostrarParaInicial: mostrarPara,
          onMostrarPara: paras.add,
        ),
      ),
    ));
    return (texto: texto, ligas: ligas, paras: paras);
  }

  testWidgets('«ramirez» encuentra a «RAMÍREZ»: ni acentos ni mayúsculas',
      (tester) async {
    await montar(tester);

    await tester.enterText(find.byType(TextField), 'ramirez');
    await tester.pumpAndSettle();

    expect(find.text('MARTÍN RAMÍREZ'), findsOneWidget);
    expect(find.text('ENRIQUE LÓPEZ'), findsNothing);
  });

  testWidgets('la coincidencia es por dentro del nombre, no solo al principio',
      (tester) async {
    await montar(tester);

    await tester.enterText(find.byType(TextField), 'lop');
    await tester.pumpAndSettle();

    expect(find.text('ENRIQUE LÓPEZ'), findsOneWidget);
  });

  testWidgets('elegir una sugerencia guarda el nombre Y liga la nota',
      (tester) async {
    final r = await montar(tester);

    await tester.enterText(find.byType(TextField), 'enrique');
    await tester.pumpAndSettle();
    await tester.tap(find.text('ENRIQUE LÓPEZ').last);
    await tester.pumpAndSettle();

    expect(r.texto.text, 'ENRIQUE LÓPEZ');
    expect(r.ligas.last, 'c2');
  });

  testWidgets('reescribir el nombre a mano desliga la nota del padrón',
      (tester) async {
    // Una nota que dice «ORLANDO R.» pero apunta a otra ficha es peor que una
    // sin ligar: nadie la revisaría.
    final r = await montar(tester,
        inicial: 'MARTÍN RAMÍREZ', colaboradorIdInicial: 'c1');

    await tester.enterText(find.byType(TextField), 'MARTÍN EL DE LA OBRA');
    await tester.pumpAndSettle();

    expect(r.ligas, [null]);
  });

  testWidgets('la casilla del apartado «Para» solo sale sin nombre',
      (tester) async {
    final r = await montar(tester);
    expect(find.byType(Checkbox), findsOneWidget);

    // Con nombre el PDF siempre imprime «Para: NOMBRE»: no hay qué preguntar.
    await tester.enterText(find.byType(TextField), 'ORLANDO RAMOZ');
    await tester.pumpAndSettle();
    expect(find.byType(Checkbox), findsNothing);

    // Y al borrarlo vuelve a ofrecerse, con lo que ya estaba elegido.
    await tester.enterText(find.byType(TextField), '');
    await tester.pumpAndSettle();
    expect(tester.widget<Checkbox>(find.byType(Checkbox)).value, isTrue);

    await tester.tap(find.byType(Checkbox));
    await tester.pumpAndSettle();
    expect(r.paras.last, isFalse);
  });
}
