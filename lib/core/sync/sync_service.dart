import 'package:connectivity_plus/connectivity_plus.dart';
import 'package:drift/drift.dart';
import 'package:flutter/foundation.dart';
import 'package:supabase_flutter/supabase_flutter.dart';

import '../db/app_database.dart';
import 'pull_paginado.dart';
import 'sync_metadata.dart';
import 'supabase_config.dart';

/// Resultado de un intento de sincronización.
///
/// [parcial]: el PULL corrió completo, pero una o más filas del PUSH
/// fallaron (quedaron marcadas `sync_status='error'` localmente) y se
/// reintentarán en el próximo ciclo. No oculta que la sincronización sí
/// avanzó, a diferencia de [error] (fallo total, p. ej. el PULL).
enum SyncOutcome { ok, sinSesion, sinRed, sinEmpresa, error, parcial }

/// Motor de sincronización offline-first (Fase 2).
///
/// Contrato:
/// - **Drift/SQLite es la fuente de verdad.** Esto solo reconcilia con Supabase.
/// - **Push** de filas locales con `sync_status='pending'` en **orden topológico
///   de FK** (padres→hijos), upsert idempotente por PK.
/// - **Pull incremental** por tabla con cursor `server_updated_at` (árbitro =
///   reloj del servidor); upsert local marcando `synced`.
/// - **LWW por fila:** en pull, si la fila local está `pending` y su `updated_at`
///   es más nuevo que el del servidor, se conserva el cambio local (se empuja luego).
/// - **Tombstones:** `deleted_at` viaja como un campo más; nunca se borra físico.
///
/// Las EDICIONES sí se sincronizan: el trigger `trg_<tabla>_mark_pending`
/// (migración v3, ver `AppDatabase._instalarTriggersSync`) remarca `pending`
/// en cada UPDATE de la app, así que altas, ediciones y borrados propagan por
/// igual. Verificado por `test/data/edicion_marca_pending_test.dart` sobre los
/// métodos de repositorio reales. (Este contrato reemplaza un comentario viejo
/// que afirmaba lo contrario, de antes de que existiera el trigger.)
///
/// PULL PAGINADO (desde la auditoría de escalabilidad de 2026-09):
/// - **Pagina hasta agotar.** Antes traía como mucho 1 000 filas por tabla y por
///   ciclo —el `max_rows` de PostgREST— y decía que había terminado: un
///   dispositivo nuevo contra una empresa con historia necesitaba varios syncs
///   para converger, sin que nada lo indicara.
/// - **Cursor compuesto `(server_updated_at, ...pk)`.** El anterior sólo miraba
///   el timestamp, así que dos filas selladas en el mismo milisegundo a caballo
///   entre dos páginas hacían que la segunda no se trajera nunca.
///   `SyncMetadata` ya guardaba el desempate; la consulta no lo usaba.
/// - **Una transacción y un lote por página**, en vez de un SELECT y un INSERT
///   por fila, con un solo aviso a los streams de Drift al final.
/// Los detalles y el porqué de cada pieza están en `pull_paginado.dart`.
class SyncService {
  SyncService({
    required this.db,
    required this.metadata,
    SupabaseClient? client,
    this.onActividad,
  }) : client = client ?? SupabaseConfig.client;

  final AppDatabase db;
  final SyncMetadata metadata;
  final SupabaseClient client;

  /// Notifica cuándo hay un sync corriendo (`true`) y cuándo termina (`false`).
  ///
  /// Vive aquí, en el único método por el que pasan TODOS los disparadores
  /// —arranque, reconexión, post-escritura y el botón manual—, y no en el
  /// [SyncController], que solo orquesta el automático: enganchar el controller
  /// dejaría al indicador sin pulso durante un "Sincronizar ahora".
  final void Function(bool activo)? onActividad;

  /// Guard compartido: evita que dos llamadas concurrentes a [syncAll] (una
  /// del [SyncController] automático y otra del botón manual) corran en
  /// paralelo y generen race conditions. Como [syncServiceProvider] es un
  /// Provider singleton, cualquier llamante usa esta misma instancia.
  bool _enCurso = false;

