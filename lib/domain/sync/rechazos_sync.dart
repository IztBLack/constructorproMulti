/// Por qué el servidor no aceptó un cambio, dicho para quien está en la obra.
///
/// Generaliza a todas las tablas lo que la bitácora ya hacía bien
/// (`clasificarRechazo` en `domain/bitacora/bitacora_reglas.dart`): antes, la
/// pantalla de nube mostraba el mensaje crudo de Postgres —en el teléfono de
/// pruebas, `cuadrilla_miembro: {"code":"42501"…}`— y un "Sincronizar ahora"
/// que reintentaba lo que el servidor iba a rechazar siempre. Cada causa trae
/// su explicación, qué hacer, y si se arregla sola al reintentar.
enum CausaRechazo {
  /// La fila ya existe en la nube y es de OTRA empresa: vino de una cuenta que
  /// se usó antes en este teléfono. Nunca va a subir a esta cuenta.
  otraCuenta,

  /// Las reglas de acceso (RLS) no dejan a este usuario hacer este cambio:
  /// típicamente, su rol no lo permite.
  sinPermiso,

  /// Los datos no cumplen una regla del servidor (CHECK, valor fuera de rango,
  /// texto demasiado largo, campo obligatorio vacío).
  datosInvalidos,

  /// Falta en la nube algo de lo que depende (la obra o la persona de una
  /// asistencia). Suele arreglarse solo cuando sube lo que falta.
  faltaRelacion,

  /// Ya existe otro registro igual (regla de "solo uno").
  duplicado,

  /// El servidor tiene una versión más nueva de la estructura que esta app no
  /// conoce (o al revés): se arregla actualizando la app.
  appDesactualizada,
}

/// Clasifica un error de PostgREST/Postgres por su código (SQLSTATE o el de
/// PostgREST) y, si hace falta, por su texto. Devuelve null para lo pasajero
/// (sin red, timeout, servidor caído, sesión vencida): eso se reintenta solo.
///
/// Nunca devuelve [CausaRechazo.otraCuenta]: un 42501 solo dice "no se pudo";
/// distinguir "es de otra cuenta" de "tu rol no puede" requiere preguntarle al
/// servidor si la fila existe (lo hace `SyncService`, ver
/// [esRechazoDeFilaExistente]).
///
/// Igual que en la bitácora, «permission denied» suelto NO se toma como falta
/// de permiso: también es lo que dice el sistema operativo cuando falla un
/// socket, y tratar un corte de red como definitivo confundiría a la persona.
CausaRechazo? clasificarRechazoSync({String? code, required String message}) {
  final m = message.toLowerCase();
  if (code == '42501' || m.contains('row-level security')) {
    return CausaRechazo.sinPermiso;
  }
  switch (code) {
    case '23503':
      return CausaRechazo.faltaRelacion;
    case '23505':
      return CausaRechazo.duplicado;
    case '23514': // CHECK
    case '23502': // NOT NULL
    case '22001': // texto demasiado largo
    case '22003': // número fuera de rango
    case '22P02': // valor con formato inválido
    case '22007': // fecha inválida
      return CausaRechazo.datosInvalidos;
    case 'PGRST204': // columna que el servidor no tiene
    case 'PGRST205': // tabla que el servidor no tiene
    case '42703': // columna inexistente
    case '42P01': // tabla inexistente
      return CausaRechazo.appDesactualizada;
  }
  return null;
}

/// ¿El rechazo RLS ocurrió sobre una fila que YA EXISTE en el servidor?
///
/// Un upsert que choca con una fila existente pasa por la política de UPDATE,
/// y si esa fila no es visible para esta empresa Postgres responde «violates
/// row-level security policy (USING expression)». Cuando la fila no existe, el
/// INSERT falla por la política de alta («WITH CHECK expression»): eso es falta
/// de permiso del rol, no una fila ajena.
bool esRechazoDeFilaExistente(String message) =>
    message.toLowerCase().contains('using expression');

/// ¿La fila local es de otra empresa? Las filas sin empresa (`''` o null) se
/// capturaron sin cuenta y la cuenta actual las adopta (offline-first).
bool esDeOtraEmpresa(String? empresaFila, String empresaActual) =>
    empresaFila != null && empresaFila.isNotEmpty && empresaFila != empresaActual;

