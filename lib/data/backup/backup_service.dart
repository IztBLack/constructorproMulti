import 'dart:convert';

import 'package:drift/drift.dart';

import '../../core/db/app_database.dart';

/// Importa/exporta el respaldo JSON con el MISMO esquema que produce la app
/// Kotlin (`BackupData`): un objeto con 13 listas, cada fila con los nombres de
/// campo de las entidades Room. Es el puente de continuidad de datos.
class BackupService {
  final AppDatabase db;
  BackupService(this.db);

  // ---------------- Helpers ----------------
  static String _s(Map m, String k, [String def = '']) =>
      (m[k] as String?) ?? def;
  static String? _sn(Map m, String k) => m[k] as String?;
  static int _i(Map m, String k) => (m[k] as num).toInt();
  static int? _in(Map m, String k) => (m[k] as num?)?.toInt();
  static double _d(Map m, String k, [double def = 0.0]) =>
      (m[k] as num?)?.toDouble() ?? def;
  static double? _dn(Map m, String k) => (m[k] as num?)?.toDouble();
  static bool _b(Map m, String k, [bool def = false]) =>
      (m[k] as bool?) ?? def;

  List<Map<String, dynamic>> _list(Map root, String key) =>
      ((root[key] as List?) ?? const [])
          .cast<Map<String, dynamic>>();

