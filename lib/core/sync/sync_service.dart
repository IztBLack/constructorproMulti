import 'dart:async';

import 'package:connectivity_plus/connectivity_plus.dart';
import 'package:drift/drift.dart';
import 'package:flutter/foundation.dart';
import 'package:supabase_flutter/supabase_flutter.dart';

import '../../domain/sync/rechazos_sync.dart';
import '../db/app_database.dart';
import 'bitacora_sync.dart';
import 'cuenta_local.dart';
import 'sync_metadata.dart';
import 'supabase_config.dart';

/// Resultado de un intento de sincronización.
///
/// [parcial]: el PULL corrió completo, pero una o más filas del PUSH
/// fallaron (quedaron marcadas `sync_status='error'` localmente) y se
/// reintentarán en el próximo ciclo. No oculta que la sincronización sí
/// avanzó, a diferencia de [error] (fallo total, p. ej. el PULL).
///
/// [cuentaPorConfirmar]: la base del teléfono es de OTRA empresa que la de la
/// sesión (cambio de cuenta sin resolver). No se sube ni se baja nada hasta que
/// la persona decida en la pantalla de nube (`docs/PLAN_CAMBIO_DE_CUENTA.md`).
enum SyncOutcome {
  ok,
  sinSesion,
  sinRed,
  sinEmpresa,
  cuentaPorConfirmar,
  error,
  parcial,
}

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
/// Pull por páginas de 1000 con cursor compuesto (server_updated_at, id): un
/// alta masiva con el mismo timestamp ya no deja filas sin bajar (2026-10-13;
/// antes era `> cursor` con límite 1000 y saltaba el resto del empate).
class SyncService {
  SyncService({
    required this.db,
    required this.metadata,
    SupabaseClient? client,
    this.onActividad,
    this.bitacora,
    this.cuentaLocal,
    this.onCuentaPorConfirmar,
  }) : client = client ?? SupabaseConfig.client;

  final AppDatabase db;
  final SyncMetadata metadata;
  final SupabaseClient client;

  /// Push propio de la bitácora. Null en pruebas que no la ejercen: sus filas
  /// se quedan pendientes, pero el pull sí corre.
  final BitacoraSync? bitacora;

  /// De quién son los datos locales. Null en pruebas que no ejercen el cambio
  /// de cuenta: entonces no hay candado (el comportamiento de antes).
  final CuentaLocal? cuentaLocal;

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

  /// Mientras se vacía la base local (cambio de cuenta, rehacer la copia), el
  /// sync no corre: subiría o bajaría filas a la mitad del borrado.
  bool _pausado = false;

  /// Detiene el sync y espera a que termine el que esté en curso.
  ///
  /// Con tope: un sync colgado por la red no debe dejar girando para siempre
  /// la pantalla que está esperando. Si se cumple, reanuda y lanza
  /// `TimeoutException`; quien llama no vacía nada.
  Future<void> pausar({Duration tope = const Duration(seconds: 45)}) async {
    _pausado = true;
    final limite = DateTime.now().add(tope);
    while (_enCurso) {
      if (DateTime.now().isAfter(limite)) {
        _pausado = false;
        throw TimeoutException('El sync en curso no terminó', tope);
      }
      await Future<void>.delayed(const Duration(milliseconds: 200));
    }
  }

  /// El último ciclo se detuvo porque la base local es de otra cuenta (ver
  /// [SyncOutcome.cuentaPorConfirmar]). Se avisa por [onCuentaPorConfirmar]
  /// para que el indicador de sync no diga "pendiente" en silencio mientras
  /// nada sube.
  bool _cuentaPorConfirmar = false;
  bool get cuentaPorConfirmar => _cuentaPorConfirmar;
  set cuentaPorConfirmar(bool v) {
    if (v == _cuentaPorConfirmar) return;
    _cuentaPorConfirmar = v;
    onCuentaPorConfirmar?.call(v);
  }

  final void Function(bool)? onCuentaPorConfirmar;

