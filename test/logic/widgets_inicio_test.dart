import 'package:constructorpro/core/modulos/modulos.dart';
import 'package:constructorpro/core/widgets_inicio/enlaces_inicio.dart';
import 'package:constructorpro/core/widgets_inicio/resumen_widgets.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:intl/date_symbol_data_local.dart';

/// Todos los módulos prendidos.
bool todo(ClaveModulo _) => true;

PermisosWidgets permisos([String? rol = 'supervisor']) =>
    permisosWidgets(rol: rol, usa: todo);

final ahora = DateTime(2026, 10, 11, 8, 30);
int a(int h, int m, {int dias = 0}) =>
    DateTime(2026, 10, 11 - dias, h, m).millisecondsSinceEpoch;

const casas = ObraWidget(id: 'o1', nombre: 'Casas Bienestar');
const boti = ObraWidget(id: 'o2', nombre: 'Boticaria');
const orlando = CuadrillaWidget(id: 'q1', nombre: 'Cuadrilla de Orlando', orden: 1);
const martin = CuadrillaWidget(id: 'q2', nombre: 'Cuadrilla de Martín', orden: 2);

AsistenciaWidget asis(String obra, String colab, double f,
        {bool pendiente = false, int? en}) =>
    AsistenciaWidget(
      obraId: obra,
      colaboradorId: colab,
      fraccion: f,
      pendiente: pendiente,
      capturadaEn: en ?? a(7, 2),
    );

EntradaWidgets entrada({
  PermisosWidgets? p,
  List<AsistenciaWidget> asistencias = const [],
  List<AvisoCandidato> avisos = const [],
  int vistos = 0,
}) =>
    EntradaWidgets(
      ahora: ahora,
      permisos: p ?? permisos(),
      obras: const [casas, boti],
      roster: const {
        'o1': ['a', 'b', 'c', 'd', 'e'],
        'o2': ['x', 'y'],
      },
      cuadrillaDe: const {'a': orlando, 'b': orlando, 'c': martin, 'd': martin},
      asistenciasHoy: asistencias,
      avisos: avisos,
      avisosVistosHasta: vistos,
    );