  /// Último error detallado de sync (para diagnóstico en la UI). Null si el
  /// último intento fue exitoso. Es un resumen ("N fila(s) no subieron…").
  String? ultimoError;

  /// Motivo REAL del último fallo de PUSH a nivel fila: el mensaje que devolvió
  /// Postgres/PostgREST (violación de RLS, de FK, columna inexistente, etc.).
  /// Es lo único que de verdad explica *por qué* una fila no sube; [ultimoError]
  /// solo dice *cuántas* fallaron. Se expone en la pantalla de nube para que el
  /// usuario vea la causa sin depender de logs de un APK de release. Null si el
  /// último ciclo de push no tuvo fallos de fila.
  String? ultimoErrorPush;

  /// Orden topológico de push: padres antes que hijos (respeta las FK de
  /// `supabase/migrations/0002_schema.sql`).
  static const List<String> pushOrder = [
    'puestos',
    'colaboradores',
    // El sueldo va DESPUÉS de colaboradores: su PK es colaborador_id (FK).
    'colaborador_sueldo',
    'obras',
    // Nota de conciliación: DESPUÉS de obras (su PK/FK es obra_id).
    'obra_caja_nota',
    // Notas de trato con socios: la nota después de obras, y sus renglones
    // después de la nota — al revés fallaría la FK en el push.
    'nota_obra',
    'nota_obra_renglon',
    // Cuadrillas: van DESPUÉS de colaboradores/obras y ANTES de asistencias/
    // destajos, que ahora referencian cuadrilla_id (evita fallo de FK en push).
    'cuadrillas',
    'cuadrilla_miembro',
    'asignacion_cuadrilla_obra',
    'obra_presupuesto',
    'cotizaciones',
    'secciones',
    'partidas',
    'pagos',
    'obra_colaborador',
    'asistencias',
    'destajos',
    'movimientos',
    'catalogo_conceptos',
    'archivos_cotizacion',
  ];

  /// SQL de los candidatos a subir de una tabla: filas con cambios locales sin
  /// reconciliar. Incluye **`error`** además de `pending` —así un fallo previo
  /// se REINTENTA en vez de quedar atorado para siempre (el bug del indicador
  /// rojo permanente)—, y excluye `synced` (ya está) y `skipped` (terminal, no
  /// reintentable). Extraído como estático para poder verificar el filtro en
  /// test sin levantar Supabase (`test/data/sync_push_retry_test.dart`).
  /// El `ORDER BY` empuja los TOMBSTONES (`deleted_at` no nulo) antes que las
  /// filas vivas de la misma tabla. Importa cuando una baja libera el espacio
  /// que un alta necesita para pasar una regla del servidor: al resolver un
  /// conflicto de jornada, la baja del registro rival debe llegar ANTES del
  /// registro que la reemplaza, o el servidor volvería a rechazarlo.
  static String sqlCandidatosPush(String tabla) =>
      "SELECT * FROM $tabla WHERE sync_status IN ('pending', 'error') "
      "ORDER BY (deleted_at IS NULL) ASC";

  /// El `UPDATE` con el que [_llenarColumnaNueva] copia a una fila local el
  /// valor que el servidor ya tenía en una columna recién migrada.
  ///
  /// Expuesto —como [sqlCandidatosPush]— para que la prueba ejerza ESTA cadena
  /// y no una copia a mano: lo que hay que garantizar es el `AND $col IS NULL`,
  /// que es lo único que impide pisar lo que el usuario escribió sin señal.
  static String sqlRellenoColumna(String tabla, String col, String idCol) =>
      "UPDATE $tabla SET $col = ? WHERE $idCol = ? AND $col IS NULL";