  void reanudar() => _pausado = false;

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

  /// El último rechazo del push, clasificado: causa en palabras de obra, si se
  /// reintenta solo, y el detalle técnico aparte. Null si no hubo fallos de
  /// fila. Es lo que muestra la pantalla de nube (U1 de la auditoría de UX).
  RechazoSync? ultimoRechazo;

  /// Filas apartadas en el último ciclo (genérico + bitácora). Lo que
  /// sobrevive a reiniciar la app es el estado [estadoApartada] en la base
  /// (`AppDatabase.vigilarApartadas`).
  int filasAjenas = 0;

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
    // Bitácora (0041): la entrada antes que sus fotos y aclaraciones. Están
    // aquí para el PULL y los conteos del indicador; su PUSH no es el genérico
    // (upsert de fila completa) sino el de [BitacoraSync], ver ahí por qué.
    'bitacora_entrada',
    'bitacora_foto',
    'bitacora_aclaracion',
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

  /// La variante para columnas NOT NULL con default (entradas `"t.c@<ms>"`
  /// de `AppDatabase.columnasPorLlenar`), donde no hay NULL que sirva de señal.
  ///
  /// Variables: valor, id, `<ms>` de la migración, valor otra vez.
  /// - `sync_status IN ('pending', 'error')`: SOLO las filas que de todos
  ///   modos se van a subir. Las `synced` no se tocan aquí: escribirles
  ///   dispararía `mark_pending` y el push subiría la fila ENTERA, con su texto
  ///   y montos de la última bajada, pisando lo que la web editó después. A
  ///   esas las arregla el pull completo que [_llenarColumnaNueva] provoca al
  ///   reiniciar el cursor de la tabla.
  /// - `updated_at <= ?` reserva el relleno a las filas INTACTAS desde que se
  ///   añadió la columna: el trigger `mark_pending` sube `updated_at` en cada
  ///   edición, así que una fila que el usuario tocó después de actualizar se
  ///   queda con lo que él vio y eligió.
  /// - `IS NOT ?` evita escribir donde ya coincide.
  static String sqlRellenoColumnaIntacta(
          String tabla, String col, String idCol) =>
      'UPDATE $tabla SET $col = ? '
      "WHERE $idCol = ? AND sync_status IN ('pending', 'error') "
      'AND updated_at <= ? AND $col IS NOT ?';

  /// True si el fallo de push es la regla de "1 jornada/día" del servidor
  /// (CHECK, SQLSTATE 23514). PostgREST entrega el cuerpo del error como un JSON
  /// dentro de `message`, con el `code` real adentro, así que se busca en ambos.
  static bool _esConflictoJornada(PostgrestException e) =>
      e.code == '23514' || e.message.contains('23514');