void main() {
  setUpAll(() => initializeDateFormatting('es_MX'));

  group('permisos por rol', () {
    test('supervisor y residente pasan lista y ven todo', () {
      for (final rol in ['supervisor', 'residente', 'admin', null]) {
        final p = permisos(rol);
        expect(p.paseLista && p.pasarLista && p.avisos && p.obrasHoy, isTrue,
            reason: '$rol');
        expect(p.accionBitacora && p.accionNota && p.accionGasto, isTrue,
            reason: '$rol');
      }
    });

    test('el contador ve el pase pero no lo pasa, y sí registra gasto', () {
      final p = permisos('contador');
      expect(p.paseLista, isTrue);
      expect(p.pasarLista, isFalse);
      expect(p.accionNota, isFalse);
      expect(p.accionBitacora, isFalse);
      expect(p.accionGasto, isTrue);
    });

    test('colaborador, compras y almacén no tienen widgets de campo', () {
      for (final rol in ['colaborador', 'compras', 'almacen']) {
        final p = permisos(rol);
        expect(
          p.paseLista || p.avisos || p.obrasHoy || p.accionGasto,
          isFalse,
          reason: rol,
        );
      }
    });

    test('un módulo apagado apaga su widget y su acción', () {
      final p = permisosWidgets(
        rol: 'supervisor',
        usa: (c) => c != ClaveModulo.bitacora && c != ClaveModulo.caja,
      );
      expect(p.avisosBitacora, isFalse);
      expect(p.accionBitacora, isFalse);
      expect(p.accionGasto, isFalse);
      expect(p.avisosNotas, isTrue);
      expect(p.avisos, isTrue);
    });
  });

  group('pase de lista', () {
    test('cuenta presentes por cuadrilla; medio día cuenta como que vino', () {
      final c = contarObra(
        entrada(asistencias: [
          asis('o1', 'a', 1),
          asis('o1', 'b', 0.5),
          asis('o1', 'c', 0), // marcado como falta
          asis('o1', 'e', 1, pendiente: true),
        ]),
        casas,
      );
      expect(c.presentes, 3);
      expect(c.total, 5);
      expect(c.porSubir, 1);
      expect(c.grupos.map((g) => '${g.nombre}: ${g.texto}'), [
        'Cuadrilla de Orlando: 2 de 2',
        'Cuadrilla de Martín: 0 de 2',
        'Sin cuadrilla: 1 de 1',
      ]);
    });

    test('la hora es la de la primera asistencia con presencia', () {
      final c = contarObra(
        entrada(asistencias: [
          asis('o1', 'a', 1, en: a(7, 40)),
          asis('o1', 'b', 1, en: a(7, 5)),
          asis('o1', 'c', 0, en: a(6, 0)),
        ]),
        casas,
      );
      expect(c.primeraCaptura, a(7, 5));
    });

    test('la obra principal es la de más presentes; sin pase, la de más gente', () {
      expect(obraPrincipal(entrada())!.obra.id, 'o1');
      final e = entrada(asistencias: [
        asis('o2', 'x', 1),
        asis('o2', 'y', 1),
        asis('o1', 'a', 1),
      ]);
      expect(obraPrincipal(e)!.obra.id, 'o2');
    });

    test('más de dos grupos: el segundo cuadro junta a los demás', () {
      final m = llavesWidgets(entrada(asistencias: [asis('o1', 'a', 1)]));
      expect(m['pase_cu_n'], 2);
      expect(m['pase_cu0_nombre'], 'Cuadrilla de Orlando');
      expect(m['pase_cu1_nombre'], 'Otras 2 cuadrillas');
      expect(m['pase_cu1_txt'], '0 de 3');
    });

    test('sin permiso no se publica la obra', () {
      final m = llavesWidgets(entrada(p: permisos('compras')));
      expect(m['pase_ok'], isFalse);
      expect(m['pase_hay_obra'], isFalse);
      expect(m.containsKey('pase_obra'), isFalse);
    });
  });

  group('avisos de la oficina', () {
    AvisoCandidato aviso(TipoAviso t, int momento,
            {bool propio = false, String texto = 'Colado mañana'}) =>
        AvisoCandidato(
          tipo: t,
          obraId: 'o1',
          obraNombre: 'Casas Bienestar',
          autor: 'Orlando',
          texto: texto,
          momento: momento,
          propio: propio,
        );

    test('sin lo propio ni lo de hace más de una semana, del más nuevo al más viejo', () {
      final e = entrada(avisos: [
        aviso(TipoAviso.instruccion, a(6, 40)),
        aviso(TipoAviso.aclaracion, a(18, 15, dias: 1)),
        aviso(TipoAviso.nota, a(9, 0, dias: 2)),
        aviso(TipoAviso.instruccion, a(9, 0, dias: 8)),
        aviso(TipoAviso.instruccion, a(8, 0), propio: true),
      ]);
      expect(avisosVisibles(e).map((x) => x.tipo), [
        TipoAviso.instruccion,
        TipoAviso.aclaracion,
        TipoAviso.nota,
      ]);
      final m = llavesWidgets(e);
      expect(m['av_n'], 3);
      expect(m['av0_titulo'], 'Instrucción · Orlando · hoy 6:40 · Casas Bienestar');
      expect(m['av1_titulo'], startsWith('Aclaración · Orlando · ayer 18:15'));
      expect(m['av0_destino'], 'bitacora');
      expect(m['av2_destino'], 'notas');
    });

    test('«nuevo» es lo posterior a la última vez que se abrió', () {
      final m = llavesWidgets(entrada(
        avisos: [
          aviso(TipoAviso.instruccion, a(6, 40)),
          aviso(TipoAviso.aclaracion, a(18, 15, dias: 1)),
        ],
        vistos: a(0, 0),
      ));
      expect(m['av_nuevos'], 1);
      expect(m['av0_nuevo'], isTrue);
      expect(m['av1_nuevo'], isFalse);
    });

    test('el texto largo se recorta', () {
      final m = llavesWidgets(entrada(
          avisos: [aviso(TipoAviso.instruccion, a(6, 40), texto: 'x ' * 200)]));
      expect((m['av0_texto'] as String).length, lessThanOrEqualTo(140));
      expect(m['av0_texto'], endsWith('…'));
    });

    test('las notas no salen si el rol no maneja notas', () {
      final e = entrada(
        p: permisos('contador'),
        avisos: [aviso(TipoAviso.nota, a(6, 40))],
      );
      expect(avisosVisibles(e), isEmpty);
    });
  });

  group('hoy en las obras', () {
    test('dice cuáles no han pasado lista', () {
      final m = llavesWidgets(entrada(asistencias: [asis('o1', 'a', 1)]));
      expect(m['oh_n'], 2);
      expect(m['oh_personas'], 1);
      expect(m['oh0_nombre'], 'Casas Bienestar');
      expect(m['oh0_cuenta'], '1 de 5');
      expect(m['oh0_falta'], isFalse);
      expect(m['oh1_cuenta'], 'Sin pase');
      expect(m['oh1_falta'], isTrue);
      expect(m['oh1_detalle'], 'Aún no pasan lista');
    });
  });

  test('NUNCA hay dinero en las llaves', () {
    final m = llavesWidgets(entrada(asistencias: [asis('o1', 'a', 1)]));
    for (final v in m.values.whereType<String>()) {
      expect(v.contains(r'$'), isFalse, reason: v);
    }
  });

  test('las llaves vacías apagan todo', () {
    final m = llavesWidgetsVacias(ahora);
    expect(m['w_vacio'], isTrue);
    for (final k in ['pase_ok', 'av_ok', 'oh_ok', 'ac_pase', 'ac_gasto']) {
      expect(m[k], isFalse, reason: k);
    }
  });

  group('enlaces', () {
    test('lee destino y obra', () {
      expect(
        leerEnlaceInicio(Uri.parse('constructorpro://abrir/gasto-caja?obra=o1')),
        const EnlaceInicio(DestinoInicio.gastoCaja, obraId: 'o1'),
      );
      expect(
        leerEnlaceInicio(Uri.parse('constructorpro://abrir/pase-lista')),
        const EnlaceInicio(DestinoInicio.paseLista),
      );
    });

    test('lo ajeno o mal formado no hace nada', () {
      for (final u in [
        'https://abrir/pase-lista',
        'constructorpro://otro/pase-lista',
        'constructorpro://abrir/',
        'constructorpro://abrir/borrar-todo',
      ]) {
        expect(leerEnlaceInicio(Uri.parse(u)), isNull, reason: u);
      }
      expect(leerEnlaceInicio(null), isNull);
    });

    test('los atajos del ícono usan los mismos destinos', () {
      expect(leerAtajo('nota-nueva'), const EnlaceInicio(DestinoInicio.notaNueva));
      expect(leerAtajo('entrada-bitacora')!.destino.requiereObra, isTrue);
      expect(DestinoInicio.paseLista.requiereObra, isFalse);
    });
  });
}
