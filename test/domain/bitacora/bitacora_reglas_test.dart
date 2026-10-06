import 'dart:io';

import 'package:constructorpro/domain/bitacora/bitacora_reglas.dart';
import 'package:constructorpro/domain/import/mx_time.dart' show fechaMxDe;
import 'package:flutter_test/flutter_test.dart';

/// Reglas puras de la bitácora (web: `web/src/lib/bitacora/bitacora.ts`; base:
/// `0041_bitacora_y_programa.sql` y `0042_roles_organizacion.sql`).
///
/// Dos tipos de prueba:
///   · las del primer grupo LEEN la web y la migración y fallan si el móvil se
///     queda con otras etiquetas, otros topes o un cierre distinto (mismo
///     enfoque que `test/core/modulos_test.dart`);
///   · el resto fija el comportamiento de cada regla, con sus bordes.
void main() {
  const hora = 3600000;
  const minuto = 60000;
  const ventana = 24 * hora;
  // Un «ahora» cualquiera, lejos de 0 para que las restas no se confundan con
  // el sello vacío.
  const ahora = 1790000000000;

  group('espejo de la web y de la base', () {
    final ts = File('web/src/lib/bitacora/bitacora.ts').readAsStringSync();
    final sql = File(
      'supabase/migrations/0041_bitacora_y_programa.sql',
    ).readAsStringSync();

    /// Pares clave → etiqueta del bloque `export const <nombre> ... };`.
    Map<String, String> mapaWeb(String nombre) {
      final i = ts.indexOf('export const $nombre');
      expect(i, isNonNegative, reason: 'no se encontró $nombre en la web');
      final bloque = ts.substring(i, ts.indexOf('};', i));
      return {
        for (final m in RegExp(
          r"^\s*'?(\w*)'?:\s*'([^']*)',?\s*$",
          multiLine: true,
        ).allMatches(bloque))
          m.group(1)!: m.group(2)!,
      };
    }

    List<String> listaSql(String columna) {
      final m = RegExp('check \\($columna in \\(([^)]*)\\)\\)').firstMatch(sql);
      expect(m, isNotNull, reason: 'no se encontró el check de $columna');
      return RegExp(
        r"'([^']*)'",
      ).allMatches(m!.group(1)!).map((x) => x.group(1)!).toList();
    }

    test(
      'tiposEntrada tiene las claves y etiquetas de la web, en su orden',
      () {
        final web = mapaWeb('ETIQUETA_TIPO');
        expect(web, isNotEmpty);
        expect(tiposEntrada, web);
        expect(tiposEntrada.keys.toList(), web.keys.toList());
      },
    );

    test('climas tiene las claves y etiquetas de la web, en su orden', () {
      final web = mapaWeb('ETIQUETA_CLIMA');
      expect(web, isNotEmpty);
      expect(climas, web);
      expect(climas.keys.toList(), web.keys.toList());
    });

    test('los tipos y climas son los que el check de la base acepta', () {
      expect(tiposEntrada.keys.toList(), listaSql('tipo'));
      expect(climas.keys.toList(), listaSql('clima'));
    });

    test('los topes son los de la web y los de la base', () {
      expect(
        RegExp(r'MAX_FOTOS = (\d+)').firstMatch(ts)!.group(1),
        '$maxFotosPorEntrada',
      );
      expect(
        RegExp(r'MAX_TEXTO = (\d+)').firstMatch(ts)!.group(1),
        '$maxLargoTexto',
      );
      expect(
        RegExp(r'v_vivas >= (\d+)').firstMatch(sql)!.group(1),
        '$maxFotosPorEntrada',
      );
      expect(
        RegExp(r'char_length\(texto\) <= (\d+)').firstMatch(sql)!.group(1),
        '$maxLargoTexto',
      );
      expect(
        RegExp(
          r'personal_presente between 0 and (\d+)',
        ).firstMatch(sql)!.group(1),
        '$maxPersonal',
      );
      // La ventana de edición: 24 h en ms, igual que `bitacora_abierta()`.
      expect(
        RegExp(r'p_registrada >= .*- (\d+)').firstMatch(sql)!.group(1),
        '${horasAbierta * hora}',
      );
      expect(ts, contains('VENTANA_EDICION_MS = 24 * 60 * 60 * 1000'));
    });

    test('el cierre cuenta igual que la web: abierta hasta las 24 h exactas', () {
      // Web: `registradaEn >= ahora - VENTANA`. Base: `p_registrada >= ahora - ...`.
      expect(ts, contains('registradaEn >= ahora - VENTANA_EDICION_MS'));
      expect(
        sql,
        contains('select p_registrada >= public.bitacora_ahora_ms()'),
      );
    });

    test(
      'los mensajes de error que se clasifican siguen existiendo en la base',
      () {
        for (final etiqueta in [
          _msgCerradaEntrada,
          _msgCerradaFoto,
          _msgMaxFotos,
        ]) {
          expect(
            sql,
            contains(etiqueta),
            reason: 'la migración ya no lanza «$etiqueta»',
          );
        }
        // EVIDENCIA_INMUTABLE lleva el nombre de la tabla en el `%`.
        expect(sql, contains('EVIDENCIA_INMUTABLE: un registro de %'));
      },
    );
  });

  group('catálogos', () {
    test('seis tipos de entrada con su etiqueta legible', () {
      expect(tiposEntrada.length, 6);
      expect(tiposEntrada['AVANCE'], 'Avance');
      expect(tiposEntrada['INSTRUCCION'], 'Instrucción');
      expect(tiposEntrada['OTRO'], 'Otro');
    });

    test('ocho climas; el vacío es «Sin anotar» y va primero', () {
      expect(climas.length, 8);
      expect(climas.keys.first, '');
      expect(climas[''], 'Sin anotar');
      expect(climas['CALOR'], 'Mucho calor');
      expect(climas['FRIO'], 'Frío');
    });

    test('no hay etiquetas vacías ni repetidas', () {
      for (final c in [tiposEntrada, climas]) {
        expect(c.values.every((v) => v.trim().isNotEmpty), isTrue);
        expect(c.values.toSet().length, c.length);
      }
    });
  });

  group('constantes', () {
    test('valen lo que dice la base', () {
      expect(maxFotosPorEntrada, 10);
      expect(maxLargoTexto, 5000);
      expect(maxPersonal, 10000);
      expect(horasAbierta, 24);
    });
  });

  group('estaAbierta', () {
    test(
      'una entrada que aún no llega al servidor (registradaEn 0) está abierta',
      () {
        expect(estaAbierta(registradaEn: 0, ahoraMs: ahora), isTrue);
        // Aunque el reloj del teléfono sea absurdo: sin sello no hay 24 h que contar.
        expect(estaAbierta(registradaEn: 0, ahoraMs: 0), isTrue);
        expect(estaAbierta(registradaEn: 0, ahoraMs: 1 << 53), isTrue);
      },
    );

    test('recién registrada y a mitad de ventana: abierta', () {
      final registrada = ahora - 5 * minuto;
      expect(estaAbierta(registradaEn: registrada, ahoraMs: ahora), isTrue);
      expect(
        estaAbierta(registradaEn: ahora - 12 * hora, ahoraMs: ahora),
        isTrue,
      );
    });

    test('un ms antes de las 24 h sigue abierta', () {
      expect(
        estaAbierta(registradaEn: ahora - ventana + 1, ahoraMs: ahora),
        isTrue,
      );
    });

    test('a las 24 h EXACTAS sigue abierta (la base compara con >=)', () {
      expect(
        estaAbierta(registradaEn: ahora - ventana, ahoraMs: ahora),
        isTrue,
      );
    });

    test('un ms después de las 24 h ya está cerrada', () {
      expect(
        estaAbierta(registradaEn: ahora - ventana - 1, ahoraMs: ahora),
        isFalse,
      );
      expect(
        estaAbierta(registradaEn: ahora - 25 * hora, ahoraMs: ahora),
        isFalse,
      );
    });

    test(
      'un teléfono con el reloj atrasado (ahora < registradaEn) no la cierra',
      () {
        expect(
          estaAbierta(registradaEn: ahora + 3 * hora, ahoraMs: ahora),
          isTrue,
        );
      },
    );
  });

  group('textoCierre', () {
    String texto(int registradaEn) =>
        textoCierre(registradaEn: registradaEn, ahoraMs: ahora);

    test('sin sello del servidor: «Aún no se sube»', () {
      expect(texto(0), 'Aún no se sube');
    });

    test('con horas de sobra, en horas redondeadas hacia abajo', () {
      expect(texto(ahora - 19 * hora), 'Se cierra en 5 h');
      // Quedan 5 h 59 min: la web dice 5 h, no 6.
      expect(
        texto(ahora - ventana + 5 * hora + 59 * minuto),
        'Se cierra en 5 h',
      );
      expect(texto(ahora - 1 * minuto), 'Se cierra en 23 h');
    });

    test('con menos de una hora, en minutos', () {
      expect(texto(ahora - ventana + 20 * minuto), 'Se cierra en 20 min');
      expect(
        texto(ahora - ventana + 59 * minuto + 59999),
        'Se cierra en 59 min',
      );
    });

    test('justo 60 min ya se dice en horas', () {
      expect(texto(ahora - ventana + 60 * minuto), 'Se cierra en 1 h');
    });

    test('nunca dice «0 min»: lo que queda de un minuto se redondea a 1', () {
      expect(texto(ahora - ventana + 30000), 'Se cierra en 1 min');
      expect(texto(ahora - ventana + 1), 'Se cierra en 1 min');
    });

    test(
      'a las 24 h exactas todavía está abierta, así que no dice «cerrada»',
      () {
        expect(texto(ahora - ventana), 'Se cierra en 1 min');
      },
    );

    test('pasadas las 24 h: «Cerrada · solo aclaraciones»', () {
      expect(texto(ahora - ventana - 1), 'Cerrada · solo aclaraciones');
      expect(texto(ahora - 30 * 24 * hora), 'Cerrada · solo aclaraciones');
    });

    test('el texto y estaAbierta nunca se contradicen', () {
      final desfases = <int>[
        for (var m = -3; m <= 3; m++) ventana + m,
        ventana - hora,
        ventana - minuto,
        ventana + minuto,
        0,
        hora,
        -hora,
      ];
      for (final d in desfases) {
        final registrada = ahora - d;
        final abierta = estaAbierta(registradaEn: registrada, ahoraMs: ahora);
        final t = texto(registrada);
        expect(
          abierta,
          t.startsWith('Se cierra en'),
          reason: 'desfase $d ms: abierta=$abierta pero el texto dice «$t»',
        );
      }
    });
  });

  group('puedeVerBitacora', () {
    test('la ven todos menos compras y almacén', () {
      for (final rol in [
        null,
        'admin',
        'supervisor',
        'residente',
        'colaborador',
        'contador',
      ]) {
        expect(puedeVerBitacora(rol), isTrue, reason: '$rol');
      }
      expect(puedeVerBitacora('compras'), isFalse);
      expect(puedeVerBitacora('almacen'), isFalse);
    });

    test('un rol que esta versión no conoce la ve (el servidor decide)', () {
      expect(puedeVerBitacora('auditor'), isTrue);
      expect(puedeVerBitacora(''), isTrue);
    });
  });

  group('puedeCapturar', () {
    test('capturan sin cuenta, admin, supervisor, residente y colaborador', () {
      for (final rol in [
        null,
        'admin',
        'supervisor',
        'residente',
        'colaborador',
      ]) {
        expect(puedeCapturar(rol), isTrue, reason: '$rol');
      }
    });

    test(
      'el contador solo lee; compras, almacén y desconocidos no capturan',
      () {
        for (final rol in ['contador', 'compras', 'almacen', 'auditor', '']) {
          expect(puedeCapturar(rol), isFalse, reason: '«$rol»');
        }
      },
    );

    test('es sensible a mayúsculas: el servidor manda roles en minúscula', () {
      expect(puedeCapturar('Admin'), isFalse);
    });
  });

  group('puedeAclarar', () {
    test('aclaran sin cuenta, admin, supervisor y residente', () {
      for (final rol in [null, 'admin', 'supervisor', 'residente']) {
        expect(puedeAclarar(rol), isTrue, reason: '$rol');
      }
    });

    test('el colaborador captura pero NO aclara; los demás tampoco', () {
      for (final rol in [
        'colaborador',
        'contador',
        'compras',
        'almacen',
        'auditor',
        '',
      ]) {
        expect(puedeAclarar(rol), isFalse, reason: '«$rol»');
      }
    });
  });

  group('puedeEditarEntrada', () {
    bool editar({
      required String? rol,
      String? autorId = 'ana',
      String? miUid = 'ana',
      bool abierta = true,
      bool confirmada = true,
    }) => puedeEditarEntrada(
      rol: rol,
      autorId: autorId,
      miUid: miUid,
      abierta: abierta,
      confirmadaEnServidor: confirmada,
    );

    test('cerrada no la edita nadie, ni el admin ni sin cuenta', () {
      for (final rol in [
        null,
        'admin',
        'supervisor',
        'residente',
        'colaborador',
      ]) {
        expect(
          editar(rol: rol, abierta: false, confirmada: false),
          isFalse,
          reason: '$rol',
        );
        expect(editar(rol: rol, abierta: false), isFalse, reason: '$rol');
      }
    });

    test('sin cuenta en la nube y admin: cualquiera, de cualquier autor', () {
      expect(editar(rol: null, autorId: 'otro'), isTrue);
      expect(editar(rol: null, autorId: null, miUid: null), isTrue);
      expect(editar(rol: 'admin', autorId: 'otro'), isTrue);
      expect(editar(rol: 'admin', autorId: 'otro', confirmada: false), isTrue);
    });

    for (final rol in ['supervisor', 'residente']) {
      group(rol, () {
        test('edita la suya', () {
          expect(editar(rol: rol, autorId: 'ana', miUid: 'ana'), isTrue);
        });

        test('no edita la de otro', () {
          expect(editar(rol: rol, autorId: 'beto', miUid: 'ana'), isFalse);
        });

        test('edita la creada en este teléfono que aún no sube', () {
          expect(
            editar(rol: rol, autorId: null, miUid: 'ana', confirmada: false),
            isTrue,
          );
          expect(
            editar(rol: rol, autorId: '', miUid: 'ana', confirmada: false),
            isTrue,
          );
          // Aunque todavía no sepa quién soy: lo no subido es de quien la hizo.
          expect(
            editar(rol: rol, autorId: null, miUid: null, confirmada: false),
            isTrue,
          );
        });

        test('un autor_id nulo o vacío que VIENE del servidor no es «mío»', () {
          // Una fila confirmada sin autor (dato raro) no se vuelve de quien
          // la mira: solo lo no subido se da por propio.
          expect(
            editar(rol: rol, autorId: null, miUid: 'ana', confirmada: true),
            isFalse,
          );
          expect(
            editar(rol: rol, autorId: '', miUid: 'ana', confirmada: true),
            isFalse,
          );
          expect(
            editar(rol: rol, autorId: null, miUid: null, confirmada: true),
            isFalse,
          );
          expect(
            editar(rol: rol, autorId: '', miUid: '', confirmada: true),
            isFalse,
          );
        });

        test('sin saber quién soy no edita la de un autor concreto', () {
          expect(editar(rol: rol, autorId: 'ana', miUid: null), isFalse);
          expect(editar(rol: rol, autorId: 'ana', miUid: ''), isFalse);
        });

        test('compara el uid sin distinguir mayúsculas', () {
          expect(
            editar(
              rol: rol,
              autorId: '3F2A0B1C-0000-4000-8000-000000000001',
              miUid: '3f2a0b1c-0000-4000-8000-000000000001',
            ),
            isTrue,
          );
        });
      });
    }

    group('colaborador (su RLS no tiene UPDATE)', () {
      test('edita la que aún no subió', () {
        expect(
          editar(rol: 'colaborador', autorId: null, confirmada: false),
          isTrue,
        );
      });

      test('no edita la que el servidor ya confirmó, ni siendo suya', () {
        expect(
          editar(
            rol: 'colaborador',
            autorId: 'ana',
            miUid: 'ana',
            confirmada: true,
          ),
          isFalse,
        );
      });
    });

    test('contador, compras, almacén y roles desconocidos no editan', () {
      for (final rol in ['contador', 'compras', 'almacen', 'auditor', '']) {
        expect(editar(rol: rol), isFalse, reason: '«$rol»');
        expect(editar(rol: rol, confirmada: false), isFalse, reason: '«$rol»');
      }
    });
  });

  group('puedePublicarAlCliente', () {
    bool publicar({
      required String? rol,
      String? autorId = 'ana',
      String? miUid = 'ana',
      bool confirmada = true,
    }) => puedePublicarAlCliente(
      rol: rol,
      autorId: autorId,
      miUid: miUid,
      confirmadaEnServidor: confirmada,
    );

    test('exige que el servidor ya la tenga, para cualquier rol', () {
      for (final rol in [null, 'admin', 'supervisor', 'residente']) {
        expect(publicar(rol: rol, confirmada: false), isFalse, reason: '$rol');
      }
    });

    test('sin cuenta y admin publican cualquiera', () {
      expect(publicar(rol: null, autorId: 'otro'), isTrue);
      expect(publicar(rol: 'admin', autorId: 'otro'), isTrue);
    });

    test('supervisor y residente, solo las suyas', () {
      for (final rol in ['supervisor', 'residente']) {
        expect(publicar(rol: rol, autorId: 'ana', miUid: 'ana'), isTrue);
        expect(publicar(rol: rol, autorId: 'beto', miUid: 'ana'), isFalse);
      }
    });

    test('un autor desconocido NO cuenta como «soy yo»', () {
      // Sin esto, null == null daría permiso a quien no es el autor.
      for (final rol in ['supervisor', 'residente']) {
        expect(publicar(rol: rol, autorId: null, miUid: null), isFalse);
        expect(publicar(rol: rol, autorId: '', miUid: ''), isFalse);
        expect(publicar(rol: rol, autorId: null, miUid: 'ana'), isFalse);
      }
    });

    test(
      'el colaborador NUNCA publica, ni su propia entrada ya confirmada',
      () {
        expect(
          publicar(
            rol: 'colaborador',
            autorId: 'ana',
            miUid: 'ana',
            confirmada: true,
          ),
          isFalse,
        );
        expect(publicar(rol: 'colaborador', confirmada: false), isFalse);
      },
    );

    test('el colaborador, el contador y los desconocidos no publican', () {
      for (final rol in [
        'colaborador',
        'contador',
        'compras',
        'almacen',
        'auditor',
        '',
      ]) {
        expect(publicar(rol: rol), isFalse, reason: '«$rol»');
      }
    });
  });

  group('puedeAgregarFotos', () {
    bool fotos({
      required String? rol,
      required int vivas,
      String? autorId = 'ana',
      String? miUid = 'ana',
      bool abierta = true,
      bool confirmada = true,
    }) => puedeAgregarFotos(
      rol: rol,
      autorId: autorId,
      miUid: miUid,
      abierta: abierta,
      confirmadaEnServidor: confirmada,
      fotosVivas: vivas,
    );

    test('con lugar y permiso para editar, sí', () {
      expect(fotos(rol: 'admin', vivas: 0), isTrue);
      expect(fotos(rol: 'supervisor', vivas: 9), isTrue);
    });

    test('con 10 fotos vivas ya no (el trigger rechaza la 11)', () {
      expect(fotos(rol: 'admin', vivas: 10), isFalse);
      expect(fotos(rol: 'admin', vivas: 11), isFalse);
    });

    test('cerrada o sin permiso para editar, no, aunque haya lugar', () {
      expect(fotos(rol: 'admin', vivas: 0, abierta: false), isFalse);
      expect(fotos(rol: 'supervisor', vivas: 0, autorId: 'beto'), isFalse);
      expect(fotos(rol: 'contador', vivas: 0), isFalse);
    });

    test('el colaborador solo en lo que aún no subió', () {
      expect(fotos(rol: 'colaborador', vivas: 2, confirmada: false), isTrue);
      expect(fotos(rol: 'colaborador', vivas: 2, confirmada: true), isFalse);
    });

    test('supervisor y residente: lo no subido sí; un autor nulo del servidor '
        'no', () {
      for (final rol in ['supervisor', 'residente']) {
        expect(
          fotos(rol: rol, vivas: 1, autorId: null, confirmada: false),
          isTrue,
          reason: rol,
        );
        expect(
          fotos(rol: rol, vivas: 1, autorId: null, confirmada: true),
          isFalse,
          reason: rol,
        );
        expect(
          fotos(rol: rol, vivas: 1, autorId: '', confirmada: true),
          isFalse,
          reason: rol,
        );
      }
    });
  });

  group('medianocheMexicoMs', () {
    // Valores sacados de `medianocheMx` de la web (`web/src/lib/data/tz.ts`) con
    // la misma zona America/Mexico_City.
    test('2026-10-06 es el mismo instante que da la web (06:00 UTC)', () {
      expect(medianocheMexicoMs(DateTime(2026, 10, 6)), 1791266400000);
      expect(
        medianocheMexicoMs(DateTime(2026, 10, 6)),
        DateTime.utc(2026, 10, 6, 6).millisecondsSinceEpoch,
      );
    });

    test(
      'otros días de la web: fin de año, bisiesto y los dos lados del 2022',
      () {
        expect(medianocheMexicoMs(DateTime(2026, 1, 1)), 1767247200000);
        expect(medianocheMexicoMs(DateTime(2026, 12, 31)), 1798696800000);
        expect(medianocheMexicoMs(DateTime(2024, 2, 29)), 1709186400000);
        // La web usa la base de zonas horarias real: México tuvo horario de
        // verano hasta el 30-oct-2022 (medianoche = 05:00 UTC ese día) y desde
        // el 31 ya no (06:00 UTC). Un -6 fijo daría 1 h de error antes de eso.
        expect(medianocheMexicoMs(DateTime(2022, 7, 1)), 1656651600000);
        expect(medianocheMexicoMs(DateTime(2022, 10, 30)), 1667106000000);
        expect(medianocheMexicoMs(DateTime(2022, 10, 31)), 1667196000000);
      },
    );

    test('la hora del DateTime no cuenta: 23:59 da la misma medianoche que '
        '00:00', () {
      final inicio = medianocheMexicoMs(DateTime(2026, 10, 6));
      expect(medianocheMexicoMs(DateTime(2026, 10, 6, 0, 0)), inicio);
      expect(medianocheMexicoMs(DateTime(2026, 10, 6, 12, 30)), inicio);
      expect(
        medianocheMexicoMs(DateTime(2026, 10, 6, 23, 59, 59, 999)),
        inicio,
      );
    });

    test('la zona del DateTime no cuenta: se lee su año/mes/día tal cual', () {
      final inicio = medianocheMexicoMs(DateTime(2026, 10, 6));
      // Un DateTime en UTC a las 23:00 del 6-oct sigue siendo «el día 6».
      expect(medianocheMexicoMs(DateTime.utc(2026, 10, 6, 23)), inicio);
      expect(medianocheMexicoMs(DateTime.utc(2026, 10, 6)), inicio);
    });

    test('días consecutivos distan 24 h (México ya no cambia la hora)', () {
      final a = medianocheMexicoMs(DateTime(2026, 10, 6));
      final b = medianocheMexicoMs(DateTime(2026, 10, 7));
      expect(b - a, 24 * hora);
      // Cambio de mes y de año.
      expect(
        medianocheMexicoMs(DateTime(2027, 1, 1)) -
            medianocheMexicoMs(DateTime(2026, 12, 31)),
        24 * hora,
      );
    });

    test('es el PRIMER instante del día en México: un ms antes ya es el día '
        'anterior', () {
      final ms = medianocheMexicoMs(DateTime(2026, 10, 6));
      expect(fechaMxDe(ms), (year: 2026, month: 10, day: 6));
      expect(fechaMxDe(ms - 1), (year: 2026, month: 10, day: 5));
    });
  });

  group('limpiarNombres', () {
    test('quita espacios y descarta vacíos', () {
      expect(limpiarNombres([' Beto ', '', '   ', '\t', 'Martín']), [
        'Beto',
        'Martín',
      ]);
    });

    test('lista vacía → vacía', () {
      expect(limpiarNombres(const []), isEmpty);
    });

    test(
      'quita duplicados sin distinguir mayúsculas y se queda con el primero',
      () {
        expect(limpiarNombres([' Beto ', '', 'beto', 'Martín']), [
          'Beto',
          'Martín',
        ]);
        expect(limpiarNombres(['ENRIQUE', 'Enrique', 'enrique']), ['ENRIQUE']);
      },
    );

    test('mayúsculas con acento también se igualan (Ñ/ñ, É/é)', () {
      expect(limpiarNombres(['PEÑA', 'peña', 'Peña']), ['PEÑA']);
      expect(limpiarNombres(['JOSÉ', 'josé']), ['JOSÉ']);
    });

    test(
      'como la web, el acento SÍ distingue: José y Jose son dos nombres',
      () {
        expect(limpiarNombres(['José', 'Jose']), ['José', 'Jose']);
      },
    );

    test('el duplicado se detecta después de recortar espacios', () {
      expect(limpiarNombres(['Ana', '  ANA  ']), ['Ana']);
    });

    test('conserva el orden de captura', () {
      expect(limpiarNombres(['Zoe', 'Ana', 'Mario']), ['Zoe', 'Ana', 'Mario']);
    });

    test('corta cada nombre a 120 caracteres', () {
      final largo = 'a' * 200;
      final r = limpiarNombres([largo]);
      expect(r.single.length, 120);
      expect(r.single, 'a' * 120);
    });

    test('120 exactos se respetan; dos nombres que solo difieren después del '
        'corte quedan como uno', () {
      final base = 'b' * 120;
      expect(limpiarNombres([base]).single, base);
      expect(limpiarNombres(['${base}X', '${base}Y']), [base]);
    });

    test('un emoji que cae en el borde del corte no deja media letra', () {
      // 119 letras + 😀 (2 unidades UTF-16): el corte a 120 partiría el emoji.
      final r = limpiarNombres(['${'c' * 119}😀']).single;
      expect(r, 'c' * 119);
      // Cadena bien formada: se puede codificar sin sustituciones.
      expect(r.codeUnits.every((u) => u < 0xD800 || u > 0xDFFF), isTrue);
    });

    test('un emoji entero dentro del límite se conserva', () {
      expect(limpiarNombres(['Ana 😀']), ['Ana 😀']);
      expect(limpiarNombres(['${'c' * 118}😀']).single.length, 120);
    });

    test('caracteres especiales (SQL, comillas, JSON) pasan tal cual', () {
      const raros = ["O'Brien", 'Ana "la jefa"', "x'; drop table a;--", r'a\b'];
      expect(limpiarNombres(raros), raros);
    });

    test('máximo 500 nombres', () {
      final muchos = [for (var i = 0; i < 10000; i++) 'Persona $i'];
      final r = limpiarNombres(muchos);
      expect(r.length, 500);
      expect(r.first, 'Persona 0');
      expect(r.last, 'Persona 499');
    });

    test(
      'el tope de 500 cuenta los nombres que SÍ entran, no los descartados',
      () {
        final entrada = <String>[
          for (var i = 0; i < 600; i++) ...['', 'Persona $i'],
        ];
        expect(limpiarNombres(entrada).length, 500);
      },
    );

    test('con un flujo infinito se detiene en 500 (no lo consume entero)', () {
      Iterable<String> sinFin() sync* {
        var i = 0;
        while (true) {
          yield 'N${i++}';
        }
      }

      expect(limpiarNombres(sinFin()).length, 500);
    });

    test('no modifica la lista original', () {
      final original = [' Beto ', 'beto'];
      limpiarNombres(original);
      expect(original, [' Beto ', 'beto']);
    });
  });

  group('validarTexto', () {
    test('un texto normal es válido', () {
      expect(validarTexto('Se coló la losa del cuarto 2'), isNull);
    });

    test('vacío o solo espacios: pide escribir', () {
      for (final t in ['', '   ', '\n\t ']) {
        final m = validarTexto(t);
        expect(m, isNotNull, reason: '«$t»');
        expect(m, contains('Escribe'));
      }
    });

    test('5000 letras exactas pasan; 5001 no', () {
      expect(validarTexto('a' * maxLargoTexto), isNull);
      final m = validarTexto('a' * (maxLargoTexto + 1));
      expect(m, isNotNull);
      expect(m, contains('5000'));
    });

    test(
      'mide el texto ya recortado (los espacios de las orillas no cuentan)',
      () {
        expect(validarTexto('  ${'a' * maxLargoTexto}  '), isNull);
      },
    );

    test('emojis y acentos cuentan como texto, no como error', () {
      expect(validarTexto('Llovió 🌧️ en la obra, cimentación ñandú'), isNull);
    });
  });

  group('validarAclaracion', () {
    test('mismo límite que el texto, con su propio mensaje', () {
      expect(validarAclaracion('Fueron 3 m³, no 4'), isNull);
      expect(validarAclaracion('  '), contains('aclaración'));
      expect(validarAclaracion('a' * maxLargoTexto), isNull);
      expect(validarAclaracion('a' * (maxLargoTexto + 1)), contains('5000'));
    });
  });

  group('validarPersonal', () {
    test('null (no se anotó) es válido', () {
      expect(validarPersonal(null), isNull);
    });

    test('0 y 10000 son los extremos válidos', () {
      expect(validarPersonal(0), isNull);
      expect(validarPersonal(1), isNull);
      expect(validarPersonal(maxPersonal), isNull);
    });

    test('fuera de rango: mensaje', () {
      expect(validarPersonal(-1), isNotNull);
      expect(validarPersonal(maxPersonal + 1), isNotNull);
      expect(validarPersonal(-1), contains('personas'));
    });
  });

  group('nombresAJson / nombresDesdeJson', () {
    test('ida y vuelta', () {
      const nombres = ['Ana', 'Beto', 'José Luis'];
      expect(nombresDesdeJson(nombresAJson(nombres)), nombres);
    });

    test('la lista vacía viaja como «[]»', () {
      expect(nombresAJson(const []), '[]');
      expect(nombresDesdeJson('[]'), isEmpty);
    });

    test(
      'es un arreglo JSON de verdad (lo que el sync convierte a text[])',
      () {
        expect(nombresAJson(['Ana', 'Beto']), '["Ana","Beto"]');
      },
    );

    test('comillas, barras, saltos de línea, acentos y emojis sobreviven', () {
      const raros = [
        'Ana "la jefa"',
        r'a\b',
        'línea\nnueva',
        'Ñandú',
        '😀 Beto',
      ];
      expect(nombresDesdeJson(nombresAJson(raros)), raros);
    });

    test('tolerante: null, vacío y espacios dan lista vacía', () {
      expect(nombresDesdeJson(null), isEmpty);
      expect(nombresDesdeJson(''), isEmpty);
      expect(nombresDesdeJson('   '), isEmpty);
    });

    test('tolerante: basura que no es JSON da lista vacía, sin lanzar', () {
      for (final basura in [
        'esto no es json',
        '[',
        '["Ana"',
        '{"a":',
        '{Ana,Beto}',
        '\u0000',
      ]) {
        expect(nombresDesdeJson(basura), isEmpty, reason: basura);
      }
    });

    test('tolerante: JSON que no es una lista da lista vacía', () {
      for (final j in ['{"a":1}', '"Ana"', '42', 'true', 'null']) {
        expect(nombresDesdeJson(j), isEmpty, reason: j);
      }
    });

    test('descarta los elementos que no son texto y conserva el resto', () {
      expect(
        nombresDesdeJson('["Ana", 3, null, {"x":1}, ["y"], true, "Beto", 1.5]'),
        ['Ana', 'Beto'],
      );
    });

    test(
      'la lista devuelta se puede modificar (no es una vista congelada)',
      () {
        final r = nombresDesdeJson('["Ana"]');
        r.add('Beto');
        expect(r, ['Ana', 'Beto']);
      },
    );

    test('500 nombres viajan completos', () {
      final nombres = [for (var i = 0; i < 500; i++) 'Persona $i'];
      expect(nombresDesdeJson(nombresAJson(nombres)), nombres);
    });
  });

  group('clasificarRechazo', () {
    // Mensajes tal cual los lanza PostgREST: el `message` es el texto del
    // `raise exception` de la migración 0041, con errcode P0001.
    test('BITACORA_CERRADA de la entrada', () {
      expect(
        clasificarRechazo(code: 'P0001', message: _msgCerradaEntrada),
        RechazoBitacora.cerrada,
      );
    });

    test('BITACORA_CERRADA de las fotos', () {
      expect(
        clasificarRechazo(code: 'P0001', message: _msgCerradaFoto),
        RechazoBitacora.cerrada,
      );
    });

    test('BITACORA_MAX_FOTOS', () {
      expect(
        clasificarRechazo(code: 'P0001', message: _msgMaxFotos),
        RechazoBitacora.maxFotos,
      );
    });

    test('EVIDENCIA_INMUTABLE (con el nombre de la tabla en lugar del %)', () {
      expect(
        clasificarRechazo(
          code: 'P0001',
          message:
              'EVIDENCIA_INMUTABLE: un registro de bitacora_entrada que '
              'ya es evidencia no se borra (usa el borrado lógico o '
              'cancélalo).',
        ),
        RechazoBitacora.evidencia,
      );
    });

    test('la etiqueta se reconoce aunque falte el código o venga envuelta', () {
      expect(
        clasificarRechazo(message: _msgCerradaEntrada),
        RechazoBitacora.cerrada,
      );
      expect(
        clasificarRechazo(
          code: 'P0001',
          message: 'PostgrestException(message: $_msgMaxFotos)',
        ),
        RechazoBitacora.maxFotos,
      );
    });

    test('RLS de una tabla: código 42501', () {
      expect(
        clasificarRechazo(
          code: '42501',
          message:
              'new row violates row-level security policy for table '
              '"bitacora_entrada"',
        ),
        RechazoBitacora.sinPermiso,
      );
    });

    test('solo el código 42501, con cualquier mensaje', () {
      expect(
        clasificarRechazo(code: '42501', message: 'permission denied'),
        RechazoBitacora.sinPermiso,
      );
      expect(
        clasificarRechazo(code: '42501', message: ''),
        RechazoBitacora.sinPermiso,
      );
    });

    test('RLS de Storage: sin código Postgres, por el texto', () {
      expect(
        clasificarRechazo(
          code: '403',
          message: 'new row violates row-level security policy',
        ),
        RechazoBitacora.sinPermiso,
      );
      expect(
        clasificarRechazo(
          message: 'New Row Violates ROW-LEVEL SECURITY policy',
        ),
        RechazoBitacora.sinPermiso,
      );
    });

    test(
      'si el mensaje trae la etiqueta del trigger, esa manda sobre el código',
      () {
        expect(
          clasificarRechazo(code: '42501', message: _msgCerradaEntrada),
          RechazoBitacora.cerrada,
        );
      },
    );

    test('lo transitorio NO es un rechazo: red, timeout, servidor caído', () {
      for (final (code, msg) in <(String?, String)>[
        (null, 'SocketException: Failed host lookup: ...'),
        (null, 'ClientException: Connection closed before full header'),
        (null, 'TimeoutException after 0:00:30.000000: Future not completed'),
        ('503', 'Service Unavailable'),
        ('PGRST301', 'JWT expired'),
        ('57014', 'canceling statement due to statement timeout'),
        ('23505', 'duplicate key value violates unique constraint'),
        (null, ''),
        (null, 'algo que nadie esperaba'),
      ]) {
        expect(
          clasificarRechazo(code: code, message: msg),
          isNull,
          reason: '$code $msg',
        );
      }
    });

    test('«permission denied» suelto (p. ej. el sistema operativo sin red) no '
        'se toma por falta de permiso en la bitácora', () {
      expect(
        clasificarRechazo(
          message:
              'SocketException: Connection failed (OS Error: Permission '
              'denied, errno = 13)',
        ),
        isNull,
      );
    });
  });

  group('explicarRechazo', () {
    test('cada rechazo tiene su texto, corto y distinto', () {
      final textos = {
        for (final r in RechazoBitacora.values) r: explicarRechazo(r),
      };
      expect(textos.length, RechazoBitacora.values.length);
      expect(textos.values.toSet().length, RechazoBitacora.values.length);
      for (final t in textos.values) {
        expect(t.trim(), isNotEmpty);
        expect(t.length, lessThan(160), reason: t);
      }
    });

    test('cerrada: dice que pasaron 24 h y manda a la aclaración', () {
      expect(
        explicarRechazo(RechazoBitacora.cerrada),
        'La entrada ya cerró (pasaron 24 h desde que llegó). '
        'Agrégalo como aclaración.',
      );
    });

    test('maxFotos: dice el máximo', () {
      expect(explicarRechazo(RechazoBitacora.maxFotos), contains('10'));
    });

    test('sinPermiso: habla de permiso', () {
      expect(explicarRechazo(RechazoBitacora.sinPermiso), contains('permiso'));
    });

    test('evidencia: explica que no se borra', () {
      expect(explicarRechazo(RechazoBitacora.evidencia), contains('evidencia'));
    });

    test('el texto de cerrada sigue la constante de horas', () {
      expect(
        explicarRechazo(RechazoBitacora.cerrada),
        contains('$horasAbierta h'),
      );
    });
  });
}

// Textos de las excepciones de 0041, para las pruebas del espejo (que verifican
// que siguen en la migración) y las de clasificarRechazo (que los usan).
const _msgCerradaEntrada =
    'BITACORA_CERRADA: la entrada ya no se puede '
    'cambiar (pasaron 24 horas). Agrega una aclaración.';
const _msgCerradaFoto =
    'BITACORA_CERRADA: la entrada ya no acepta cambios en '
    'sus fotos (pasaron 24 horas).';
const _msgMaxFotos = 'BITACORA_MAX_FOTOS: una entrada lleva máximo 10 fotos.';