  /// Pasa a disco los avisos de relleno que dejó la migración en
  /// `AppDatabase.columnasPorLlenar`, que vive solo en memoria.
  ///
  /// Corre al arrancar (lo llama el [SyncController]) y al principio de cada
  /// [syncAll], sin depender de sesión ni de red: si el aviso se quedara en
  /// memoria hasta el primer sync con señal, y Android matara el proceso
  /// antes, la siguiente apertura ya no migra y el aviso se perdería para
  /// siempre. Abre la base si nadie lo ha hecho: Drift la abre perezosamente y
  /// la migración —que es quien anota— corre justo al abrirla.
  ///
  /// No lanza: si falla, el aviso sigue en memoria y se reintenta en la
  /// siguiente llamada.
  Future<void> persistirAvisosDeMigracion() async {
    try {
      await db.customSelect('SELECT 1').get();
      if (AppDatabase.columnasPorLlenar.isEmpty) return;
      await metadata.marcarPorLlenar(AppDatabase.columnasPorLlenar);
      AppDatabase.columnasPorLlenar.clear();
    } catch (e) {
      debugPrint('[SyncService] no se pudo guardar el aviso de relleno: $e');
    }
  }

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
    // El guard se toma ANTES de cualquier `await`: entre la revisión y la
    // marca no puede colarse otro sync ni un [pausar] (que, sin ver la marca,
    // vaciaría la base con este sync a medio camino).
    if (_enCurso || _pausado) return SyncOutcome.ok;
    _enCurso = true;
    // ANTES de las salidas por sesión o red: actualizar la app en la obra, sin
    // señal, es justo el caso en que el aviso tiene que sobrevivir a que
    // Android mate el proceso.
    final String empresaId;
    try {
      await persistirAvisosDeMigracion();
      if (!tieneSesion) {
        _enCurso = false;
        return SyncOutcome.sinSesion;
      }
      if (!await hayRed) {
        _enCurso = false;
        return SyncOutcome.sinRed;
      }
      final id = await _empresaIdActual();
      if (id == null) {
        _enCurso = false;
        return SyncOutcome.sinEmpresa;
      }
      empresaId = id;
      // Candado del cambio de cuenta: si los datos del teléfono son de otra
      // empresa u otro usuario, subirlos los mandaría a quien no es (el
      // origen de los 72 rechazos del teléfono de pruebas). Se espera a que
      // la persona decida en la pantalla de nube.
      final cuenta = cuentaLocal;
      if (cuenta != null &&
          !await cuenta.permiteSincronizar(
              empresaId, SupabaseConfig.currentUser?.id)) {
        _enCurso = false;
        cuentaPorConfirmar = true;
        return SyncOutcome.cuentaPorConfirmar;
      }
      cuentaPorConfirmar = false;
    } catch (e) {
      _enCurso = false;
      ultimoError = e.toString();
      debugPrint('[SyncService] no se pudo resolver la empresa: $e');
      return SyncOutcome.error;
    }