  /// True si el fallo de push es la regla de "1 jornada/día" del servidor
  /// (CHECK, SQLSTATE 23514). PostgREST entrega el cuerpo del error como un JSON
  /// dentro de `message`, con el `code` real adentro, así que se busca en ambos.
  static bool _esConflictoJornada(PostgrestException e) =>
      e.code == '23514' || e.message.contains('23514');

  bool get tieneSesion => SupabaseConfig.currentUser != null;

  Future<bool> get hayRed async {
    final estado = await Connectivity().checkConnectivity();
    return !estado.every((r) => r == ConnectivityResult.none);
  }

  /// Punto de entrada. Disparado por: arranque, reconexión, post-escritura
  /// (con debounce) y pull-to-refresh.
  ///
  /// Si ya hay un sync en curso (p. ej. el automático del [SyncController]
  /// solapado con el manual del usuario), retorna inmediatamente para no
  /// correr dos syncs concurrentes sobre los mismos datos.
  Future<SyncOutcome> syncAll() async {
    if (_enCurso) return SyncOutcome.ok; // otro sync ya está en camino
    if (!tieneSesion) return SyncOutcome.sinSesion;
    if (!await hayRed) return SyncOutcome.sinRed;

    final empresaId = await _empresaIdActual();
    if (empresaId == null) return SyncOutcome.sinEmpresa;

    _enCurso = true;
    onActividad?.call(true);
    var erroresPush = 0;
    ultimoErrorPush = null; // se llena si alguna fila falla en este ciclo
    try {
      // 0) RELLENO de las columnas que una migración acaba de crear en NULL y
      //    que el servidor ya tenía llenas (ver `AppDatabase.columnasPorLlenar`,
      //    que explica qué se rompería sin esto). Va ANTES del push, que es lo
      //    único que importa: después ya sería tarde.
      //
      //    El aviso se persiste ANTES de atenderlo: si el relleno falla a
      //    medias, la marca sigue puesta y el próximo ciclo lo reintenta. El
      //    mapa en memoria se vacía para no re-anotar lo ya atendido en otro
      //    `syncAll` de esta misma sesión.
      await metadata.marcarPorLlenar(AppDatabase.columnasPorLlenar);
      AppDatabase.columnasPorLlenar.clear();
      for (final pendiente in metadata.porLlenar) {
        await _llenarColumnaNueva(pendiente);
        await metadata.limpiarPorLlenar(pendiente);
      }

      // 1) PUSH (padres→hijos) para no traer del server algo que aún
      //    no subimos y perder la edición local.
      //
      //    Se aísla en su propio try/catch que NO propaga: los fallos de fila
      //    ya se manejan dentro de _pushTabla (se marcan sync_status='error'
      //    y se continúa), pero si algo inesperado revienta a nivel tabla acá
      //    lo registramos sin abortar el PULL, que debe correr siempre.
      try {
        for (final t in pushOrder) {
          erroresPush += await _pushTabla(t, empresaId);
        }
      } catch (e, st) {
        erroresPush++;
        debugPrint('[SyncService] ══════ PUSH ERROR (no fatal, PULL continúa) ══════');
        debugPrint('[SyncService] $e');
        debugPrint('[SyncService] $st');
      }

      // 2) PULL de cada tabla (orden indistinto: upsert idempotente). Corre
      //    SIEMPRE, aunque el push haya tenido errores arriba.
      for (final t in pushOrder) {
        await _pullTabla(t);
      }

      await _diagnosticoAsistencias();

      if (erroresPush > 0) {
        final motivo =
            ultimoErrorPush != null ? ' Motivo: $ultimoErrorPush.' : '';
        ultimoError = '$erroresPush fila(s) no se pudieron subir; '
            'el resto sincronizó correctamente. Se reintentará en el '
            'próximo ciclo.$motivo';
        return SyncOutcome.parcial;
      }
      ultimoError = null;
      return SyncOutcome.ok;
    } catch (e, st) {
      ultimoError = e.toString();
      debugPrint('[SyncService] ══════ syncAll ERROR ══════');
      debugPrint('[SyncService] $e');
      debugPrint('[SyncService] $st');
      return SyncOutcome.error;
    } finally {
      _enCurso = false;
      onActividad?.call(false);
    }
  }

