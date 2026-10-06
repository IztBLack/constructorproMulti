/// Las piezas del PULL que se pueden probar sin red ni servidor.
///
/// `SyncService._pullTabla` era, hasta esta versión, un bucle que hacía **una
/// consulta local y un INSERT por cada fila traída**, sin transacción, con un
/// `.limit(1000)` sin paginar y un cursor que sólo miraba `server_updated_at`.
/// Tres problemas de distinta naturaleza vivían en las mismas veinte líneas:
///
///   1. **No paginaba.** Con más de 1 000 filas nuevas, un ciclo de sync traía
///      las primeras 1 000 y decía que había terminado. Y 1 000 no es un número
///      elegido: es exactamente el `max_rows` de PostgREST en este proyecto, así
///      que el servidor jamás iba a devolver más aunque se pidiera.
///   2. **Perdía filas en el borde de página.** El cursor era
///      `server_updated_at > X`. Dos filas selladas en el mismo milisegundo, una
///      al final de una página y otra al principio de la siguiente, y la segunda
///      no se traía NUNCA. `SyncMetadata` ya guardaba un `cursorId` para
///      desempatar —lo documentaba como "corrección clave del plan de sync"—
///      pero la consulta no lo usaba.
///   3. **N+1 local.** Por cada fila: un SELECT para decidir el LWW y un INSERT.
///      Mil filas eran dos mil idas y vueltas a SQLite, cada una notificando a
///      los streams de Drift, o sea repintando la UI cientos de veces durante el
///      sync.
///
/// Este archivo saca de ahí lo que es lógica pura —construir el cursor, el
/// filtro y el SQL— para poder fijarlo con tests, que es lo que faltaba. La
/// orquestación (pedir páginas, abrir transacción) se queda en `SyncService`.
library;

/// Posición del pull dentro de una tabla.
///
/// Es un cursor de tipo *keyset*: no un número de página, sino "la última fila
/// que ya apliqué". Sobrevive a que el servidor reciba filas nuevas mientras
/// estamos paginando, cosa que un `OFFSET` no hace —con offset, una inserción a
/// mitad del recorrido desplaza todo y una fila se salta o se repite—.
class CursorPull {
  const CursorPull(this.serverUpdatedAt, this.clavePrimaria);

  /// Cursor inicial: traer todo desde el principio.
  const CursorPull.inicio()
      : serverUpdatedAt = 0,
        clavePrimaria = const {};

  /// Sello del servidor de la última fila aplicada.
  final int serverUpdatedAt;

  /// Valores de la clave primaria de esa última fila, por nombre de columna.
  ///
  /// Es un mapa y no un `String` porque no todas las tablas tienen `id`:
  /// `obra_colaborador` tiene PK compuesta `(obra_id, colaborador_id)`,
  /// `colaborador_sueldo` la tiene en `colaborador_id` y `obra_caja_nota` en
  /// `obra_id`. Un cursor que asumiera `id` funcionaría en 18 de las 21 tablas,
  /// que es la peor de las opciones: falla sólo donde nadie mira.
  final Map<String, Object?> clavePrimaria;

  /// ¿Es el cursor de "nunca he sincronizado esta tabla"?
  bool get esInicio => serverUpdatedAt == 0 && clavePrimaria.isEmpty;

  @override
  String toString() => 'CursorPull($serverUpdatedAt, $clavePrimaria)';
}

/// Cuántas filas se piden por página.
///
/// Por debajo del `max_rows = 1000` de PostgREST a propósito. Si el tope del
/// servidor bajara, el bucle seguiría siendo correcto —terminaría antes de
/// tiempo sólo si la página viniera corta, y por eso la condición de parada NO
/// es "vino corta" a secas, sino que se combina con el avance del cursor.
const int tamanoPaginaPull = 500;

/// Construye el filtro PostgREST que pide "todo lo posterior a [cursor]".
///
/// La comparación es lexicográfica sobre `(server_updated_at, ...pk)`:
///
///     server_updated_at > TS
///  OR (server_updated_at = TS AND pk1 > K1)
///  OR (server_updated_at = TS AND pk1 = K1 AND pk2 > K2)
///  ...
///
/// Es la traducción de "la fila siguiente en el orden en que estoy leyendo".
/// Con un solo `>` sobre el timestamp se pierden las filas empatadas; con `>=`
/// se repiten para siempre las del propio borde y el bucle no avanza. La forma
/// de arriba es la única que ni salta ni se atasca.
///
/// Devuelve `null` cuando el cursor es el de inicio: ahí no hay nada que
/// filtrar y añadir `server_updated_at > 0` sólo estorbaría al planificador.
String? filtroCursorPull(CursorPull cursor, List<String> columnasPk) {
  if (cursor.esInicio) return null;

  final ts = cursor.serverUpdatedAt;
  final clausulas = <String>['server_updated_at.gt.$ts'];

  // Las PK presentes en el cursor, en el mismo orden que el ORDER BY.
  final pk = columnasPk.where(cursor.clavePrimaria.containsKey).toList();

  for (var i = 0; i < pk.length; i++) {
    final partes = <String>['server_updated_at.eq.$ts'];
    for (var j = 0; j < i; j++) {
      partes.add('${pk[j]}.eq.${_valor(cursor.clavePrimaria[pk[j]])}');
    }
    partes.add('${pk[i]}.gt.${_valor(cursor.clavePrimaria[pk[i]])}');
    clausulas.add('and(${partes.join(',')})');
  }

  return clausulas.join(',');
}

