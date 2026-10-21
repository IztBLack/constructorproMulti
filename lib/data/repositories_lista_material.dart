/// LISTAS DE MATERIAL en el móvil (Supabase 0050, fase 1 de
/// docs/PLAN_LISTAS_MATERIAL.md). Espeja el acceso de la web
/// (`web/src/lib/data/listas.ts`).
///
/// El borrado es LÓGICO (`deletedAt`), como en el resto de la app: una lista
/// borrada aquí tiene que llegar borrada al servidor.
library;

import 'package:drift/drift.dart';
import 'package:uuid/uuid.dart';

import '../core/db/app_database.dart';
import '../domain/listas/leer_nota_material.dart';
import '../domain/listas/listas_calculo.dart';

/// Una lista con sus renglones ya cargados y ordenados: así la consumen la
/// pantalla y el PDF.
class ListaConRenglones {
  const ListaConRenglones(this.lista, this.renglones);

  final ListaMaterialRow lista;
  final List<ListaMaterialRenglonRow> renglones;

  static RenglonListaCalc calc(ListaMaterialRenglonRow r) => RenglonListaCalc(
        tipo: tipoRenglonListaDeCadena(r.tipo),
        cantidad: r.cantidad,
        largo: r.largo,
        separacionCm: r.separacionCm,
        seccion: r.seccion,
        marcado: r.marcado,
      );

  TotalesLista get totales => totalesDe(renglones.map(calc));

  /// Las secciones en el orden de sus renglones.
  List<(String, List<ListaMaterialRenglonRow>)> get secciones =>
      agruparPorSeccion(renglones, (r) => r.seccion);
}

class ListaMaterialRepository {
  ListaMaterialRepository(this.db);

  final AppDatabase db;
  static const _uuid = Uuid();

  int get _ahora => DateTime.now().millisecondsSinceEpoch;

  // ── Lectura ───────────────────────────────────────────────────────────

  /// Re-emite cuando cambia CUALQUIERA de las dos tablas (palomear un renglón
  /// tiene que mover el «12 de 20» de la lista sin tocar la lista).
  Stream<void> _cambios() => db
      .customSelect('SELECT 1',
          readsFrom: {db.listaMaterial, db.listaMaterialRenglon})
      .watch();

  Future<List<ListaMaterialRenglonRow>> _renglonesDe(
      Iterable<String> listaIds) {
    return (db.select(db.listaMaterialRenglon)
          ..where((t) => t.listaId.isIn(listaIds) & t.deletedAt.isNull())
          ..orderBy([
            (t) => OrderingTerm(expression: t.orden),
            (t) => OrderingTerm(expression: t.createdAt),
          ]))
        .get();
  }

  /// Las listas de una obra, la más reciente primero, con sus renglones.
  Stream<List<ListaConRenglones>> watchDeObra(String obraId) =>
      _cambios().asyncMap((_) async {
        final listas = await (db.select(db.listaMaterial)
              ..where((t) => t.obraId.equals(obraId) & t.deletedAt.isNull())
              ..orderBy([
                (t) =>
                    OrderingTerm(expression: t.fecha, mode: OrderingMode.desc),
                (t) => OrderingTerm(
                    expression: t.createdAt, mode: OrderingMode.desc),
              ]))
            .get();
        final renglones = await _renglonesDe(listas.map((l) => l.id));
        return [
          for (final l in listas)
            ListaConRenglones(
                l, renglones.where((r) => r.listaId == l.id).toList()),
        ];
      });

  /// Una lista concreta con sus renglones, en vivo. Null si se borró.
  Stream<ListaConRenglones?> watchUna(String listaId) =>
      _cambios().asyncMap((_) async {
        final l = await (db.select(db.listaMaterial)
              ..where((t) => t.id.equals(listaId) & t.deletedAt.isNull()))
            .getSingleOrNull();
        if (l == null) return null;
        return ListaConRenglones(l, await _renglonesDe([listaId]));
      });

  // ── Escritura: la lista ───────────────────────────────────────────────

  /// [empresaId] puede ir vacío sin cuenta vinculada: el push la sella.
  Future<String> crear({
    required String obraId,
    required String empresaId,
    String titulo = '',
    String plano = '',
  }) async {
    final id = _uuid.v4();
    final ahora = _ahora;
    await db.into(db.listaMaterial).insert(ListaMaterialCompanion.insert(
          id: id,
          obraId: obraId,
          fecha: ahora,
          titulo: Value(titulo.trim()),
          plano: Value(plano.trim()),
          empresaId: Value(empresaId),
          createdAt: Value(ahora),
          updatedAt: Value(ahora),
        ));
    return id;
  }

  /// El trigger `mark_pending` marca la fila sola; no se toca `syncStatus`.
  Future<void> actualizar(ListaMaterialCompanion cambios) =>
      (db.update(db.listaMaterial)..where((t) => t.id.equals(cambios.id.value)))
          .write(cambios);