  /// Traza el reparto de `sync_status` en asistencias al cerrar cada ciclo.
  ///
  /// Existe porque un conteo que no cuadra (filas marcadas `conflict` que luego
  /// no aparecen en la pantalla de conflictos) no se puede diagnosticar desde la
  /// UI: hay que ver el estado real de la tabla después del push Y del pull, que
  /// es justo donde una fila puede cambiar de estado sin que nadie lo note.
  Future<void> _diagnosticoAsistencias() async {
    final filas = await db
        .customSelect(
            'SELECT sync_status, COUNT(*) AS n, '
            'SUM(CASE WHEN deleted_at IS NULL THEN 0 ELSE 1 END) AS borradas '
            'FROM asistencias GROUP BY sync_status')
        .get();
    // Solo se traza si hay algo que NO esté reconciliado: en régimen normal
    // (todo 'synced') esta línea sería ruido cada 25 s y acabaría enterrando
    // justo los ciclos en que sí pasó algo.
    final interesantes =
        filas.where((f) => f.data['sync_status'] != 'synced').toList();
    if (interesantes.isEmpty) return;
    final resumen = filas
        .map((f) => '${f.data['sync_status']}=${f.data['n']}'
            '(borradas:${f.data['borradas']})')
        .join(' ');
    debugPrint('[SyncService] ⓘ asistencias por estado: $resumen');
  }

  /// empresa_id del usuario (vía RLS). Null si no está vinculado.
  Future<String?> _empresaIdActual() async {
    final rows = await client
        .from('usuarios_empresa')
        .select('empresa_id')
        .limit(1);
    if (rows.isEmpty) return null;
    return rows.first['empresa_id'] as String?;
  }

  TableInfo _info(String name) =>
      db.allTables.firstWhere((t) => t.actualTableName == name);

  List<String> _pk(TableInfo t) => t.$primaryKey.map((c) => c.name).toList();

  Set<String> _boolCols(TableInfo t) => t.$columns
      .where((c) => c.type == DriftSqlType.bool)
      .map((c) => c.name)
      .toSet();

  /// Columnas TEXT de Drift que mapean a uuid en Postgres: `id` y todo `*_id`.
  Set<String> _uuidCols(TableInfo t) => t.$columns
      .where((c) =>
          c.type == DriftSqlType.string &&
          (c.name == 'id' || c.name.endsWith('_id')))
      .map((c) => c.name)
      .toSet();

  static final _uuidRe = RegExp(
      r'^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$',
      caseSensitive: false);

  /// Devuelve true si [value] es null, vacío, o un UUID válido.
  static bool _isValidUuid(dynamic value) {
    if (value == null) return true;
    if (value is! String) return false;
    if (value.isEmpty) return true;
    return _uuidRe.hasMatch(value);
  }

  // ---------------- RELLENO DE COLUMNA RECIÉN AÑADIDA ----------------