/// Serializa un valor de PK para la sintaxis de filtros de PostgREST.
///
/// Las PK de este esquema son uuid o texto sin comas ni paréntesis, así que no
/// hay nada que escapar; se comprueba igualmente porque un valor con una coma
/// partiría el filtro en dos condiciones distintas y el error sería silencioso
/// (traería filas de más, no un fallo).
String _valor(Object? v) {
  final s = v?.toString() ?? '';
  if (s.contains(',') || s.contains('(') || s.contains(')') || s.contains('"')) {
    throw ArgumentError(
      'Valor de clave primaria no apto para un filtro PostgREST: "$s". '
      'Las PK de este esquema son uuid; si esto salta, algo cambió en el '
      'esquema y el cursor de pull necesita otra codificación.',
    );
  }
  return s;
}

/// SQL que lee de golpe el estado local de todas las filas de una página.
///
/// Sustituye a un SELECT por fila. Devuelve las columnas de PK más
/// `sync_status` y `updated_at`, que es lo único que la decisión de LWW mira.
///
/// Con PK simple usa `IN (?, ?, …)`, que es lo que SQLite optimiza mejor. Con
/// PK compuesta cae a un `OR` de `AND`s: es más largo de escribir pero se
/// resuelve igual por la PK, y evita depender de la sintaxis de tuplas, que
/// SQLite sólo soporta en versiones recientes.
String sqlEstadoLocalDePagina(
  String tabla,
  List<String> columnasPk,
  int cuantasFilas,
) {
  final seleccion = [...columnasPk, 'sync_status', 'updated_at'].join(', ');

  if (columnasPk.length == 1) {
    final huecos = List.filled(cuantasFilas, '?').join(', ');
    return 'SELECT $seleccion FROM $tabla WHERE ${columnasPk.first} IN ($huecos)';
  }

  final unaFila = columnasPk.map((c) => '$c = ?').join(' AND ');
  final todas = List.filled(cuantasFilas, '($unaFila)').join(' OR ');
  return 'SELECT $seleccion FROM $tabla WHERE $todas';
}

/// Separador de las partes de una clave primaria compuesta.
///
/// No es un espacio ni un guion: un uuid no los lleva, pero si algún día una PK
/// fuera texto libre, `('a b', 'c')` y `('a', 'b c')` producirían la MISMA clave
/// y dos filas distintas se pisarían en el mapa. Un carácter de control no
/// aparece en ningún dato real. Es el mismo que usa `SyncService` para
/// serializar el cursor, y tiene que seguir siéndolo: lo que se guarda en disco
/// se vuelve a partir por aquí.
const String separadorClave = '\u0001';

/// Clave de comparación de una fila, para cruzar lo del servidor con lo local
/// sin depender del orden en que vinieron.
String claveDeFila(Map<String, Object?> fila, List<String> columnasPk) =>
    columnasPk.map((c) => fila[c]?.toString() ?? '').join(separadorClave);

/// ¿Gana el cambio LOCAL sobre el que trae el servidor?
///
/// Regla (la misma de antes, extraída para poder probarla): gana lo local sólo
/// si la fila está `pending` —es decir, tiene una edición sin subir— y su
/// `updated_at` es más nuevo que el del servidor.
///
/// El centinela para `updated_at` nulo del servidor no es un detalle: la web
/// escribe a Supabase sin `updated_at` de cliente (sólo el trigger sella
/// `server_updated_at`). Si viniera null y lo tratáramos como 0, CUALQUIER fila
/// local pendiente ganaría y los cambios hechos desde la oficina se perderían
/// en silencio. Tratándolo como "muy nuevo" gana el servidor, que es lo
/// correcto: si la web lo escribió, es que alguien lo escribió a propósito.
bool ganaLoLocal({
  required String? syncStatusLocal,
  required int updatedAtLocal,
  required int? updatedAtServidor,
}) {
  if (syncStatusLocal != 'pending') return false;
  const muyNuevo = 9223372036854775807;
  return updatedAtLocal > (updatedAtServidor ?? muyNuevo);
}
