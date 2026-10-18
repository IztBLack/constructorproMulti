import 'dart:io';

import 'package:constructorpro/core/db/app_database.dart';
import 'package:constructorpro/data/repositories_lista_material.dart';
import 'package:constructorpro/domain/listas/leer_nota_material.dart';
import 'package:constructorpro/domain/listas/listas_calculo.dart';
import 'package:constructorpro/pdf/pdf_service.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:intl/date_symbol_data_local.dart';

/// El PDF de la LISTA DE MATERIAL (docs/PLAN_LISTAS_MATERIAL.md §8), armado con
/// la nota real de trabes y pasillo que originó el módulo.
///
/// Se mide como en `nota_obra_para_test.dart`: por el TAMAÑO del archivo, que
/// cambia si algo llega a la hoja. Además deja el PDF en `build/` para verlo.
void main() {
  setUpAll(() => initializeDateFormatting('es_MX'));

  const cuando = 1791000000000;
  const nota = 'Través\n4 10:45\n2 12:25\n2 2:80\n1 2:80 chica\n2 3:90\n'
      '2 3:10\n2 2:10\nPasillo\n2 3:55 estribo 25\n4:10 1\n2 3mt';

  ListaConRenglones lista({bool marcarDos = false, String notas = ''}) {
    final leidos = leerNotaMaterial(nota);
    return ListaConRenglones(
      ListaMaterialRow(
        empresaId: 'e1',
        createdAt: cuando,
        updatedAt: cuando,
        syncStatus: 'synced',
        orden: 0,
        id: 'l1',
        obraId: 'o1',
        titulo: 'Trabes y pasillo',
        plano: 'E-03',
        fecha: cuando,
        estado: 'ABIERTA',
        notas: notas,
      ),
      [
        for (var i = 0; i < leidos.length; i++)
          ListaMaterialRenglonRow(
            empresaId: 'e1',
            createdAt: cuando,
            updatedAt: cuando,
            syncStatus: 'synced',
            orden: (i + 1) * pasoOrdenLista,
            id: 'r$i',
            listaId: 'l1',
            seccion: leidos[i].seccion,
            tipo: tipoRenglonListaACadena(leidos[i].tipo),
            descripcion: leidos[i].descripcion,
            cantidad: leidos[i].cantidad,
            largo: leidos[i].largo,
            unidad: leidos[i].unidad,
            separacionCm: leidos[i].separacionCm,
            nota: leidos[i].nota,
            marcado: marcarDos && i < 2,
            marcadoPorNombre: '',
          ),
      ],
    );
  }

  test('la nota real da los totales del PDF que el dueño revisó', () {
    final t = lista().totales;
    expect(t.piezas, 20);
    expect(t.metros, 110.1);
    expect(t.estribos, 30);
  });

  test('genera el PDF y las marcas llegan a la hoja', () async {
    final enBlanco = await PdfService.listaMaterial(
        lista: lista(marcarDos: true), obraNombre: 'Casa Alfaro', conMarcas: false);
    final conMarcas = await PdfService.listaMaterial(
        lista: lista(marcarDos: true), obraNombre: 'Casa Alfaro');
    expect(enBlanco.length, greaterThan(1000));
    expect(conMarcas.length, isNot(enBlanco.length),
        reason: 'las casillas palomeadas se dibujan rellenas');

    final conNotas = await PdfService.listaMaterial(
        lista: lista(notas: 'Revisar con el fierrero'), obraNombre: 'Casa Alfaro');
    expect(conNotas.length, greaterThan(enBlanco.length));

    Directory('build').createSync(recursive: true);
    File('build/lista_material_prueba.pdf').writeAsBytesSync(conMarcas);
  });
}