  /// Baja del servidor el valor de una columna que la migración acaba de crear
  /// y lo copia a las filas locales que la tienen en NULL.
  ///
  /// POR QUÉ NO BASTA UN PULL NORMAL: `_pullTabla` aplica LWW y **salta** las
  /// filas `pending` cuya edición local es más nueva — que son exactamente las
  /// que corren peligro. Un pull adelantado dejaría el NULL puesto en ellas y
  /// el push lo subiría igual. Por eso esto va columna por columna en vez de
  /// fila entera: toca SOLO el dato que la migración no pudo saber, sin pisar
  /// nada de lo que el usuario escribió sin señal.
  ///
  /// [pendiente] llega como `"tabla.columna"`.
  ///
  /// El `UPDATE` dispara `mark_pending` y deja `pending` a filas que estaban
  /// `synced`, así que el siguiente ciclo las vuelve a subir con el MISMO valor
  /// que acaban de recibir. Es una vuelta de más sobre unas decenas de filas,
  /// una sola vez; apagar el trigger para ahorrárselo costaría dejar la tabla
  /// sin él si algo revienta en medio, que es mucho peor que el ruido.
  Future<void> _llenarColumnaNueva(String pendiente) async {
    final partes = pendiente.split('.');
    if (partes.length != 2) return;
    final (tabla, col) = (partes[0], partes[1]);

    final t = _info(tabla);
    final pk = _pk(t);
    // Solo PK simple: no hay ninguna tabla con PK compuesta que necesite esto,
    // y armar el WHERE para ese caso sin usarlo sería código sin probar.
    if (pk.length != 1) return;
    final idCol = pk.first;

    final filas = await client.from(tabla).select('$idCol,$col');
    var llenadas = 0;
    for (final row in (filas as List).cast<Map<String, dynamic>>()) {
      final valor = row[col];
      if (valor == null) continue;
      final n = await db.customUpdate(
        sqlRellenoColumna(tabla, col, idCol),
        variables: [Variable(valor), Variable(row[idCol])],
        updates: {t},
      );
      llenadas += n;
    }
    debugPrint('[SyncService] $pendiente: $llenadas fila(s) rellenadas del servidor');
  }