  Future<void> cambiarEstado(String listaId, EstadoLista estado) => actualizar(
      ListaMaterialCompanion(
          id: Value(listaId), estado: Value(estadoListaACadena(estado))));

  /// Borrado lógico de la lista Y de sus renglones.
  Future<void> eliminar(String listaId) async {
    final sello = _ahora;
    await db.transaction(() async {
      await (db.update(db.listaMaterial)..where((t) => t.id.equals(listaId)))
          .write(ListaMaterialCompanion(
              deletedAt: Value(sello), updatedAt: Value(sello)));
      await (db.update(db.listaMaterialRenglon)
            ..where((t) => t.listaId.equals(listaId) & t.deletedAt.isNull()))
          .write(ListaMaterialRenglonCompanion(
              deletedAt: Value(sello), updatedAt: Value(sello)));
    });
  }

  // ── Escritura: los renglones ──────────────────────────────────────────

  /// El `orden` que le toca a un renglón nuevo: al final de la lista.
  Future<int> _siguienteOrden(String listaId) async {
    final maximo = db.listaMaterialRenglon.orden.max();
    final q = db.selectOnly(db.listaMaterialRenglon)
      ..addColumns([maximo])
      ..where(db.listaMaterialRenglon.listaId.equals(listaId));
    final actual = (await q.getSingle()).read(maximo) ?? 0;
    return actual + pasoOrdenLista;
  }

  Future<String> agregarRenglon({
    required String listaId,
    required String empresaId,
    required String seccion,
    required TipoRenglonLista tipo,
    required double cantidad,
    double? largo,
    double? separacionCm,
    String unidad = '',
    String descripcion = '',
    String nota = '',
  }) async {
    final id = _uuid.v4();
    final ahora = _ahora;
    await db
        .into(db.listaMaterialRenglon)
        .insert(ListaMaterialRenglonCompanion.insert(
          id: id,
          listaId: listaId,
          seccion: Value(seccion.trim()),
          tipo: Value(tipoRenglonListaACadena(tipo)),
          cantidad: Value(cantidad),
          largo: Value(largo),
          separacionCm: Value(separacionCm),
          unidad: Value(unidad.trim()),
          descripcion: Value(descripcion.trim()),
          nota: Value(nota.trim()),
          orden: Value(await _siguienteOrden(listaId)),
          empresaId: Value(empresaId),
          createdAt: Value(ahora),
          updatedAt: Value(ahora),
        ));
    return id;
  }

  /// Guarda de una vez lo leído de una nota pegada, en su orden, al final de
  /// la lista. Todo o nada: una nota a medio guardar confunde más que ayuda.
  Future<void> agregarLeidos({
    required String listaId,
    required String empresaId,
    required List<RenglonLeido> leidos,
  }) async {
    if (leidos.isEmpty) return;
    final inicio = await _siguienteOrden(listaId);
    final ahora = _ahora;
    await db.batch((b) {
      for (var i = 0; i < leidos.length; i++) {
        final r = leidos[i];
        b.insert(
          db.listaMaterialRenglon,
          ListaMaterialRenglonCompanion.insert(
            id: _uuid.v4(),
            listaId: listaId,
            seccion: Value(r.seccion),
            tipo: Value(tipoRenglonListaACadena(r.tipo)),
            cantidad: Value(r.cantidad),
            largo: Value(r.largo),
            separacionCm: Value(r.separacionCm),
            unidad: Value(r.unidad),
            descripcion: Value(r.descripcion),
            nota: Value(r.nota),
            orden: Value(inicio + i * pasoOrdenLista),
            empresaId: Value(empresaId),
            createdAt: Value(ahora),
            updatedAt: Value(ahora),
          ),
        );
      }
    });
  }

  Future<void> actualizarRenglon(ListaMaterialRenglonCompanion cambios) =>
      (db.update(db.listaMaterialRenglon)
            ..where((t) => t.id.equals(cambios.id.value)))
          .write(cambios);

  /// Palomea (o despalomea) un renglón, con quién y cuándo. [usuarioId] null
  /// sin sesión: el servidor rechazaría un uuid vacío.
  Future<void> marcar(
    String renglonId,
    bool marcado, {
    String? usuarioId,
    String nombre = '',
  }) =>
      actualizarRenglon(ListaMaterialRenglonCompanion(
        id: Value(renglonId),
        marcado: Value(marcado),
        marcadoPor: Value(marcado ? usuarioId : null),
        marcadoPorNombre: Value(marcado ? nombre : ''),
        marcadoAt: Value(marcado ? _ahora : null),
      ));

  Future<void> eliminarRenglon(String renglonId) {
    final sello = _ahora;
    return (db.update(db.listaMaterialRenglon)
          ..where((t) => t.id.equals(renglonId)))
        .write(ListaMaterialRenglonCompanion(
            deletedAt: Value(sello), updatedAt: Value(sello)));
  }
}
