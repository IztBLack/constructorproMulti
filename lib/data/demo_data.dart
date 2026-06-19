import 'package:drift/drift.dart';
import 'package:uuid/uuid.dart';

import '../core/db/app_database.dart';
import '../core/format/format.dart';

/// Genera datos de prueba representativos (equivalente a GenerateDemoDataUseCase
/// del proyecto Kotlin). Idempotente: no hace nada si ya hay obras.
class DemoData {
  static const _uuid = Uuid();

  static Future<bool> generar(AppDatabase db) async {
    final yaHay = await db.contarObras();
    if (yaHay > 0) return false;

    final ahora = DateTime.now().millisecondsSinceEpoch;
    final lunes = Semana.inicioSemana(DateTime.now());

    await db.transaction(() async {
      // Puestos
      final albanil = _uuid.v4();
      final maestro = _uuid.v4();
      final ayudante = _uuid.v4();
      await db.batch((b) {
        b.insertAll(db.puestos, [
          PuestosCompanion.insert(id: albanil, nombre: 'Albañil', salarioDiaDefault: const Value(550)),
          PuestosCompanion.insert(id: maestro, nombre: 'Maestro de obra', salarioDiaDefault: const Value(800)),
          PuestosCompanion.insert(id: ayudante, nombre: 'Ayudante', salarioDiaDefault: const Value(400)),
        ]);
      });

      // Colaboradores
      final juan = _uuid.v4();
      final pedro = _uuid.v4();
      final luis = _uuid.v4();
      await db.batch((b) {
        b.insertAll(db.colaboradores, [
          ColaboradoresCompanion.insert(id: juan, nombre: 'Juan Pérez', puestoId: maestro, tipoPago: 'DIA'),
          ColaboradoresCompanion.insert(id: pedro, nombre: 'Pedro Ramírez', puestoId: albanil, tipoPago: 'DIA'),
          ColaboradoresCompanion.insert(id: luis, nombre: 'Luis Hernández', puestoId: ayudante, tipoPago: 'DESTAJO'),
        ]);
      });

      // Obra
      final obra = _uuid.v4();
      await db.into(db.obras).insert(ObrasCompanion.insert(
            id: obra,
            nombre: 'Casa Brest',
            cliente: const Value('Ricardo Mendoza'),
            ubicacion: const Value('Col. Brest, Monterrey'),
            fechaInicio: ahora,
          ));

      // Asignaciones
      await db.batch((b) {
        for (final c in [juan, pedro, luis]) {
          b.insert(db.obraColaborador,
              ObraColaboradorCompanion.insert(obraId: obra, colaboradorId: c, fechaIngreso: ahora));
        }
      });

      // Asistencias (lunes-miércoles, día completo)
      await db.batch((b) {
        for (var d = 0; d < 3; d++) {
          final fecha = DateTime.fromMillisecondsSinceEpoch(lunes)
              .add(Duration(days: d))
              .millisecondsSinceEpoch;
          for (final c in [juan, pedro]) {
            b.insert(db.asistencias, AsistenciasCompanion.insert(
                id: _uuid.v4(), colaboradorId: c, obraId: obra, fecha: fecha, fraccion: 1.0));
          }
        }
      });

      // Destajo para Luis
      await db.into(db.destajos).insert(DestajosCompanion.insert(
            id: _uuid.v4(),
            colaboradorId: luis,
            obraId: obra,
            fecha: lunes,
            concepto: 'Acarreo de material',
            monto: 1200,
          ));

      // Flujo de caja
      await db.batch((b) {
        b.insert(db.movimientos, MovimientosCompanion.insert(
            id: _uuid.v4(), obraId: obra, fecha: ahora, tipo: 'ENTRADA',
            categoria: 'ANTICIPO', concepto: 'Anticipo del cliente', monto: 150000, metodoPago: 'Transferencia'));
        b.insert(db.movimientos, MovimientosCompanion.insert(
            id: _uuid.v4(), obraId: obra, fecha: ahora, tipo: 'SALIDA',
            categoria: 'MATERIAL', concepto: 'Cemento y varilla', monto: 18500, metodoPago: 'Efectivo'));
      });

      // Cotización con sección y partidas
      final cot = _uuid.v4();
      await db.into(db.cotizaciones).insert(CotizacionesCompanion.insert(
            id: cot, cliente: 'Ricardo Mendoza', nombreProyecto: 'Ampliación Casa Brest', fecha: ahora));
      final sec = _uuid.v4();
      await db.into(db.secciones).insert(
          SeccionesCompanion.insert(id: sec, cotizacionId: cot, nombre: 'Cimentación', orden: const Value(0)));
      await db.batch((b) {
        b.insert(db.partidas, PartidasCompanion.insert(
            id: _uuid.v4(), seccionId: sec, descripcion: 'Zapata corrida ZC1',
            clave: const Value('ZAP.ZC1'), unidad: const Value('ML'), cantidad: 24, precioUnitario: 308.76));
        b.insert(db.partidas, PartidasCompanion.insert(
            id: _uuid.v4(), seccionId: sec, descripcion: 'Plantilla de cimentación',
            clave: const Value('PLA.10'), unidad: const Value('M2'), cantidad: 40, precioUnitario: 66.22));
      });
    });

    return true;
  }
}