  // ---------------- PUSH ----------------
  /// Sube las filas `pending` **y `error`** de [name] (las `error` se reintentan;
  /// ver el SELECT abajo). Devuelve la cantidad de filas que volvieron a fallar
  /// (quedaron marcadas `sync_status='error'`); nunca lanza por un fallo de fila
  /// individual para no abortar el resto del syncAll. Las filas legacy sin UUID
  /// válido pasan a `skipped` (terminal, no reintentable) y no suman al retorno.
  Future<int> _pushTabla(String name, String empresaId) async {
    final t = _info(name);
    final pk = _pk(t);
    final boolCols = _boolCols(t);
    final uuidCols = _uuidCols(t)..remove('empresa_id'); // la forzamos nosotros

    final pendientes = await db.customSelect(sqlCandidatosPush(name)).get();

    if (pendientes.isNotEmpty) {
      debugPrint('[SyncService] PUSH $name: ${pendientes.length} por subir');
    }

    var erroresFila = 0;

    for (final r in pendientes) {
      final data = Map<String, dynamic>.from(r.data);
      data.remove('sync_status'); // no existe en el servidor
      data.remove('server_updated_at'); // lo pone el trigger
      // Sobrescribimos siempre con el empresaId actual para evitar que datos
      // cacheados de sesiones/empresas anteriores rompan RLS.
      data['empresa_id'] = empresaId;
      // SQLite guarda bool como 0/1; Postgres espera boolean.
      for (final c in boolCols) {
        if (data[c] is int) data[c] = data[c] != 0;
      }

      // ── Validar UUID: saltar filas legacy con IDs no-UUID (ej. "1","2") ──
      String? colInvalida;
      for (final c in uuidCols) {
        if (!_isValidUuid(data[c])) {
          colInvalida = c;
          break;
        }
      }
      if (colInvalida != null) {
        final pkVals = pk.map((c) => '$c=${r.data[c]}').join(', ');
        debugPrint(
            '[SyncService] ⚠ SKIP $name ($pkVals): '
            '$colInvalida="${data[colInvalida]}" no es UUID válido');
        // Estado terminal 'skipped' (NO 'error'): el ID nunca será un UUID
        // válido, así que reintentarlo es inútil. Distinto de 'error'
        // (transitorio, se reintenta cada ciclo): 'skipped' no se re-selecciona
        // arriba ni cuenta para el indicador rojo, que queda reservado a fallos
        // que sí vale la pena reintentar.
        final whereSql = pk.map((c) => '$c = ?').join(' AND ');
        final whereArgs = pk.map((c) => r.data[c]).toList();
        await db.customStatement(
          "UPDATE $name SET sync_status='skipped' WHERE $whereSql",
          whereArgs,
        );
        continue;
      }

      try {
        final resp = await client
            .from(name)
            .upsert(data, onConflict: pk.join(','))
            .select('server_updated_at')
            .maybeSingle();
        final serverUpd = (resp?['server_updated_at'] as num?)?.toInt();

        final whereSql = pk.map((c) => '$c = ?').join(' AND ');
        final whereArgs = pk.map((c) => r.data[c]).toList();
        await db.customStatement(
          "UPDATE $name SET sync_status='synced', server_updated_at=?, empresa_id=? "
          "WHERE $whereSql",
          [serverUpd, empresaId, ...whereArgs],
        );
      } on PostgrestException catch (e) {
        if (e.message.contains('uq_asist') && name == 'asistencias') {
          debugPrint('[SyncService] ⚠ PUSH $name: Conflicto uq_asist. Resolviendo...');
          // Colisión de constraint UNIQUE (colaborador_id, obra_id, fecha).
          // El servidor ya tiene un registro. Tomamos su ID y actualizamos el local.
          final existing = await client
              .from(name)
              .select('id')
              .eq('colaborador_id', data['colaborador_id'])
              .eq('obra_id', data['obra_id'])
              .eq('fecha', data['fecha'])
              .maybeSingle();
              
          if (existing != null) {
            final serverId = existing['id'] as String;
            final oldId = data['id'] as String;
            
            // Actualizamos el ID local
            await db.customStatement(
              "UPDATE $name SET id = ? WHERE id = ?",
              [serverId, oldId]
            );
            
            // Reintentamos upsert con el ID del servidor (ahora hará update)
            data['id'] = serverId;
            final resp2 = await client
                .from(name)
                .upsert(data, onConflict: pk.join(','))
                .select('server_updated_at')
                .maybeSingle();
                
            final serverUpd = (resp2?['server_updated_at'] as num?)?.toInt();
            await db.customStatement(
              "UPDATE $name SET sync_status='synced', server_updated_at=?, empresa_id=? "
              "WHERE id = ?",
              [serverUpd, empresaId, serverId],
            );
            continue;
          }
        }

        // Conflicto de REGLA DE NEGOCIO del servidor (CHECK, SQLSTATE 23514):
        // la regla de "1 jornada/día por persona". NO es un error de sistema ni
        // se arregla reintentando —necesita que alguien decida qué registro se
        // queda—, así que se marca 'conflict' (queda fuera de los candidatos de
        // push: deja de reintentar en bucle) para listarlo en la pantalla de
        // conflictos. Se resuelve al corregir/omitir/reemplazar en esa pantalla.
        if (name == 'asistencias' && _esConflictoJornada(e)) {
          final whereSqlC = pk.map((c) => '$c = ?').join(' AND ');
          final whereArgsC = pk.map((c) => r.data[c]).toList();
          // customUpdate (no customStatement) para que Drift notifique: así el
          // contador del indicador y la lista de conflictos aparecen en cuanto
          // el sync detecta el rechazo, sin esperar otra escritura.
          await db.customUpdate(
            "UPDATE $name SET sync_status='conflict' WHERE $whereSqlC",
            variables: whereArgsC.map<Variable>((a) => Variable(a)).toList(),
            updates: {t},
          );
          debugPrint('[SyncService] ⚑ CONFLICTO $name: ${e.message}');
          continue;
        }

        ultimoErrorPush = '$name: ${e.message}';
        final pkVals = pk.map((c) => '$c=${r.data[c]}').join(', ');
        debugPrint('[SyncService] ✖ PUSH $name fallo en fila ($pkVals): $e');
        debugPrint('[SyncService]   data enviada: $data');
        final whereSqlErr = pk.map((c) => '$c = ?').join(' AND ');
        final whereArgsErr = pk.map((c) => r.data[c]).toList();
        await db.customStatement(
          "UPDATE $name SET sync_status='error' WHERE $whereSqlErr",
          whereArgsErr,
        );
        erroresFila++;
        continue;
      } catch (e) {
        ultimoErrorPush = '$name: $e';
        final pkVals = pk.map((c) => '$c=${r.data[c]}').join(', ');
        debugPrint('[SyncService] ✖ PUSH $name fallo en fila ($pkVals): $e');
        debugPrint('[SyncService]   data enviada: $data');
        final whereSqlErr = pk.map((c) => '$c = ?').join(' AND ');
        final whereArgsErr = pk.map((c) => r.data[c]).toList();
        await db.customStatement(
          "UPDATE $name SET sync_status='error' WHERE $whereSqlErr",
          whereArgsErr,
        );
        erroresFila++;
        continue;
      }
    }

    return erroresFila;
  }

