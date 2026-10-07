import 'dart:convert';
import 'dart:io';

import 'package:constructorpro/core/modulos/modulos.dart';
import 'package:flutter_test/flutter_test.dart';

/// El catálogo de módulos del móvil es un ESPEJO: la web
/// (`web/src/lib/modulos.ts`) y la base (`0035_modulos_empresa.sql`) mandan.
/// Estas pruebas leen esos dos archivos y fallan si el móvil se queda con otra
/// lista, otras dependencias u otros nombres — el dueño tiene que leer lo mismo
/// en el celular que en la web.
void main() {
  group('espejo de la web y de la base', () {
    final sql =
        File('supabase/migrations/0035_modulos_empresa.sql').readAsStringSync();
    final ts = File('web/src/lib/modulos.ts').readAsStringSync();

    String entre(String texto, String desde, String hasta) {
      final i = texto.indexOf(desde);
      expect(i, isNonNegative, reason: 'no se encontró "$desde"');
      final j = texto.indexOf(hasta, i);
      return texto.substring(i, j);
    }

    test('mismas claves y en el mismo orden que modulos_catalogo()', () {
      final bloque = entre(sql, 'function public.modulos_catalogo()', r'$$;');
      final claves = RegExp(r"'(\w+)'")
          .allMatches(bloque.substring(bloque.indexOf('array[')))
          .map((m) => m.group(1))
          .toList();
      expect(ClaveModulo.values.map((c) => c.name).toList(), claves);
    });

    test('mismas dependencias que modulos_dependencias()', () {
      final bloque =
          entre(sql, 'function public.modulos_dependencias()', "'::jsonb");
      final deps = (json.decode(bloque.substring(bloque.indexOf("'{") + 1))
              as Map<String, dynamic>)
          .map((k, v) => MapEntry(k, List<String>.from(v as List)..sort()));
      final nuestras = {
        for (final m in catalogoModulos)
          if (m.dependeDe.isNotEmpty)
            m.clave.name: (m.dependeDe.map((c) => c.name).toList()..sort()),
      };
      expect(nuestras, deps);
    });

    test('mismos nombres y descripciones que la web', () {
      final web = {
        for (final m in RegExp(
          r"clave: '(\w+)',\s*nombre:\s*'([^']*)',\s*descripcion:\s*'([^']*)'",
        ).allMatches(ts))
          m.group(1)!: (m.group(2)!, m.group(3)!),
      };
      expect(web.keys.toSet(), ClaveModulo.values.map((c) => c.name).toSet());
      for (final m in catalogoModulos) {
        expect((m.nombre, m.descripcion), web[m.clave.name],
            reason: 'el módulo ${m.clave.name} dice otra cosa en la web');
      }
    });

    test('el paquete por defecto es el PAQUETE_POR_DEFECTO de la web', () {
      final bloque = entre(ts, 'PAQUETE_POR_DEFECTO', '];');
      final claves = RegExp(r"'(\w+)'")
          .allMatches(bloque)
          .map((m) => m.group(1))
          .toSet();
      expect(paquetePorDefecto.map((c) => c.name).toSet(), claves);
    });
  });

  group('catálogo', () {
    test('cada clave tiene su módulo, una sola vez', () {
      expect(catalogoModulos.map((m) => m.clave).toSet(),
          ClaveModulo.values.toSet());
      expect(catalogoModulos.length, ClaveModulo.values.length);
    });

    test('el móvil implementa lo que ya existía más la bitácora, sin el portal',
        () {
      final implementados = {
        for (final m in catalogoModulos)
          if (m.implementadoEnMovil) m.clave,
      };
      expect(implementados, {
        ClaveModulo.obras,
        ClaveModulo.cotizaciones,
        ClaveModulo.equipo,
        ClaveModulo.cuadrillas,
        ClaveModulo.caja,
        ClaveModulo.proyeccion,
        ClaveModulo.notas,
        // Fase 1 de la paridad (docs/PLAN_BITACORA_MOVIL.md).
        ClaveModulo.bitacora,
      });
      expect(moduloDe(ClaveModulo.portal).aplicaEnMovil, isFalse);
    });
  });

  group('resolverDependencias', () {
    test('siempre agrega obras', () {
      expect(resolverDependencias(const []), {ClaveModulo.obras});
    });

    test('cuadrillas y proyección traen equipo', () {
      expect(
        resolverDependencias(const [ClaveModulo.cuadrillas]),
        {ClaveModulo.obras, ClaveModulo.cuadrillas, ClaveModulo.equipo},
      );
      expect(resolverDependencias(const [ClaveModulo.proyeccion]),
          contains(ClaveModulo.equipo));
    });

    test('subcontratos trae notas; estimaciones trae cotizaciones', () {
      expect(resolverDependencias(const [ClaveModulo.subcontratos]),
          contains(ClaveModulo.notas));
      expect(resolverDependencias(const [ClaveModulo.estimaciones]),
          contains(ClaveModulo.cotizaciones));
    });
  });

  group('normalizarModulos', () {
    test('sin lista (null, columna ausente, basura) = paquete por defecto', () {
      expect(normalizarModulos(null), paquetePorDefecto);
      expect(normalizarModulos('obras'), paquetePorDefecto);
      expect(normalizarModulos({'a': 1}), paquetePorDefecto);
    });

    test('ignora claves que esta versión no conoce', () {
      expect(normalizarModulos(['obras', 'teletransporte', 3, null]),
          {ClaveModulo.obras});
    });

    test('resuelve dependencias de lo que llega', () {
      expect(normalizarModulos(['cuadrillas']),
          {ClaveModulo.obras, ClaveModulo.cuadrillas, ClaveModulo.equipo});
    });

    test('una lista vacía no deja a la empresa sin núcleo', () {
      expect(normalizarModulos(const []), {ClaveModulo.obras});
    });
  });

  group('ModulosActivos', () {
    test('usa: el núcleo siempre, lo demás si está prendido', () {
      const m = ModulosActivos({ClaveModulo.cotizaciones}, FuenteModulos.cache);
      expect(m.usa(ClaveModulo.obras), isTrue);
      expect(m.usa(ClaveModulo.cotizaciones), isTrue);
      expect(m.usa(ClaveModulo.caja), isFalse);
    });

    test('por defecto se ve todo lo del paquete de siempre que el móvil tiene',
        () {
      for (final m in catalogoModulos.where(
          (m) => m.implementadoEnMovil && paquetePorDefecto.contains(m.clave))) {
        expect(ModulosActivos.porDefecto.usa(m.clave), isTrue,
            reason: m.clave.name);
      }
      // La bitácora NO viene en el paquete por defecto (tampoco en la web): la
      // prende el dueño en Ajustes → Módulos.
      expect(ModulosActivos.porDefecto.usa(ClaveModulo.bitacora), isFalse);
      // Y no se anuncia nada "en la web": el portal no aplica.
      expect(ModulosActivos.porDefecto.soloEnLaWeb, isEmpty);
    });

    test('con la bitácora prendida se usa y ya no se anuncia "en la web"', () {
      final m = ModulosActivos(
        normalizarModulos(['bitacora', 'programa']),
        FuenteModulos.servidor,
      );
      expect(m.usa(ClaveModulo.bitacora), isTrue);
      expect(m.soloEnLaWeb.map((x) => x.clave).toList(),
          [ClaveModulo.programa]);
    });

    test('soloEnLaWeb: prendidos, sin pantalla en el móvil, en orden', () {
      final m = ModulosActivos(
        normalizarModulos(['fiscal', 'cambios', 'portal', 'caja', 'compras']),
        FuenteModulos.servidor,
      );
      expect(m.soloEnLaWeb.map((x) => x.clave).toList(), [
        ClaveModulo.cambios,
        ClaveModulo.fiscal,
        ClaveModulo.compras,
      ]);
    });

    test('igualdad por contenido, sin importar el orden', () {
      expect(
        const ModulosActivos(
            {ClaveModulo.obras, ClaveModulo.caja}, FuenteModulos.cache),
        const ModulosActivos(
            {ClaveModulo.caja, ClaveModulo.obras}, FuenteModulos.cache),
      );
      expect(
        const ModulosActivos({ClaveModulo.obras}, FuenteModulos.cache) ==
            const ModulosActivos({ClaveModulo.obras}, FuenteModulos.servidor),
        isFalse,
      );
    });
  });
}
