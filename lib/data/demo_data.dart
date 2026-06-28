import 'dart:math';

import 'package:drift/drift.dart';
import 'package:uuid/uuid.dart';

import '../core/db/app_database.dart';
import '../core/format/format.dart';

/// Genera datos de prueba COMPLETOS y realistas: ~6 meses (26 semanas) de
/// operación para TODOS los módulos. Reemplaza los datos operativos actuales
/// (conserva el catálogo de conceptos) y siembra obras escalonadas en el tiempo,
/// equipo, asistencias semana a semana, destajos, flujo de caja y cotizaciones.
///
/// Incluye escenarios que muestran las funciones recientes:
/// - un trabajador que CAMBIA de obra a mitad del periodo (Pedro: Casa Brest →
///   Plaza San Ángel), con baja lógica en la anterior e historial intacto;
/// - días sueltos trabajados en OTRA obra (Juan tiene un día en TechNova) para
///   ver la distinción multi-obra en la asistencia semanal.
///
/// Determinista: usa una semilla fija para que el demo sea reproducible.
class DemoData {
  static const _uuid = Uuid();
  static const _semanas = 26; // ~6 meses

  static Future<bool> generar(AppDatabase db) async {
    final rnd = Random(7);
    final lunesActual = Semana.inicioSemana(DateTime.now());

    // Lunes de la semana cronológica w (0 = la más antigua, 25 = la actual).
    int lunesDe(int w) => DateTime.fromMillisecondsSinceEpoch(lunesActual)
        .subtract(Duration(days: (_semanas - 1 - w) * 7))
        .millisecondsSinceEpoch;
    int diaDe(int w, int offset) =>
        DateTime.fromMillisecondsSinceEpoch(lunesDe(w))
            .add(Duration(days: offset))
            .millisecondsSinceEpoch;

    await db.transaction(() async {
      // --- Limpieza de datos operativos (se conserva el catálogo) ---
      await db.delete(db.movimientos).go();
      await db.delete(db.pagos).go();
      await db.delete(db.partidas).go();
      await db.delete(db.secciones).go();
      await db.delete(db.asistencias).go();
      await db.delete(db.destajos).go();
      await db.delete(db.obraColaborador).go();
      await db.delete(db.cotizaciones).go();
      await db.delete(db.colaboradores).go();
      await db.delete(db.obras).go();
      await db.delete(db.puestos).go();

      // --- Puestos ---
      final puestos = <String, (String, double)>{
        'maestro': ('Maestro de obra', 800.0),
        'albanil': ('Albañil', 550.0),
        'carpintero': ('Carpintero', 600.0),
        'electricista': ('Electricista', 700.0),
        'plomero': ('Plomero', 650.0),
        'pintor': ('Pintor', 500.0),
        'herrero': ('Herrero', 600.0),
        'ayudante': ('Ayudante', 400.0),
      };
      final puestoId = {for (final k in puestos.keys) k: _uuid.v4()};
      await db.batch((b) {
        puestos.forEach((k, v) {
          b.insert(db.puestos, PuestosCompanion.insert(
              id: puestoId[k]!, nombre: v.$1, salarioDiaDefault: Value(v.$2)));
        });
      });

      // --- Colaboradores ---
      final colabs = <(String id, String nombre, String puesto, String tipo, double? custom)>[
        (_uuid.v4(), 'Juan Pérez', 'maestro', 'DIA', null),        // 0
        (_uuid.v4(), 'Pedro Ramírez', 'albanil', 'DIA', null),      // 1 (se mueve)
        (_uuid.v4(), 'Miguel Torres', 'albanil', 'DIA', 580.0),     // 2
        (_uuid.v4(), 'Carlos Sánchez', 'carpintero', 'DIA', null),  // 3
        (_uuid.v4(), 'José Gómez', 'electricista', 'DIA', null),    // 4
        (_uuid.v4(), 'Luis Hernández', 'ayudante', 'DESTAJO', null),// 5
        (_uuid.v4(), 'Roberto Díaz', 'plomero', 'DIA', null),       // 6
        (_uuid.v4(), 'Fernando Cruz', 'pintor', 'DESTAJO', null),   // 7
        (_uuid.v4(), 'Andrés Morales', 'herrero', 'DIA', null),     // 8
        (_uuid.v4(), 'Javier Reyes', 'ayudante', 'DIA', null),      // 9
        (_uuid.v4(), 'Ricardo Flores', 'albanil', 'DESTAJO', null), // 10
        (_uuid.v4(), 'Sergio Mendoza', 'ayudante', 'DIA', null),    // 11
      ];
      await db.batch((b) {
        for (final c in colabs) {
          b.insert(db.colaboradores, ColaboradoresCompanion.insert(
            id: c.$1,
            nombre: c.$2,
            puestoId: puestoId[c.$3]!,
            tipoPago: c.$4,
            salarioPersonalizado: Value(c.$5),
            telefono: Value('55-${1000 + colabs.indexOf(c) * 7}-${2000 + colabs.indexOf(c) * 13}'),
          ));
        }
      });
      double salarioDe(int i) => colabs[i].$5 ?? puestos[colabs[i].$3]!.$2;

      // --- Obras (escalonadas en el tiempo) ---
      final obraBrest = _uuid.v4();
      final obraTech = _uuid.v4();
      final obraPlaza = _uuid.v4();
      final obraPinos = _uuid.v4();
      const wTech = 6, wPlaza = 16, wPedroMueve = 14;
      await db.batch((b) {
        b.insert(db.obras, ObrasCompanion.insert(
            id: obraBrest, nombre: 'Casa Brest', cliente: const Value('Ricardo Mendoza'),
            ubicacion: const Value('Col. Brest, Monterrey'), fechaInicio: lunesDe(0)));
        b.insert(db.obras, ObrasCompanion.insert(
            id: obraTech, nombre: 'Remodelación TechNova', cliente: const Value('TechNova SA de CV'),
            ubicacion: const Value('Av. Revolución 450, CDMX'), fechaInicio: lunesDe(wTech)));
        b.insert(db.obras, ObrasCompanion.insert(
            id: obraPlaza, nombre: 'Plaza San Ángel', cliente: const Value('Grupo Inmobiliario SA'),
            ubicacion: const Value('Blvd. San Ángel 200, GDL'), fechaInicio: lunesDe(wPlaza)));
        // Los Pinos: obra ya TERMINADA (inactiva), con historial de caja.
        b.insert(db.obras, ObrasCompanion.insert(
            id: obraPinos, nombre: 'Residencial Los Pinos', cliente: const Value('Familia López'),
            ubicacion: const Value('Fracc. Los Pinos, Querétaro'),
            fechaInicio: lunesDe(0), activa: const Value(false)));
      });

      // --- Asignaciones obra↔colaborador (ventanas cronológicas) ---
      // (colabIndex, obraId, semanaInicio, semanaFin, esUltima)
      final ventanas = <(int, String, int, int)>[
        (0, obraBrest, 0, _semanas - 1),
        (1, obraBrest, 0, wPedroMueve - 1),   // Pedro en Brest (cerrada)
        (1, obraPlaza, wPedroMueve, _semanas - 1), // Pedro se mueve a Plaza
        (2, obraBrest, 0, _semanas - 1),
        (6, obraBrest, 2, _semanas - 1),
        (5, obraBrest, 0, _semanas - 1),      // Luis (destajo)
        (3, obraTech, wTech, _semanas - 1),
        (4, obraTech, wTech, _semanas - 1),
        (9, obraTech, wTech, _semanas - 1),
        (7, obraTech, wTech, _semanas - 1),   // Fernando (destajo)
        (8, obraPlaza, wPlaza, _semanas - 1),
        (11, obraPlaza, wPlaza, _semanas - 1),
        (10, obraPlaza, wPlaza, _semanas - 1),// Ricardo (destajo)
      ];
      await db.batch((b) {
        for (final v in ventanas) {
          final esCerrada = v.$4 < _semanas - 1; // ventana que terminó antes de hoy
          b.insert(db.obraColaborador, ObraColaboradorCompanion.insert(
            obraId: v.$2,
            colaboradorId: colabs[v.$1].$1,
            fechaIngreso: lunesDe(v.$3),
            fechaSalida: esCerrada ? Value(lunesDe(v.$4 + 1)) : const Value(null),
          ));
        }
      });

      // --- Asistencias + acumulación de nómina semanal por obra ---
      final asis = <AsistenciasCompanion>[];
      // nómina[obraId][semana] = monto
      final nomina = <String, Map<int, double>>{};
      void addNomina(String obra, int w, double m) =>
          (nomina[obra] ??= {})[w] = ((nomina[obra]?[w]) ?? 0) + m;

      double fracAleatoria() {
        final r = rnd.nextDouble();
        if (r < 0.08) return 0.0;   // falta
        if (r < 0.16) return 0.5;   // medio día
        if (r < 0.26) return 0.75;  // tres cuartos
        return 1.0;                 // completo
      }

      for (final v in ventanas) {
        final i = v.$1;
        if (colabs[i].$4 != 'DIA') continue; // asistencia solo para tipo DIA
        final obra = v.$2;
        for (var w = v.$3; w <= v.$4; w++) {
          final diasSemana = 5 + (rnd.nextBool() ? 1 : 0); // 5 o 6 días
          for (var d = 0; d < diasSemana; d++) {
            // Escenario multi-obra: Juan tiene UN día (miércoles, semana actual)
            // trabajado en TechNova en vez de Brest.
            final esCruceJuan = i == 0 && w == _semanas - 1 && d == 2;
            final obraDia = esCruceJuan ? obraTech : obra;
            final frac = esCruceJuan ? 1.0 : fracAleatoria();
            if (frac == 0.0) continue; // falta: no se registra fila
            asis.add(AsistenciasCompanion.insert(
                id: _uuid.v4(), colaboradorId: colabs[i].$1, obraId: obraDia,
                fecha: diaDe(w, d), fraccion: frac));
            addNomina(obraDia, w, frac * salarioDe(i));
          }
        }
      }
      await db.batch((b) => b.insertAll(db.asistencias, asis));

      // --- Destajos (para los DESTAJO), repartidos en el periodo ---
      final destajos = <DestajosCompanion>[];
      final conceptosDest = [
        'Acarreo de material', 'Pintura de recámaras', 'Levantamiento de muro',
        'Colado de firme', 'Aplanado de fachada', 'Instalación de loseta',
      ];
      for (final v in ventanas) {
        final i = v.$1;
        if (colabs[i].$4 != 'DESTAJO') continue;
        for (var w = v.$3; w <= v.$4; w += 2 + rnd.nextInt(2)) {
          final monto = (1000 + rnd.nextInt(40) * 100).toDouble();
          final concepto = conceptosDest[rnd.nextInt(conceptosDest.length)];
          destajos.add(DestajosCompanion.insert(
              id: _uuid.v4(), colaboradorId: colabs[i].$1, obraId: v.$2,
              fecha: diaDe(w, 5), concepto: concepto, monto: monto));
          addNomina(v.$2, w, monto);
        }
      }
      await db.batch((b) => b.insertAll(db.destajos, destajos));

      // --- Flujo de caja por obra (anticipos, material, nómina, varios) ---
      final movs = <MovimientosCompanion>[];
      void mov(String obra, int w, int off, String tipo, String cat,
          String concepto, double monto, String metodo) {
        movs.add(MovimientosCompanion.insert(
            id: _uuid.v4(), obraId: obra, fecha: diaDe(w, off), tipo: tipo,
            categoria: cat, concepto: concepto, monto: monto, metodoPago: metodo));
      }

      final inicioObra = {obraBrest: 0, obraTech: wTech, obraPlaza: wPlaza};
      final matConceptos = [
        'Cemento y varilla', 'Block y mortero', 'Pintura y solventes',
        'Tablaroca y perfiles', 'Arena y grava', 'Instalación hidráulica',
        'Material eléctrico', 'Impermeabilizante',
      ];
      inicioObra.forEach((obra, wIni) {
        // Anticipos / estimaciones (entradas) cada ~5 semanas.
        var primero = true;
        for (var w = wIni; w < _semanas; w += 5) {
          mov(obra, w, 0, 'ENTRADA', primero ? 'ANTICIPO' : 'PAGO_ESTIMACION',
              primero ? 'Anticipo del cliente' : 'Estimación de avance',
              primero ? (90000 + rnd.nextInt(80) * 1000).toDouble()
                      : (60000 + rnd.nextInt(60) * 1000).toDouble(),
              'Transferencia');
          primero = false;
        }
        // Nómina semanal (salida) con el monto acumulado de la semana.
        final nomObra = nomina[obra] ?? {};
        for (var w = wIni; w < _semanas; w++) {
          final m = nomObra[w] ?? 0;
          if (m <= 0) continue;
          mov(obra, w, 5, 'SALIDA', 'NOMINA', 'Nómina semana', m.roundToDouble(),
              'Efectivo');
        }
        // Material cada ~3 semanas.
        for (var w = wIni; w < _semanas; w += 3) {
          mov(obra, w, 1 + rnd.nextInt(3), 'SALIDA', 'MATERIAL',
              matConceptos[rnd.nextInt(matConceptos.length)],
              (5000 + rnd.nextInt(200) * 100).toDouble(), 'Efectivo');
        }
        // Herramienta / subcontratista ocasional.
        for (var w = wIni + 2; w < _semanas; w += 7) {
          final sub = rnd.nextBool();
          mov(obra, w, 3, 'SALIDA', sub ? 'SUBCONTRATISTA' : 'HERRAMIENTA',
              sub ? 'Subcontrato especializado' : 'Renta de equipo',
              (3000 + rnd.nextInt(120) * 100).toDouble(),
              sub ? 'Cheque' : 'Efectivo');
        }
      });
      // Historial de caja de Los Pinos (obra terminada, semanas 0–12).
      mov(obraPinos, 0, 0, 'ENTRADA', 'ANTICIPO', 'Anticipo del cliente', 180000, 'Transferencia');
      for (var w = 1; w <= 12; w += 2) {
        mov(obraPinos, w, 3, 'SALIDA', 'MATERIAL',
            matConceptos[rnd.nextInt(matConceptos.length)],
            (8000 + rnd.nextInt(150) * 100).toDouble(), 'Efectivo');
      }
      mov(obraPinos, 6, 0, 'ENTRADA', 'PAGO_ESTIMACION', 'Estimación final', 150000, 'Transferencia');
      await db.batch((b) => b.insertAll(db.movimientos, movs));

      // --- Cotizaciones con presupuesto, fechadas a lo largo del periodo ---
      Future<void> cotizacion(String cliente, String proyecto, String ubic,
          String estado, int wFecha,
          List<(String sec, List<(String clave, String desc, String u, double cant, double pu)>)> data,
          {List<(String concepto, double monto)> pagos = const []}) async {
        final cotId = _uuid.v4();
        await db.into(db.cotizaciones).insert(CotizacionesCompanion.insert(
            id: cotId, cliente: cliente, nombreProyecto: proyecto,
            ubicacion: Value(ubic), fecha: diaDe(wFecha, 0), estado: Value(estado)));
        var orden = 0;
        for (final s in data) {
          final secId = _uuid.v4();
          await db.into(db.secciones).insert(SeccionesCompanion.insert(
              id: secId, cotizacionId: cotId, nombre: s.$1, orden: Value(orden++)));
          var po = 0;
          for (final p in s.$2) {
            await db.into(db.partidas).insert(PartidasCompanion.insert(
                id: _uuid.v4(), seccionId: secId, descripcion: p.$2,
                clave: Value(p.$1), unidad: Value(p.$3), cantidad: p.$4,
                precioUnitario: p.$5, orden: Value(po++)));
          }
        }
        for (final pg in pagos) {
          await db.into(db.pagos).insert(PagosCompanion.insert(
              id: _uuid.v4(), cotizacionId: cotId, fecha: diaDe(wFecha, 3),
              monto: pg.$2, metodo: 'Transferencia', concepto: pg.$1));
        }
      }

      await cotizacion('Ricardo Mendoza', 'Ampliación Casa Brest', 'Monterrey',
          'ACEPTADA', 1, [
        ('Cimentación', [
          ('ZAP.ZC1', 'Zapata corrida ZC1 60 cm', 'ML', 24, 308.76),
          ('PLA.10', 'Plantilla de cimentación 5 cm', 'M2', 40, 66.22),
          ('CTR.CT2', 'Contratrabe CT2 35×40 cm', 'ML', 18, 445.13),
        ]),
        ('Albañilería', [
          ('MUR.TAB12', 'Muro novablock 12 cm', 'M2', 85, 201.34),
          ('APLA.INT', 'Aplanado interior a plomo', 'M2', 120, 91.68),
        ]),
      ], pagos: [('Anticipo 50%', 30000), ('Estimación 1', 25000)]);

      await cotizacion('TechNova SA de CV', 'Oficinas TechNova', 'CDMX',
          'CONVERTIDA', wTech, [
        ('Pintura', [
          ('CTM-P01', 'Pintura vinílica a dos manos', 'M2', 320, 113.0),
          ('CTM-P04', 'Pasta tipo impermeable', 'M2', 180, 116.0),
        ]),
        ('Tablaroca', [
          ('CTM-Y06', 'Plafón de tablaroca con bastidor', 'M2', 90, 316.0),
        ]),
      ], pagos: [('Anticipo 40%', 40000)]);

      await cotizacion('Grupo Inmobiliario SA', 'Plaza San Ángel etapa 2', 'GDL',
          'ACEPTADA', wPlaza, [
        ('Estructura', [
          ('LOSA.MAC.12', 'Losa maciza 12 cm F\'C=250', 'M2', 210, 540.89),
          ('COL.C1', 'Columna C1 40×40 cm', 'ML', 64, 612.40),
        ]),
      ], pagos: [('Anticipo 50%', 120000)]);

      await cotizacion('Inmobiliaria del Valle', 'Bodega industrial', 'Toluca',
          'ENVIADA', _semanas - 3, [
        ('Obra civil', [
          ('FIRME.15', 'Firme de concreto 15 cm', 'M2', 600, 285.0),
          ('MUR.PANEL', 'Muro panel W aislado', 'M2', 320, 410.0),
        ]),
      ]);

      await cotizacion('Familia Quintero', 'Casa habitación 2 niveles', 'Saltillo',
          'BORRADOR', _semanas - 1, [
        ('Preliminares', [
          ('LIMP.TERR', 'Limpieza y trazo de terreno', 'M2', 180, 28.5),
        ]),
      ]);

      await cotizacion('Comercializadora Ríos', 'Local comercial', 'Monterrey',
          'RECHAZADA', _semanas - 8, [
        ('Acabados', [
          ('PISO.PORC', 'Piso porcelánico 60×60', 'M2', 95, 389.0),
        ]),
      ]);
    });

    return true;
  }
}