  // ---------------- PULL ----------------
  /// Trae del servidor todo lo que cambió en [name] desde el último cursor.
  ///
  /// Pagina hasta agotar: un ciclo de sync deja la tabla al día, no "las
  /// primeras 1 000 filas al día". Cada página se aplica dentro de UNA
  /// transacción y con UN lote de sentencias, en vez de dos idas y vueltas a
  /// SQLite por fila.
  ///
  /// El cursor se guarda al terminar cada página, no al final de todo: si la
  /// red se cae en la página 7, las seis anteriores no se vuelven a pedir.
  /// Cada página es, por sí sola, un avance que no se pierde.
  ///
  /// Ver `pull_paginado.dart` para el porqué de cada pieza.
  Future<void> _pullTabla(String name) async {
    final t = _info(name);
    final pk = _pk(t);
    final localCols = t.$columns.map((c) => c.name).toSet();

    var cursor = _cursorGuardado(name, pk);

    for (var pagina = 0; ; pagina++) {
      final filas = await _paginaDelServidor(name, cursor, pk);
      if (filas.isEmpty) return;

      await _aplicarPagina(name, t, pk, localCols, filas);

      // El cursor avanza a la ÚLTIMA fila de la página, que por el ORDER BY es
      // la mayor en `(server_updated_at, ...pk)`. Avanzarlo al máximo del
      // `server_updated_at` a secas —como se hacía antes— pierde la posición
      // dentro de un empate y devuelve el problema del borde de página.
      final ultima = filas.last;
      cursor = CursorPull(
        (ultima['server_updated_at'] as num?)?.toInt() ?? cursor.serverUpdatedAt,
        {for (final c in pk) c: ultima[c]},
      );
      await metadata.setCursor(
        name,
        cursor.serverUpdatedAt,
        // `SyncMetadata` guarda un solo `id`; con PK compuesta se guarda la
        // clave completa serializada. Es opaco para quien lo lee: sólo tiene
        // que volver a entrar tal cual en el filtro del cursor.
        _serializarClave(cursor.clavePrimaria, pk),
      );

      // Una página incompleta significa que el servidor no tenía más. Es la
      // única condición de parada: no se cuenta cuántas van, porque el número
      // de páginas depende de cuánto haya cambiado, no de un tope nuestro.
      if (filas.length < tamanoPaginaPull) return;

      // Salvaguarda contra un bucle infinito. No debería activarse nunca: si lo
      // hace es que el cursor no avanza, y seguir pidiendo la misma página para
      // siempre es peor que parar y que el próximo ciclo lo reintente.
      if (pagina >= 999) {
        debugPrint(
            '[SyncService] ⚠️ pull de $name cortado en la página 1000: el '
            'cursor no avanza. Cursor actual: $cursor');
        return;
      }
    }
  }

  /// Reconstruye el cursor persistido. Sin cursor guardado, empieza del inicio.
  CursorPull _cursorGuardado(String name, List<String> pk) {
    final ts = metadata.cursorTs(name);
    final clave = metadata.cursorId(name);
    if (ts == 0 || clave == null || clave.isEmpty) {
      return const CursorPull.inicio();
    }
    final partes = clave.split(separadorClave);
    // Si el formato guardado no cuadra con la PK actual (por ejemplo, tras una
    // migración que cambió la clave), se descarta el desempate y se conserva el
    // timestamp: se re-traerán las filas de ese milisegundo, que es inofensivo
    // porque el upsert es idempotente, y no se pierde ninguna.
    if (partes.length != pk.length) return CursorPull(ts, const {});
    return CursorPull(ts, {for (var i = 0; i < pk.length; i++) pk[i]: partes[i]});
  }