/// ¿Se arregla solo al reintentar? Si no, la persona tiene que hacer algo.
bool seReintentaSola(CausaRechazo c) => c == CausaRechazo.faltaRelacion;

/// Qué pasó, en palabras de obra.
String explicarRechazoSync(CausaRechazo c) => switch (c) {
      CausaRechazo.otraCuenta =>
        'Hay datos de otra cuenta que se usó antes en este teléfono. No se '
            'pueden subir a esta.',
      CausaRechazo.sinPermiso =>
        'Tu usuario no tiene permiso para hacer este cambio.',
      CausaRechazo.datosInvalidos =>
        'La nube no aceptó estos datos porque no cumplen una de sus reglas.',
      CausaRechazo.faltaRelacion =>
        'Falta subir primero algo de lo que depende este cambio (por ejemplo, '
            'la obra o la persona).',
      CausaRechazo.duplicado => 'En la nube ya existe un registro igual.',
      CausaRechazo.appDesactualizada =>
        'La nube espera una versión más nueva de la app.',
    };

/// Qué hacer. Corto y con la salida a la vista.
String accionRechazoSync(CausaRechazo c) => switch (c) {
      CausaRechazo.otraCuenta =>
        'Rehaz la copia de este teléfono desde la nube.',
      CausaRechazo.sinPermiso =>
        'Pide al administrador que revise tu rol en la web.',
      CausaRechazo.datosInvalidos =>
        'Revisa el registro o comparte el detalle con soporte.',
      CausaRechazo.faltaRelacion =>
        'No tienes que hacer nada: se reintenta solo en cuanto suba lo que '
            'falta.',
      CausaRechazo.duplicado =>
        'Revisa si el registro ya está en la web; comparte el detalle con '
            'soporte si no.',
      CausaRechazo.appDesactualizada =>
        'Actualiza la app desde el portal y vuelve a sincronizar.',
    };

/// Nombre de una tabla del sync en palabras de la app (plural, minúsculas),
/// para decir "3 asistencias no se pudieron subir" y no "asistencias: …".
String nombreTablaSync(String tabla) => switch (tabla) {
      'puestos' => 'puestos',
      'colaboradores' => 'colaboradores',
      'colaborador_sueldo' => 'sueldos',
      'obras' => 'obras',
      'obra_caja_nota' => 'notas de caja',
      'nota_obra' => 'notas de obra',
      'nota_obra_renglon' => 'renglones de notas',
      'lista_material' => 'listas de material',
      'lista_material_renglon' => 'renglones de listas de material',
      'cuadrillas' => 'cuadrillas',
      'cuadrilla_miembro' => 'integrantes de cuadrilla',
      'asignacion_cuadrilla_obra' => 'asignaciones de cuadrilla',
      'obra_presupuesto' => 'presupuestos',
      'cotizaciones' => 'cotizaciones',
      'secciones' => 'secciones de cotización',
      'partidas' => 'partidas',
      'pagos' => 'pagos',
      'obra_colaborador' => 'asignaciones de equipo',
      'asistencias' => 'asistencias',
      'destajos' => 'destajos',
      'movimientos' => 'movimientos de caja',
      'catalogo_conceptos' => 'conceptos del catálogo',
      'archivos_cotizacion' => 'archivos de cotización',
      'bitacora_entrada' => 'entradas de bitácora',
      'bitacora_foto' => 'fotos de bitácora',
      'bitacora_aclaracion' => 'aclaraciones de bitácora',
      _ => tabla.replaceAll('_', ' '),
    };

/// El último rechazo de un ciclo de sync, listo para la pantalla de nube: la
/// causa en palabras de obra y el detalle técnico aparte, plegado, para soporte.
class RechazoSync {
  const RechazoSync({
    required this.tabla,
    required this.causa,
    required this.detalleTecnico,
  });

  final String tabla;

  /// Null = pasajero (se reintenta solo).
  final CausaRechazo? causa;

  /// Código y mensaje del servidor. Solo se muestra plegado, con "Copiar para
  /// soporte": no es para quien está en la obra.
  final String detalleTecnico;

  bool get seReintenta => causa == null || seReintentaSola(causa!);
}
