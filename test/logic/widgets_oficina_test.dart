import 'package:constructorpro/core/modulos/modulos.dart';
import 'package:constructorpro/core/widgets_inicio/datos_oficina.dart';
import 'package:constructorpro/core/widgets_inicio/oficina_widgets.dart';
import 'package:constructorpro/core/widgets_inicio/resumen_widgets.dart';
import 'package:constructorpro/domain/import/mx_time.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:intl/date_symbol_data_local.dart';
import 'package:shared_preferences/shared_preferences.dart';

bool todo(ClaveModulo _) => true;
PermisosWidgets permisos([String? rol = 'supervisor']) =>
    permisosWidgets(rol: rol, usa: todo);

/// Miércoles 14 de octubre de 2026, 9:00. Semana: lunes 12 a domingo 18.
final ahora = DateTime(2026, 10, 14, 9);
int dia(int d, {int mes = 10}) => medianocheMx(2026, mes, d);
int hace(Duration d) => ahora.subtract(d).millisecondsSinceEpoch;

const obras = {'o1': 'Casas Bienestar', 'o2': 'Boticaria'};

PedidoMaterial pedido(String estado,
        {String obra = 'o1', Duration antes = const Duration(days: 1), int folio = 1}) =>
    PedidoMaterial(
      obraId: obra,
      folio: folio,
      estado: estado,
      creadoEn: hace(antes),
      renglones: const [
        RenglonPedido(descripcion: 'Cemento', cantidad: 40, unidad: 'bultos'),
        RenglonPedido(descripcion: 'Varilla 3/8', cantidad: 2, unidad: 't'),
      ],
    );

PartidaPrograma partida(String concepto, int inicio, int fin, {bool terminada = false, String obra = 'o1'}) =>
    PartidaPrograma(obraId: obra, concepto: concepto, inicio: inicio, fin: fin, terminada: terminada);