  // ---------------- Importar ----------------
  /// Restaura desde el JSON de respaldo. Reemplaza TODO el contenido actual.
  Future<void> importFromJson(String jsonString) async {
    final root = json.decode(jsonString) as Map<String, dynamic>;

    await db.transaction(() async {
      // Limpia todas las tablas (restauración = reemplazo total).
      await db.delete(db.movimientos).go();
      await db.delete(db.pagos).go();
      await db.delete(db.partidas).go();
      await db.delete(db.secciones).go();
      await db.delete(db.archivosCotizacion).go();
      await db.delete(db.asistencias).go();
      await db.delete(db.destajos).go();
      await db.delete(db.obraColaborador).go();
      await db.delete(db.cotizaciones).go();
      await db.delete(db.colaboradores).go();
      await db.delete(db.obras).go();
      await db.delete(db.puestos).go();
      await db.delete(db.catalogoConceptos).go();

      await db.batch((b) {
        for (final m in _list(root, 'puestos')) {
          b.insert(db.puestos, PuestosCompanion.insert(
            id: _s(m, 'id'),
            nombre: _s(m, 'nombre'),
            salarioDiaDefault: Value(_d(m, 'salarioDiaDefault')),
          ));
        }
        for (final m in _list(root, 'obras')) {
          b.insert(db.obras, ObrasCompanion.insert(
            id: _s(m, 'id'),
            nombre: _s(m, 'nombre'),
            cliente: Value(_s(m, 'cliente')),
            ubicacion: Value(_s(m, 'ubicacion')),
            fechaInicio: _i(m, 'fechaInicio'),
            activa: Value(_b(m, 'activa', true)),
            cotizacionOrigenId: Value(_sn(m, 'cotizacionOrigenId')),
            pdfConfigJson: Value(_sn(m, 'pdfConfigJson')),
          ));
        }
        for (final m in _list(root, 'colaboradores')) {
          b.insert(db.colaboradores, ColaboradoresCompanion.insert(
            id: _s(m, 'id'),
            nombre: _s(m, 'nombre'),
            puestoId: _s(m, 'puestoId'),
            tipoPago: _s(m, 'tipoPago'),
            telefono: Value(_s(m, 'telefono')),
            contactoNombre: Value(_s(m, 'contactoNombre')),
            contactoTelefono: Value(_s(m, 'contactoTelefono')),
            contactoParentesco: Value(_s(m, 'contactoParentesco')),
            activo: Value(_b(m, 'activo', true)),
            salarioPersonalizado: Value(_dn(m, 'salarioPersonalizado')),
          ));
        }
        for (final m in _list(root, 'obraColaboradores')) {
          b.insert(db.obraColaborador, ObraColaboradorCompanion.insert(
            obraId: _s(m, 'obraId'),
            colaboradorId: _s(m, 'colaboradorId'),
            fechaIngreso: _i(m, 'fechaIngreso'),
            fechaSalida: Value(_in(m, 'fechaSalida')),
            salarioDiaOverride: Value(_dn(m, 'salarioDiaOverride')),
          ));
        }
        for (final m in _list(root, 'asistencias')) {
          b.insert(db.asistencias, AsistenciasCompanion.insert(
            id: _s(m, 'id'),
            colaboradorId: _s(m, 'colaboradorId'),
            obraId: _s(m, 'obraId'),
            fecha: _i(m, 'fecha'),
            fraccion: _d(m, 'fraccion'),
          ));
        }
        for (final m in _list(root, 'destajos')) {
          b.insert(db.destajos, DestajosCompanion.insert(
            id: _s(m, 'id'),
            colaboradorId: _s(m, 'colaboradorId'),
            obraId: _s(m, 'obraId'),
            fecha: _i(m, 'fecha'),
            concepto: _s(m, 'concepto'),
            monto: _d(m, 'monto'),
          ));
        }
        for (final m in _list(root, 'cotizaciones')) {
          b.insert(db.cotizaciones, CotizacionesCompanion.insert(
            id: _s(m, 'id'),
            cliente: _s(m, 'cliente'),
            nombreProyecto: _s(m, 'nombreProyecto'),
            ubicacion: Value(_s(m, 'ubicacion')),
            fecha: _i(m, 'fecha'),
            estado: Value(_s(m, 'estado', 'BORRADOR')),
            ivaEnabled: Value(_b(m, 'ivaEnabled', true)),
            descuento: Value(_d(m, 'descuento')),
            notas: Value(_s(m, 'notas')),
            obraId: Value(_sn(m, 'obraId')),
            pdfConfigJson: Value(_sn(m, 'pdfConfigJson')),
          ));
        }
        for (final m in _list(root, 'archivosCotizacion')) {
          b.insert(db.archivosCotizacion, ArchivosCotizacionCompanion.insert(
            id: _s(m, 'id'),
            cotizacionId: _s(m, 'cotizacionId'),
            tipo: _s(m, 'tipo'),
            nombre: _s(m, 'nombre'),
            uri: _s(m, 'uri'),
            fechaAgregado: _i(m, 'fechaAgregado'),
          ));
        }
        for (final m in _list(root, 'secciones')) {
          b.insert(db.secciones, SeccionesCompanion.insert(
            id: _s(m, 'id'),
            cotizacionId: _s(m, 'cotizacionId'),
            nombre: _s(m, 'nombre'),
            orden: Value(_i(m, 'orden')),
          ));
        }
        for (final m in _list(root, 'partidas')) {
          b.insert(db.partidas, PartidasCompanion.insert(
            id: _s(m, 'id'),
            seccionId: _s(m, 'seccionId'),
            clave: Value(_s(m, 'clave')),
            descripcion: _s(m, 'descripcion'),
            unidad: Value(_s(m, 'unidad')),
            cantidad: _d(m, 'cantidad'),
            precioUnitario: _d(m, 'precioUnitario'),
            orden: Value(_i(m, 'orden')),
          ));
        }
        for (final m in _list(root, 'pagos')) {
          b.insert(db.pagos, PagosCompanion.insert(
            id: _s(m, 'id'),
            cotizacionId: _s(m, 'cotizacionId'),
            fecha: _i(m, 'fecha'),
            monto: _d(m, 'monto'),
            metodo: _s(m, 'metodo'),
            concepto: _s(m, 'concepto'),
            referencia: Value(_sn(m, 'referencia')),
          ));
        }
        for (final m in _list(root, 'movimientos')) {
          b.insert(db.movimientos, MovimientosCompanion.insert(
            id: _s(m, 'id'),
            obraId: _s(m, 'obraId'),
            fecha: _i(m, 'fecha'),
            tipo: _s(m, 'tipo'),
            categoria: _s(m, 'categoria'),
            concepto: _s(m, 'concepto'),
            monto: _d(m, 'monto'),
            metodoPago: _s(m, 'metodoPago'),
            referencia: Value(_s(m, 'referencia')),
            nominaId: Value(_sn(m, 'nominaId')),
            cotizacionId: Value(_sn(m, 'cotizacionId')),
            seccionId: Value(_sn(m, 'seccionId')),
            partidaId: Value(_sn(m, 'partidaId')),
          ));
        }
        for (final m in _list(root, 'catalogosConceptos')) {
          b.insert(db.catalogoConceptos, CatalogoConceptosCompanion.insert(
            id: _s(m, 'id'),
            clave: _s(m, 'clave'),
            descripcion: _s(m, 'descripcion'),
            unidad: _s(m, 'unidad'),
            precioUnitarioDefault: Value(_d(m, 'precioUnitarioDefault')),
            categoria: _s(m, 'categoria'),
            esPersonalizado: Value(_b(m, 'esPersonalizado')),
          ));
        }
      });
    });
  }

