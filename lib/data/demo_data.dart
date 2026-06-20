import 'package:drift/drift.dart';
import 'package:uuid/uuid.dart';

import '../core/db/app_database.dart';
import '../core/format/format.dart';

/// Genera datos de prueba COMPLETOS (equivalente enriquecido al
/// GenerateDemoDataUseCase de Kotlin). Reemplaza los datos operativos actuales
/// (conserva el catálogo de conceptos) y siembra varias obras, equipo, semana
/// de asistencias, destajos, flujo de caja y cotizaciones con presupuesto.
class DemoData {
  static const _uuid = Uuid();

  static Future<bool> generar(AppDatabase db) async {
    final ahora = DateTime.now().millisecondsSinceEpoch;
    final lunes = Semana.inicioSemana(DateTime.now());
    int dia(int offset) => DateTime.fromMillisecondsSinceEpoch(lunes)
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
      final puestos = {
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
        (_uuid.v4(), 'Juan Pérez', 'maestro', 'DIA', null),
        (_uuid.v4(), 'Pedro Ramírez', 'albanil', 'DIA', null),
        (_uuid.v4(), 'Miguel Torres', 'albanil', 'DIA', 580.0),
        (_uuid.v4(), 'Carlos Sánchez', 'carpintero', 'DIA', null),
        (_uuid.v4(), 'José Gómez', 'electricista', 'DIA', null),
        (_uuid.v4(), 'Luis Hernández', 'ayudante', 'DESTAJO', null),
        (_uuid.v4(), 'Roberto Díaz', 'plomero', 'DIA', null),
        (_uuid.v4(), 'Fernando Cruz', 'pintor', 'DESTAJO', null),
        (_uuid.v4(), 'Andrés Morales', 'herrero', 'DIA', null),
        (_uuid.v4(), 'Javier Reyes', 'ayudante', 'DIA', null),
        (_uuid.v4(), 'Ricardo Flores', 'albanil', 'DESTAJO', null),
        (_uuid.v4(), 'Sergio Mendoza', 'ayudante', 'DIA', null),
      ];
      await db.batch((b) {
        for (final c in colabs) {
          b.insert(db.colaboradores, ColaboradoresCompanion.insert(
            id: c.$1,
            nombre: c.$2,
            puestoId: puestoId[c.$3]!,
            tipoPago: c.$4,
            salarioPersonalizado: Value(c.$5),
            telefono: const Value('55-0000-0000'),
          ));
        }
      });

      // --- Obras ---
      final obraBrest = _uuid.v4();
      final obraTech = _uuid.v4();
      final obraPlaza = _uuid.v4();
      final obraPinos = _uuid.v4();
      await db.batch((b) {
        b.insert(db.obras, ObrasCompanion.insert(
            id: obraBrest, nombre: 'Casa Brest', cliente: const Value('Ricardo Mendoza'),
            ubicacion: const Value('Col. Brest, Monterrey'), fechaInicio: ahora));
        b.insert(db.obras, ObrasCompanion.insert(
            id: obraTech, nombre: 'Remodelación TechNova', cliente: const Value('TechNova SA de CV'),
            ubicacion: const Value('Av. Revolución 450, CDMX'), fechaInicio: ahora));
        b.insert(db.obras, ObrasCompanion.insert(
            id: obraPlaza, nombre: 'Plaza San Ángel', cliente: const Value('Grupo Inmobiliario SA'),
            ubicacion: const Value('Blvd. San Ángel 200, GDL'), fechaInicio: ahora));
        b.insert(db.obras, ObrasCompanion.insert(
            id: obraPinos, nombre: 'Residencial Los Pinos', cliente: const Value('Familia López'),
            ubicacion: const Value('Fracc. Los Pinos, Querétaro'), fechaInicio: ahora, activa: const Value(false)));
      });

      // --- Asignaciones (reparto del equipo entre obras) ---
      final asignaciones = <(String obra, List<int> idxColabs)>[
        (obraBrest, [0, 1, 2, 5, 6]),       // Juan, Pedro, Miguel, Luis, Roberto
        (obraTech, [3, 4, 7, 9]),            // Carlos, José, Fernando, Javier
        (obraPlaza, [8, 10, 11]),            // Andrés, Ricardo, Sergio
      ];
      await db.batch((b) {
        for (final a in asignaciones) {
          for (final i in a.$2) {
            b.insert(db.obraColaborador, ObraColaboradorCompanion.insert(
                obraId: a.$1, colaboradorId: colabs[i].$1, fechaIngreso: ahora));
          }
        }
      });

      // --- Asistencias: semana lunes-sábado para los de tipo DIA ---
      await db.batch((b) {
        void asistir(String obra, List<int> idx, int dias) {
          for (final i in idx) {
            if (colabs[i].$4 != 'DIA') continue;
            for (var d = 0; d < dias; d++) {
              final frac = (d == dias - 1) ? 0.75 : 1.0; // último día 3/4
              b.insert(db.asistencias, AsistenciasCompanion.insert(
                  id: _uuid.v4(), colaboradorId: colabs[i].$1, obraId: obra,
                  fecha: dia(d), fraccion: frac));
            }
          }
        }
        asistir(obraBrest, [0, 1, 2, 6], 6); // Mon-Sat
        asistir(obraTech, [3, 4, 9], 5);     // Mon-Fri
        asistir(obraPlaza, [8, 11], 6);
      });

      // --- Destajos (para los DESTAJO) ---
      await db.batch((b) {
        b.insert(db.destajos, DestajosCompanion.insert(
            id: _uuid.v4(), colaboradorId: colabs[5].$1, obraId: obraBrest,
            fecha: lunes, concepto: 'Acarreo de material', monto: 1200));
        b.insert(db.destajos, DestajosCompanion.insert(
            id: _uuid.v4(), colaboradorId: colabs[7].$1, obraId: obraTech,
            fecha: lunes, concepto: 'Pintura 3 recámaras', monto: 4500));
        b.insert(db.destajos, DestajosCompanion.insert(
            id: _uuid.v4(), colaboradorId: colabs[10].$1, obraId: obraPlaza,
            fecha: lunes, concepto: 'Levantamiento de muro', monto: 3200));
      });

      // --- Flujo de caja por obra ---
      await db.batch((b) {
        void mov(String obra, String tipo, String cat, String concepto, double monto, String metodo, int offset) {
          b.insert(db.movimientos, MovimientosCompanion.insert(
              id: _uuid.v4(), obraId: obra, fecha: dia(offset), tipo: tipo,
              categoria: cat, concepto: concepto, monto: monto, metodoPago: metodo));
        }
        // Casa Brest
        mov(obraBrest, 'ENTRADA', 'ANTICIPO', 'Anticipo del cliente', 150000, 'Transferencia', 0);
        mov(obraBrest, 'SALIDA', 'MATERIAL', 'Cemento y varilla', 18500, 'Efectivo', 1);
        mov(obraBrest, 'SALIDA', 'NOMINA', 'Nómina semana 1', 24200, 'Efectivo', 5);
        mov(obraBrest, 'SALIDA', 'HERRAMIENTA', 'Renta de revolvedora', 3500, 'Efectivo', 2);
        // TechNova
        mov(obraTech, 'ENTRADA', 'ANTICIPO', 'Anticipo 40%', 80000, 'Transferencia', 0);
        mov(obraTech, 'SALIDA', 'MATERIAL', 'Pintura y solventes', 9800, 'Transferencia', 1);
        mov(obraTech, 'SALIDA', 'SUBCONTRATISTA', 'Subcontrato eléctrico', 12000, 'Cheque', 3);
        // Plaza
        mov(obraPlaza, 'ENTRADA', 'PAGO_ESTIMACION', 'Estimación 1', 120000, 'Transferencia', 0);
        mov(obraPlaza, 'SALIDA', 'MATERIAL', 'Block y mortero', 22000, 'Efectivo', 2);
      });

      // --- Cotizaciones con presupuesto ---
      Future<void> cotizacion(String cliente, String proyecto, String ubic,
          String estado, List<(String sec, List<(String clave, String desc, String u, double cant, double pu)>)> data,
          {List<(String concepto, double monto)> pagos = const []}) async {
        final cotId = _uuid.v4();
        await db.into(db.cotizaciones).insert(CotizacionesCompanion.insert(
            id: cotId, cliente: cliente, nombreProyecto: proyecto,
            ubicacion: Value(ubic), fecha: ahora, estado: Value(estado)));
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
              id: _uuid.v4(), cotizacionId: cotId, fecha: ahora, monto: pg.$2,
              metodo: 'Transferencia', concepto: pg.$1));
        }
      }

      await cotizacion('Ricardo Mendoza', 'Ampliación Casa Brest', 'Monterrey', 'ACEPTADA', [
        ('Cimentación', [
          ('ZAP.ZC1', 'Zapata corrida ZC1 60 cm', 'ML', 24, 308.76),
          ('PLA.10', 'Plantilla de cimentación 5 cm', 'M2', 40, 66.22),
          ('CTR.CT2', 'Contratrabe CT2 35×40 cm', 'ML', 18, 445.13),
        ]),
        ('Albañilería', [
          ('MUR.TAB12', 'Muro novablock 12 cm', 'M2', 85, 201.34),
          ('APLA.INT', 'Aplanado interior a plomo', 'M2', 120, 91.68),
        ]),
      ], pagos: [('Anticipo 50%', 30000)]);

      await cotizacion('TechNova SA de CV', 'Oficinas TechNova', 'CDMX', 'ENVIADA', [
        ('Pintura', [
          ('CTM-P01', 'Pintura vinílica a dos manos', 'M2', 320, 113.0),
          ('CTM-P04', 'Pasta tipo impermeable', 'M2', 180, 116.0),
        ]),
        ('Tablaroca', [
          ('CTM-Y06', 'Plafón de tablaroca con bastidor', 'M2', 90, 316.0),
        ]),
      ]);

      await cotizacion('Familia López', 'Casa Los Pinos', 'Querétaro', 'BORRADOR', [
        ('Losas', [
          ('LOSA.MAC.12', 'Losa maciza 12 cm F\'C=250', 'M2', 110, 540.89),
        ]),
      ]);
    });

    return true;
  }
}