void main() {
  setUpAll(() => initializeDateFormatting('es_MX'));

  group('permisos de la etapa 2', () {
    test('compras y almacén SÍ ven el material; no el programa ni lo por aprobar', () {
      for (final rol in ['compras', 'almacen']) {
        final p = permisos(rol);
        expect(p.material, isTrue, reason: rol);
        expect(p.programa || p.porAprobar, isFalse, reason: rol);
      }
    });

    test('por aprobar solo para admin y supervisor', () {
      expect(permisos('admin').porAprobar, isTrue);
      expect(permisos('supervisor').porAprobar, isTrue);
      expect(permisos('residente').porAprobar, isFalse);
      expect(permisos('contador').porAprobar, isFalse);
    });

    test('sin el módulo no hay widget, y dice cuál prender', () {
      final p = permisosWidgets(
        rol: 'admin',
        usa: (c) => c != ClaveModulo.compras && c != ClaveModulo.programa,
      );
      expect(p.material, isFalse);
      expect(p.programa, isFalse);
      expect(p.sinMaterial, contains('«Compras y material»'));
      expect(p.sinPrograma, contains('«Programa de obra»'));
      expect(permisos('residente').sinAprobar, startsWith('Solo el administrador'));
      expect(permisos('admin').sinMaterial, isEmpty);
    });
  });

  group('material', () {
    test('qué se pidió, sin precio', () {
      expect(queSePidio(pedido('PENDIENTE')), 'Cemento, 40 bultos (+1 más)');
      expect(
        queSePidio(const PedidoMaterial(obraId: 'o1', folio: 7, estado: 'PENDIENTE', creadoEn: 0)),
        'Pedido 7',
      );
    });

    test('se ven los abiertos y lo reciente de obras activas, del más nuevo al más viejo', () {
      final d = DatosOficina(leidoEn: hace(Duration.zero), pedidos: [
        pedido('COMPRADA', antes: const Duration(days: 20), folio: 1), // viejo y cerrado
        pedido('APROBADA', antes: const Duration(days: 30), folio: 2), // viejo pero abierto
        pedido('PENDIENTE', antes: const Duration(hours: 2), folio: 3),
        pedido('PENDIENTE', obra: 'o9', folio: 4), // obra no activa
      ]);
      expect(pedidosVisibles(d, ahora, obras).map((p) => p.folio), [3, 2]);
    });

    test('las llaves dicen estado, obra y a dónde lleva', () {
      final d = DatosOficina(
        leidoEn: hace(const Duration(minutes: 10)),
        pedidos: [pedido('PENDIENTE')],
        recepciones: [(obraId: 'o1', fecha: dia(14))],
      );
      final m = llavesOficina(
          datos: d, ahora: ahora, permisos: permisos(), obrasActivas: obras, rol: 'supervisor');
      expect(m['mat_n'], 1);
      expect(m['mat0_estado'], 'Por aprobar');
      expect(m['mat0_tono'], 'ambar');
      expect(m['mat0_cuando'], startsWith('Pedido ayer'));
      expect(m['mat0_cuando'], endsWith('Casas Bienestar'));
      expect(m['mat0_url'], '$urlPortal/admin/obras/o1/material');
      expect(m['mat_llego'], 'Hoy llegó material a Casas Bienestar');
      expect(m['of_actualizado'], startsWith('Actualizado hoy'));
    });

    test('un rechazo dice por qué', () {
      final d = DatosOficina(leidoEn: 0, pedidos: [
        PedidoMaterial(
            obraId: 'o1',
            folio: 1,
            estado: 'RECHAZADA',
            creadoEn: hace(const Duration(days: 2)),
            motivoRechazo: 'Ya hay en bodega'),
      ]);
      final m = llavesOficina(
          datos: d, ahora: ahora, permisos: permisos(), obrasActivas: obras, rol: 'admin');
      expect(m['mat0_cuando'], 'Rechazado: Ya hay en bodega');
      expect(m['mat0_tono'], 'rojo');
    });
  });

  group('lo que toca esta semana', () {
    test('lo atrasado primero; luego lo que empieza y termina en la semana', () {
      final d = DatosOficina(leidoEn: 0, partidas: [
        partida('Instalación eléctrica', dia(1), dia(16)), // termina el viernes
        partida('Losa casa 12', dia(15), dia(25)), // empieza el jueves
        partida('Aplanados', dia(1), dia(9)), // venció el viernes pasado
        partida('Pintura', dia(1), dia(9), terminada: true), // terminada: no sale
        partida('Acabados', dia(1), dia(30)), // en curso sin hito esta semana
        partida('Herrería', dia(20), dia(28)), // la semana que entra
        partida('Otra obra', dia(1), dia(2), obra: 'o9'), // obra no activa
      ]);
      final v = partidasVisibles(d, ahora, obras);
      expect(v.map((x) => '${x.partida.concepto}:${x.tipo.name}'), [
        'Aplanados:atrasada',
        'Losa casa 12:empieza',
        'Instalación eléctrica:termina',
      ]);
      final m = llavesOficina(
          datos: d, ahora: ahora, permisos: permisos(), obrasActivas: obras, rol: 'admin');
      expect(m['pr_atrasadas'], 1);
      expect(m['pr0_estado'], 'Atrasada');
      expect(m['pr0_cuando'], 'Debía terminar el vie 9 de oct');
      expect(m['pr1_cuando'], 'Empieza el jue 15 de oct');
      expect(m['pr2_cuando'], 'Termina el vie 16 de oct');
      expect(m['pr0_url'], '$urlPortal/admin/obras/o1/programa');
    });
  });

  group('por aprobar', () {
    test('cuenta pedidos y solicitudes, nunca montos', () {
      final d = DatosOficina(
        leidoEn: 0,
        pedidos: [pedido('PENDIENTE', folio: 1), pedido('PENDIENTE', folio: 2), pedido('APROBADA')],
        aprobaciones: const {'EXTRA': 1, 'ESTIMACION': 1},
      );
      final m = llavesOficina(
          datos: d, ahora: ahora, permisos: permisos('admin'), obrasActivas: obras, rol: 'admin');
      expect(m['ap_total'], 4);
      expect(m['ap_detalle'], '2 pedidos de material · 1 extra · 1 estimación');
      expect(m['ap_url'], '$urlPortal/admin/ajustes#aprobaciones');
    });

    test('al supervisor lo lleva a Compras (el visto bueno lo abre el admin)', () {
      final m = llavesOficina(
          datos: const DatosOficina(leidoEn: 0),
          ahora: ahora,
          permisos: permisos('supervisor'),
          obrasActivas: obras,
          rol: 'supervisor');
      expect(m['ap_url'], '$urlPortal/admin/compras');
    });
  });

  test('sin datos todavía: los widgets lo dicen en vez de enseñar ceros', () {
    final m = llavesOficina(
        datos: null, ahora: ahora, permisos: permisos(), obrasActivas: obras, rol: 'admin');
    expect(m['of_hay_datos'], isFalse);
    expect(m['mat_n'], 0);
    expect(m['ap_total'], 0);
  });

  test('NUNCA hay dinero en las llaves', () {
    final d = DatosOficina(
      leidoEn: 0,
      pedidos: [pedido('PENDIENTE')],
      partidas: [partida('Losa', dia(15), dia(20))],
      aprobaciones: const {'COMPRA': 2},
    );
    final m = llavesOficina(
        datos: d, ahora: ahora, permisos: permisos('admin'), obrasActivas: obras, rol: 'admin');
    for (final v in m.values.whereType<String>()) {
      expect(v.contains(r'$'), isFalse, reason: v);
    }
  });

  test('ida y vuelta por JSON', () {
    final d = DatosOficina(
      leidoEn: 123,
      pedidos: [pedido('PARCIAL')],
      recepciones: [(obraId: 'o1', fecha: dia(14))],
      partidas: [partida('Losa', dia(15), dia(20))],
      aprobaciones: const {'EXTRA': 2},
    );
    final v = DatosOficina.fromJson(d.toJson().cast<String, dynamic>());
    expect(v.leidoEn, 123);
    expect(v.pedidos.single.renglones.length, 2);
    expect(v.recepciones.single.obraId, 'o1');
    expect(v.partidas.single.concepto, 'Losa');
    expect(v.aprobaciones, {'EXTRA': 2});
  });

  group('lo guardado en el teléfono', () {
    late SharedPreferences prefs;
    var lecturas = 0;
    Future<DatosOficina> lector(DateTime t) async {
      lecturas++;
      return DatosOficina(leidoEn: t.millisecondsSinceEpoch, aprobaciones: const {'EXTRA': 1});
    }

    setUp(() async {
      SharedPreferences.setMockInitialValues({});
      prefs = await SharedPreferences.getInstance();
      lecturas = 0;
    });

    test('solo se enseña a la misma empresa y el mismo usuario', () async {
      final s = DatosOficinaService(prefs, lector: lector);
      await s.refrescar(empresaId: 'e1', usuarioId: 'u1', ahora: ahora);
      expect(s.leerCache(empresaId: 'e1', usuarioId: 'u1'), isNotNull);
      expect(s.leerCache(empresaId: 'e1', usuarioId: 'u2'), isNull);
      expect(s.leerCache(empresaId: 'e2', usuarioId: 'u1'), isNull);
    });

    test('no vuelve a leer antes de 3 minutos, salvo que se fuerce', () async {
      final s = DatosOficinaService(prefs, lector: lector);
      await s.refrescar(empresaId: 'e1', usuarioId: 'u1', ahora: ahora);
      await s.refrescar(
          empresaId: 'e1', usuarioId: 'u1', ahora: ahora.add(const Duration(minutes: 1)));
      expect(lecturas, 1);
      await s.refrescar(
          empresaId: 'e1', usuarioId: 'u1', ahora: ahora.add(const Duration(minutes: 1)), forzar: true);
      expect(lecturas, 2);
    });

    test('sin red se queda lo guardado', () async {
      await DatosOficinaService(prefs, lector: lector)
          .refrescar(empresaId: 'e1', usuarioId: 'u1', ahora: ahora);
      final sinRed = DatosOficinaService(prefs, lector: (_) async => throw Exception('sin red'));
      final nuevo = await sinRed.refrescar(empresaId: 'e1', usuarioId: 'u1', forzar: true);
      expect(nuevo, isFalse);
      expect(sinRed.leerCache(empresaId: 'e1', usuarioId: 'u1')!.aprobaciones, {'EXTRA': 1});
    });
  });

  group('etapa 3', () {
    Map<String, Object> llaves(DatosOficina d, [String rol = 'admin']) => llavesOficina(
        datos: d, ahora: ahora, permisos: permisos(rol), obrasActivas: obras, rol: rol);

    test('seguridad: cuáles obras no tienen la revisión de hoy; incidentes solo contados', () {
      final m = llaves(DatosOficina(
        leidoEn: 0,
        revisiones: [
          (obraId: 'o1', fecha: dia(14)),
          (obraId: 'o2', fecha: dia(13)), // fue ayer: hoy falta
        ],
        incidentes: [
          (obraId: 'o1', fecha: dia(12), tipo: 'CASI_ACCIDENTE'),
          (obraId: 'o1', fecha: dia(1), tipo: 'ACCIDENTE'), // de hace dos semanas
        ],
      ));
      expect(m['sg_resumen'], 'Revisión hecha en 1 de 2 obras');
      expect(m['sg_n'], 1);
      expect(m['sg0_que'], 'Boticaria');
      expect(m['sg0_url'], '$urlPortal/admin/obras/o2/seguridad');
      expect(m['sg_incidentes'], '1 incidente en los últimos 7 días');
    });

    test('garantías: lo programado para hoy primero, luego lo abierto más viejo', () {
      final m = llaves(DatosOficina(leidoEn: 0, garantias: [
        GarantiaAbierta(
            obraId: 'o1', descripcion: 'Humedad en baño', estado: 'ABIERTO', reportadoEn: dia(10), ubicacion: 'Casa 4'),
        GarantiaAbierta(
            obraId: 'o1', descripcion: 'Puerta no cierra', estado: 'EN_REVISION', reportadoEn: dia(1)),
        GarantiaAbierta(
            obraId: 'o2',
            descripcion: 'Fuga',
            estado: 'PROGRAMADO',
            reportadoEn: dia(12),
            programadoPara: dia(14)),
      ]));
      expect(m['ga_total'], 3);
      expect(m['ga_hoy'], 1);
      expect([m['ga0_que'], m['ga1_que'], m['ga2_que']], ['Fuga', 'Humedad en baño', 'Puerta no cierra']);
      expect(m['ga0_estado'], 'Hoy');
      expect(m['ga1_cuando'], 'Casa 4 · Casas Bienestar');
      expect(m['ga2_estado'], 'En revisión');
    });

    test('herramienta: la que ya debió volver primero; nunca el costo', () {
      final m = llaves(DatosOficina(leidoEn: 0, herramientas: [
        HerramientaPrestada(nombre: 'Revolvedora', obraId: 'o1', quien: 'Juan', desde: dia(1)),
        HerramientaPrestada(nombre: 'Rotomartillo', obraId: 'o2', desde: dia(5), devolverAntes: dia(10)),
        HerramientaPrestada(nombre: 'Andamio', obraId: 'o1', desde: dia(8), devolverAntes: dia(16)),
      ]));
      expect(m['he_total'], 3);
      expect(m['he_vencidas'], 1);
      expect(m['he0_que'], 'Rotomartillo');
      expect(m['he0_estado'], 'Ya debió volver');
      expect(m['he0_tono'], 'rojo');
      expect(m['he1_estado'], 'Hasta el vie 16 de oct');
      expect(m['he2_cuando'], 'Casas Bienestar · la tiene Juan');
      for (final v in m.values.whereType<String>()) {
        expect(v.contains(r'$'), isFalse, reason: v);
      }
    });

    test('permisos: el almacén ve la herramienta; sin el módulo dice cuál prender', () {
      expect(permisos('almacen').herramienta, isTrue);
      expect(permisos('almacen').seguridad, isFalse);
      final p = permisosWidgets(rol: 'admin', usa: (c) => c != ClaveModulo.postventa);
      expect(p.garantias, isFalse);
      expect(p.sinGarantias, contains('«Garantías»'));
    });

    test('lo de la etapa 3 sobrevive la ida y vuelta por JSON', () {
      final d = DatosOficina(
        leidoEn: 1,
        revisiones: [(obraId: 'o1', fecha: dia(14))],
        incidentes: [(obraId: 'o1', fecha: dia(13), tipo: 'ACCIDENTE')],
        garantias: [GarantiaAbierta(obraId: 'o1', descripcion: 'x', estado: 'ABIERTO', reportadoEn: 5)],
        herramientas: [HerramientaPrestada(nombre: 'Taladro', desde: 3, devolverAntes: 9)],
      );
      final v = DatosOficina.fromJson(d.toJson().cast<String, dynamic>());
      expect(v.revisiones.single.obraId, 'o1');
      expect(v.incidentes.single.tipo, 'ACCIDENTE');
      expect(v.garantias.single.descripcion, 'x');
      expect(v.herramientas.single.devolverAntes, 9);
      // Una caché vieja (sin las llaves nuevas) se lee sin tronar.
      expect(DatosOficina.fromJson({'l': 1}).herramientas, isEmpty);
    });
  });
}