    onActividad?.call(true);
    var erroresPush = 0;
    ultimoErrorPush = null; // se llena si alguna fila falla en este ciclo
    ultimoRechazo = null;
    filasAjenas = 0;
    try {
      // 0) RELLENO de las columnas que una migración acaba de crear en NULL y
      //    que el servidor ya tenía llenas (ver `AppDatabase.columnasPorLlenar`,
      //    que explica qué se rompería sin esto). Va ANTES del push, que es lo
      //    único que importa: después ya sería tarde.
      //
      //    El aviso ya está en disco ([persistirAvisosDeMigracion], arriba):
      //    si el relleno falla a medias, la marca sigue puesta y el próximo
      //    ciclo lo reintenta.
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
          if (BitacoraSync.tablas.contains(t)) continue;
          erroresPush += await _pushTabla(t, empresaId);
        }
        // Después de obras: una entrada de bitácora cuelga de su obra.
        final b = bitacora;
        if (b != null) {
          final fallos = await b.push(empresaId);
          if (fallos > 0) {
            ultimoErrorPush = b.ultimoError;
            // La bitácora trae su propia causa en sus avisos; aquí solo
            // queda el detalle para soporte, como pasajero.
            ultimoRechazo ??= RechazoSync(
                tabla: 'bitacora_entrada',
                causa: null,
                detalleTecnico: b.ultimoError ?? '');
          }
          erroresPush += fallos;
          filasAjenas += b.filasAjenas;
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
      await metadata.marcarSubidaCompleta(DateTime.now());
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

  /// Estado de una fila que la nube no acepta para ESTA cuenta: es de otra
  /// empresa, o el servidor dice que existe y esta cuenta ya no la ve (un
  /// residente al que le quitaron la obra). No se sube ni se reintenta, pero
  /// —a diferencia de `skipped`— cuenta como trabajo sin subir: rehacer la
  /// copia o cambiar de cuenta avisa antes de borrarla.
  static const estadoApartada = 'ajena';

  /// Marca [estadoApartada] una fila y la cuenta en [filasAjenas].
  /// `customUpdate` (no `customStatement`) para que el indicador se entere.
  Future<void> _apartarAjena(String name, TableInfo t, List<String> pk,
      Map<String, Object?> fila) async {
    final pkVals = pk.map((c) => '$c=${fila[c]}').join(', ');
    debugPrint('[SyncService] ⚠ AJENA $name ($pkVals): es de otra empresa');
    await db.customUpdate(
      "UPDATE $name SET sync_status='$estadoApartada' "
      "WHERE ${pk.map((c) => '$c = ?').join(' AND ')}",
      variables: pk.map<Variable>((c) => Variable(fila[c])).toList(),
      updates: {t},
    );
    filasAjenas++;
  }

  /// ¿Esta empresa ve la fila en el servidor? Si el upsert chocó con una fila
  /// existente (rechazo «USING expression») y aun así no la ve, la fila es de
  /// otra empresa. Ante cualquier duda (sin red, error) responde `true`: lo
  /// seguro es seguir reintentando, nunca apartar de más.
  Future<bool> _visibleEnServidor(
      String name, List<String> pk, Map<String, Object?> fila) async {
    try {
      final filtro = {for (final c in pk) c: fila[c] as Object};
      final row =
          await client.from(name).select(pk.first).match(filtro).maybeSingle();
      return row != null;
    } catch (e) {
      debugPrint('[SyncService] no se pudo verificar $name: $e');
      return true;
    }
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
  /// [pendiente] llega como `"tabla.columna"` (rellena donde haya NULL) o
  /// `"tabla.columna@<ms>"` (rellena las filas intactas desde `<ms>`; ver
  /// [sqlRellenoColumnaIntacta] y `AppDatabase.columnasPorLlenar`).
  ///
  /// El `UPDATE` dispara `mark_pending` y deja `pending` a filas que estaban
  /// `synced`, así que el siguiente ciclo las vuelve a subir con el MISMO valor
  /// que acaban de recibir. Es una vuelta de más sobre unas decenas de filas,
  /// una sola vez; apagar el trigger para ahorrárselo costaría dejar la tabla
  /// sin él si algo revienta en medio, que es mucho peor que el ruido.
  Future<void> _llenarColumnaNueva(String pendiente) async {
    final (ref, hasta) = switch (pendiente.split('@')) {
      [final r] => (r, null),
      [final r, final ms] => (r, int.tryParse(ms)),
      _ => (pendiente, null),
    };
    // Un `@` sin número válido no se adivina: rellenar sin la guarda de
    // `updated_at` podría pisar lo que el usuario eligió en el teléfono.
    if (pendiente.contains('@') && hasta == null) return;
    final partes = ref.split('.');
    if (partes.length != 2) return;
    final (tabla, col) = (partes[0], partes[1]);

    final t = _info(tabla);
    final pk = _pk(t);
    // Solo PK simple: no hay ninguna tabla con PK compuesta que necesite esto,
    // y armar el WHERE para ese caso sin usarlo sería código sin probar.
    if (pk.length != 1) return;
    final idCol = pk.first;

    // Modo "fila intacta": las filas `synced` se arreglan bajándolas COMPLETAS
    // en el pull de este mismo ciclo (sin cambios locales, el LWW deja que el
    // servidor gane). Reiniciar el cursor cuesta bajar la tabla una vez; a
    // cambio, ninguna fila sin cambios locales se marca para subir.
    if (hasta != null) await metadata.reset(tabla);

    // Por páginas: PostgREST corta cada respuesta en 1000 filas, y una tabla
    // de renglones pasa de ahí sin esfuerzo. Sin paginar, las filas de la
    // página 2 en adelante se quedarían sin rellenar y sin aviso.
    const pagina = 1000;
    var desde = 0;
    var llenadas = 0;
    while (true) {
      final filas = await client
          .from(tabla)
          .select('$idCol,$col')
          .order(idCol)
          .range(desde, desde + pagina - 1);
      final lista = (filas as List).cast<Map<String, dynamic>>();
      for (final row in lista) {
        final crudo = row[col];
        if (crudo == null) continue;
        // SQLite guarda los bool como 0/1; con `IS NOT ?` un `true` sin
        // convertir nunca sería "igual" a 1 y se reescribiría todo.
        final valor = crudo is bool ? (crudo ? 1 : 0) : crudo;
        llenadas += await db.customUpdate(
          hasta == null
              ? sqlRellenoColumna(tabla, col, idCol)
              : sqlRellenoColumnaIntacta(tabla, col, idCol),
          variables: hasta == null
              ? [Variable(valor), Variable(row[idCol])]
              : [
                  Variable(valor),
                  Variable(row[idCol]),
                  Variable(hasta),
                  Variable(valor),
                ],
          updates: {t},
        );
      }
      // `isEmpty` y avanzar lo RECIBIDO, no `pagina`: si el servidor topara
      // las respuestas por debajo de 1000, una página corta no significaría
      // que se acabó, y saltar 1000 dejaría un hueco sin rellenar.
      if (lista.isEmpty) break;
      desde += lista.length;
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
      // Red de seguridad del cambio de cuenta: una fila de OTRA empresa no se
      // sube como si fuera de esta (abajo se sobrescribe `empresa_id`). Queda
      // apartada ([estadoApartada]): para esta cuenta nunca va a subir.
      if (esDeOtraEmpresa(r.data['empresa_id'] as String?, empresaId)) {
        await _apartarAjena(name, t, pk, r.data);
        continue;
      }
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

        // Fila que YA EXISTE en la nube y es de otra empresa: llegó a este
        // teléfono con una cuenta anterior y el sellado viejo (antes de la
        // 1.5.1) la reetiquetó como de esta. Es el caso del teléfono de
        // pruebas: localmente ya no se distingue, solo el servidor lo sabe.
        // Reintentarla es inútil; se aparta como las de [esDeOtraEmpresa].
        final causa = clasificarRechazoSync(code: e.code, message: e.message);
        if (causa == CausaRechazo.sinPermiso &&
            esRechazoDeFilaExistente(e.message) &&
            !await _visibleEnServidor(name, pk, r.data)) {
          await _apartarAjena(name, t, pk, r.data);
          continue;
        }

        ultimoErrorPush = '$name: ${e.message}';
        ultimoRechazo = RechazoSync(
          tabla: name,
          causa: causa,
          detalleTecnico: '$name · ${e.code ?? 's/código'} · ${e.message}',
        );
        final pkVals = pk.map((c) => '$c=${r.data[c]}').join(', ');
        debugPrint('[SyncService] ✖ PUSH $name fallo en fila ($pkVals): $e');
        // La fila completa solo en desarrollo: en release `debugPrint` llega
        // a logcat, y ahí no deben quedar nombres ni montos.
        if (kDebugMode) debugPrint('[SyncService]   data enviada: $data');
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
        // La fila completa solo en desarrollo: en release `debugPrint` llega
        // a logcat, y ahí no deben quedar nombres ni montos.
        if (kDebugMode) debugPrint('[SyncService]   data enviada: $data');
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
  Future<void> _pullTabla(String name) async {
    final t = _info(name);
    final pk = _pk(t);
    final localCols = t.$columns.map((c) => c.name).toSet();
    final cursorTs = metadata.cursorTs(name);

    // Por páginas y con cursor COMPUESTO (server_updated_at, id). Antes era
    // una sola consulta `> cursor` con límite 1000: si más de 1000 filas
    // compartían el mismo server_updated_at (un alta masiva en una sola
    // transacción), las que no cabían se saltaban PARA SIEMPRE. Se empieza
    // con `>=` para re-leer el último grupo empatado (inofensivo: LWW) y,
    // dentro de la corrida, se avanza por (ts, id).
    const pagina = 1000;
    final idCol = pk.length == 1 ? pk.first : null;
    var maxTs = cursorTs;
    String lastId = metadata.cursorId(name) ?? '';
    var pagTs = cursorTs;
    String? pagId;
    final serverRows = <Map<String, dynamic>>[];
    while (true) {
      var q = client.from(name).select();
      if (idCol == null) {
        q = q.gt('server_updated_at', pagTs);
      } else if (pagId == null) {
        q = q.gte('server_updated_at', pagTs);
      } else {
        q = q.or('server_updated_at.gt.$pagTs,'
            'and(server_updated_at.eq.$pagTs,$idCol.gt.$pagId)');
      }
      final ordenada = q.order('server_updated_at', ascending: true);
      final filas = ((idCol == null
                  ? await ordenada.limit(pagina)
                  : await ordenada
                      .order(idCol, ascending: true)
                      .limit(pagina)) as List)
          .cast<Map<String, dynamic>>();
      serverRows.addAll(filas);
      if (filas.length < pagina || idCol == null) break;
      final ultima = filas.last;
      pagTs = (ultima['server_updated_at'] as num?)?.toInt() ?? pagTs;
      pagId = ultima[idCol]?.toString();
      if (pagId == null) break;
    }

    for (final row in serverRows) {
      final sut = (row['server_updated_at'] as num?)?.toInt() ?? 0;
      if (sut > maxTs) maxTs = sut;

      // LWW: conservar edición local no sincronizada más nueva.
      final whereSql = pk.map((c) => '$c = ?').join(' AND ');
      final pkArgs = pk.map((c) => row[c]).toList();
      final locales = await db
          .customSelect(
            "SELECT sync_status, updated_at FROM $name WHERE $whereSql",
            variables: pkArgs.map<Variable>((a) => Variable(a)).toList(),
          )
          .get();
      if (locales.isNotEmpty) {
        final lr = locales.first.data;
        // Bitácora: se protege TODA fila que no esté `synced`. Sus `error` y
        // `skipped` guardan trabajo de la persona (una entrada que aún no sube,
        // un alta rechazada con su aviso) que este reemplazo borraría.
        if (BitacoraSync.tablas.contains(name) &&
            lr['sync_status'] != 'synced') {
          continue;
        }
        final pending = lr['sync_status'] == 'pending';
        final localUpd = (lr['updated_at'] as int?) ?? 0;
        // La web escribe a Supabase sin `updated_at` de cliente (solo el
        // trigger sella `server_updated_at`). Si viene null, lo tratamos como
        // "muy nuevo" (centinela = int máximo) para que gane el server salvo
        // que el local pending tenga un timestamp genuino mayor a ese
        // centinela, lo cual nunca ocurre: evita que un `updated_at` nulo del
        // server haga perder silenciosamente cambios subidos desde la web.
        final serverUserUpd =
            (row['updated_at'] as num?)?.toInt() ?? 9223372036854775807;
        if (pending && localUpd > serverUserUpd) {
          continue; // gana el cambio local; se empujará en el próximo push
        }
      }

      // Upsert local con sync_status='synced'.
      final cols = row.keys.where(localCols.contains).toList();
      final colList = [...cols, 'sync_status'].join(',');
      final placeholders = List.filled(cols.length + 1, '?').join(',');
      // `valorLocal` convierte lo que SQLite no sabe guardar (el `text[]` de
      // la bitácora llega como lista y aquí va como JSON; ligar una lista
      // reventaría el pull de esa tabla y de todas las que siguen).
      final vals = <Object?>[
        ...cols.map((c) => BitacoraSync.valorLocal(name, c, row[c])),
        'synced',
      ];
      // customUpdate (en vez de customStatement) para que Drift notifique
      // la tabla y los streams .watch() se re-emitan tras el pull.
      await db.customUpdate(
        "INSERT OR REPLACE INTO $name ($colList) VALUES ($placeholders)",
        variables: vals.map((v) => Variable(v)).toList(),
        updates: {t},
      );

      if (pk.length == 1) lastId = row[pk.first]?.toString() ?? lastId;
    }

    if (maxTs > cursorTs) {
      await metadata.setCursor(name, maxTs, lastId);
    }
  }
}