  static String _serializarClave(Map<String, Object?> clave, List<String> pk) =>
      pk.map((c) => clave[c]?.toString() ?? '').join(separadorClave);

  /// Una página de filas del servidor, posteriores al cursor.
  Future<List<Map<String, dynamic>>> _paginaDelServidor(
    String name,
    CursorPull cursor,
    List<String> pk,
  ) async {
    var consulta = client.from(name).select();

    final filtro = filtroCursorPull(cursor, pk);
    if (filtro != null) consulta = consulta.or(filtro);

    // El ORDER BY tiene que ser el MISMO que la comparación del cursor, y total
    // (con la PK dentro). Ordenar sólo por `server_updated_at` deja el orden de
    // los empates a criterio de Postgres, y entonces el cursor apunta a una
    // fila que la siguiente consulta puede colocar en otro sitio.
    var ordenada = consulta.order('server_updated_at', ascending: true);
    for (final c in pk) {
      ordenada = ordenada.order(c, ascending: true);
    }

    final filas = await ordenada.limit(tamanoPaginaPull);
    return (filas as List).cast<Map<String, dynamic>>();
  }

  /// Aplica una página: decide el LWW de todas las filas con UNA consulta y
  /// escribe con UN lote, dentro de una transacción.
  Future<void> _aplicarPagina(
    String name,
    TableInfo t,
    List<String> pk,
    Set<String> localCols,
    List<Map<String, dynamic>> filas,
  ) async {
    await db.transaction(() async {
      // ── 1. Estado local de toda la página, de una vez ──────────────────
      final variables = <Variable>[];
      for (final fila in filas) {
        for (final c in pk) {
          variables.add(Variable(fila[c]));
        }
      }
      final locales = await db
          .customSelect(
            sqlEstadoLocalDePagina(name, pk, filas.length),
            variables: variables,
          )
          .get();

      final estadoPorClave = <String, ({String? status, int updatedAt})>{};
      for (final f in locales) {
        estadoPorClave[claveDeFila(f.data, pk)] = (
          status: f.data['sync_status'] as String?,
          updatedAt: (f.data['updated_at'] as int?) ?? 0,
        );
      }

      // ── 2. Un lote con los upserts que sí proceden ─────────────────────
      var escritas = 0;
      await db.batch((lote) {
        for (final fila in filas) {
          final local = estadoPorClave[claveDeFila(fila, pk)];
          if (local != null &&
              ganaLoLocal(
                syncStatusLocal: local.status,
                updatedAtLocal: local.updatedAt,
                updatedAtServidor: (fila['updated_at'] as num?)?.toInt(),
              )) {
            continue; // gana el cambio local; se empujará en el próximo push
          }

          final cols = fila.keys.where(localCols.contains).toList();
          final colList = [...cols, 'sync_status'].join(',');
          final huecos = List.filled(cols.length + 1, '?').join(',');
          lote.customStatement(
            'INSERT OR REPLACE INTO $name ($colList) VALUES ($huecos)',
            [...cols.map((c) => fila[c]), 'synced'],
          );
          escritas++;
        }
      });

      // ── 3. Un solo aviso a los streams ─────────────────────────────────
      // `batch` con `customStatement` no sabe qué tabla tocó, así que Drift no
      // re-emite los `.watch()` por su cuenta. Se avisa una vez por página en
      // vez de una vez por fila: antes, un pull de mil filas repintaba la UI
      // mil veces.
      if (escritas > 0) {
        db.notifyUpdates({TableUpdate.onTable(t, kind: UpdateKind.insert)});
      }
    });
  }
}
