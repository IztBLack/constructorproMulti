import 'package:constructorpro/core/pdf/pdf_config.dart';
import 'package:constructorpro/core/pdf/textos_finales.dart';
import 'package:constructorpro/core/sync/rol_provider.dart';
import 'package:constructorpro/data/providers.dart';
import 'package:constructorpro/presentation/common/texto_final_card.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';

/// La tarjeta del párrafo final, la MISMA para cotizaciones, notas y estado de
/// cuenta.
///
/// Existe una sola por lo que cuenta su propio encabezado: nació como método
/// privado de la pantalla de cotización y el estado de cuenta se quedó dos
/// versiones sin poder editar su párrafo. Estas pruebas fijan lo que hay que
/// poder decir de las tres a la vez.
///
/// Lo que se comprueba es lo que el usuario LEE: qué párrafo se enseña —el
/// resuelto, no una plantilla con huecos— y de dónde dice que salió, porque de
/// eso depende que sepa si lo que va a imprimir es suyo o el de la empresa.
void main() {
  const empresa = 'Constructora Hernández';

  Widget montar({
    required TipoDocumento tipo,
    String? textoPropio,
    Map<TipoDocumento, String> generales = const {},
    bool puedeEditar = true,
    void Function(String?)? onGuardar,
  }) {
    return ProviderScope(
      overrides: [
        pdfConfigEfectivaProvider.overrideWith(
          (ref) async => const PdfConfig(empresaNombre: empresa),
        ),
        textosPdfProvider.overrideWith(() => _TextosFijos(generales)),
        puedeEditarOperacionProvider.overrideWithValue(puedeEditar),
      ],
      child: MaterialApp(
        home: Scaffold(
          body: TextoFinalCard(
            tipo: tipo,
            textoPropio: textoPropio,
            ctx: (cfg) => ContextoTextoFinal(nombreEmpresa: cfg.empresaNombre),
            onGuardar: (t) async => onGuardar?.call(t),
          ),
        ),
      ),
    );
  }

  testWidgets('sin nada escrito enseña el integrado, ya resuelto', (t) async {
    await t.pumpWidget(montar(tipo: TipoDocumento.estadoCuenta));
    await t.pumpAndSettle();

    expect(find.text('Texto por defecto'), findsOneWidget);
    // Resuelto: con el nombre real de la empresa sustituido. Si enseñara la
    // plantilla, el dueño no sabría qué va a decir la hoja.
    expect(
      find.textContaining('comuníquese con $empresa.'),
      findsOneWidget,
    );
  });

  testWidgets('el texto general de la empresa se anuncia como tal', (t) async {
    await t.pumpWidget(montar(
      tipo: TipoDocumento.estadoCuenta,
      generales: const {TipoDocumento.estadoCuenta: 'Pagos a 15 días.'},
    ));
    await t.pumpAndSettle();

    expect(find.text('Texto de tus ajustes'), findsOneWidget);
    expect(find.text('Pagos a 15 días.'), findsOneWidget);
  });

  testWidgets('el propio del documento gana y se puede restaurar', (t) async {
    String? guardado;
    var llamado = false;
    await t.pumpWidget(montar(
      tipo: TipoDocumento.estadoCuenta,
      textoPropio: 'Solo para esta obra.',
      generales: const {TipoDocumento.estadoCuenta: 'Pagos a 15 días.'},
      onGuardar: (v) {
        guardado = v;
        llamado = true;
      },
    ));
    await t.pumpAndSettle();

    expect(find.text('Editado aquí'), findsOneWidget);
    expect(find.text('Solo para esta obra.'), findsOneWidget);

    await t.tap(find.text('Restaurar'));
    await t.pumpAndSettle();
    // `null` y no cadena vacía: vacío significaría "documento sin párrafo", y lo
    // que se pide al restaurar es volver a seguir el general.
    expect(llamado, isTrue);
    expect(guardado, isNull);
  });

  testWidgets('sin propio no hay nada que restaurar', (t) async {
    await t.pumpWidget(montar(tipo: TipoDocumento.estadoCuenta));
    await t.pumpAndSettle();

    expect(find.text('Restaurar'), findsNothing);
    expect(find.text('Editar'), findsOneWidget);
  });

  testWidgets('un rol de solo lectura ve el texto pero no lo toca', (t) async {
    await t.pumpWidget(montar(
      tipo: TipoDocumento.estadoCuenta,
      textoPropio: 'Solo para esta obra.',
      puedeEditar: false,
    ));
    await t.pumpAndSettle();

    // Lo que se va a imprimir se sigue viendo: el candado es sobre editar, no
    // sobre enterarse.
    expect(find.text('Solo para esta obra.'), findsOneWidget);
    expect(find.text('Editar'), findsNothing);
    expect(find.text('Restaurar'), findsNothing);
  });

  testWidgets('cada tipo lee su propio texto general', (t) async {
    // El error fácil al reusar esta tarjeta es dejar el tipo del documento de
    // donde se copió. Si pasara, la nota imprimiría la vigencia de 30 días de
    // una cotización.
    await t.pumpWidget(montar(
      tipo: TipoDocumento.nota,
      generales: const {TipoDocumento.cotizacion: 'Vigencia de 30 días.'},
    ));
    await t.pumpAndSettle();

    expect(find.text('Vigencia de 30 días.'), findsNothing);
    expect(find.text('Texto por defecto'), findsOneWidget);
  });
}

/// Textos generales fijos, sin Supabase ni SharedPreferences de por medio.
class _TextosFijos extends TextosPdfNotifier {
  _TextosFijos(this._fijos);

  final Map<TipoDocumento, String> _fijos;

  @override
  Map<TipoDocumento, String> build() => _fijos;
}