  // ---------------- Exportar ----------------
  /// Genera el JSON de respaldo con el mismo esquema que la app Kotlin.
  Future<String> exportToJson() async {
    Map<String, dynamic> obraJson(Obra o) => {
          'id': o.id,
          'nombre': o.nombre,
          'cliente': o.cliente,
          'ubicacion': o.ubicacion,
          'fechaInicio': o.fechaInicio,
          'activa': o.activa,
          'cotizacionOrigenId': o.cotizacionOrigenId,
          'pdfConfigJson': o.pdfConfigJson,
        };

    final data = {
      'obras': (await db.select(db.obras).get()).map(obraJson).toList(),
      'puestos': (await db.select(db.puestos).get())
          .map((p) => {
                'id': p.id,
                'nombre': p.nombre,
                'salarioDiaDefault': p.salarioDiaDefault,
              })
          .toList(),
      'colaboradores': (await db.select(db.colaboradores).get())
          .map((c) => {
                'id': c.id,
                'nombre': c.nombre,
                'puestoId': c.puestoId,
                'tipoPago': c.tipoPago,
                'telefono': c.telefono,
                'contactoNombre': c.contactoNombre,
                'contactoTelefono': c.contactoTelefono,
                'contactoParentesco': c.contactoParentesco,
                'activo': c.activo,
                'salarioPersonalizado': c.salarioPersonalizado,
              })
          .toList(),
      'obraColaboradores': (await db.select(db.obraColaborador).get())
          .map((r) => {
                'obraId': r.obraId,
                'colaboradorId': r.colaboradorId,
                'fechaIngreso': r.fechaIngreso,
                'fechaSalida': r.fechaSalida,
                'salarioDiaOverride': r.salarioDiaOverride,
              })
          .toList(),
      'asistencias': (await db.select(db.asistencias).get())
          .map((a) => {
                'id': a.id,
                'colaboradorId': a.colaboradorId,
                'obraId': a.obraId,
                'fecha': a.fecha,
                'fraccion': a.fraccion,
              })
          .toList(),
      'destajos': (await db.select(db.destajos).get())
          .map((d) => {
                'id': d.id,
                'colaboradorId': d.colaboradorId,
                'obraId': d.obraId,
                'fecha': d.fecha,
                'concepto': d.concepto,
                'monto': d.monto,
              })
          .toList(),
      'cotizaciones': (await db.select(db.cotizaciones).get())
          .map((c) => {
                'id': c.id,
                'cliente': c.cliente,
                'nombreProyecto': c.nombreProyecto,
                'ubicacion': c.ubicacion,
                'fecha': c.fecha,
                'estado': c.estado,
                'ivaEnabled': c.ivaEnabled,
                'descuento': c.descuento,
                'notas': c.notas,
                'obraId': c.obraId,
                'pdfConfigJson': c.pdfConfigJson,
              })
          .toList(),
      'archivosCotizacion': (await db.select(db.archivosCotizacion).get())
          .map((a) => {
                'id': a.id,
                'cotizacionId': a.cotizacionId,
                'tipo': a.tipo,
                'nombre': a.nombre,
                'uri': a.uri,
                'fechaAgregado': a.fechaAgregado,
              })
          .toList(),
      'secciones': (await db.select(db.secciones).get())
          .map((s) => {
                'id': s.id,
                'cotizacionId': s.cotizacionId,
                'nombre': s.nombre,
                'orden': s.orden,
              })
          .toList(),
      'partidas': (await db.select(db.partidas).get())
          .map((p) => {
                'id': p.id,
                'seccionId': p.seccionId,
                'clave': p.clave,
                'descripcion': p.descripcion,
                'unidad': p.unidad,
                'cantidad': p.cantidad,
                'precioUnitario': p.precioUnitario,
                'orden': p.orden,
              })
          .toList(),
      'pagos': (await db.select(db.pagos).get())
          .map((p) => {
                'id': p.id,
                'cotizacionId': p.cotizacionId,
                'fecha': p.fecha,
                'monto': p.monto,
                'metodo': p.metodo,
                'concepto': p.concepto,
                'referencia': p.referencia,
              })
          .toList(),
      'movimientos': (await db.select(db.movimientos).get())
          .map((mv) => {
                'id': mv.id,
                'obraId': mv.obraId,
                'fecha': mv.fecha,
                'tipo': mv.tipo,
                'categoria': mv.categoria,
                'concepto': mv.concepto,
                'monto': mv.monto,
                'metodoPago': mv.metodoPago,
                'referencia': mv.referencia,
                'nominaId': mv.nominaId,
                'cotizacionId': mv.cotizacionId,
                'seccionId': mv.seccionId,
                'partidaId': mv.partidaId,
              })
          .toList(),
      'catalogosConceptos': (await db.select(db.catalogoConceptos).get())
          .map((c) => {
                'id': c.id,
                'clave': c.clave,
                'descripcion': c.descripcion,
                'unidad': c.unidad,
                'precioUnitarioDefault': c.precioUnitarioDefault,
                'categoria': c.categoria,
                'esPersonalizado': c.esPersonalizado,
              })
          .toList(),
    };

    return const JsonEncoder.withIndent('  ').convert(data);
  }
}
