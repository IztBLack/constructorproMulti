/// NOTAS DE OBRA en el móvil: los tratos de palabra con socios que no están en
/// el sistema. Espeja el acceso de la web (`web/src/lib/data/notas-obra.ts`).
///
/// El borrado es LÓGICO (`deletedAt`), como en el resto de la app: una nota
/// borrada aquí tiene que llegar borrada al servidor, y una fila que desaparece
/// de la base local no tiene forma de viajar en el push.
library;

import 'package:drift/drift.dart';
import 'package:uuid/uuid.dart';

import '../core/db/app_database.dart';
import '../domain/logic/notas_obra_calculo.dart';

/// Una nota con sus renglones ya cargados: es como la consume la pantalla y
/// como se arma el PDF.
class NotaConRenglones {
  const NotaConRenglones(this.nota, this.renglones);

  final NotaObraRow nota;
  final List<NotaObraRenglonRow> renglones;

  /// Los renglones traducidos a lo que entiende la aritmética.
  List<RenglonCalc> get paraCalculo => renglones
      .map((r) => RenglonCalc(
            tipo: tipoRenglonDeCadena(r.tipo),
            monto: r.monto,
            montoBase: r.montoBase,
            porcentaje: r.porcentaje,
          ))
      .toList();

  TotalesNota get totales => calcularTotales(
        totalOverride: nota.totalOverride,
        saldoOverride: nota.saldoOverride,
        renglones: paraCalculo,
      );
}

class NotaObraRepository {
  NotaObraRepository(this.db);

  final AppDatabase db;
  static const _uuid = Uuid();

  int get _ahora => DateTime.now().millisecondsSinceEpoch;

  // ── Lectura ───────────────────────────────────────────────────────────

  /// Las notas de una obra con sus renglones, en vivo.
  ///
  /// Se combinan las dos consultas en memoria en vez de pedirle a SQLite un
  /// join: son pocas filas por obra y así el stream se recalcula solo cuando
  /// cambia cualquiera de las dos tablas, sin escribir SQL a mano.
  Stream<List<NotaConRenglones>> watchDeObra(String obraId) {
    final notas = (db.select(db.notaObra)
          ..where((t) => t.obraId.equals(obraId) & t.deletedAt.isNull())
          ..orderBy([
            (t) => OrderingTerm(expression: t.orden),
            (t) => OrderingTerm(expression: t.fecha, mode: OrderingMode.desc),
          ]))
        .watch();

    final renglones = (db.select(db.notaObraRenglon)
          ..where((t) => t.deletedAt.isNull())
          ..orderBy([(t) => OrderingTerm(expression: t.orden)]))
        .watch();

    return notas.asyncMap((ns) async {
      final todos = await renglones.first;
      return ns.map((n) {
        final suyos = todos.where((r) => r.notaId == n.id).toList();
        return NotaConRenglones(n, suyos);
      }).toList();
    });
  }

  /// Una nota concreta con sus renglones, en vivo.
  Stream<NotaConRenglones?> watchUna(String notaId) {
    final nota = (db.select(db.notaObra)
          ..where((t) => t.id.equals(notaId) & t.deletedAt.isNull()))
        .watchSingleOrNull();

    return nota.asyncMap((n) async {
      if (n == null) return null;
      final rs = await (db.select(db.notaObraRenglon)
            ..where((t) => t.notaId.equals(notaId) & t.deletedAt.isNull())
            ..orderBy([(t) => OrderingTerm(expression: t.orden)]))
          .get();
      return NotaConRenglones(n, rs);
    });
  }

  // ── Escritura: la nota ────────────────────────────────────────────────

  Future<String> crear({
    required String obraId,
    required String empresaId,
    required String destinatario,
    String titulo = '',
    String? colaboradorId,
    int? fecha,
    required int orden,
  }) async {
    final id = _uuid.v4();
    await db.into(db.notaObra).insert(NotaObraCompanion.insert(
          id: id,
          obraId: obraId,
          fecha: fecha ?? _ahora,
          destinatario: Value(destinatario),
          titulo: Value(titulo),
          colaboradorId: Value(colaboradorId),
          orden: Value(orden),
          empresaId: Value(empresaId),
          createdAt: Value(_ahora),
          updatedAt: Value(_ahora),
        ));
    return id;
  }

  /// El trigger `mark_pending` marca la fila sola; no se toca `syncStatus`.
  Future<void> actualizar(NotaObraCompanion cambios) =>
      (db.update(db.notaObra)..where((t) => t.id.equals(cambios.id.value)))
          .write(cambios);

  /// Borrado lógico de la nota Y de sus renglones: dejarlos vivos los haría
  /// reaparecer si la nota se restaurara a medias.
  Future<void> eliminar(String notaId) async {
    final sello = _ahora;
    await (db.update(db.notaObra)..where((t) => t.id.equals(notaId)))
        .write(NotaObraCompanion(deletedAt: Value(sello), updatedAt: Value(sello)));
    await (db.update(db.notaObraRenglon)
          ..where((t) => t.notaId.equals(notaId) & t.deletedAt.isNull()))
        .write(NotaObraRenglonCompanion(
            deletedAt: Value(sello), updatedAt: Value(sello)));
  }

  // ── Escritura: los renglones ──────────────────────────────────────────

  Future<void> agregarRenglon({
    required String notaId,
    required String empresaId,
    required TipoRenglon tipo,
    required String etiqueta,
    double? monto,
    double? montoBase,
    double? porcentaje,
    String texto = '',
    int? fecha,
    required int orden,
  }) =>
      db.into(db.notaObraRenglon).insert(NotaObraRenglonCompanion.insert(
            id: _uuid.v4(),
            notaId: notaId,
            tipo: Value(tipoRenglonACadena(tipo)),
            etiqueta: Value(etiqueta),
            monto: Value(monto),
            montoBase: Value(montoBase),
            porcentaje: Value(porcentaje),
            texto: Value(texto),
            fecha: Value(fecha),
            orden: Value(orden),
            empresaId: Value(empresaId),
            createdAt: Value(_ahora),
            updatedAt: Value(_ahora),
          ));

  Future<void> actualizarRenglon(NotaObraRenglonCompanion cambios) =>
      (db.update(db.notaObraRenglon)
            ..where((t) => t.id.equals(cambios.id.value)))
          .write(cambios);

  Future<void> eliminarRenglon(String renglonId) {
    final sello = _ahora;
    return (db.update(db.notaObraRenglon)..where((t) => t.id.equals(renglonId)))
        .write(NotaObraRenglonCompanion(
            deletedAt: Value(sello), updatedAt: Value(sello)));
  }

  /// Reparte posiciones espaciadas según el orden final recibido, igual que la
  /// web: así caben inserciones futuras sin renumerar toda la lista.
  Future<void> reordenarRenglones(List<String> idsEnOrden) async {
    await db.batch((b) {
      for (var i = 0; i < idsEnOrden.length; i++) {
        b.update(
          db.notaObraRenglon,
          NotaObraRenglonCompanion(orden: Value((i + 1) * pasoOrdenRenglon)),
          where: (t) => t.id.equals(idsEnOrden[i]),
        );
      }
    });
  }
}
