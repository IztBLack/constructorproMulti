// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'app_database.dart';

// ignore_for_file: type=lint
class $ObrasTable extends Obras with TableInfo<$ObrasTable, Obra> {
  @override
  final GeneratedDatabase attachedDatabase;
  final String? _alias;
  $ObrasTable(this.attachedDatabase, [this._alias]);
  static const VerificationMeta _idMeta = const VerificationMeta('id');
  @override
  late final GeneratedColumn<String> id = GeneratedColumn<String>(
    'id',
    aliasedName,
    false,
    type: DriftSqlType.string,
    requiredDuringInsert: true,
  );
  static const VerificationMeta _nombreMeta = const VerificationMeta('nombre');
  @override
  late final GeneratedColumn<String> nombre = GeneratedColumn<String>(
    'nombre',
    aliasedName,
    false,
    type: DriftSqlType.string,
    requiredDuringInsert: true,
  );
  static const VerificationMeta _clienteMeta = const VerificationMeta(
    'cliente',
  );
  @override
  late final GeneratedColumn<String> cliente = GeneratedColumn<String>(
    'cliente',
    aliasedName,
    false,
    type: DriftSqlType.string,
    requiredDuringInsert: false,
    defaultValue: const Constant(''),
  );
  static const VerificationMeta _ubicacionMeta = const VerificationMeta(
    'ubicacion',
  );
  @override
  late final GeneratedColumn<String> ubicacion = GeneratedColumn<String>(
    'ubicacion',
    aliasedName,
    false,
    type: DriftSqlType.string,
    requiredDuringInsert: false,
    defaultValue: const Constant(''),
  );
  static const VerificationMeta _fechaInicioMeta = const VerificationMeta(
    'fechaInicio',
  );
  @override
  late final GeneratedColumn<int> fechaInicio = GeneratedColumn<int>(
    'fecha_inicio',
    aliasedName,
    false,
    type: DriftSqlType.int,
    requiredDuringInsert: true,
  );
  static const VerificationMeta _activaMeta = const VerificationMeta('activa');
  @override
  late final GeneratedColumn<bool> activa = GeneratedColumn<bool>(
    'activa',
    aliasedName,
    false,
    type: DriftSqlType.bool,
    requiredDuringInsert: false,
    defaultConstraints: GeneratedColumn.constraintIsAlways(
      'CHECK ("activa" IN (0, 1))',
    ),
    defaultValue: const Constant(true),
  );
  static const VerificationMeta _cotizacionOrigenIdMeta =
      const VerificationMeta('cotizacionOrigenId');
  @override
  late final GeneratedColumn<String> cotizacionOrigenId =
      GeneratedColumn<String>(
        'cotizacion_origen_id',
        aliasedName,
        true,
        type: DriftSqlType.string,
        requiredDuringInsert: false,
      );
  static const VerificationMeta _pdfConfigJsonMeta = const VerificationMeta(
    'pdfConfigJson',
  );
  @override
  late final GeneratedColumn<String> pdfConfigJson = GeneratedColumn<String>(
    'pdf_config_json',
    aliasedName,
    true,
    type: DriftSqlType.string,
    requiredDuringInsert: false,
  );
  @override
  List<GeneratedColumn> get $columns => [
    id,
    nombre,
    cliente,
    ubicacion,
    fechaInicio,
    activa,
    cotizacionOrigenId,
    pdfConfigJson,
  ];
  @override
  String get aliasedName => _alias ?? actualTableName;
  @override
  String get actualTableName => $name;
  static const String $name = 'obras';
  @override
  VerificationContext validateIntegrity(
    Insertable<Obra> instance, {
    bool isInserting = false,
  }) {
    final context = VerificationContext();
    final data = instance.toColumns(true);
    if (data.containsKey('id')) {
      context.handle(_idMeta, id.isAcceptableOrUnknown(data['id']!, _idMeta));
    } else if (isInserting) {
      context.missing(_idMeta);
    }
    if (data.containsKey('nombre')) {
      context.handle(
        _nombreMeta,
        nombre.isAcceptableOrUnknown(data['nombre']!, _nombreMeta),
      );
    } else if (isInserting) {
      context.missing(_nombreMeta);
    }
    if (data.containsKey('cliente')) {
      context.handle(
        _clienteMeta,
        cliente.isAcceptableOrUnknown(data['cliente']!, _clienteMeta),
      );
    }
    if (data.containsKey('ubicacion')) {
      context.handle(
        _ubicacionMeta,
        ubicacion.isAcceptableOrUnknown(data['ubicacion']!, _ubicacionMeta),
      );
    }
    if (data.containsKey('fecha_inicio')) {
      context.handle(
        _fechaInicioMeta,
        fechaInicio.isAcceptableOrUnknown(
          data['fecha_inicio']!,
          _fechaInicioMeta,
        ),
      );
    } else if (isInserting) {
      context.missing(_fechaInicioMeta);
    }
    if (data.containsKey('activa')) {
      context.handle(
        _activaMeta,
        activa.isAcceptableOrUnknown(data['activa']!, _activaMeta),
      );
    }
    if (data.containsKey('cotizacion_origen_id')) {
      context.handle(
        _cotizacionOrigenIdMeta,
        cotizacionOrigenId.isAcceptableOrUnknown(
          data['cotizacion_origen_id']!,
          _cotizacionOrigenIdMeta,
        ),
      );
    }
    if (data.containsKey('pdf_config_json')) {
      context.handle(
        _pdfConfigJsonMeta,
        pdfConfigJson.isAcceptableOrUnknown(
          data['pdf_config_json']!,
          _pdfConfigJsonMeta,
        ),
      );
    }
    return context;
  }

  @override
  Set<GeneratedColumn> get $primaryKey => {id};
  @override
  Obra map(Map<String, dynamic> data, {String? tablePrefix}) {
    final effectivePrefix = tablePrefix != null ? '$tablePrefix.' : '';
    return Obra(
      id: attachedDatabase.typeMapping.read(
        DriftSqlType.string,
        data['${effectivePrefix}id'],
      )!,
      nombre: attachedDatabase.typeMapping.read(
        DriftSqlType.string,
        data['${effectivePrefix}nombre'],
      )!,
      cliente: attachedDatabase.typeMapping.read(
        DriftSqlType.string,
        data['${effectivePrefix}cliente'],
      )!,
      ubicacion: attachedDatabase.typeMapping.read(
        DriftSqlType.string,
        data['${effectivePrefix}ubicacion'],
      )!,
      fechaInicio: attachedDatabase.typeMapping.read(
        DriftSqlType.int,
        data['${effectivePrefix}fecha_inicio'],
      )!,
      activa: attachedDatabase.typeMapping.read(
        DriftSqlType.bool,
        data['${effectivePrefix}activa'],
      )!,
      cotizacionOrigenId: attachedDatabase.typeMapping.read(
        DriftSqlType.string,
        data['${effectivePrefix}cotizacion_origen_id'],
      ),
      pdfConfigJson: attachedDatabase.typeMapping.read(
        DriftSqlType.string,
        data['${effectivePrefix}pdf_config_json'],
      ),
    );
  }

  @override
  $ObrasTable createAlias(String alias) {
    return $ObrasTable(attachedDatabase, alias);
  }
}

class Obra extends DataClass implements Insertable<Obra> {
  final String id;
  final String nombre;
  final String cliente;
  final String ubicacion;
  final int fechaInicio;
  final bool activa;
  final String? cotizacionOrigenId;
  final String? pdfConfigJson;
  const Obra({
    required this.id,
    required this.nombre,
    required this.cliente,
    required this.ubicacion,
    required this.fechaInicio,
    required this.activa,
    this.cotizacionOrigenId,
    this.pdfConfigJson,
  });
  @override
  Map<String, Expression> toColumns(bool nullToAbsent) {
    final map = <String, Expression>{};
    map['id'] = Variable<String>(id);
    map['nombre'] = Variable<String>(nombre);
    map['cliente'] = Variable<String>(cliente);
    map['ubicacion'] = Variable<String>(ubicacion);
    map['fecha_inicio'] = Variable<int>(fechaInicio);
    map['activa'] = Variable<bool>(activa);
    if (!nullToAbsent || cotizacionOrigenId != null) {
      map['cotizacion_origen_id'] = Variable<String>(cotizacionOrigenId);
    }
    if (!nullToAbsent || pdfConfigJson != null) {
      map['pdf_config_json'] = Variable<String>(pdfConfigJson);
    }
    return map;
  }

  ObrasCompanion toCompanion(bool nullToAbsent) {
    return ObrasCompanion(
      id: Value(id),
      nombre: Value(nombre),
      cliente: Value(cliente),
      ubicacion: Value(ubicacion),
      fechaInicio: Value(fechaInicio),
      activa: Value(activa),
      cotizacionOrigenId: cotizacionOrigenId == null && nullToAbsent
          ? const Value.absent()
          : Value(cotizacionOrigenId),
      pdfConfigJson: pdfConfigJson == null && nullToAbsent
          ? const Value.absent()
          : Value(pdfConfigJson),
    );
  }

  factory Obra.fromJson(
    Map<String, dynamic> json, {
    ValueSerializer? serializer,
  }) {
    serializer ??= driftRuntimeOptions.defaultSerializer;
    return Obra(
      id: serializer.fromJson<String>(json['id']),
      nombre: serializer.fromJson<String>(json['nombre']),
      cliente: serializer.fromJson<String>(json['cliente']),
      ubicacion: serializer.fromJson<String>(json['ubicacion']),
      fechaInicio: serializer.fromJson<int>(json['fechaInicio']),
      activa: serializer.fromJson<bool>(json['activa']),
      cotizacionOrigenId: serializer.fromJson<String?>(
        json['cotizacionOrigenId'],
      ),
      pdfConfigJson: serializer.fromJson<String?>(json['pdfConfigJson']),
    );
  }
  @override
  Map<String, dynamic> toJson({ValueSerializer? serializer}) {
    serializer ??= driftRuntimeOptions.defaultSerializer;
    return <String, dynamic>{
      'id': serializer.toJson<String>(id),
      'nombre': serializer.toJson<String>(nombre),
      'cliente': serializer.toJson<String>(cliente),
      'ubicacion': serializer.toJson<String>(ubicacion),
      'fechaInicio': serializer.toJson<int>(fechaInicio),
      'activa': serializer.toJson<bool>(activa),
      'cotizacionOrigenId': serializer.toJson<String?>(cotizacionOrigenId),
      'pdfConfigJson': serializer.toJson<String?>(pdfConfigJson),
    };
  }

  Obra copyWith({
    String? id,
    String? nombre,
    String? cliente,
    String? ubicacion,
    int? fechaInicio,
    bool? activa,
    Value<String?> cotizacionOrigenId = const Value.absent(),
    Value<String?> pdfConfigJson = const Value.absent(),
  }) => Obra(
    id: id ?? this.id,
    nombre: nombre ?? this.nombre,
    cliente: cliente ?? this.cliente,
    ubicacion: ubicacion ?? this.ubicacion,
    fechaInicio: fechaInicio ?? this.fechaInicio,
    activa: activa ?? this.activa,
    cotizacionOrigenId: cotizacionOrigenId.present
        ? cotizacionOrigenId.value
        : this.cotizacionOrigenId,
    pdfConfigJson: pdfConfigJson.present
        ? pdfConfigJson.value
        : this.pdfConfigJson,
  );
  Obra copyWithCompanion(ObrasCompanion data) {
    return Obra(
      id: data.id.present ? data.id.value : this.id,
      nombre: data.nombre.present ? data.nombre.value : this.nombre,
      cliente: data.cliente.present ? data.cliente.value : this.cliente,
      ubicacion: data.ubicacion.present ? data.ubicacion.value : this.ubicacion,
      fechaInicio: data.fechaInicio.present
          ? data.fechaInicio.value
          : this.fechaInicio,
      activa: data.activa.present ? data.activa.value : this.activa,
      cotizacionOrigenId: data.cotizacionOrigenId.present
          ? data.cotizacionOrigenId.value
          : this.cotizacionOrigenId,
      pdfConfigJson: data.pdfConfigJson.present
          ? data.pdfConfigJson.value
          : this.pdfConfigJson,
    );
  }

  @override
  String toString() {
    return (StringBuffer('Obra(')
          ..write('id: $id, ')
          ..write('nombre: $nombre, ')
          ..write('cliente: $cliente, ')
          ..write('ubicacion: $ubicacion, ')
          ..write('fechaInicio: $fechaInicio, ')
          ..write('activa: $activa, ')
          ..write('cotizacionOrigenId: $cotizacionOrigenId, ')
          ..write('pdfConfigJson: $pdfConfigJson')
          ..write(')'))
        .toString();
  }

  @override
  int get hashCode => Object.hash(
    id,
    nombre,
    cliente,
    ubicacion,
    fechaInicio,
    activa,
    cotizacionOrigenId,
    pdfConfigJson,
  );
  @override
  bool operator ==(Object other) =>
      identical(this, other) ||
      (other is Obra &&
          other.id == this.id &&
          other.nombre == this.nombre &&
          other.cliente == this.cliente &&
          other.ubicacion == this.ubicacion &&
          other.fechaInicio == this.fechaInicio &&
          other.activa == this.activa &&
          other.cotizacionOrigenId == this.cotizacionOrigenId &&
          other.pdfConfigJson == this.pdfConfigJson);
}

class ObrasCompanion extends UpdateCompanion<Obra> {
  final Value<String> id;
  final Value<String> nombre;
  final Value<String> cliente;
  final Value<String> ubicacion;
  final Value<int> fechaInicio;
  final Value<bool> activa;
  final Value<String?> cotizacionOrigenId;
  final Value<String?> pdfConfigJson;
  final Value<int> rowid;
  const ObrasCompanion({
    this.id = const Value.absent(),
    this.nombre = const Value.absent(),
    this.cliente = const Value.absent(),
    this.ubicacion = const Value.absent(),
    this.fechaInicio = const Value.absent(),
    this.activa = const Value.absent(),
    this.cotizacionOrigenId = const Value.absent(),
    this.pdfConfigJson = const Value.absent(),
    this.rowid = const Value.absent(),
  });
  ObrasCompanion.insert({
    required String id,
    required String nombre,
    this.cliente = const Value.absent(),
    this.ubicacion = const Value.absent(),
    required int fechaInicio,
    this.activa = const Value.absent(),
    this.cotizacionOrigenId = const Value.absent(),
    this.pdfConfigJson = const Value.absent(),
    this.rowid = const Value.absent(),
  }) : id = Value(id),
       nombre = Value(nombre),
       fechaInicio = Value(fechaInicio);
  static Insertable<Obra> custom({
    Expression<String>? id,
    Expression<String>? nombre,
    Expression<String>? cliente,
    Expression<String>? ubicacion,
    Expression<int>? fechaInicio,
    Expression<bool>? activa,
    Expression<String>? cotizacionOrigenId,
    Expression<String>? pdfConfigJson,
    Expression<int>? rowid,
  }) {
    return RawValuesInsertable({
      if (id != null) 'id': id,
      if (nombre != null) 'nombre': nombre,
      if (cliente != null) 'cliente': cliente,
      if (ubicacion != null) 'ubicacion': ubicacion,
      if (fechaInicio != null) 'fecha_inicio': fechaInicio,
      if (activa != null) 'activa': activa,
      if (cotizacionOrigenId != null)
        'cotizacion_origen_id': cotizacionOrigenId,
      if (pdfConfigJson != null) 'pdf_config_json': pdfConfigJson,
      if (rowid != null) 'rowid': rowid,
    });
  }

  ObrasCompanion copyWith({
    Value<String>? id,
    Value<String>? nombre,
    Value<String>? cliente,
    Value<String>? ubicacion,
    Value<int>? fechaInicio,
    Value<bool>? activa,
    Value<String?>? cotizacionOrigenId,
    Value<String?>? pdfConfigJson,
    Value<int>? rowid,
  }) {
    return ObrasCompanion(
      id: id ?? this.id,
      nombre: nombre ?? this.nombre,
      cliente: cliente ?? this.cliente,
      ubicacion: ubicacion ?? this.ubicacion,
      fechaInicio: fechaInicio ?? this.fechaInicio,
      activa: activa ?? this.activa,
      cotizacionOrigenId: cotizacionOrigenId ?? this.cotizacionOrigenId,
      pdfConfigJson: pdfConfigJson ?? this.pdfConfigJson,
      rowid: rowid ?? this.rowid,
    );
  }

  @override
  Map<String, Expression> toColumns(bool nullToAbsent) {
    final map = <String, Expression>{};
    if (id.present) {
      map['id'] = Variable<String>(id.value);
    }
    if (nombre.present) {
      map['nombre'] = Variable<String>(nombre.value);
    }
    if (cliente.present) {
      map['cliente'] = Variable<String>(cliente.value);
    }
    if (ubicacion.present) {
      map['ubicacion'] = Variable<String>(ubicacion.value);
    }
    if (fechaInicio.present) {
      map['fecha_inicio'] = Variable<int>(fechaInicio.value);
    }
    if (activa.present) {
      map['activa'] = Variable<bool>(activa.value);
    }
    if (cotizacionOrigenId.present) {
      map['cotizacion_origen_id'] = Variable<String>(cotizacionOrigenId.value);
    }
    if (pdfConfigJson.present) {
      map['pdf_config_json'] = Variable<String>(pdfConfigJson.value);
    }
    if (rowid.present) {
      map['rowid'] = Variable<int>(rowid.value);
    }
    return map;
  }

  @override
  String toString() {
    return (StringBuffer('ObrasCompanion(')
          ..write('id: $id, ')
          ..write('nombre: $nombre, ')
          ..write('cliente: $cliente, ')
          ..write('ubicacion: $ubicacion, ')
          ..write('fechaInicio: $fechaInicio, ')
          ..write('activa: $activa, ')
          ..write('cotizacionOrigenId: $cotizacionOrigenId, ')
          ..write('pdfConfigJson: $pdfConfigJson, ')
          ..write('rowid: $rowid')
          ..write(')'))
        .toString();
  }
}

class $PuestosTable extends Puestos with TableInfo<$PuestosTable, Puesto> {
  @override
  final GeneratedDatabase attachedDatabase;
  final String? _alias;
  $PuestosTable(this.attachedDatabase, [this._alias]);
  static const VerificationMeta _idMeta = const VerificationMeta('id');
  @override
  late final GeneratedColumn<String> id = GeneratedColumn<String>(
    'id',
    aliasedName,
    false,
    type: DriftSqlType.string,
    requiredDuringInsert: true,
  );
  static const VerificationMeta _nombreMeta = const VerificationMeta('nombre');
  @override
  late final GeneratedColumn<String> nombre = GeneratedColumn<String>(
    'nombre',
    aliasedName,
    false,
    type: DriftSqlType.string,
    requiredDuringInsert: true,
  );
  static const VerificationMeta _salarioDiaDefaultMeta = const VerificationMeta(
    'salarioDiaDefault',
  );
  @override
  late final GeneratedColumn<double> salarioDiaDefault =
      GeneratedColumn<double>(
        'salario_dia_default',
        aliasedName,
        false,
        type: DriftSqlType.double,
        requiredDuringInsert: false,
        defaultValue: const Constant(0.0),
      );
  @override
  List<GeneratedColumn> get $columns => [id, nombre, salarioDiaDefault];
  @override
  String get aliasedName => _alias ?? actualTableName;
  @override
  String get actualTableName => $name;
  static const String $name = 'puestos';
  @override
  VerificationContext validateIntegrity(
    Insertable<Puesto> instance, {
    bool isInserting = false,
  }) {
    final context = VerificationContext();
    final data = instance.toColumns(true);
    if (data.containsKey('id')) {
      context.handle(_idMeta, id.isAcceptableOrUnknown(data['id']!, _idMeta));
    } else if (isInserting) {
      context.missing(_idMeta);
    }
    if (data.containsKey('nombre')) {
      context.handle(
        _nombreMeta,
        nombre.isAcceptableOrUnknown(data['nombre']!, _nombreMeta),
      );
    } else if (isInserting) {
      context.missing(_nombreMeta);
    }
    if (data.containsKey('salario_dia_default')) {
      context.handle(
        _salarioDiaDefaultMeta,
        salarioDiaDefault.isAcceptableOrUnknown(
          data['salario_dia_default']!,
          _salarioDiaDefaultMeta,
        ),
      );
    }
    return context;
  }

  @override
  Set<GeneratedColumn> get $primaryKey => {id};
  @override
  Puesto map(Map<String, dynamic> data, {String? tablePrefix}) {
    final effectivePrefix = tablePrefix != null ? '$tablePrefix.' : '';
    return Puesto(
      id: attachedDatabase.typeMapping.read(
        DriftSqlType.string,
        data['${effectivePrefix}id'],
      )!,
      nombre: attachedDatabase.typeMapping.read(
        DriftSqlType.string,
        data['${effectivePrefix}nombre'],
      )!,
      salarioDiaDefault: attachedDatabase.typeMapping.read(
        DriftSqlType.double,
        data['${effectivePrefix}salario_dia_default'],
      )!,
    );
  }

  @override
  $PuestosTable createAlias(String alias) {
    return $PuestosTable(attachedDatabase, alias);
  }
}

class Puesto extends DataClass implements Insertable<Puesto> {
  final String id;
  final String nombre;
  final double salarioDiaDefault;
  const Puesto({
    required this.id,
    required this.nombre,
    required this.salarioDiaDefault,
  });
  @override
  Map<String, Expression> toColumns(bool nullToAbsent) {
    final map = <String, Expression>{};
    map['id'] = Variable<String>(id);
    map['nombre'] = Variable<String>(nombre);
    map['salario_dia_default'] = Variable<double>(salarioDiaDefault);
    return map;
  }

  PuestosCompanion toCompanion(bool nullToAbsent) {
    return PuestosCompanion(
      id: Value(id),
      nombre: Value(nombre),
      salarioDiaDefault: Value(salarioDiaDefault),
    );
  }

  factory Puesto.fromJson(
    Map<String, dynamic> json, {
    ValueSerializer? serializer,
  }) {
    serializer ??= driftRuntimeOptions.defaultSerializer;
    return Puesto(
      id: serializer.fromJson<String>(json['id']),
      nombre: serializer.fromJson<String>(json['nombre']),
      salarioDiaDefault: serializer.fromJson<double>(json['salarioDiaDefault']),
    );
  }
  @override
  Map<String, dynamic> toJson({ValueSerializer? serializer}) {
    serializer ??= driftRuntimeOptions.defaultSerializer;
    return <String, dynamic>{
      'id': serializer.toJson<String>(id),
      'nombre': serializer.toJson<String>(nombre),
      'salarioDiaDefault': serializer.toJson<double>(salarioDiaDefault),
    };
  }

  Puesto copyWith({String? id, String? nombre, double? salarioDiaDefault}) =>
      Puesto(
        id: id ?? this.id,
        nombre: nombre ?? this.nombre,
        salarioDiaDefault: salarioDiaDefault ?? this.salarioDiaDefault,
      );
  Puesto copyWithCompanion(PuestosCompanion data) {
    return Puesto(
      id: data.id.present ? data.id.value : this.id,
      nombre: data.nombre.present ? data.nombre.value : this.nombre,
      salarioDiaDefault: data.salarioDiaDefault.present
          ? data.salarioDiaDefault.value
          : this.salarioDiaDefault,
    );
  }

  @override
  String toString() {
    return (StringBuffer('Puesto(')
          ..write('id: $id, ')
          ..write('nombre: $nombre, ')
          ..write('salarioDiaDefault: $salarioDiaDefault')
          ..write(')'))
        .toString();
  }

  @override
  int get hashCode => Object.hash(id, nombre, salarioDiaDefault);
  @override
  bool operator ==(Object other) =>
      identical(this, other) ||
      (other is Puesto &&
          other.id == this.id &&
          other.nombre == this.nombre &&
          other.salarioDiaDefault == this.salarioDiaDefault);
}

class PuestosCompanion extends UpdateCompanion<Puesto> {
  final Value<String> id;
  final Value<String> nombre;
  final Value<double> salarioDiaDefault;
  final Value<int> rowid;
  const PuestosCompanion({
    this.id = const Value.absent(),
    this.nombre = const Value.absent(),
    this.salarioDiaDefault = const Value.absent(),
    this.rowid = const Value.absent(),
  });
  PuestosCompanion.insert({
    required String id,
    required String nombre,
    this.salarioDiaDefault = const Value.absent(),
    this.rowid = const Value.absent(),
  }) : id = Value(id),
       nombre = Value(nombre);
  static Insertable<Puesto> custom({
    Expression<String>? id,
    Expression<String>? nombre,
    Expression<double>? salarioDiaDefault,
    Expression<int>? rowid,
  }) {
    return RawValuesInsertable({
      if (id != null) 'id': id,
      if (nombre != null) 'nombre': nombre,
      if (salarioDiaDefault != null) 'salario_dia_default': salarioDiaDefault,
      if (rowid != null) 'rowid': rowid,
    });
  }

  PuestosCompanion copyWith({
    Value<String>? id,
    Value<String>? nombre,
    Value<double>? salarioDiaDefault,
    Value<int>? rowid,
  }) {
    return PuestosCompanion(
      id: id ?? this.id,
      nombre: nombre ?? this.nombre,
      salarioDiaDefault: salarioDiaDefault ?? this.salarioDiaDefault,
      rowid: rowid ?? this.rowid,
    );
  }

  @override
  Map<String, Expression> toColumns(bool nullToAbsent) {
    final map = <String, Expression>{};
    if (id.present) {
      map['id'] = Variable<String>(id.value);
    }
    if (nombre.present) {
      map['nombre'] = Variable<String>(nombre.value);
    }
    if (salarioDiaDefault.present) {
      map['salario_dia_default'] = Variable<double>(salarioDiaDefault.value);
    }
    if (rowid.present) {
      map['rowid'] = Variable<int>(rowid.value);
    }
    return map;
  }

  @override
  String toString() {
    return (StringBuffer('PuestosCompanion(')
          ..write('id: $id, ')
          ..write('nombre: $nombre, ')
          ..write('salarioDiaDefault: $salarioDiaDefault, ')
          ..write('rowid: $rowid')
          ..write(')'))
        .toString();
  }
}

class $ColaboradoresTable extends Colaboradores
    with TableInfo<$ColaboradoresTable, Colaborador> {
  @override
  final GeneratedDatabase attachedDatabase;
  final String? _alias;
  $ColaboradoresTable(this.attachedDatabase, [this._alias]);
  static const VerificationMeta _idMeta = const VerificationMeta('id');
  @override
  late final GeneratedColumn<String> id = GeneratedColumn<String>(
    'id',
    aliasedName,
    false,
    type: DriftSqlType.string,
    requiredDuringInsert: true,
  );
  static const VerificationMeta _nombreMeta = const VerificationMeta('nombre');
  @override
  late final GeneratedColumn<String> nombre = GeneratedColumn<String>(
    'nombre',
    aliasedName,
    false,
    type: DriftSqlType.string,
    requiredDuringInsert: true,
  );
  static const VerificationMeta _puestoIdMeta = const VerificationMeta(
    'puestoId',
  );
  @override
  late final GeneratedColumn<String> puestoId = GeneratedColumn<String>(
    'puesto_id',
    aliasedName,
    false,
    type: DriftSqlType.string,
    requiredDuringInsert: true,
  );
  static const VerificationMeta _tipoPagoMeta = const VerificationMeta(
    'tipoPago',
  );
  @override
  late final GeneratedColumn<String> tipoPago = GeneratedColumn<String>(
    'tipo_pago',
    aliasedName,
    false,
    type: DriftSqlType.string,
    requiredDuringInsert: true,
  );
  static const VerificationMeta _telefonoMeta = const VerificationMeta(
    'telefono',
  );
  @override
  late final GeneratedColumn<String> telefono = GeneratedColumn<String>(
    'telefono',
    aliasedName,
    false,
    type: DriftSqlType.string,
    requiredDuringInsert: false,
    defaultValue: const Constant(''),
  );
  static const VerificationMeta _contactoNombreMeta = const VerificationMeta(
    'contactoNombre',
  );
  @override
  late final GeneratedColumn<String> contactoNombre = GeneratedColumn<String>(
    'contacto_nombre',
    aliasedName,
    false,
    type: DriftSqlType.string,
    requiredDuringInsert: false,
    defaultValue: const Constant(''),
  );
  static const VerificationMeta _contactoTelefonoMeta = const VerificationMeta(
    'contactoTelefono',
  );
  @override
  late final GeneratedColumn<String> contactoTelefono = GeneratedColumn<String>(
    'contacto_telefono',
    aliasedName,
    false,
    type: DriftSqlType.string,
    requiredDuringInsert: false,
    defaultValue: const Constant(''),
  );
  static const VerificationMeta _contactoParentescoMeta =
      const VerificationMeta('contactoParentesco');
  @override
  late final GeneratedColumn<String> contactoParentesco =
      GeneratedColumn<String>(
        'contacto_parentesco',
        aliasedName,
        false,
        type: DriftSqlType.string,
        requiredDuringInsert: false,
        defaultValue: const Constant(''),
      );
  static const VerificationMeta _activoMeta = const VerificationMeta('activo');
  @override
  late final GeneratedColumn<bool> activo = GeneratedColumn<bool>(
    'activo',
    aliasedName,
    false,
    type: DriftSqlType.bool,
    requiredDuringInsert: false,
    defaultConstraints: GeneratedColumn.constraintIsAlways(
      'CHECK ("activo" IN (0, 1))',
    ),
    defaultValue: const Constant(true),
  );
  static const VerificationMeta _salarioPersonalizadoMeta =
      const VerificationMeta('salarioPersonalizado');
  @override
  late final GeneratedColumn<double> salarioPersonalizado =
      GeneratedColumn<double>(
        'salario_personalizado',
        aliasedName,
        true,
        type: DriftSqlType.double,
        requiredDuringInsert: false,
      );
  @override
  List<GeneratedColumn> get $columns => [
    id,
    nombre,
    puestoId,
    tipoPago,
    telefono,
    contactoNombre,
    contactoTelefono,
    contactoParentesco,
    activo,
    salarioPersonalizado,
  ];
  @override
  String get aliasedName => _alias ?? actualTableName;
  @override
  String get actualTableName => $name;
  static const String $name = 'colaboradores';
  @override
  VerificationContext validateIntegrity(
    Insertable<Colaborador> instance, {
    bool isInserting = false,
  }) {
    final context = VerificationContext();
    final data = instance.toColumns(true);
    if (data.containsKey('id')) {
      context.handle(_idMeta, id.isAcceptableOrUnknown(data['id']!, _idMeta));
    } else if (isInserting) {
      context.missing(_idMeta);
    }
    if (data.containsKey('nombre')) {
      context.handle(
        _nombreMeta,
        nombre.isAcceptableOrUnknown(data['nombre']!, _nombreMeta),
      );
    } else if (isInserting) {
      context.missing(_nombreMeta);
    }
    if (data.containsKey('puesto_id')) {
      context.handle(
        _puestoIdMeta,
        puestoId.isAcceptableOrUnknown(data['puesto_id']!, _puestoIdMeta),
      );
    } else if (isInserting) {
      context.missing(_puestoIdMeta);
    }
    if (data.containsKey('tipo_pago')) {
      context.handle(
        _tipoPagoMeta,
        tipoPago.isAcceptableOrUnknown(data['tipo_pago']!, _tipoPagoMeta),
      );
    } else if (isInserting) {
      context.missing(_tipoPagoMeta);
    }
    if (data.containsKey('telefono')) {
      context.handle(
        _telefonoMeta,
        telefono.isAcceptableOrUnknown(data['telefono']!, _telefonoMeta),
      );
    }
    if (data.containsKey('contacto_nombre')) {
      context.handle(
        _contactoNombreMeta,
        contactoNombre.isAcceptableOrUnknown(
          data['contacto_nombre']!,
          _contactoNombreMeta,
        ),
      );
    }
    if (data.containsKey('contacto_telefono')) {
      context.handle(
        _contactoTelefonoMeta,
        contactoTelefono.isAcceptableOrUnknown(
          data['contacto_telefono']!,
          _contactoTelefonoMeta,
        ),
      );
    }
    if (data.containsKey('contacto_parentesco')) {
      context.handle(
        _contactoParentescoMeta,
        contactoParentesco.isAcceptableOrUnknown(
          data['contacto_parentesco']!,
          _contactoParentescoMeta,
        ),
      );
    }
    if (data.containsKey('activo')) {
      context.handle(
        _activoMeta,
        activo.isAcceptableOrUnknown(data['activo']!, _activoMeta),
      );
    }
    if (data.containsKey('salario_personalizado')) {
      context.handle(
        _salarioPersonalizadoMeta,
        salarioPersonalizado.isAcceptableOrUnknown(
          data['salario_personalizado']!,
          _salarioPersonalizadoMeta,
        ),
      );
    }
    return context;
  }

  @override
  Set<GeneratedColumn> get $primaryKey => {id};
  @override
  Colaborador map(Map<String, dynamic> data, {String? tablePrefix}) {
    final effectivePrefix = tablePrefix != null ? '$tablePrefix.' : '';
    return Colaborador(
      id: attachedDatabase.typeMapping.read(
        DriftSqlType.string,
        data['${effectivePrefix}id'],
      )!,
      nombre: attachedDatabase.typeMapping.read(
        DriftSqlType.string,
        data['${effectivePrefix}nombre'],
      )!,
      puestoId: attachedDatabase.typeMapping.read(
        DriftSqlType.string,
        data['${effectivePrefix}puesto_id'],
      )!,
      tipoPago: attachedDatabase.typeMapping.read(
        DriftSqlType.string,
        data['${effectivePrefix}tipo_pago'],
      )!,
      telefono: attachedDatabase.typeMapping.read(
        DriftSqlType.string,
        data['${effectivePrefix}telefono'],
      )!,
      contactoNombre: attachedDatabase.typeMapping.read(
        DriftSqlType.string,
        data['${effectivePrefix}contacto_nombre'],
      )!,
      contactoTelefono: attachedDatabase.typeMapping.read(
        DriftSqlType.string,
        data['${effectivePrefix}contacto_telefono'],
      )!,
      contactoParentesco: attachedDatabase.typeMapping.read(
        DriftSqlType.string,
        data['${effectivePrefix}contacto_parentesco'],
      )!,
      activo: attachedDatabase.typeMapping.read(
        DriftSqlType.bool,
        data['${effectivePrefix}activo'],
      )!,
      salarioPersonalizado: attachedDatabase.typeMapping.read(
        DriftSqlType.double,
        data['${effectivePrefix}salario_personalizado'],
      ),
    );
  }

  @override
  $ColaboradoresTable createAlias(String alias) {
    return $ColaboradoresTable(attachedDatabase, alias);
  }
}

class Colaborador extends DataClass implements Insertable<Colaborador> {
  final String id;
  final String nombre;
  final String puestoId;
  final String tipoPago;
  final String telefono;
  final String contactoNombre;
  final String contactoTelefono;
  final String contactoParentesco;
  final bool activo;
  final double? salarioPersonalizado;
  const Colaborador({
    required this.id,
    required this.nombre,
    required this.puestoId,
    required this.tipoPago,
    required this.telefono,
    required this.contactoNombre,
    required this.contactoTelefono,
    required this.contactoParentesco,
    required this.activo,
    this.salarioPersonalizado,
  });
  @override
  Map<String, Expression> toColumns(bool nullToAbsent) {
    final map = <String, Expression>{};
    map['id'] = Variable<String>(id);
    map['nombre'] = Variable<String>(nombre);
    map['puesto_id'] = Variable<String>(puestoId);
    map['tipo_pago'] = Variable<String>(tipoPago);
    map['telefono'] = Variable<String>(telefono);
    map['contacto_nombre'] = Variable<String>(contactoNombre);
    map['contacto_telefono'] = Variable<String>(contactoTelefono);
    map['contacto_parentesco'] = Variable<String>(contactoParentesco);
    map['activo'] = Variable<bool>(activo);
    if (!nullToAbsent || salarioPersonalizado != null) {
      map['salario_personalizado'] = Variable<double>(salarioPersonalizado);
    }
    return map;
  }

  ColaboradoresCompanion toCompanion(bool nullToAbsent) {
    return ColaboradoresCompanion(
      id: Value(id),
      nombre: Value(nombre),
      puestoId: Value(puestoId),
      tipoPago: Value(tipoPago),
      telefono: Value(telefono),
      contactoNombre: Value(contactoNombre),
      contactoTelefono: Value(contactoTelefono),
      contactoParentesco: Value(contactoParentesco),
      activo: Value(activo),
      salarioPersonalizado: salarioPersonalizado == null && nullToAbsent
          ? const Value.absent()
          : Value(salarioPersonalizado),
    );
  }

  factory Colaborador.fromJson(
    Map<String, dynamic> json, {
    ValueSerializer? serializer,
  }) {
    serializer ??= driftRuntimeOptions.defaultSerializer;
    return Colaborador(
      id: serializer.fromJson<String>(json['id']),
      nombre: serializer.fromJson<String>(json['nombre']),
      puestoId: serializer.fromJson<String>(json['puestoId']),
      tipoPago: serializer.fromJson<String>(json['tipoPago']),
      telefono: serializer.fromJson<String>(json['telefono']),
      contactoNombre: serializer.fromJson<String>(json['contactoNombre']),
      contactoTelefono: serializer.fromJson<String>(json['contactoTelefono']),
      contactoParentesco: serializer.fromJson<String>(
        json['contactoParentesco'],
      ),
      activo: serializer.fromJson<bool>(json['activo']),
      salarioPersonalizado: serializer.fromJson<double?>(
        json['salarioPersonalizado'],
      ),
    );
  }
  @override
  Map<String, dynamic> toJson({ValueSerializer? serializer}) {
    serializer ??= driftRuntimeOptions.defaultSerializer;
    return <String, dynamic>{
      'id': serializer.toJson<String>(id),
      'nombre': serializer.toJson<String>(nombre),
      'puestoId': serializer.toJson<String>(puestoId),
      'tipoPago': serializer.toJson<String>(tipoPago),
      'telefono': serializer.toJson<String>(telefono),
      'contactoNombre': serializer.toJson<String>(contactoNombre),
      'contactoTelefono': serializer.toJson<String>(contactoTelefono),
      'contactoParentesco': serializer.toJson<String>(contactoParentesco),
      'activo': serializer.toJson<bool>(activo),
      'salarioPersonalizado': serializer.toJson<double?>(salarioPersonalizado),
    };
  }

  Colaborador copyWith({
    String? id,
    String? nombre,
    String? puestoId,
    String? tipoPago,
    String? telefono,
    String? contactoNombre,
    String? contactoTelefono,
    String? contactoParentesco,
    bool? activo,
    Value<double?> salarioPersonalizado = const Value.absent(),
  }) => Colaborador(
    id: id ?? this.id,
    nombre: nombre ?? this.nombre,
    puestoId: puestoId ?? this.puestoId,
    tipoPago: tipoPago ?? this.tipoPago,
    telefono: telefono ?? this.telefono,
    contactoNombre: contactoNombre ?? this.contactoNombre,
    contactoTelefono: contactoTelefono ?? this.contactoTelefono,
    contactoParentesco: contactoParentesco ?? this.contactoParentesco,
    activo: activo ?? this.activo,
    salarioPersonalizado: salarioPersonalizado.present
        ? salarioPersonalizado.value
        : this.salarioPersonalizado,
  );
  Colaborador copyWithCompanion(ColaboradoresCompanion data) {
    return Colaborador(
      id: data.id.present ? data.id.value : this.id,
      nombre: data.nombre.present ? data.nombre.value : this.nombre,
      puestoId: data.puestoId.present ? data.puestoId.value : this.puestoId,
      tipoPago: data.tipoPago.present ? data.tipoPago.value : this.tipoPago,
      telefono: data.telefono.present ? data.telefono.value : this.telefono,
      contactoNombre: data.contactoNombre.present
          ? data.contactoNombre.value
          : this.contactoNombre,
      contactoTelefono: data.contactoTelefono.present
          ? data.contactoTelefono.value
          : this.contactoTelefono,
      contactoParentesco: data.contactoParentesco.present
          ? data.contactoParentesco.value
          : this.contactoParentesco,
      activo: data.activo.present ? data.activo.value : this.activo,
      salarioPersonalizado: data.salarioPersonalizado.present
          ? data.salarioPersonalizado.value
          : this.salarioPersonalizado,
    );
  }

  @override
  String toString() {
    return (StringBuffer('Colaborador(')
          ..write('id: $id, ')
          ..write('nombre: $nombre, ')
          ..write('puestoId: $puestoId, ')
          ..write('tipoPago: $tipoPago, ')
          ..write('telefono: $telefono, ')
          ..write('contactoNombre: $contactoNombre, ')
          ..write('contactoTelefono: $contactoTelefono, ')
          ..write('contactoParentesco: $contactoParentesco, ')
          ..write('activo: $activo, ')
          ..write('salarioPersonalizado: $salarioPersonalizado')
          ..write(')'))
        .toString();
  }

  @override
  int get hashCode => Object.hash(
    id,
    nombre,
    puestoId,
    tipoPago,
    telefono,
    contactoNombre,
    contactoTelefono,
    contactoParentesco,
    activo,
    salarioPersonalizado,
  );
  @override
  bool operator ==(Object other) =>
      identical(this, other) ||
      (other is Colaborador &&
          other.id == this.id &&
          other.nombre == this.nombre &&
          other.puestoId == this.puestoId &&
          other.tipoPago == this.tipoPago &&
          other.telefono == this.telefono &&
          other.contactoNombre == this.contactoNombre &&
          other.contactoTelefono == this.contactoTelefono &&
          other.contactoParentesco == this.contactoParentesco &&
          other.activo == this.activo &&
          other.salarioPersonalizado == this.salarioPersonalizado);
}

class ColaboradoresCompanion extends UpdateCompanion<Colaborador> {
  final Value<String> id;
  final Value<String> nombre;
  final Value<String> puestoId;
  final Value<String> tipoPago;
  final Value<String> telefono;
  final Value<String> contactoNombre;
  final Value<String> contactoTelefono;
  final Value<String> contactoParentesco;
  final Value<bool> activo;
  final Value<double?> salarioPersonalizado;
  final Value<int> rowid;
  const ColaboradoresCompanion({
    this.id = const Value.absent(),
    this.nombre = const Value.absent(),
    this.puestoId = const Value.absent(),
    this.tipoPago = const Value.absent(),
    this.telefono = const Value.absent(),
    this.contactoNombre = const Value.absent(),
    this.contactoTelefono = const Value.absent(),
    this.contactoParentesco = const Value.absent(),
    this.activo = const Value.absent(),
    this.salarioPersonalizado = const Value.absent(),
    this.rowid = const Value.absent(),
  });
  ColaboradoresCompanion.insert({
    required String id,
    required String nombre,
    required String puestoId,
    required String tipoPago,
    this.telefono = const Value.absent(),
    this.contactoNombre = const Value.absent(),
    this.contactoTelefono = const Value.absent(),
    this.contactoParentesco = const Value.absent(),
    this.activo = const Value.absent(),
    this.salarioPersonalizado = const Value.absent(),
    this.rowid = const Value.absent(),
  }) : id = Value(id),
       nombre = Value(nombre),
       puestoId = Value(puestoId),
       tipoPago = Value(tipoPago);
  static Insertable<Colaborador> custom({
    Expression<String>? id,
    Expression<String>? nombre,
    Expression<String>? puestoId,
    Expression<String>? tipoPago,
    Expression<String>? telefono,
    Expression<String>? contactoNombre,
    Expression<String>? contactoTelefono,
    Expression<String>? contactoParentesco,
    Expression<bool>? activo,
    Expression<double>? salarioPersonalizado,
    Expression<int>? rowid,
  }) {
    return RawValuesInsertable({
      if (id != null) 'id': id,
      if (nombre != null) 'nombre': nombre,
      if (puestoId != null) 'puesto_id': puestoId,
      if (tipoPago != null) 'tipo_pago': tipoPago,
      if (telefono != null) 'telefono': telefono,
      if (contactoNombre != null) 'contacto_nombre': contactoNombre,
      if (contactoTelefono != null) 'contacto_telefono': contactoTelefono,
      if (contactoParentesco != null) 'contacto_parentesco': contactoParentesco,
      if (activo != null) 'activo': activo,
      if (salarioPersonalizado != null)
        'salario_personalizado': salarioPersonalizado,
      if (rowid != null) 'rowid': rowid,
    });
  }

  ColaboradoresCompanion copyWith({
    Value<String>? id,
    Value<String>? nombre,
    Value<String>? puestoId,
    Value<String>? tipoPago,
    Value<String>? telefono,
    Value<String>? contactoNombre,
    Value<String>? contactoTelefono,
    Value<String>? contactoParentesco,
    Value<bool>? activo,
    Value<double?>? salarioPersonalizado,
    Value<int>? rowid,
  }) {
    return ColaboradoresCompanion(
      id: id ?? this.id,
      nombre: nombre ?? this.nombre,
      puestoId: puestoId ?? this.puestoId,
      tipoPago: tipoPago ?? this.tipoPago,
      telefono: telefono ?? this.telefono,
      contactoNombre: contactoNombre ?? this.contactoNombre,
      contactoTelefono: contactoTelefono ?? this.contactoTelefono,
      contactoParentesco: contactoParentesco ?? this.contactoParentesco,
      activo: activo ?? this.activo,
      salarioPersonalizado: salarioPersonalizado ?? this.salarioPersonalizado,
      rowid: rowid ?? this.rowid,
    );
  }

  @override
  Map<String, Expression> toColumns(bool nullToAbsent) {
    final map = <String, Expression>{};
    if (id.present) {
      map['id'] = Variable<String>(id.value);
    }
    if (nombre.present) {
      map['nombre'] = Variable<String>(nombre.value);
    }
    if (puestoId.present) {
      map['puesto_id'] = Variable<String>(puestoId.value);
    }
    if (tipoPago.present) {
      map['tipo_pago'] = Variable<String>(tipoPago.value);
    }
    if (telefono.present) {
      map['telefono'] = Variable<String>(telefono.value);
    }
    if (contactoNombre.present) {
      map['contacto_nombre'] = Variable<String>(contactoNombre.value);
    }
    if (contactoTelefono.present) {
      map['contacto_telefono'] = Variable<String>(contactoTelefono.value);
    }
    if (contactoParentesco.present) {
      map['contacto_parentesco'] = Variable<String>(contactoParentesco.value);
    }
    if (activo.present) {
      map['activo'] = Variable<bool>(activo.value);
    }
    if (salarioPersonalizado.present) {
      map['salario_personalizado'] = Variable<double>(
        salarioPersonalizado.value,
      );
    }
    if (rowid.present) {
      map['rowid'] = Variable<int>(rowid.value);
    }
    return map;
  }

  @override
  String toString() {
    return (StringBuffer('ColaboradoresCompanion(')
          ..write('id: $id, ')
          ..write('nombre: $nombre, ')
          ..write('puestoId: $puestoId, ')
          ..write('tipoPago: $tipoPago, ')
          ..write('telefono: $telefono, ')
          ..write('contactoNombre: $contactoNombre, ')
          ..write('contactoTelefono: $contactoTelefono, ')
          ..write('contactoParentesco: $contactoParentesco, ')
          ..write('activo: $activo, ')
          ..write('salarioPersonalizado: $salarioPersonalizado, ')
          ..write('rowid: $rowid')
          ..write(')'))
        .toString();
  }
}

class $ObraColaboradorTable extends ObraColaborador
    with TableInfo<$ObraColaboradorTable, ObraColaboradorData> {
  @override
  final GeneratedDatabase attachedDatabase;
  final String? _alias;
  $ObraColaboradorTable(this.attachedDatabase, [this._alias]);
  static const VerificationMeta _obraIdMeta = const VerificationMeta('obraId');
  @override
  late final GeneratedColumn<String> obraId = GeneratedColumn<String>(
    'obra_id',
    aliasedName,
    false,
    type: DriftSqlType.string,
    requiredDuringInsert: true,
  );
  static const VerificationMeta _colaboradorIdMeta = const VerificationMeta(
    'colaboradorId',
  );
  @override
  late final GeneratedColumn<String> colaboradorId = GeneratedColumn<String>(
    'colaborador_id',
    aliasedName,
    false,
    type: DriftSqlType.string,
    requiredDuringInsert: true,
  );
  static const VerificationMeta _fechaIngresoMeta = const VerificationMeta(
    'fechaIngreso',
  );
  @override
  late final GeneratedColumn<int> fechaIngreso = GeneratedColumn<int>(
    'fecha_ingreso',
    aliasedName,
    false,
    type: DriftSqlType.int,
    requiredDuringInsert: true,
  );
  static const VerificationMeta _fechaSalidaMeta = const VerificationMeta(
    'fechaSalida',
  );
  @override
  late final GeneratedColumn<int> fechaSalida = GeneratedColumn<int>(
    'fecha_salida',
    aliasedName,
    true,
    type: DriftSqlType.int,
    requiredDuringInsert: false,
  );
  static const VerificationMeta _salarioDiaOverrideMeta =
      const VerificationMeta('salarioDiaOverride');
  @override
  late final GeneratedColumn<double> salarioDiaOverride =
      GeneratedColumn<double>(
        'salario_dia_override',
        aliasedName,
        true,
        type: DriftSqlType.double,
        requiredDuringInsert: false,
      );
  @override
  List<GeneratedColumn> get $columns => [
    obraId,
    colaboradorId,
    fechaIngreso,
    fechaSalida,
    salarioDiaOverride,
  ];
  @override
  String get aliasedName => _alias ?? actualTableName;
  @override
  String get actualTableName => $name;
  static const String $name = 'obra_colaborador';
  @override
  VerificationContext validateIntegrity(
    Insertable<ObraColaboradorData> instance, {
    bool isInserting = false,
  }) {
    final context = VerificationContext();
    final data = instance.toColumns(true);
    if (data.containsKey('obra_id')) {
      context.handle(
        _obraIdMeta,
        obraId.isAcceptableOrUnknown(data['obra_id']!, _obraIdMeta),
      );
    } else if (isInserting) {
      context.missing(_obraIdMeta);
    }
    if (data.containsKey('colaborador_id')) {
      context.handle(
        _colaboradorIdMeta,
        colaboradorId.isAcceptableOrUnknown(
          data['colaborador_id']!,
          _colaboradorIdMeta,
        ),
      );
    } else if (isInserting) {
      context.missing(_colaboradorIdMeta);
    }
    if (data.containsKey('fecha_ingreso')) {
      context.handle(
        _fechaIngresoMeta,
        fechaIngreso.isAcceptableOrUnknown(
          data['fecha_ingreso']!,
          _fechaIngresoMeta,
        ),
      );
    } else if (isInserting) {
      context.missing(_fechaIngresoMeta);
    }
    if (data.containsKey('fecha_salida')) {
      context.handle(
        _fechaSalidaMeta,
        fechaSalida.isAcceptableOrUnknown(
          data['fecha_salida']!,
          _fechaSalidaMeta,
        ),
      );
    }
    if (data.containsKey('salario_dia_override')) {
      context.handle(
        _salarioDiaOverrideMeta,
        salarioDiaOverride.isAcceptableOrUnknown(
          data['salario_dia_override']!,
          _salarioDiaOverrideMeta,
        ),
      );
    }
    return context;
  }

  @override
  Set<GeneratedColumn> get $primaryKey => {obraId, colaboradorId};
  @override
  ObraColaboradorData map(Map<String, dynamic> data, {String? tablePrefix}) {
    final effectivePrefix = tablePrefix != null ? '$tablePrefix.' : '';
    return ObraColaboradorData(
      obraId: attachedDatabase.typeMapping.read(
        DriftSqlType.string,
        data['${effectivePrefix}obra_id'],
      )!,
      colaboradorId: attachedDatabase.typeMapping.read(
        DriftSqlType.string,
        data['${effectivePrefix}colaborador_id'],
      )!,
      fechaIngreso: attachedDatabase.typeMapping.read(
        DriftSqlType.int,
        data['${effectivePrefix}fecha_ingreso'],
      )!,
      fechaSalida: attachedDatabase.typeMapping.read(
        DriftSqlType.int,
        data['${effectivePrefix}fecha_salida'],
      ),
      salarioDiaOverride: attachedDatabase.typeMapping.read(
        DriftSqlType.double,
        data['${effectivePrefix}salario_dia_override'],
      ),
    );
  }

  @override
  $ObraColaboradorTable createAlias(String alias) {
    return $ObraColaboradorTable(attachedDatabase, alias);
  }
}

class ObraColaboradorData extends DataClass
    implements Insertable<ObraColaboradorData> {
  final String obraId;
  final String colaboradorId;
  final int fechaIngreso;
  final int? fechaSalida;
  final double? salarioDiaOverride;
  const ObraColaboradorData({
    required this.obraId,
    required this.colaboradorId,
    required this.fechaIngreso,
    this.fechaSalida,
    this.salarioDiaOverride,
  });
  @override
  Map<String, Expression> toColumns(bool nullToAbsent) {
    final map = <String, Expression>{};
    map['obra_id'] = Variable<String>(obraId);
    map['colaborador_id'] = Variable<String>(colaboradorId);
    map['fecha_ingreso'] = Variable<int>(fechaIngreso);
    if (!nullToAbsent || fechaSalida != null) {
      map['fecha_salida'] = Variable<int>(fechaSalida);
    }
    if (!nullToAbsent || salarioDiaOverride != null) {
      map['salario_dia_override'] = Variable<double>(salarioDiaOverride);
    }
    return map;
  }

  ObraColaboradorCompanion toCompanion(bool nullToAbsent) {
    return ObraColaboradorCompanion(
      obraId: Value(obraId),
      colaboradorId: Value(colaboradorId),
      fechaIngreso: Value(fechaIngreso),
      fechaSalida: fechaSalida == null && nullToAbsent
          ? const Value.absent()
          : Value(fechaSalida),
      salarioDiaOverride: salarioDiaOverride == null && nullToAbsent
          ? const Value.absent()
          : Value(salarioDiaOverride),
    );
  }

  factory ObraColaboradorData.fromJson(
    Map<String, dynamic> json, {
    ValueSerializer? serializer,
  }) {
    serializer ??= driftRuntimeOptions.defaultSerializer;
    return ObraColaboradorData(
      obraId: serializer.fromJson<String>(json['obraId']),
      colaboradorId: serializer.fromJson<String>(json['colaboradorId']),
      fechaIngreso: serializer.fromJson<int>(json['fechaIngreso']),
      fechaSalida: serializer.fromJson<int?>(json['fechaSalida']),
      salarioDiaOverride: serializer.fromJson<double?>(
        json['salarioDiaOverride'],
      ),
    );
  }
  @override
  Map<String, dynamic> toJson({ValueSerializer? serializer}) {
    serializer ??= driftRuntimeOptions.defaultSerializer;
    return <String, dynamic>{
      'obraId': serializer.toJson<String>(obraId),
      'colaboradorId': serializer.toJson<String>(colaboradorId),
      'fechaIngreso': serializer.toJson<int>(fechaIngreso),
      'fechaSalida': serializer.toJson<int?>(fechaSalida),
      'salarioDiaOverride': serializer.toJson<double?>(salarioDiaOverride),
    };
  }

  ObraColaboradorData copyWith({
    String? obraId,
    String? colaboradorId,
    int? fechaIngreso,
    Value<int?> fechaSalida = const Value.absent(),
    Value<double?> salarioDiaOverride = const Value.absent(),
  }) => ObraColaboradorData(
    obraId: obraId ?? this.obraId,
    colaboradorId: colaboradorId ?? this.colaboradorId,
    fechaIngreso: fechaIngreso ?? this.fechaIngreso,
    fechaSalida: fechaSalida.present ? fechaSalida.value : this.fechaSalida,
    salarioDiaOverride: salarioDiaOverride.present
        ? salarioDiaOverride.value
        : this.salarioDiaOverride,
  );
  ObraColaboradorData copyWithCompanion(ObraColaboradorCompanion data) {
    return ObraColaboradorData(
      obraId: data.obraId.present ? data.obraId.value : this.obraId,
      colaboradorId: data.colaboradorId.present
          ? data.colaboradorId.value
          : this.colaboradorId,
      fechaIngreso: data.fechaIngreso.present
          ? data.fechaIngreso.value
          : this.fechaIngreso,
      fechaSalida: data.fechaSalida.present
          ? data.fechaSalida.value
          : this.fechaSalida,
      salarioDiaOverride: data.salarioDiaOverride.present
          ? data.salarioDiaOverride.value
          : this.salarioDiaOverride,
    );
  }

  @override
  String toString() {
    return (StringBuffer('ObraColaboradorData(')
          ..write('obraId: $obraId, ')
          ..write('colaboradorId: $colaboradorId, ')
          ..write('fechaIngreso: $fechaIngreso, ')
          ..write('fechaSalida: $fechaSalida, ')
          ..write('salarioDiaOverride: $salarioDiaOverride')
          ..write(')'))
        .toString();
  }

  @override
  int get hashCode => Object.hash(
    obraId,
    colaboradorId,
    fechaIngreso,
    fechaSalida,
    salarioDiaOverride,
  );
  @override
  bool operator ==(Object other) =>
      identical(this, other) ||
      (other is ObraColaboradorData &&
          other.obraId == this.obraId &&
          other.colaboradorId == this.colaboradorId &&
          other.fechaIngreso == this.fechaIngreso &&
          other.fechaSalida == this.fechaSalida &&
          other.salarioDiaOverride == this.salarioDiaOverride);
}

class ObraColaboradorCompanion extends UpdateCompanion<ObraColaboradorData> {
  final Value<String> obraId;
  final Value<String> colaboradorId;
  final Value<int> fechaIngreso;
  final Value<int?> fechaSalida;
  final Value<double?> salarioDiaOverride;
  final Value<int> rowid;
  const ObraColaboradorCompanion({
    this.obraId = const Value.absent(),
    this.colaboradorId = const Value.absent(),
    this.fechaIngreso = const Value.absent(),
    this.fechaSalida = const Value.absent(),
    this.salarioDiaOverride = const Value.absent(),
    this.rowid = const Value.absent(),
  });
  ObraColaboradorCompanion.insert({
    required String obraId,
    required String colaboradorId,
    required int fechaIngreso,
    this.fechaSalida = const Value.absent(),
    this.salarioDiaOverride = const Value.absent(),
    this.rowid = const Value.absent(),
  }) : obraId = Value(obraId),
       colaboradorId = Value(colaboradorId),
       fechaIngreso = Value(fechaIngreso);
  static Insertable<ObraColaboradorData> custom({
    Expression<String>? obraId,
    Expression<String>? colaboradorId,
    Expression<int>? fechaIngreso,
    Expression<int>? fechaSalida,
    Expression<double>? salarioDiaOverride,
    Expression<int>? rowid,
  }) {
    return RawValuesInsertable({
      if (obraId != null) 'obra_id': obraId,
      if (colaboradorId != null) 'colaborador_id': colaboradorId,
      if (fechaIngreso != null) 'fecha_ingreso': fechaIngreso,
      if (fechaSalida != null) 'fecha_salida': fechaSalida,
      if (salarioDiaOverride != null)
        'salario_dia_override': salarioDiaOverride,
      if (rowid != null) 'rowid': rowid,
    });
  }

  ObraColaboradorCompanion copyWith({
    Value<String>? obraId,
    Value<String>? colaboradorId,
    Value<int>? fechaIngreso,
    Value<int?>? fechaSalida,
    Value<double?>? salarioDiaOverride,
    Value<int>? rowid,
  }) {
    return ObraColaboradorCompanion(
      obraId: obraId ?? this.obraId,
      colaboradorId: colaboradorId ?? this.colaboradorId,
      fechaIngreso: fechaIngreso ?? this.fechaIngreso,
      fechaSalida: fechaSalida ?? this.fechaSalida,
      salarioDiaOverride: salarioDiaOverride ?? this.salarioDiaOverride,
      rowid: rowid ?? this.rowid,
    );
  }

  @override
  Map<String, Expression> toColumns(bool nullToAbsent) {
    final map = <String, Expression>{};
    if (obraId.present) {
      map['obra_id'] = Variable<String>(obraId.value);
    }
    if (colaboradorId.present) {
      map['colaborador_id'] = Variable<String>(colaboradorId.value);
    }
    if (fechaIngreso.present) {
      map['fecha_ingreso'] = Variable<int>(fechaIngreso.value);
    }
    if (fechaSalida.present) {
      map['fecha_salida'] = Variable<int>(fechaSalida.value);
    }
    if (salarioDiaOverride.present) {
      map['salario_dia_override'] = Variable<double>(salarioDiaOverride.value);
    }
    if (rowid.present) {
      map['rowid'] = Variable<int>(rowid.value);
    }
    return map;
  }

  @override
  String toString() {
    return (StringBuffer('ObraColaboradorCompanion(')
          ..write('obraId: $obraId, ')
          ..write('colaboradorId: $colaboradorId, ')
          ..write('fechaIngreso: $fechaIngreso, ')
          ..write('fechaSalida: $fechaSalida, ')
          ..write('salarioDiaOverride: $salarioDiaOverride, ')
          ..write('rowid: $rowid')
          ..write(')'))
        .toString();
  }
}

class $AsistenciasTable extends Asistencias
    with TableInfo<$AsistenciasTable, Asistencia> {
  @override
  final GeneratedDatabase attachedDatabase;
  final String? _alias;
  $AsistenciasTable(this.attachedDatabase, [this._alias]);
  static const VerificationMeta _idMeta = const VerificationMeta('id');
  @override
  late final GeneratedColumn<String> id = GeneratedColumn<String>(
    'id',
    aliasedName,
    false,
    type: DriftSqlType.string,
    requiredDuringInsert: true,
  );
  static const VerificationMeta _colaboradorIdMeta = const VerificationMeta(
    'colaboradorId',
  );
  @override
  late final GeneratedColumn<String> colaboradorId = GeneratedColumn<String>(
    'colaborador_id',
    aliasedName,
    false,
    type: DriftSqlType.string,
    requiredDuringInsert: true,
  );
  static const VerificationMeta _obraIdMeta = const VerificationMeta('obraId');
  @override
  late final GeneratedColumn<String> obraId = GeneratedColumn<String>(
    'obra_id',
    aliasedName,
    false,
    type: DriftSqlType.string,
    requiredDuringInsert: true,
  );
  static const VerificationMeta _fechaMeta = const VerificationMeta('fecha');
  @override
  late final GeneratedColumn<int> fecha = GeneratedColumn<int>(
    'fecha',
    aliasedName,
    false,
    type: DriftSqlType.int,
    requiredDuringInsert: true,
  );
  static const VerificationMeta _fraccionMeta = const VerificationMeta(
    'fraccion',
  );
  @override
  late final GeneratedColumn<double> fraccion = GeneratedColumn<double>(
    'fraccion',
    aliasedName,
    false,
    type: DriftSqlType.double,
    requiredDuringInsert: true,
  );
  @override
  List<GeneratedColumn> get $columns => [
    id,
    colaboradorId,
    obraId,
    fecha,
    fraccion,
  ];
  @override
  String get aliasedName => _alias ?? actualTableName;
  @override
  String get actualTableName => $name;
  static const String $name = 'asistencias';
  @override
  VerificationContext validateIntegrity(
    Insertable<Asistencia> instance, {
    bool isInserting = false,
  }) {
    final context = VerificationContext();
    final data = instance.toColumns(true);
    if (data.containsKey('id')) {
      context.handle(_idMeta, id.isAcceptableOrUnknown(data['id']!, _idMeta));
    } else if (isInserting) {
      context.missing(_idMeta);
    }
    if (data.containsKey('colaborador_id')) {
      context.handle(
        _colaboradorIdMeta,
        colaboradorId.isAcceptableOrUnknown(
          data['colaborador_id']!,
          _colaboradorIdMeta,
        ),
      );
    } else if (isInserting) {
      context.missing(_colaboradorIdMeta);
    }
    if (data.containsKey('obra_id')) {
      context.handle(
        _obraIdMeta,
        obraId.isAcceptableOrUnknown(data['obra_id']!, _obraIdMeta),
      );
    } else if (isInserting) {
      context.missing(_obraIdMeta);
    }
    if (data.containsKey('fecha')) {
      context.handle(
        _fechaMeta,
        fecha.isAcceptableOrUnknown(data['fecha']!, _fechaMeta),
      );
    } else if (isInserting) {
      context.missing(_fechaMeta);
    }
    if (data.containsKey('fraccion')) {
      context.handle(
        _fraccionMeta,
        fraccion.isAcceptableOrUnknown(data['fraccion']!, _fraccionMeta),
      );
    } else if (isInserting) {
      context.missing(_fraccionMeta);
    }
    return context;
  }

  @override
  Set<GeneratedColumn> get $primaryKey => {id};
  @override
  List<Set<GeneratedColumn>> get uniqueKeys => [
    {colaboradorId, obraId, fecha},
  ];
  @override
  Asistencia map(Map<String, dynamic> data, {String? tablePrefix}) {
    final effectivePrefix = tablePrefix != null ? '$tablePrefix.' : '';
    return Asistencia(
      id: attachedDatabase.typeMapping.read(
        DriftSqlType.string,
        data['${effectivePrefix}id'],
      )!,
      colaboradorId: attachedDatabase.typeMapping.read(
        DriftSqlType.string,
        data['${effectivePrefix}colaborador_id'],
      )!,
      obraId: attachedDatabase.typeMapping.read(
        DriftSqlType.string,
        data['${effectivePrefix}obra_id'],
      )!,
      fecha: attachedDatabase.typeMapping.read(
        DriftSqlType.int,
        data['${effectivePrefix}fecha'],
      )!,
      fraccion: attachedDatabase.typeMapping.read(
        DriftSqlType.double,
        data['${effectivePrefix}fraccion'],
      )!,
    );
  }

  @override
  $AsistenciasTable createAlias(String alias) {
    return $AsistenciasTable(attachedDatabase, alias);
  }
}

class Asistencia extends DataClass implements Insertable<Asistencia> {
  final String id;
  final String colaboradorId;
  final String obraId;
  final int fecha;
  final double fraccion;
  const Asistencia({
    required this.id,
    required this.colaboradorId,
    required this.obraId,
    required this.fecha,
    required this.fraccion,
  });
  @override
  Map<String, Expression> toColumns(bool nullToAbsent) {
    final map = <String, Expression>{};
    map['id'] = Variable<String>(id);
    map['colaborador_id'] = Variable<String>(colaboradorId);
    map['obra_id'] = Variable<String>(obraId);
    map['fecha'] = Variable<int>(fecha);
    map['fraccion'] = Variable<double>(fraccion);
    return map;
  }

  AsistenciasCompanion toCompanion(bool nullToAbsent) {
    return AsistenciasCompanion(
      id: Value(id),
      colaboradorId: Value(colaboradorId),
      obraId: Value(obraId),
      fecha: Value(fecha),
      fraccion: Value(fraccion),
    );
  }

  factory Asistencia.fromJson(
    Map<String, dynamic> json, {
    ValueSerializer? serializer,
  }) {
    serializer ??= driftRuntimeOptions.defaultSerializer;
    return Asistencia(
      id: serializer.fromJson<String>(json['id']),
      colaboradorId: serializer.fromJson<String>(json['colaboradorId']),
      obraId: serializer.fromJson<String>(json['obraId']),
      fecha: serializer.fromJson<int>(json['fecha']),
      fraccion: serializer.fromJson<double>(json['fraccion']),
    );
  }
  @override
  Map<String, dynamic> toJson({ValueSerializer? serializer}) {
    serializer ??= driftRuntimeOptions.defaultSerializer;
    return <String, dynamic>{
      'id': serializer.toJson<String>(id),
      'colaboradorId': serializer.toJson<String>(colaboradorId),
      'obraId': serializer.toJson<String>(obraId),
      'fecha': serializer.toJson<int>(fecha),
      'fraccion': serializer.toJson<double>(fraccion),
    };
  }

  Asistencia copyWith({
    String? id,
    String? colaboradorId,
    String? obraId,
    int? fecha,
    double? fraccion,
  }) => Asistencia(
    id: id ?? this.id,
    colaboradorId: colaboradorId ?? this.colaboradorId,
    obraId: obraId ?? this.obraId,
    fecha: fecha ?? this.fecha,
    fraccion: fraccion ?? this.fraccion,
  );
  Asistencia copyWithCompanion(AsistenciasCompanion data) {
    return Asistencia(
      id: data.id.present ? data.id.value : this.id,
      colaboradorId: data.colaboradorId.present
          ? data.colaboradorId.value
          : this.colaboradorId,
      obraId: data.obraId.present ? data.obraId.value : this.obraId,
      fecha: data.fecha.present ? data.fecha.value : this.fecha,
      fraccion: data.fraccion.present ? data.fraccion.value : this.fraccion,
    );
  }

  @override
  String toString() {
    return (StringBuffer('Asistencia(')
          ..write('id: $id, ')
          ..write('colaboradorId: $colaboradorId, ')
          ..write('obraId: $obraId, ')
          ..write('fecha: $fecha, ')
          ..write('fraccion: $fraccion')
          ..write(')'))
        .toString();
  }

  @override
  int get hashCode => Object.hash(id, colaboradorId, obraId, fecha, fraccion);
  @override
  bool operator ==(Object other) =>
      identical(this, other) ||
      (other is Asistencia &&
          other.id == this.id &&
          other.colaboradorId == this.colaboradorId &&
          other.obraId == this.obraId &&
          other.fecha == this.fecha &&
          other.fraccion == this.fraccion);
}

class AsistenciasCompanion extends UpdateCompanion<Asistencia> {
  final Value<String> id;
  final Value<String> colaboradorId;
  final Value<String> obraId;
  final Value<int> fecha;
  final Value<double> fraccion;
  final Value<int> rowid;
  const AsistenciasCompanion({
    this.id = const Value.absent(),
    this.colaboradorId = const Value.absent(),
    this.obraId = const Value.absent(),
    this.fecha = const Value.absent(),
    this.fraccion = const Value.absent(),
    this.rowid = const Value.absent(),
  });
  AsistenciasCompanion.insert({
    required String id,
    required String colaboradorId,
    required String obraId,
    required int fecha,
    required double fraccion,
    this.rowid = const Value.absent(),
  }) : id = Value(id),
       colaboradorId = Value(colaboradorId),
       obraId = Value(obraId),
       fecha = Value(fecha),
       fraccion = Value(fraccion);
  static Insertable<Asistencia> custom({
    Expression<String>? id,
    Expression<String>? colaboradorId,
    Expression<String>? obraId,
    Expression<int>? fecha,
    Expression<double>? fraccion,
    Expression<int>? rowid,
  }) {
    return RawValuesInsertable({
      if (id != null) 'id': id,
      if (colaboradorId != null) 'colaborador_id': colaboradorId,
      if (obraId != null) 'obra_id': obraId,
      if (fecha != null) 'fecha': fecha,
      if (fraccion != null) 'fraccion': fraccion,
      if (rowid != null) 'rowid': rowid,
    });
  }

  AsistenciasCompanion copyWith({
    Value<String>? id,
    Value<String>? colaboradorId,
    Value<String>? obraId,
    Value<int>? fecha,
    Value<double>? fraccion,
    Value<int>? rowid,
  }) {
    return AsistenciasCompanion(
      id: id ?? this.id,
      colaboradorId: colaboradorId ?? this.colaboradorId,
      obraId: obraId ?? this.obraId,
      fecha: fecha ?? this.fecha,
      fraccion: fraccion ?? this.fraccion,
      rowid: rowid ?? this.rowid,
    );
  }

  @override
  Map<String, Expression> toColumns(bool nullToAbsent) {
    final map = <String, Expression>{};
    if (id.present) {
      map['id'] = Variable<String>(id.value);
    }
    if (colaboradorId.present) {
      map['colaborador_id'] = Variable<String>(colaboradorId.value);
    }
    if (obraId.present) {
      map['obra_id'] = Variable<String>(obraId.value);
    }
    if (fecha.present) {
      map['fecha'] = Variable<int>(fecha.value);
    }
    if (fraccion.present) {
      map['fraccion'] = Variable<double>(fraccion.value);
    }
    if (rowid.present) {
      map['rowid'] = Variable<int>(rowid.value);
    }
    return map;
  }

  @override
  String toString() {
    return (StringBuffer('AsistenciasCompanion(')
          ..write('id: $id, ')
          ..write('colaboradorId: $colaboradorId, ')
          ..write('obraId: $obraId, ')
          ..write('fecha: $fecha, ')
          ..write('fraccion: $fraccion, ')
          ..write('rowid: $rowid')
          ..write(')'))
        .toString();
  }
}

class $DestajosTable extends Destajos with TableInfo<$DestajosTable, Destajo> {
  @override
  final GeneratedDatabase attachedDatabase;
  final String? _alias;
  $DestajosTable(this.attachedDatabase, [this._alias]);
  static const VerificationMeta _idMeta = const VerificationMeta('id');
  @override
  late final GeneratedColumn<String> id = GeneratedColumn<String>(
    'id',
    aliasedName,
    false,
    type: DriftSqlType.string,
    requiredDuringInsert: true,
  );
  static const VerificationMeta _colaboradorIdMeta = const VerificationMeta(
    'colaboradorId',
  );
  @override
  late final GeneratedColumn<String> colaboradorId = GeneratedColumn<String>(
    'colaborador_id',
    aliasedName,
    false,
    type: DriftSqlType.string,
    requiredDuringInsert: true,
  );
  static const VerificationMeta _obraIdMeta = const VerificationMeta('obraId');
  @override
  late final GeneratedColumn<String> obraId = GeneratedColumn<String>(
    'obra_id',
    aliasedName,
    false,
    type: DriftSqlType.string,
    requiredDuringInsert: true,
  );
  static const VerificationMeta _fechaMeta = const VerificationMeta('fecha');
  @override
  late final GeneratedColumn<int> fecha = GeneratedColumn<int>(
    'fecha',
    aliasedName,
    false,
    type: DriftSqlType.int,
    requiredDuringInsert: true,
  );
  static const VerificationMeta _conceptoMeta = const VerificationMeta(
    'concepto',
  );
  @override
  late final GeneratedColumn<String> concepto = GeneratedColumn<String>(
    'concepto',
    aliasedName,
    false,
    type: DriftSqlType.string,
    requiredDuringInsert: true,
  );
  static const VerificationMeta _montoMeta = const VerificationMeta('monto');
  @override
  late final GeneratedColumn<double> monto = GeneratedColumn<double>(
    'monto',
    aliasedName,
    false,
    type: DriftSqlType.double,
    requiredDuringInsert: true,
  );
  @override
  List<GeneratedColumn> get $columns => [
    id,
    colaboradorId,
    obraId,
    fecha,
    concepto,
    monto,
  ];
  @override
  String get aliasedName => _alias ?? actualTableName;
  @override
  String get actualTableName => $name;
  static const String $name = 'destajos';
  @override
  VerificationContext validateIntegrity(
    Insertable<Destajo> instance, {
    bool isInserting = false,
  }) {
    final context = VerificationContext();
    final data = instance.toColumns(true);
    if (data.containsKey('id')) {
      context.handle(_idMeta, id.isAcceptableOrUnknown(data['id']!, _idMeta));
    } else if (isInserting) {
      context.missing(_idMeta);
    }
    if (data.containsKey('colaborador_id')) {
      context.handle(
        _colaboradorIdMeta,
        colaboradorId.isAcceptableOrUnknown(
          data['colaborador_id']!,
          _colaboradorIdMeta,
        ),
      );
    } else if (isInserting) {
      context.missing(_colaboradorIdMeta);
    }
    if (data.containsKey('obra_id')) {
      context.handle(
        _obraIdMeta,
        obraId.isAcceptableOrUnknown(data['obra_id']!, _obraIdMeta),
      );
    } else if (isInserting) {
      context.missing(_obraIdMeta);
    }
    if (data.containsKey('fecha')) {
      context.handle(
        _fechaMeta,
        fecha.isAcceptableOrUnknown(data['fecha']!, _fechaMeta),
      );
    } else if (isInserting) {
      context.missing(_fechaMeta);
    }
    if (data.containsKey('concepto')) {
      context.handle(
        _conceptoMeta,
        concepto.isAcceptableOrUnknown(data['concepto']!, _conceptoMeta),
      );
    } else if (isInserting) {
      context.missing(_conceptoMeta);
    }
    if (data.containsKey('monto')) {
      context.handle(
        _montoMeta,
        monto.isAcceptableOrUnknown(data['monto']!, _montoMeta),
      );
    } else if (isInserting) {
      context.missing(_montoMeta);
    }
    return context;
  }

  @override
  Set<GeneratedColumn> get $primaryKey => {id};
  @override
  Destajo map(Map<String, dynamic> data, {String? tablePrefix}) {
    final effectivePrefix = tablePrefix != null ? '$tablePrefix.' : '';
    return Destajo(
      id: attachedDatabase.typeMapping.read(
        DriftSqlType.string,
        data['${effectivePrefix}id'],
      )!,
      colaboradorId: attachedDatabase.typeMapping.read(
        DriftSqlType.string,
        data['${effectivePrefix}colaborador_id'],
      )!,
      obraId: attachedDatabase.typeMapping.read(
        DriftSqlType.string,
        data['${effectivePrefix}obra_id'],
      )!,
      fecha: attachedDatabase.typeMapping.read(
        DriftSqlType.int,
        data['${effectivePrefix}fecha'],
      )!,
      concepto: attachedDatabase.typeMapping.read(
        DriftSqlType.string,
        data['${effectivePrefix}concepto'],
      )!,
      monto: attachedDatabase.typeMapping.read(
        DriftSqlType.double,
        data['${effectivePrefix}monto'],
      )!,
    );
  }

  @override
  $DestajosTable createAlias(String alias) {
    return $DestajosTable(attachedDatabase, alias);
  }
}

class Destajo extends DataClass implements Insertable<Destajo> {
  final String id;
  final String colaboradorId;
  final String obraId;
  final int fecha;
  final String concepto;
  final double monto;
  const Destajo({
    required this.id,
    required this.colaboradorId,
    required this.obraId,
    required this.fecha,
    required this.concepto,
    required this.monto,
  });
  @override
  Map<String, Expression> toColumns(bool nullToAbsent) {
    final map = <String, Expression>{};
    map['id'] = Variable<String>(id);
    map['colaborador_id'] = Variable<String>(colaboradorId);
    map['obra_id'] = Variable<String>(obraId);
    map['fecha'] = Variable<int>(fecha);
    map['concepto'] = Variable<String>(concepto);
    map['monto'] = Variable<double>(monto);
    return map;
  }

  DestajosCompanion toCompanion(bool nullToAbsent) {
    return DestajosCompanion(
      id: Value(id),
      colaboradorId: Value(colaboradorId),
      obraId: Value(obraId),
      fecha: Value(fecha),
      concepto: Value(concepto),
      monto: Value(monto),
    );
  }

  factory Destajo.fromJson(
    Map<String, dynamic> json, {
    ValueSerializer? serializer,
  }) {
    serializer ??= driftRuntimeOptions.defaultSerializer;
    return Destajo(
      id: serializer.fromJson<String>(json['id']),
      colaboradorId: serializer.fromJson<String>(json['colaboradorId']),
      obraId: serializer.fromJson<String>(json['obraId']),
      fecha: serializer.fromJson<int>(json['fecha']),
      concepto: serializer.fromJson<String>(json['concepto']),
      monto: serializer.fromJson<double>(json['monto']),
    );
  }
  @override
  Map<String, dynamic> toJson({ValueSerializer? serializer}) {
    serializer ??= driftRuntimeOptions.defaultSerializer;
    return <String, dynamic>{
      'id': serializer.toJson<String>(id),
      'colaboradorId': serializer.toJson<String>(colaboradorId),
      'obraId': serializer.toJson<String>(obraId),
      'fecha': serializer.toJson<int>(fecha),
      'concepto': serializer.toJson<String>(concepto),
      'monto': serializer.toJson<double>(monto),
    };
  }

  Destajo copyWith({
    String? id,
    String? colaboradorId,
    String? obraId,
    int? fecha,
    String? concepto,
    double? monto,
  }) => Destajo(
    id: id ?? this.id,
    colaboradorId: colaboradorId ?? this.colaboradorId,
    obraId: obraId ?? this.obraId,
    fecha: fecha ?? this.fecha,
    concepto: concepto ?? this.concepto,
    monto: monto ?? this.monto,
  );
  Destajo copyWithCompanion(DestajosCompanion data) {
    return Destajo(
      id: data.id.present ? data.id.value : this.id,
      colaboradorId: data.colaboradorId.present
          ? data.colaboradorId.value
          : this.colaboradorId,
      obraId: data.obraId.present ? data.obraId.value : this.obraId,
      fecha: data.fecha.present ? data.fecha.value : this.fecha,
      concepto: data.concepto.present ? data.concepto.value : this.concepto,
      monto: data.monto.present ? data.monto.value : this.monto,
    );
  }

  @override
  String toString() {
    return (StringBuffer('Destajo(')
          ..write('id: $id, ')
          ..write('colaboradorId: $colaboradorId, ')
          ..write('obraId: $obraId, ')
          ..write('fecha: $fecha, ')
          ..write('concepto: $concepto, ')
          ..write('monto: $monto')
          ..write(')'))
        .toString();
  }

  @override
  int get hashCode =>
      Object.hash(id, colaboradorId, obraId, fecha, concepto, monto);
  @override
  bool operator ==(Object other) =>
      identical(this, other) ||
      (other is Destajo &&
          other.id == this.id &&
          other.colaboradorId == this.colaboradorId &&
          other.obraId == this.obraId &&
          other.fecha == this.fecha &&
          other.concepto == this.concepto &&
          other.monto == this.monto);
}

class DestajosCompanion extends UpdateCompanion<Destajo> {
  final Value<String> id;
  final Value<String> colaboradorId;
  final Value<String> obraId;
  final Value<int> fecha;
  final Value<String> concepto;
  final Value<double> monto;
  final Value<int> rowid;
  const DestajosCompanion({
    this.id = const Value.absent(),
    this.colaboradorId = const Value.absent(),
    this.obraId = const Value.absent(),
    this.fecha = const Value.absent(),
    this.concepto = const Value.absent(),
    this.monto = const Value.absent(),
    this.rowid = const Value.absent(),
  });
  DestajosCompanion.insert({
    required String id,
    required String colaboradorId,
    required String obraId,
    required int fecha,
    required String concepto,
    required double monto,
    this.rowid = const Value.absent(),
  }) : id = Value(id),
       colaboradorId = Value(colaboradorId),
       obraId = Value(obraId),
       fecha = Value(fecha),
       concepto = Value(concepto),
       monto = Value(monto);
  static Insertable<Destajo> custom({
    Expression<String>? id,
    Expression<String>? colaboradorId,
    Expression<String>? obraId,
    Expression<int>? fecha,
    Expression<String>? concepto,
    Expression<double>? monto,
    Expression<int>? rowid,
  }) {
    return RawValuesInsertable({
      if (id != null) 'id': id,
      if (colaboradorId != null) 'colaborador_id': colaboradorId,
      if (obraId != null) 'obra_id': obraId,
      if (fecha != null) 'fecha': fecha,
      if (concepto != null) 'concepto': concepto,
      if (monto != null) 'monto': monto,
      if (rowid != null) 'rowid': rowid,
    });
  }

  DestajosCompanion copyWith({
    Value<String>? id,
    Value<String>? colaboradorId,
    Value<String>? obraId,
    Value<int>? fecha,
    Value<String>? concepto,
    Value<double>? monto,
    Value<int>? rowid,
  }) {
    return DestajosCompanion(
      id: id ?? this.id,
      colaboradorId: colaboradorId ?? this.colaboradorId,
      obraId: obraId ?? this.obraId,
      fecha: fecha ?? this.fecha,
      concepto: concepto ?? this.concepto,
      monto: monto ?? this.monto,
      rowid: rowid ?? this.rowid,
    );
  }

  @override
  Map<String, Expression> toColumns(bool nullToAbsent) {
    final map = <String, Expression>{};
    if (id.present) {
      map['id'] = Variable<String>(id.value);
    }
    if (colaboradorId.present) {
      map['colaborador_id'] = Variable<String>(colaboradorId.value);
    }
    if (obraId.present) {
      map['obra_id'] = Variable<String>(obraId.value);
    }
    if (fecha.present) {
      map['fecha'] = Variable<int>(fecha.value);
    }
    if (concepto.present) {
      map['concepto'] = Variable<String>(concepto.value);
    }
    if (monto.present) {
      map['monto'] = Variable<double>(monto.value);
    }
    if (rowid.present) {
      map['rowid'] = Variable<int>(rowid.value);
    }
    return map;
  }

  @override
  String toString() {
    return (StringBuffer('DestajosCompanion(')
          ..write('id: $id, ')
          ..write('colaboradorId: $colaboradorId, ')
          ..write('obraId: $obraId, ')
          ..write('fecha: $fecha, ')
          ..write('concepto: $concepto, ')
          ..write('monto: $monto, ')
          ..write('rowid: $rowid')
          ..write(')'))
        .toString();
  }
}

class $CotizacionesTable extends Cotizaciones
    with TableInfo<$CotizacionesTable, Cotizacion> {
  @override
  final GeneratedDatabase attachedDatabase;
  final String? _alias;
  $CotizacionesTable(this.attachedDatabase, [this._alias]);
  static const VerificationMeta _idMeta = const VerificationMeta('id');
  @override
  late final GeneratedColumn<String> id = GeneratedColumn<String>(
    'id',
    aliasedName,
    false,
    type: DriftSqlType.string,
    requiredDuringInsert: true,
  );
  static const VerificationMeta _clienteMeta = const VerificationMeta(
    'cliente',
  );
  @override
  late final GeneratedColumn<String> cliente = GeneratedColumn<String>(
    'cliente',
    aliasedName,
    false,
    type: DriftSqlType.string,
    requiredDuringInsert: true,
  );
  static const VerificationMeta _nombreProyectoMeta = const VerificationMeta(
    'nombreProyecto',
  );
  @override
  late final GeneratedColumn<String> nombreProyecto = GeneratedColumn<String>(
    'nombre_proyecto',
    aliasedName,
    false,
    type: DriftSqlType.string,
    requiredDuringInsert: true,
  );
  static const VerificationMeta _ubicacionMeta = const VerificationMeta(
    'ubicacion',
  );
  @override
  late final GeneratedColumn<String> ubicacion = GeneratedColumn<String>(
    'ubicacion',
    aliasedName,
    false,
    type: DriftSqlType.string,
    requiredDuringInsert: false,
    defaultValue: const Constant(''),
  );
  static const VerificationMeta _fechaMeta = const VerificationMeta('fecha');
  @override
  late final GeneratedColumn<int> fecha = GeneratedColumn<int>(
    'fecha',
    aliasedName,
    false,
    type: DriftSqlType.int,
    requiredDuringInsert: true,
  );
  static const VerificationMeta _estadoMeta = const VerificationMeta('estado');
  @override
  late final GeneratedColumn<String> estado = GeneratedColumn<String>(
    'estado',
    aliasedName,
    false,
    type: DriftSqlType.string,
    requiredDuringInsert: false,
    defaultValue: const Constant('BORRADOR'),
  );
  static const VerificationMeta _ivaEnabledMeta = const VerificationMeta(
    'ivaEnabled',
  );
  @override
  late final GeneratedColumn<bool> ivaEnabled = GeneratedColumn<bool>(
    'iva_enabled',
    aliasedName,
    false,
    type: DriftSqlType.bool,
    requiredDuringInsert: false,
    defaultConstraints: GeneratedColumn.constraintIsAlways(
      'CHECK ("iva_enabled" IN (0, 1))',
    ),
    defaultValue: const Constant(true),
  );
  static const VerificationMeta _descuentoMeta = const VerificationMeta(
    'descuento',
  );
  @override
  late final GeneratedColumn<double> descuento = GeneratedColumn<double>(
    'descuento',
    aliasedName,
    false,
    type: DriftSqlType.double,
    requiredDuringInsert: false,
    defaultValue: const Constant(0.0),
  );
  static const VerificationMeta _notasMeta = const VerificationMeta('notas');
  @override
  late final GeneratedColumn<String> notas = GeneratedColumn<String>(
    'notas',
    aliasedName,
    false,
    type: DriftSqlType.string,
    requiredDuringInsert: false,
    defaultValue: const Constant(''),
  );
  static const VerificationMeta _obraIdMeta = const VerificationMeta('obraId');
  @override
  late final GeneratedColumn<String> obraId = GeneratedColumn<String>(
    'obra_id',
    aliasedName,
    true,
    type: DriftSqlType.string,
    requiredDuringInsert: false,
  );
  static const VerificationMeta _pdfConfigJsonMeta = const VerificationMeta(
    'pdfConfigJson',
  );
  @override
  late final GeneratedColumn<String> pdfConfigJson = GeneratedColumn<String>(
    'pdf_config_json',
    aliasedName,
    true,
    type: DriftSqlType.string,
    requiredDuringInsert: false,
  );
  @override
  List<GeneratedColumn> get $columns => [
    id,
    cliente,
    nombreProyecto,
    ubicacion,
    fecha,
    estado,
    ivaEnabled,
    descuento,
    notas,
    obraId,
    pdfConfigJson,
  ];
  @override
  String get aliasedName => _alias ?? actualTableName;
  @override
  String get actualTableName => $name;
  static const String $name = 'cotizaciones';
  @override
  VerificationContext validateIntegrity(
    Insertable<Cotizacion> instance, {
    bool isInserting = false,
  }) {
    final context = VerificationContext();
    final data = instance.toColumns(true);
    if (data.containsKey('id')) {
      context.handle(_idMeta, id.isAcceptableOrUnknown(data['id']!, _idMeta));
    } else if (isInserting) {
      context.missing(_idMeta);
    }
    if (data.containsKey('cliente')) {
      context.handle(
        _clienteMeta,
        cliente.isAcceptableOrUnknown(data['cliente']!, _clienteMeta),
      );
    } else if (isInserting) {
      context.missing(_clienteMeta);
    }
    if (data.containsKey('nombre_proyecto')) {
      context.handle(
        _nombreProyectoMeta,
        nombreProyecto.isAcceptableOrUnknown(
          data['nombre_proyecto']!,
          _nombreProyectoMeta,
        ),
      );
    } else if (isInserting) {
      context.missing(_nombreProyectoMeta);
    }
    if (data.containsKey('ubicacion')) {
      context.handle(
        _ubicacionMeta,
        ubicacion.isAcceptableOrUnknown(data['ubicacion']!, _ubicacionMeta),
      );
    }
    if (data.containsKey('fecha')) {
      context.handle(
        _fechaMeta,
        fecha.isAcceptableOrUnknown(data['fecha']!, _fechaMeta),
      );
    } else if (isInserting) {
      context.missing(_fechaMeta);
    }
    if (data.containsKey('estado')) {
      context.handle(
        _estadoMeta,
        estado.isAcceptableOrUnknown(data['estado']!, _estadoMeta),
      );
    }
    if (data.containsKey('iva_enabled')) {
      context.handle(
        _ivaEnabledMeta,
        ivaEnabled.isAcceptableOrUnknown(data['iva_enabled']!, _ivaEnabledMeta),
      );
    }
    if (data.containsKey('descuento')) {
      context.handle(
        _descuentoMeta,
        descuento.isAcceptableOrUnknown(data['descuento']!, _descuentoMeta),
      );
    }
    if (data.containsKey('notas')) {
      context.handle(
        _notasMeta,
        notas.isAcceptableOrUnknown(data['notas']!, _notasMeta),
      );
    }
    if (data.containsKey('obra_id')) {
      context.handle(
        _obraIdMeta,
        obraId.isAcceptableOrUnknown(data['obra_id']!, _obraIdMeta),
      );
    }
    if (data.containsKey('pdf_config_json')) {
      context.handle(
        _pdfConfigJsonMeta,
        pdfConfigJson.isAcceptableOrUnknown(
          data['pdf_config_json']!,
          _pdfConfigJsonMeta,
        ),
      );
    }
    return context;
  }

  @override
  Set<GeneratedColumn> get $primaryKey => {id};
  @override
  Cotizacion map(Map<String, dynamic> data, {String? tablePrefix}) {
    final effectivePrefix = tablePrefix != null ? '$tablePrefix.' : '';
    return Cotizacion(
      id: attachedDatabase.typeMapping.read(
        DriftSqlType.string,
        data['${effectivePrefix}id'],
      )!,
      cliente: attachedDatabase.typeMapping.read(
        DriftSqlType.string,
        data['${effectivePrefix}cliente'],
      )!,
      nombreProyecto: attachedDatabase.typeMapping.read(
        DriftSqlType.string,
        data['${effectivePrefix}nombre_proyecto'],
      )!,
      ubicacion: attachedDatabase.typeMapping.read(
        DriftSqlType.string,
        data['${effectivePrefix}ubicacion'],
      )!,
      fecha: attachedDatabase.typeMapping.read(
        DriftSqlType.int,
        data['${effectivePrefix}fecha'],
      )!,
      estado: attachedDatabase.typeMapping.read(
        DriftSqlType.string,
        data['${effectivePrefix}estado'],
      )!,
      ivaEnabled: attachedDatabase.typeMapping.read(
        DriftSqlType.bool,
        data['${effectivePrefix}iva_enabled'],
      )!,
      descuento: attachedDatabase.typeMapping.read(
        DriftSqlType.double,
        data['${effectivePrefix}descuento'],
      )!,
      notas: attachedDatabase.typeMapping.read(
        DriftSqlType.string,
        data['${effectivePrefix}notas'],
      )!,
      obraId: attachedDatabase.typeMapping.read(
        DriftSqlType.string,
        data['${effectivePrefix}obra_id'],
      ),
      pdfConfigJson: attachedDatabase.typeMapping.read(
        DriftSqlType.string,
        data['${effectivePrefix}pdf_config_json'],
      ),
    );
  }

  @override
  $CotizacionesTable createAlias(String alias) {
    return $CotizacionesTable(attachedDatabase, alias);
  }
}

class Cotizacion extends DataClass implements Insertable<Cotizacion> {
  final String id;
  final String cliente;
  final String nombreProyecto;
  final String ubicacion;
  final int fecha;
  final String estado;
  final bool ivaEnabled;
  final double descuento;
  final String notas;
  final String? obraId;
  final String? pdfConfigJson;
  const Cotizacion({
    required this.id,
    required this.cliente,
    required this.nombreProyecto,
    required this.ubicacion,
    required this.fecha,
    required this.estado,
    required this.ivaEnabled,
    required this.descuento,
    required this.notas,
    this.obraId,
    this.pdfConfigJson,
  });
  @override
  Map<String, Expression> toColumns(bool nullToAbsent) {
    final map = <String, Expression>{};
    map['id'] = Variable<String>(id);
    map['cliente'] = Variable<String>(cliente);
    map['nombre_proyecto'] = Variable<String>(nombreProyecto);
    map['ubicacion'] = Variable<String>(ubicacion);
    map['fecha'] = Variable<int>(fecha);
    map['estado'] = Variable<String>(estado);
    map['iva_enabled'] = Variable<bool>(ivaEnabled);
    map['descuento'] = Variable<double>(descuento);
    map['notas'] = Variable<String>(notas);
    if (!nullToAbsent || obraId != null) {
      map['obra_id'] = Variable<String>(obraId);
    }
    if (!nullToAbsent || pdfConfigJson != null) {
      map['pdf_config_json'] = Variable<String>(pdfConfigJson);
    }
    return map;
  }

  CotizacionesCompanion toCompanion(bool nullToAbsent) {
    return CotizacionesCompanion(
      id: Value(id),
      cliente: Value(cliente),
      nombreProyecto: Value(nombreProyecto),
      ubicacion: Value(ubicacion),
      fecha: Value(fecha),
      estado: Value(estado),
      ivaEnabled: Value(ivaEnabled),
      descuento: Value(descuento),
      notas: Value(notas),
      obraId: obraId == null && nullToAbsent
          ? const Value.absent()
          : Value(obraId),
      pdfConfigJson: pdfConfigJson == null && nullToAbsent
          ? const Value.absent()
          : Value(pdfConfigJson),
    );
  }

  factory Cotizacion.fromJson(
    Map<String, dynamic> json, {
    ValueSerializer? serializer,
  }) {
    serializer ??= driftRuntimeOptions.defaultSerializer;
    return Cotizacion(
      id: serializer.fromJson<String>(json['id']),
      cliente: serializer.fromJson<String>(json['cliente']),
      nombreProyecto: serializer.fromJson<String>(json['nombreProyecto']),
      ubicacion: serializer.fromJson<String>(json['ubicacion']),
      fecha: serializer.fromJson<int>(json['fecha']),
      estado: serializer.fromJson<String>(json['estado']),
      ivaEnabled: serializer.fromJson<bool>(json['ivaEnabled']),
      descuento: serializer.fromJson<double>(json['descuento']),
      notas: serializer.fromJson<String>(json['notas']),
      obraId: serializer.fromJson<String?>(json['obraId']),
      pdfConfigJson: serializer.fromJson<String?>(json['pdfConfigJson']),
    );
  }
  @override
  Map<String, dynamic> toJson({ValueSerializer? serializer}) {
    serializer ??= driftRuntimeOptions.defaultSerializer;
    return <String, dynamic>{
      'id': serializer.toJson<String>(id),
      'cliente': serializer.toJson<String>(cliente),
      'nombreProyecto': serializer.toJson<String>(nombreProyecto),
      'ubicacion': serializer.toJson<String>(ubicacion),
      'fecha': serializer.toJson<int>(fecha),
      'estado': serializer.toJson<String>(estado),
      'ivaEnabled': serializer.toJson<bool>(ivaEnabled),
      'descuento': serializer.toJson<double>(descuento),
      'notas': serializer.toJson<String>(notas),
      'obraId': serializer.toJson<String?>(obraId),
      'pdfConfigJson': serializer.toJson<String?>(pdfConfigJson),
    };
  }

  Cotizacion copyWith({
    String? id,
    String? cliente,
    String? nombreProyecto,
    String? ubicacion,
    int? fecha,
    String? estado,
    bool? ivaEnabled,
    double? descuento,
    String? notas,
    Value<String?> obraId = const Value.absent(),
    Value<String?> pdfConfigJson = const Value.absent(),
  }) => Cotizacion(
    id: id ?? this.id,
    cliente: cliente ?? this.cliente,
    nombreProyecto: nombreProyecto ?? this.nombreProyecto,
    ubicacion: ubicacion ?? this.ubicacion,
    fecha: fecha ?? this.fecha,
    estado: estado ?? this.estado,
    ivaEnabled: ivaEnabled ?? this.ivaEnabled,
    descuento: descuento ?? this.descuento,
    notas: notas ?? this.notas,
    obraId: obraId.present ? obraId.value : this.obraId,
    pdfConfigJson: pdfConfigJson.present
        ? pdfConfigJson.value
        : this.pdfConfigJson,
  );
  Cotizacion copyWithCompanion(CotizacionesCompanion data) {
    return Cotizacion(
      id: data.id.present ? data.id.value : this.id,
      cliente: data.cliente.present ? data.cliente.value : this.cliente,
      nombreProyecto: data.nombreProyecto.present
          ? data.nombreProyecto.value
          : this.nombreProyecto,
      ubicacion: data.ubicacion.present ? data.ubicacion.value : this.ubicacion,
      fecha: data.fecha.present ? data.fecha.value : this.fecha,
      estado: data.estado.present ? data.estado.value : this.estado,
      ivaEnabled: data.ivaEnabled.present
          ? data.ivaEnabled.value
          : this.ivaEnabled,
      descuento: data.descuento.present ? data.descuento.value : this.descuento,
      notas: data.notas.present ? data.notas.value : this.notas,
      obraId: data.obraId.present ? data.obraId.value : this.obraId,
      pdfConfigJson: data.pdfConfigJson.present
          ? data.pdfConfigJson.value
          : this.pdfConfigJson,
    );
  }

  @override
  String toString() {
    return (StringBuffer('Cotizacion(')
          ..write('id: $id, ')
          ..write('cliente: $cliente, ')
          ..write('nombreProyecto: $nombreProyecto, ')
          ..write('ubicacion: $ubicacion, ')
          ..write('fecha: $fecha, ')
          ..write('estado: $estado, ')
          ..write('ivaEnabled: $ivaEnabled, ')
          ..write('descuento: $descuento, ')
          ..write('notas: $notas, ')
          ..write('obraId: $obraId, ')
          ..write('pdfConfigJson: $pdfConfigJson')
          ..write(')'))
        .toString();
  }

  @override
  int get hashCode => Object.hash(
    id,
    cliente,
    nombreProyecto,
    ubicacion,
    fecha,
    estado,
    ivaEnabled,
    descuento,
    notas,
    obraId,
    pdfConfigJson,
  );
  @override
  bool operator ==(Object other) =>
      identical(this, other) ||
      (other is Cotizacion &&
          other.id == this.id &&
          other.cliente == this.cliente &&
          other.nombreProyecto == this.nombreProyecto &&
          other.ubicacion == this.ubicacion &&
          other.fecha == this.fecha &&
          other.estado == this.estado &&
          other.ivaEnabled == this.ivaEnabled &&
          other.descuento == this.descuento &&
          other.notas == this.notas &&
          other.obraId == this.obraId &&
          other.pdfConfigJson == this.pdfConfigJson);
}

class CotizacionesCompanion extends UpdateCompanion<Cotizacion> {
  final Value<String> id;
  final Value<String> cliente;
  final Value<String> nombreProyecto;
  final Value<String> ubicacion;
  final Value<int> fecha;
  final Value<String> estado;
  final Value<bool> ivaEnabled;
  final Value<double> descuento;
  final Value<String> notas;
  final Value<String?> obraId;
  final Value<String?> pdfConfigJson;
  final Value<int> rowid;
  const CotizacionesCompanion({
    this.id = const Value.absent(),
    this.cliente = const Value.absent(),
    this.nombreProyecto = const Value.absent(),
    this.ubicacion = const Value.absent(),
    this.fecha = const Value.absent(),
    this.estado = const Value.absent(),
    this.ivaEnabled = const Value.absent(),
    this.descuento = const Value.absent(),
    this.notas = const Value.absent(),
    this.obraId = const Value.absent(),
    this.pdfConfigJson = const Value.absent(),
    this.rowid = const Value.absent(),
  });
  CotizacionesCompanion.insert({
    required String id,
    required String cliente,
    required String nombreProyecto,
    this.ubicacion = const Value.absent(),
    required int fecha,
    this.estado = const Value.absent(),
    this.ivaEnabled = const Value.absent(),
    this.descuento = const Value.absent(),
    this.notas = const Value.absent(),
    this.obraId = const Value.absent(),
    this.pdfConfigJson = const Value.absent(),
    this.rowid = const Value.absent(),
  }) : id = Value(id),
       cliente = Value(cliente),
       nombreProyecto = Value(nombreProyecto),
       fecha = Value(fecha);
  static Insertable<Cotizacion> custom({
    Expression<String>? id,
    Expression<String>? cliente,
    Expression<String>? nombreProyecto,
    Expression<String>? ubicacion,
    Expression<int>? fecha,
    Expression<String>? estado,
    Expression<bool>? ivaEnabled,
    Expression<double>? descuento,
    Expression<String>? notas,
    Expression<String>? obraId,
    Expression<String>? pdfConfigJson,
    Expression<int>? rowid,
  }) {
    return RawValuesInsertable({
      if (id != null) 'id': id,
      if (cliente != null) 'cliente': cliente,
      if (nombreProyecto != null) 'nombre_proyecto': nombreProyecto,
      if (ubicacion != null) 'ubicacion': ubicacion,
      if (fecha != null) 'fecha': fecha,
      if (estado != null) 'estado': estado,
      if (ivaEnabled != null) 'iva_enabled': ivaEnabled,
      if (descuento != null) 'descuento': descuento,
      if (notas != null) 'notas': notas,
      if (obraId != null) 'obra_id': obraId,
      if (pdfConfigJson != null) 'pdf_config_json': pdfConfigJson,
      if (rowid != null) 'rowid': rowid,
    });
  }

  CotizacionesCompanion copyWith({
    Value<String>? id,
    Value<String>? cliente,
    Value<String>? nombreProyecto,
    Value<String>? ubicacion,
    Value<int>? fecha,
    Value<String>? estado,
    Value<bool>? ivaEnabled,
    Value<double>? descuento,
    Value<String>? notas,
    Value<String?>? obraId,
    Value<String?>? pdfConfigJson,
    Value<int>? rowid,
  }) {
    return CotizacionesCompanion(
      id: id ?? this.id,
      cliente: cliente ?? this.cliente,
      nombreProyecto: nombreProyecto ?? this.nombreProyecto,
      ubicacion: ubicacion ?? this.ubicacion,
      fecha: fecha ?? this.fecha,
      estado: estado ?? this.estado,
      ivaEnabled: ivaEnabled ?? this.ivaEnabled,
      descuento: descuento ?? this.descuento,
      notas: notas ?? this.notas,
      obraId: obraId ?? this.obraId,
      pdfConfigJson: pdfConfigJson ?? this.pdfConfigJson,
      rowid: rowid ?? this.rowid,
    );
  }

  @override
  Map<String, Expression> toColumns(bool nullToAbsent) {
    final map = <String, Expression>{};
    if (id.present) {
      map['id'] = Variable<String>(id.value);
    }
    if (cliente.present) {
      map['cliente'] = Variable<String>(cliente.value);
    }
    if (nombreProyecto.present) {
      map['nombre_proyecto'] = Variable<String>(nombreProyecto.value);
    }
    if (ubicacion.present) {
      map['ubicacion'] = Variable<String>(ubicacion.value);
    }
    if (fecha.present) {
      map['fecha'] = Variable<int>(fecha.value);
    }
    if (estado.present) {
      map['estado'] = Variable<String>(estado.value);
    }
    if (ivaEnabled.present) {
      map['iva_enabled'] = Variable<bool>(ivaEnabled.value);
    }
    if (descuento.present) {
      map['descuento'] = Variable<double>(descuento.value);
    }
    if (notas.present) {
      map['notas'] = Variable<String>(notas.value);
    }
    if (obraId.present) {
      map['obra_id'] = Variable<String>(obraId.value);
    }
    if (pdfConfigJson.present) {
      map['pdf_config_json'] = Variable<String>(pdfConfigJson.value);
    }
    if (rowid.present) {
      map['rowid'] = Variable<int>(rowid.value);
    }
    return map;
  }

  @override
  String toString() {
    return (StringBuffer('CotizacionesCompanion(')
          ..write('id: $id, ')
          ..write('cliente: $cliente, ')
          ..write('nombreProyecto: $nombreProyecto, ')
          ..write('ubicacion: $ubicacion, ')
          ..write('fecha: $fecha, ')
          ..write('estado: $estado, ')
          ..write('ivaEnabled: $ivaEnabled, ')
          ..write('descuento: $descuento, ')
          ..write('notas: $notas, ')
          ..write('obraId: $obraId, ')
          ..write('pdfConfigJson: $pdfConfigJson, ')
          ..write('rowid: $rowid')
          ..write(')'))
        .toString();
  }
}

class $SeccionesTable extends Secciones
    with TableInfo<$SeccionesTable, Seccion> {
  @override
  final GeneratedDatabase attachedDatabase;
  final String? _alias;
  $SeccionesTable(this.attachedDatabase, [this._alias]);
  static const VerificationMeta _idMeta = const VerificationMeta('id');
  @override
  late final GeneratedColumn<String> id = GeneratedColumn<String>(
    'id',
    aliasedName,
    false,
    type: DriftSqlType.string,
    requiredDuringInsert: true,
  );
  static const VerificationMeta _cotizacionIdMeta = const VerificationMeta(
    'cotizacionId',
  );
  @override
  late final GeneratedColumn<String> cotizacionId = GeneratedColumn<String>(
    'cotizacion_id',
    aliasedName,
    false,
    type: DriftSqlType.string,
    requiredDuringInsert: true,
  );
  static const VerificationMeta _nombreMeta = const VerificationMeta('nombre');
  @override
  late final GeneratedColumn<String> nombre = GeneratedColumn<String>(
    'nombre',
    aliasedName,
    false,
    type: DriftSqlType.string,
    requiredDuringInsert: true,
  );
  static const VerificationMeta _ordenMeta = const VerificationMeta('orden');
  @override
  late final GeneratedColumn<int> orden = GeneratedColumn<int>(
    'orden',
    aliasedName,
    false,
    type: DriftSqlType.int,
    requiredDuringInsert: false,
    defaultValue: const Constant(0),
  );
  @override
  List<GeneratedColumn> get $columns => [id, cotizacionId, nombre, orden];
  @override
  String get aliasedName => _alias ?? actualTableName;
  @override
  String get actualTableName => $name;
  static const String $name = 'secciones';
  @override
  VerificationContext validateIntegrity(
    Insertable<Seccion> instance, {
    bool isInserting = false,
  }) {
    final context = VerificationContext();
    final data = instance.toColumns(true);
    if (data.containsKey('id')) {
      context.handle(_idMeta, id.isAcceptableOrUnknown(data['id']!, _idMeta));
    } else if (isInserting) {
      context.missing(_idMeta);
    }
    if (data.containsKey('cotizacion_id')) {
      context.handle(
        _cotizacionIdMeta,
        cotizacionId.isAcceptableOrUnknown(
          data['cotizacion_id']!,
          _cotizacionIdMeta,
        ),
      );
    } else if (isInserting) {
      context.missing(_cotizacionIdMeta);
    }
    if (data.containsKey('nombre')) {
      context.handle(
        _nombreMeta,
        nombre.isAcceptableOrUnknown(data['nombre']!, _nombreMeta),
      );
    } else if (isInserting) {
      context.missing(_nombreMeta);
    }
    if (data.containsKey('orden')) {
      context.handle(
        _ordenMeta,
        orden.isAcceptableOrUnknown(data['orden']!, _ordenMeta),
      );
    }
    return context;
  }

  @override
  Set<GeneratedColumn> get $primaryKey => {id};
  @override
  Seccion map(Map<String, dynamic> data, {String? tablePrefix}) {
    final effectivePrefix = tablePrefix != null ? '$tablePrefix.' : '';
    return Seccion(
      id: attachedDatabase.typeMapping.read(
        DriftSqlType.string,
        data['${effectivePrefix}id'],
      )!,
      cotizacionId: attachedDatabase.typeMapping.read(
        DriftSqlType.string,
        data['${effectivePrefix}cotizacion_id'],
      )!,
      nombre: attachedDatabase.typeMapping.read(
        DriftSqlType.string,
        data['${effectivePrefix}nombre'],
      )!,
      orden: attachedDatabase.typeMapping.read(
        DriftSqlType.int,
        data['${effectivePrefix}orden'],
      )!,
    );
  }

  @override
  $SeccionesTable createAlias(String alias) {
    return $SeccionesTable(attachedDatabase, alias);
  }
}

class Seccion extends DataClass implements Insertable<Seccion> {
  final String id;
  final String cotizacionId;
  final String nombre;
  final int orden;
  const Seccion({
    required this.id,
    required this.cotizacionId,
    required this.nombre,
    required this.orden,
  });
  @override
  Map<String, Expression> toColumns(bool nullToAbsent) {
    final map = <String, Expression>{};
    map['id'] = Variable<String>(id);
    map['cotizacion_id'] = Variable<String>(cotizacionId);
    map['nombre'] = Variable<String>(nombre);
    map['orden'] = Variable<int>(orden);
    return map;
  }

  SeccionesCompanion toCompanion(bool nullToAbsent) {
    return SeccionesCompanion(
      id: Value(id),
      cotizacionId: Value(cotizacionId),
      nombre: Value(nombre),
      orden: Value(orden),
    );
  }

  factory Seccion.fromJson(
    Map<String, dynamic> json, {
    ValueSerializer? serializer,
  }) {
    serializer ??= driftRuntimeOptions.defaultSerializer;
    return Seccion(
      id: serializer.fromJson<String>(json['id']),
      cotizacionId: serializer.fromJson<String>(json['cotizacionId']),
      nombre: serializer.fromJson<String>(json['nombre']),
      orden: serializer.fromJson<int>(json['orden']),
    );
  }
  @override
  Map<String, dynamic> toJson({ValueSerializer? serializer}) {
    serializer ??= driftRuntimeOptions.defaultSerializer;
    return <String, dynamic>{
      'id': serializer.toJson<String>(id),
      'cotizacionId': serializer.toJson<String>(cotizacionId),
      'nombre': serializer.toJson<String>(nombre),
      'orden': serializer.toJson<int>(orden),
    };
  }

  Seccion copyWith({
    String? id,
    String? cotizacionId,
    String? nombre,
    int? orden,
  }) => Seccion(
    id: id ?? this.id,
    cotizacionId: cotizacionId ?? this.cotizacionId,
    nombre: nombre ?? this.nombre,
    orden: orden ?? this.orden,
  );
  Seccion copyWithCompanion(SeccionesCompanion data) {
    return Seccion(
      id: data.id.present ? data.id.value : this.id,
      cotizacionId: data.cotizacionId.present
          ? data.cotizacionId.value
          : this.cotizacionId,
      nombre: data.nombre.present ? data.nombre.value : this.nombre,
      orden: data.orden.present ? data.orden.value : this.orden,
    );
  }

  @override
  String toString() {
    return (StringBuffer('Seccion(')
          ..write('id: $id, ')
          ..write('cotizacionId: $cotizacionId, ')
          ..write('nombre: $nombre, ')
          ..write('orden: $orden')
          ..write(')'))
        .toString();
  }

  @override
  int get hashCode => Object.hash(id, cotizacionId, nombre, orden);
  @override
  bool operator ==(Object other) =>
      identical(this, other) ||
      (other is Seccion &&
          other.id == this.id &&
          other.cotizacionId == this.cotizacionId &&
          other.nombre == this.nombre &&
          other.orden == this.orden);
}

class SeccionesCompanion extends UpdateCompanion<Seccion> {
  final Value<String> id;
  final Value<String> cotizacionId;
  final Value<String> nombre;
  final Value<int> orden;
  final Value<int> rowid;
  const SeccionesCompanion({
    this.id = const Value.absent(),
    this.cotizacionId = const Value.absent(),
    this.nombre = const Value.absent(),
    this.orden = const Value.absent(),
    this.rowid = const Value.absent(),
  });
  SeccionesCompanion.insert({
    required String id,
    required String cotizacionId,
    required String nombre,
    this.orden = const Value.absent(),
    this.rowid = const Value.absent(),
  }) : id = Value(id),
       cotizacionId = Value(cotizacionId),
       nombre = Value(nombre);
  static Insertable<Seccion> custom({
    Expression<String>? id,
    Expression<String>? cotizacionId,
    Expression<String>? nombre,
    Expression<int>? orden,
    Expression<int>? rowid,
  }) {
    return RawValuesInsertable({
      if (id != null) 'id': id,
      if (cotizacionId != null) 'cotizacion_id': cotizacionId,
      if (nombre != null) 'nombre': nombre,
      if (orden != null) 'orden': orden,
      if (rowid != null) 'rowid': rowid,
    });
  }

  SeccionesCompanion copyWith({
    Value<String>? id,
    Value<String>? cotizacionId,
    Value<String>? nombre,
    Value<int>? orden,
    Value<int>? rowid,
  }) {
    return SeccionesCompanion(
      id: id ?? this.id,
      cotizacionId: cotizacionId ?? this.cotizacionId,
      nombre: nombre ?? this.nombre,
      orden: orden ?? this.orden,
      rowid: rowid ?? this.rowid,
    );
  }

  @override
  Map<String, Expression> toColumns(bool nullToAbsent) {
    final map = <String, Expression>{};
    if (id.present) {
      map['id'] = Variable<String>(id.value);
    }
    if (cotizacionId.present) {
      map['cotizacion_id'] = Variable<String>(cotizacionId.value);
    }
    if (nombre.present) {
      map['nombre'] = Variable<String>(nombre.value);
    }
    if (orden.present) {
      map['orden'] = Variable<int>(orden.value);
    }
    if (rowid.present) {
      map['rowid'] = Variable<int>(rowid.value);
    }
    return map;
  }

  @override
  String toString() {
    return (StringBuffer('SeccionesCompanion(')
          ..write('id: $id, ')
          ..write('cotizacionId: $cotizacionId, ')
          ..write('nombre: $nombre, ')
          ..write('orden: $orden, ')
          ..write('rowid: $rowid')
          ..write(')'))
        .toString();
  }
}

class $PartidasTable extends Partidas with TableInfo<$PartidasTable, Partida> {
  @override
  final GeneratedDatabase attachedDatabase;
  final String? _alias;
  $PartidasTable(this.attachedDatabase, [this._alias]);
  static const VerificationMeta _idMeta = const VerificationMeta('id');
  @override
  late final GeneratedColumn<String> id = GeneratedColumn<String>(
    'id',
    aliasedName,
    false,
    type: DriftSqlType.string,
    requiredDuringInsert: true,
  );
  static const VerificationMeta _seccionIdMeta = const VerificationMeta(
    'seccionId',
  );
  @override
  late final GeneratedColumn<String> seccionId = GeneratedColumn<String>(
    'seccion_id',
    aliasedName,
    false,
    type: DriftSqlType.string,
    requiredDuringInsert: true,
  );
  static const VerificationMeta _claveMeta = const VerificationMeta('clave');
  @override
  late final GeneratedColumn<String> clave = GeneratedColumn<String>(
    'clave',
    aliasedName,
    false,
    type: DriftSqlType.string,
    requiredDuringInsert: false,
    defaultValue: const Constant(''),
  );
  static const VerificationMeta _descripcionMeta = const VerificationMeta(
    'descripcion',
  );
  @override
  late final GeneratedColumn<String> descripcion = GeneratedColumn<String>(
    'descripcion',
    aliasedName,
    false,
    type: DriftSqlType.string,
    requiredDuringInsert: true,
  );
  static const VerificationMeta _unidadMeta = const VerificationMeta('unidad');
  @override
  late final GeneratedColumn<String> unidad = GeneratedColumn<String>(
    'unidad',
    aliasedName,
    false,
    type: DriftSqlType.string,
    requiredDuringInsert: false,
    defaultValue: const Constant(''),
  );
  static const VerificationMeta _cantidadMeta = const VerificationMeta(
    'cantidad',
  );
  @override
  late final GeneratedColumn<double> cantidad = GeneratedColumn<double>(
    'cantidad',
    aliasedName,
    false,
    type: DriftSqlType.double,
    requiredDuringInsert: true,
  );
  static const VerificationMeta _precioUnitarioMeta = const VerificationMeta(
    'precioUnitario',
  );
  @override
  late final GeneratedColumn<double> precioUnitario = GeneratedColumn<double>(
    'precio_unitario',
    aliasedName,
    false,
    type: DriftSqlType.double,
    requiredDuringInsert: true,
  );
  static const VerificationMeta _ordenMeta = const VerificationMeta('orden');
  @override
  late final GeneratedColumn<int> orden = GeneratedColumn<int>(
    'orden',
    aliasedName,
    false,
    type: DriftSqlType.int,
    requiredDuringInsert: false,
    defaultValue: const Constant(0),
  );
  @override
  List<GeneratedColumn> get $columns => [
    id,
    seccionId,
    clave,
    descripcion,
    unidad,
    cantidad,
    precioUnitario,
    orden,
  ];
  @override
  String get aliasedName => _alias ?? actualTableName;
  @override
  String get actualTableName => $name;
  static const String $name = 'partidas';
  @override
  VerificationContext validateIntegrity(
    Insertable<Partida> instance, {
    bool isInserting = false,
  }) {
    final context = VerificationContext();
    final data = instance.toColumns(true);
    if (data.containsKey('id')) {
      context.handle(_idMeta, id.isAcceptableOrUnknown(data['id']!, _idMeta));
    } else if (isInserting) {
      context.missing(_idMeta);
    }
    if (data.containsKey('seccion_id')) {
      context.handle(
        _seccionIdMeta,
        seccionId.isAcceptableOrUnknown(data['seccion_id']!, _seccionIdMeta),
      );
    } else if (isInserting) {
      context.missing(_seccionIdMeta);
    }
    if (data.containsKey('clave')) {
      context.handle(
        _claveMeta,
        clave.isAcceptableOrUnknown(data['clave']!, _claveMeta),
      );
    }
    if (data.containsKey('descripcion')) {
      context.handle(
        _descripcionMeta,
        descripcion.isAcceptableOrUnknown(
          data['descripcion']!,
          _descripcionMeta,
        ),
      );
    } else if (isInserting) {
      context.missing(_descripcionMeta);
    }
    if (data.containsKey('unidad')) {
      context.handle(
        _unidadMeta,
        unidad.isAcceptableOrUnknown(data['unidad']!, _unidadMeta),
      );
    }
    if (data.containsKey('cantidad')) {
      context.handle(
        _cantidadMeta,
        cantidad.isAcceptableOrUnknown(data['cantidad']!, _cantidadMeta),
      );
    } else if (isInserting) {
      context.missing(_cantidadMeta);
    }
    if (data.containsKey('precio_unitario')) {
      context.handle(
        _precioUnitarioMeta,
        precioUnitario.isAcceptableOrUnknown(
          data['precio_unitario']!,
          _precioUnitarioMeta,
        ),
      );
    } else if (isInserting) {
      context.missing(_precioUnitarioMeta);
    }
    if (data.containsKey('orden')) {
      context.handle(
        _ordenMeta,
        orden.isAcceptableOrUnknown(data['orden']!, _ordenMeta),
      );
    }
    return context;
  }

  @override
  Set<GeneratedColumn> get $primaryKey => {id};
  @override
  Partida map(Map<String, dynamic> data, {String? tablePrefix}) {
    final effectivePrefix = tablePrefix != null ? '$tablePrefix.' : '';
    return Partida(
      id: attachedDatabase.typeMapping.read(
        DriftSqlType.string,
        data['${effectivePrefix}id'],
      )!,
      seccionId: attachedDatabase.typeMapping.read(
        DriftSqlType.string,
        data['${effectivePrefix}seccion_id'],
      )!,
      clave: attachedDatabase.typeMapping.read(
        DriftSqlType.string,
        data['${effectivePrefix}clave'],
      )!,
      descripcion: attachedDatabase.typeMapping.read(
        DriftSqlType.string,
        data['${effectivePrefix}descripcion'],
      )!,
      unidad: attachedDatabase.typeMapping.read(
        DriftSqlType.string,
        data['${effectivePrefix}unidad'],
      )!,
      cantidad: attachedDatabase.typeMapping.read(
        DriftSqlType.double,
        data['${effectivePrefix}cantidad'],
      )!,
      precioUnitario: attachedDatabase.typeMapping.read(
        DriftSqlType.double,
        data['${effectivePrefix}precio_unitario'],
      )!,
      orden: attachedDatabase.typeMapping.read(
        DriftSqlType.int,
        data['${effectivePrefix}orden'],
      )!,
    );
  }

  @override
  $PartidasTable createAlias(String alias) {
    return $PartidasTable(attachedDatabase, alias);
  }
}

class Partida extends DataClass implements Insertable<Partida> {
  final String id;
  final String seccionId;
  final String clave;
  final String descripcion;
  final String unidad;
  final double cantidad;
  final double precioUnitario;
  final int orden;
  const Partida({
    required this.id,
    required this.seccionId,
    required this.clave,
    required this.descripcion,
    required this.unidad,
    required this.cantidad,
    required this.precioUnitario,
    required this.orden,
  });
  @override
  Map<String, Expression> toColumns(bool nullToAbsent) {
    final map = <String, Expression>{};
    map['id'] = Variable<String>(id);
    map['seccion_id'] = Variable<String>(seccionId);
    map['clave'] = Variable<String>(clave);
    map['descripcion'] = Variable<String>(descripcion);
    map['unidad'] = Variable<String>(unidad);
    map['cantidad'] = Variable<double>(cantidad);
    map['precio_unitario'] = Variable<double>(precioUnitario);
    map['orden'] = Variable<int>(orden);
    return map;
  }

  PartidasCompanion toCompanion(bool nullToAbsent) {
    return PartidasCompanion(
      id: Value(id),
      seccionId: Value(seccionId),
      clave: Value(clave),
      descripcion: Value(descripcion),
      unidad: Value(unidad),
      cantidad: Value(cantidad),
      precioUnitario: Value(precioUnitario),
      orden: Value(orden),
    );
  }

  factory Partida.fromJson(
    Map<String, dynamic> json, {
    ValueSerializer? serializer,
  }) {
    serializer ??= driftRuntimeOptions.defaultSerializer;
    return Partida(
      id: serializer.fromJson<String>(json['id']),
      seccionId: serializer.fromJson<String>(json['seccionId']),
      clave: serializer.fromJson<String>(json['clave']),
      descripcion: serializer.fromJson<String>(json['descripcion']),
      unidad: serializer.fromJson<String>(json['unidad']),
      cantidad: serializer.fromJson<double>(json['cantidad']),
      precioUnitario: serializer.fromJson<double>(json['precioUnitario']),
      orden: serializer.fromJson<int>(json['orden']),
    );
  }
  @override
  Map<String, dynamic> toJson({ValueSerializer? serializer}) {
    serializer ??= driftRuntimeOptions.defaultSerializer;
    return <String, dynamic>{
      'id': serializer.toJson<String>(id),
      'seccionId': serializer.toJson<String>(seccionId),
      'clave': serializer.toJson<String>(clave),
      'descripcion': serializer.toJson<String>(descripcion),
      'unidad': serializer.toJson<String>(unidad),
      'cantidad': serializer.toJson<double>(cantidad),
      'precioUnitario': serializer.toJson<double>(precioUnitario),
      'orden': serializer.toJson<int>(orden),
    };
  }

  Partida copyWith({
    String? id,
    String? seccionId,
    String? clave,
    String? descripcion,
    String? unidad,
    double? cantidad,
    double? precioUnitario,
    int? orden,
  }) => Partida(
    id: id ?? this.id,
    seccionId: seccionId ?? this.seccionId,
    clave: clave ?? this.clave,
    descripcion: descripcion ?? this.descripcion,
    unidad: unidad ?? this.unidad,
    cantidad: cantidad ?? this.cantidad,
    precioUnitario: precioUnitario ?? this.precioUnitario,
    orden: orden ?? this.orden,
  );
  Partida copyWithCompanion(PartidasCompanion data) {
    return Partida(
      id: data.id.present ? data.id.value : this.id,
      seccionId: data.seccionId.present ? data.seccionId.value : this.seccionId,
      clave: data.clave.present ? data.clave.value : this.clave,
      descripcion: data.descripcion.present
          ? data.descripcion.value
          : this.descripcion,
      unidad: data.unidad.present ? data.unidad.value : this.unidad,
      cantidad: data.cantidad.present ? data.cantidad.value : this.cantidad,
      precioUnitario: data.precioUnitario.present
          ? data.precioUnitario.value
          : this.precioUnitario,
      orden: data.orden.present ? data.orden.value : this.orden,
    );
  }

  @override
  String toString() {
    return (StringBuffer('Partida(')
          ..write('id: $id, ')
          ..write('seccionId: $seccionId, ')
          ..write('clave: $clave, ')
          ..write('descripcion: $descripcion, ')
          ..write('unidad: $unidad, ')
          ..write('cantidad: $cantidad, ')
          ..write('precioUnitario: $precioUnitario, ')
          ..write('orden: $orden')
          ..write(')'))
        .toString();
  }

  @override
  int get hashCode => Object.hash(
    id,
    seccionId,
    clave,
    descripcion,
    unidad,
    cantidad,
    precioUnitario,
    orden,
  );
  @override
  bool operator ==(Object other) =>
      identical(this, other) ||
      (other is Partida &&
          other.id == this.id &&
          other.seccionId == this.seccionId &&
          other.clave == this.clave &&
          other.descripcion == this.descripcion &&
          other.unidad == this.unidad &&
          other.cantidad == this.cantidad &&
          other.precioUnitario == this.precioUnitario &&
          other.orden == this.orden);
}

class PartidasCompanion extends UpdateCompanion<Partida> {
  final Value<String> id;
  final Value<String> seccionId;
  final Value<String> clave;
  final Value<String> descripcion;
  final Value<String> unidad;
  final Value<double> cantidad;
  final Value<double> precioUnitario;
  final Value<int> orden;
  final Value<int> rowid;
  const PartidasCompanion({
    this.id = const Value.absent(),
    this.seccionId = const Value.absent(),
    this.clave = const Value.absent(),
    this.descripcion = const Value.absent(),
    this.unidad = const Value.absent(),
    this.cantidad = const Value.absent(),
    this.precioUnitario = const Value.absent(),
    this.orden = const Value.absent(),
    this.rowid = const Value.absent(),
  });
  PartidasCompanion.insert({
    required String id,
    required String seccionId,
    this.clave = const Value.absent(),
    required String descripcion,
    this.unidad = const Value.absent(),
    required double cantidad,
    required double precioUnitario,
    this.orden = const Value.absent(),
    this.rowid = const Value.absent(),
  }) : id = Value(id),
       seccionId = Value(seccionId),
       descripcion = Value(descripcion),
       cantidad = Value(cantidad),
       precioUnitario = Value(precioUnitario);
  static Insertable<Partida> custom({
    Expression<String>? id,
    Expression<String>? seccionId,
    Expression<String>? clave,
    Expression<String>? descripcion,
    Expression<String>? unidad,
    Expression<double>? cantidad,
    Expression<double>? precioUnitario,
    Expression<int>? orden,
    Expression<int>? rowid,
  }) {
    return RawValuesInsertable({
      if (id != null) 'id': id,
      if (seccionId != null) 'seccion_id': seccionId,
      if (clave != null) 'clave': clave,
      if (descripcion != null) 'descripcion': descripcion,
      if (unidad != null) 'unidad': unidad,
      if (cantidad != null) 'cantidad': cantidad,
      if (precioUnitario != null) 'precio_unitario': precioUnitario,
      if (orden != null) 'orden': orden,
      if (rowid != null) 'rowid': rowid,
    });
  }

  PartidasCompanion copyWith({
    Value<String>? id,
    Value<String>? seccionId,
    Value<String>? clave,
    Value<String>? descripcion,
    Value<String>? unidad,
    Value<double>? cantidad,
    Value<double>? precioUnitario,
    Value<int>? orden,
    Value<int>? rowid,
  }) {
    return PartidasCompanion(
      id: id ?? this.id,
      seccionId: seccionId ?? this.seccionId,
      clave: clave ?? this.clave,
      descripcion: descripcion ?? this.descripcion,
      unidad: unidad ?? this.unidad,
      cantidad: cantidad ?? this.cantidad,
      precioUnitario: precioUnitario ?? this.precioUnitario,
      orden: orden ?? this.orden,
      rowid: rowid ?? this.rowid,
    );
  }

  @override
  Map<String, Expression> toColumns(bool nullToAbsent) {
    final map = <String, Expression>{};
    if (id.present) {
      map['id'] = Variable<String>(id.value);
    }
    if (seccionId.present) {
      map['seccion_id'] = Variable<String>(seccionId.value);
    }
    if (clave.present) {
      map['clave'] = Variable<String>(clave.value);
    }
    if (descripcion.present) {
      map['descripcion'] = Variable<String>(descripcion.value);
    }
    if (unidad.present) {
      map['unidad'] = Variable<String>(unidad.value);
    }
    if (cantidad.present) {
      map['cantidad'] = Variable<double>(cantidad.value);
    }
    if (precioUnitario.present) {
      map['precio_unitario'] = Variable<double>(precioUnitario.value);
    }
    if (orden.present) {
      map['orden'] = Variable<int>(orden.value);
    }
    if (rowid.present) {
      map['rowid'] = Variable<int>(rowid.value);
    }
    return map;
  }

  @override
  String toString() {
    return (StringBuffer('PartidasCompanion(')
          ..write('id: $id, ')
          ..write('seccionId: $seccionId, ')
          ..write('clave: $clave, ')
          ..write('descripcion: $descripcion, ')
          ..write('unidad: $unidad, ')
          ..write('cantidad: $cantidad, ')
          ..write('precioUnitario: $precioUnitario, ')
          ..write('orden: $orden, ')
          ..write('rowid: $rowid')
          ..write(')'))
        .toString();
  }
}

class $PagosTable extends Pagos with TableInfo<$PagosTable, Pago> {
  @override
  final GeneratedDatabase attachedDatabase;
  final String? _alias;
  $PagosTable(this.attachedDatabase, [this._alias]);
  static const VerificationMeta _idMeta = const VerificationMeta('id');
  @override
  late final GeneratedColumn<String> id = GeneratedColumn<String>(
    'id',
    aliasedName,
    false,
    type: DriftSqlType.string,
    requiredDuringInsert: true,
  );
  static const VerificationMeta _cotizacionIdMeta = const VerificationMeta(
    'cotizacionId',
  );
  @override
  late final GeneratedColumn<String> cotizacionId = GeneratedColumn<String>(
    'cotizacion_id',
    aliasedName,
    false,
    type: DriftSqlType.string,
    requiredDuringInsert: true,
  );
  static const VerificationMeta _fechaMeta = const VerificationMeta('fecha');
  @override
  late final GeneratedColumn<int> fecha = GeneratedColumn<int>(
    'fecha',
    aliasedName,
    false,
    type: DriftSqlType.int,
    requiredDuringInsert: true,
  );
  static const VerificationMeta _montoMeta = const VerificationMeta('monto');
  @override
  late final GeneratedColumn<double> monto = GeneratedColumn<double>(
    'monto',
    aliasedName,
    false,
    type: DriftSqlType.double,
    requiredDuringInsert: true,
  );
  static const VerificationMeta _metodoMeta = const VerificationMeta('metodo');
  @override
  late final GeneratedColumn<String> metodo = GeneratedColumn<String>(
    'metodo',
    aliasedName,
    false,
    type: DriftSqlType.string,
    requiredDuringInsert: true,
  );
  static const VerificationMeta _conceptoMeta = const VerificationMeta(
    'concepto',
  );
  @override
  late final GeneratedColumn<String> concepto = GeneratedColumn<String>(
    'concepto',
    aliasedName,
    false,
    type: DriftSqlType.string,
    requiredDuringInsert: true,
  );
  static const VerificationMeta _referenciaMeta = const VerificationMeta(
    'referencia',
  );
  @override
  late final GeneratedColumn<String> referencia = GeneratedColumn<String>(
    'referencia',
    aliasedName,
    true,
    type: DriftSqlType.string,
    requiredDuringInsert: false,
  );
  @override
  List<GeneratedColumn> get $columns => [
    id,
    cotizacionId,
    fecha,
    monto,
    metodo,
    concepto,
    referencia,
  ];
  @override
  String get aliasedName => _alias ?? actualTableName;
  @override
  String get actualTableName => $name;
  static const String $name = 'pagos';
  @override
  VerificationContext validateIntegrity(
    Insertable<Pago> instance, {
    bool isInserting = false,
  }) {
    final context = VerificationContext();
    final data = instance.toColumns(true);
    if (data.containsKey('id')) {
      context.handle(_idMeta, id.isAcceptableOrUnknown(data['id']!, _idMeta));
    } else if (isInserting) {
      context.missing(_idMeta);
    }
    if (data.containsKey('cotizacion_id')) {
      context.handle(
        _cotizacionIdMeta,
        cotizacionId.isAcceptableOrUnknown(
          data['cotizacion_id']!,
          _cotizacionIdMeta,
        ),
      );
    } else if (isInserting) {
      context.missing(_cotizacionIdMeta);
    }
    if (data.containsKey('fecha')) {
      context.handle(
        _fechaMeta,
        fecha.isAcceptableOrUnknown(data['fecha']!, _fechaMeta),
      );
    } else if (isInserting) {
      context.missing(_fechaMeta);
    }
    if (data.containsKey('monto')) {
      context.handle(
        _montoMeta,
        monto.isAcceptableOrUnknown(data['monto']!, _montoMeta),
      );
    } else if (isInserting) {
      context.missing(_montoMeta);
    }
    if (data.containsKey('metodo')) {
      context.handle(
        _metodoMeta,
        metodo.isAcceptableOrUnknown(data['metodo']!, _metodoMeta),
      );
    } else if (isInserting) {
      context.missing(_metodoMeta);
    }
    if (data.containsKey('concepto')) {
      context.handle(
        _conceptoMeta,
        concepto.isAcceptableOrUnknown(data['concepto']!, _conceptoMeta),
      );
    } else if (isInserting) {
      context.missing(_conceptoMeta);
    }
    if (data.containsKey('referencia')) {
      context.handle(
        _referenciaMeta,
        referencia.isAcceptableOrUnknown(data['referencia']!, _referenciaMeta),
      );
    }
    return context;
  }

  @override
  Set<GeneratedColumn> get $primaryKey => {id};
  @override
  Pago map(Map<String, dynamic> data, {String? tablePrefix}) {
    final effectivePrefix = tablePrefix != null ? '$tablePrefix.' : '';
    return Pago(
      id: attachedDatabase.typeMapping.read(
        DriftSqlType.string,
        data['${effectivePrefix}id'],
      )!,
      cotizacionId: attachedDatabase.typeMapping.read(
        DriftSqlType.string,
        data['${effectivePrefix}cotizacion_id'],
      )!,
      fecha: attachedDatabase.typeMapping.read(
        DriftSqlType.int,
        data['${effectivePrefix}fecha'],
      )!,
      monto: attachedDatabase.typeMapping.read(
        DriftSqlType.double,
        data['${effectivePrefix}monto'],
      )!,
      metodo: attachedDatabase.typeMapping.read(
        DriftSqlType.string,
        data['${effectivePrefix}metodo'],
      )!,
      concepto: attachedDatabase.typeMapping.read(
        DriftSqlType.string,
        data['${effectivePrefix}concepto'],
      )!,
      referencia: attachedDatabase.typeMapping.read(
        DriftSqlType.string,
        data['${effectivePrefix}referencia'],
      ),
    );
  }

  @override
  $PagosTable createAlias(String alias) {
    return $PagosTable(attachedDatabase, alias);
  }
}

class Pago extends DataClass implements Insertable<Pago> {
  final String id;
  final String cotizacionId;
  final int fecha;
  final double monto;
  final String metodo;
  final String concepto;
  final String? referencia;
  const Pago({
    required this.id,
    required this.cotizacionId,
    required this.fecha,
    required this.monto,
    required this.metodo,
    required this.concepto,
    this.referencia,
  });
  @override
  Map<String, Expression> toColumns(bool nullToAbsent) {
    final map = <String, Expression>{};
    map['id'] = Variable<String>(id);
    map['cotizacion_id'] = Variable<String>(cotizacionId);
    map['fecha'] = Variable<int>(fecha);
    map['monto'] = Variable<double>(monto);
    map['metodo'] = Variable<String>(metodo);
    map['concepto'] = Variable<String>(concepto);
    if (!nullToAbsent || referencia != null) {
      map['referencia'] = Variable<String>(referencia);
    }
    return map;
  }

  PagosCompanion toCompanion(bool nullToAbsent) {
    return PagosCompanion(
      id: Value(id),
      cotizacionId: Value(cotizacionId),
      fecha: Value(fecha),
      monto: Value(monto),
      metodo: Value(metodo),
      concepto: Value(concepto),
      referencia: referencia == null && nullToAbsent
          ? const Value.absent()
          : Value(referencia),
    );
  }

  factory Pago.fromJson(
    Map<String, dynamic> json, {
    ValueSerializer? serializer,
  }) {
    serializer ??= driftRuntimeOptions.defaultSerializer;
    return Pago(
      id: serializer.fromJson<String>(json['id']),
      cotizacionId: serializer.fromJson<String>(json['cotizacionId']),
      fecha: serializer.fromJson<int>(json['fecha']),
      monto: serializer.fromJson<double>(json['monto']),
      metodo: serializer.fromJson<String>(json['metodo']),
      concepto: serializer.fromJson<String>(json['concepto']),
      referencia: serializer.fromJson<String?>(json['referencia']),
    );
  }
  @override
  Map<String, dynamic> toJson({ValueSerializer? serializer}) {
    serializer ??= driftRuntimeOptions.defaultSerializer;
    return <String, dynamic>{
      'id': serializer.toJson<String>(id),
      'cotizacionId': serializer.toJson<String>(cotizacionId),
      'fecha': serializer.toJson<int>(fecha),
      'monto': serializer.toJson<double>(monto),
      'metodo': serializer.toJson<String>(metodo),
      'concepto': serializer.toJson<String>(concepto),
      'referencia': serializer.toJson<String?>(referencia),
    };
  }

  Pago copyWith({
    String? id,
    String? cotizacionId,
    int? fecha,
    double? monto,
    String? metodo,
    String? concepto,
    Value<String?> referencia = const Value.absent(),
  }) => Pago(
    id: id ?? this.id,
    cotizacionId: cotizacionId ?? this.cotizacionId,
    fecha: fecha ?? this.fecha,
    monto: monto ?? this.monto,
    metodo: metodo ?? this.metodo,
    concepto: concepto ?? this.concepto,
    referencia: referencia.present ? referencia.value : this.referencia,
  );
  Pago copyWithCompanion(PagosCompanion data) {
    return Pago(
      id: data.id.present ? data.id.value : this.id,
      cotizacionId: data.cotizacionId.present
          ? data.cotizacionId.value
          : this.cotizacionId,
      fecha: data.fecha.present ? data.fecha.value : this.fecha,
      monto: data.monto.present ? data.monto.value : this.monto,
      metodo: data.metodo.present ? data.metodo.value : this.metodo,
      concepto: data.concepto.present ? data.concepto.value : this.concepto,
      referencia: data.referencia.present
          ? data.referencia.value
          : this.referencia,
    );
  }

  @override
  String toString() {
    return (StringBuffer('Pago(')
          ..write('id: $id, ')
          ..write('cotizacionId: $cotizacionId, ')
          ..write('fecha: $fecha, ')
          ..write('monto: $monto, ')
          ..write('metodo: $metodo, ')
          ..write('concepto: $concepto, ')
          ..write('referencia: $referencia')
          ..write(')'))
        .toString();
  }

  @override
  int get hashCode =>
      Object.hash(id, cotizacionId, fecha, monto, metodo, concepto, referencia);
  @override
  bool operator ==(Object other) =>
      identical(this, other) ||
      (other is Pago &&
          other.id == this.id &&
          other.cotizacionId == this.cotizacionId &&
          other.fecha == this.fecha &&
          other.monto == this.monto &&
          other.metodo == this.metodo &&
          other.concepto == this.concepto &&
          other.referencia == this.referencia);
}

class PagosCompanion extends UpdateCompanion<Pago> {
  final Value<String> id;
  final Value<String> cotizacionId;
  final Value<int> fecha;
  final Value<double> monto;
  final Value<String> metodo;
  final Value<String> concepto;
  final Value<String?> referencia;
  final Value<int> rowid;
  const PagosCompanion({
    this.id = const Value.absent(),
    this.cotizacionId = const Value.absent(),
    this.fecha = const Value.absent(),
    this.monto = const Value.absent(),
    this.metodo = const Value.absent(),
    this.concepto = const Value.absent(),
    this.referencia = const Value.absent(),
    this.rowid = const Value.absent(),
  });
  PagosCompanion.insert({
    required String id,
    required String cotizacionId,
    required int fecha,
    required double monto,
    required String metodo,
    required String concepto,
    this.referencia = const Value.absent(),
    this.rowid = const Value.absent(),
  }) : id = Value(id),
       cotizacionId = Value(cotizacionId),
       fecha = Value(fecha),
       monto = Value(monto),
       metodo = Value(metodo),
       concepto = Value(concepto);
  static Insertable<Pago> custom({
    Expression<String>? id,
    Expression<String>? cotizacionId,
    Expression<int>? fecha,
    Expression<double>? monto,
    Expression<String>? metodo,
    Expression<String>? concepto,
    Expression<String>? referencia,
    Expression<int>? rowid,
  }) {
    return RawValuesInsertable({
      if (id != null) 'id': id,
      if (cotizacionId != null) 'cotizacion_id': cotizacionId,
      if (fecha != null) 'fecha': fecha,
      if (monto != null) 'monto': monto,
      if (metodo != null) 'metodo': metodo,
      if (concepto != null) 'concepto': concepto,
      if (referencia != null) 'referencia': referencia,
      if (rowid != null) 'rowid': rowid,
    });
  }

  PagosCompanion copyWith({
    Value<String>? id,
    Value<String>? cotizacionId,
    Value<int>? fecha,
    Value<double>? monto,
    Value<String>? metodo,
    Value<String>? concepto,
    Value<String?>? referencia,
    Value<int>? rowid,
  }) {
    return PagosCompanion(
      id: id ?? this.id,
      cotizacionId: cotizacionId ?? this.cotizacionId,
      fecha: fecha ?? this.fecha,
      monto: monto ?? this.monto,
      metodo: metodo ?? this.metodo,
      concepto: concepto ?? this.concepto,
      referencia: referencia ?? this.referencia,
      rowid: rowid ?? this.rowid,
    );
  }

  @override
  Map<String, Expression> toColumns(bool nullToAbsent) {
    final map = <String, Expression>{};
    if (id.present) {
      map['id'] = Variable<String>(id.value);
    }
    if (cotizacionId.present) {
      map['cotizacion_id'] = Variable<String>(cotizacionId.value);
    }
    if (fecha.present) {
      map['fecha'] = Variable<int>(fecha.value);
    }
    if (monto.present) {
      map['monto'] = Variable<double>(monto.value);
    }
    if (metodo.present) {
      map['metodo'] = Variable<String>(metodo.value);
    }
    if (concepto.present) {
      map['concepto'] = Variable<String>(concepto.value);
    }
    if (referencia.present) {
      map['referencia'] = Variable<String>(referencia.value);
    }
    if (rowid.present) {
      map['rowid'] = Variable<int>(rowid.value);
    }
    return map;
  }

  @override
  String toString() {
    return (StringBuffer('PagosCompanion(')
          ..write('id: $id, ')
          ..write('cotizacionId: $cotizacionId, ')
          ..write('fecha: $fecha, ')
          ..write('monto: $monto, ')
          ..write('metodo: $metodo, ')
          ..write('concepto: $concepto, ')
          ..write('referencia: $referencia, ')
          ..write('rowid: $rowid')
          ..write(')'))
        .toString();
  }
}

class $MovimientosTable extends Movimientos
    with TableInfo<$MovimientosTable, Movimiento> {
  @override
  final GeneratedDatabase attachedDatabase;
  final String? _alias;
  $MovimientosTable(this.attachedDatabase, [this._alias]);
  static const VerificationMeta _idMeta = const VerificationMeta('id');
  @override
  late final GeneratedColumn<String> id = GeneratedColumn<String>(
    'id',
    aliasedName,
    false,
    type: DriftSqlType.string,
    requiredDuringInsert: true,
  );
  static const VerificationMeta _obraIdMeta = const VerificationMeta('obraId');
  @override
  late final GeneratedColumn<String> obraId = GeneratedColumn<String>(
    'obra_id',
    aliasedName,
    false,
    type: DriftSqlType.string,
    requiredDuringInsert: true,
  );
  static const VerificationMeta _fechaMeta = const VerificationMeta('fecha');
  @override
  late final GeneratedColumn<int> fecha = GeneratedColumn<int>(
    'fecha',
    aliasedName,
    false,
    type: DriftSqlType.int,
    requiredDuringInsert: true,
  );
  static const VerificationMeta _tipoMeta = const VerificationMeta('tipo');
  @override
  late final GeneratedColumn<String> tipo = GeneratedColumn<String>(
    'tipo',
    aliasedName,
    false,
    type: DriftSqlType.string,
    requiredDuringInsert: true,
  );
  static const VerificationMeta _categoriaMeta = const VerificationMeta(
    'categoria',
  );
  @override
  late final GeneratedColumn<String> categoria = GeneratedColumn<String>(
    'categoria',
    aliasedName,
    false,
    type: DriftSqlType.string,
    requiredDuringInsert: true,
  );
  static const VerificationMeta _conceptoMeta = const VerificationMeta(
    'concepto',
  );
  @override
  late final GeneratedColumn<String> concepto = GeneratedColumn<String>(
    'concepto',
    aliasedName,
    false,
    type: DriftSqlType.string,
    requiredDuringInsert: true,
  );
  static const VerificationMeta _montoMeta = const VerificationMeta('monto');
  @override
  late final GeneratedColumn<double> monto = GeneratedColumn<double>(
    'monto',
    aliasedName,
    false,
    type: DriftSqlType.double,
    requiredDuringInsert: true,
  );
  static const VerificationMeta _metodoPagoMeta = const VerificationMeta(
    'metodoPago',
  );
  @override
  late final GeneratedColumn<String> metodoPago = GeneratedColumn<String>(
    'metodo_pago',
    aliasedName,
    false,
    type: DriftSqlType.string,
    requiredDuringInsert: true,
  );
  static const VerificationMeta _referenciaMeta = const VerificationMeta(
    'referencia',
  );
  @override
  late final GeneratedColumn<String> referencia = GeneratedColumn<String>(
    'referencia',
    aliasedName,
    false,
    type: DriftSqlType.string,
    requiredDuringInsert: false,
    defaultValue: const Constant(''),
  );
  static const VerificationMeta _nominaIdMeta = const VerificationMeta(
    'nominaId',
  );
  @override
  late final GeneratedColumn<String> nominaId = GeneratedColumn<String>(
    'nomina_id',
    aliasedName,
    true,
    type: DriftSqlType.string,
    requiredDuringInsert: false,
  );
  static const VerificationMeta _cotizacionIdMeta = const VerificationMeta(
    'cotizacionId',
  );
  @override
  late final GeneratedColumn<String> cotizacionId = GeneratedColumn<String>(
    'cotizacion_id',
    aliasedName,
    true,
    type: DriftSqlType.string,
    requiredDuringInsert: false,
  );
  static const VerificationMeta _seccionIdMeta = const VerificationMeta(
    'seccionId',
  );
  @override
  late final GeneratedColumn<String> seccionId = GeneratedColumn<String>(
    'seccion_id',
    aliasedName,
    true,
    type: DriftSqlType.string,
    requiredDuringInsert: false,
  );
  static const VerificationMeta _partidaIdMeta = const VerificationMeta(
    'partidaId',
  );
  @override
  late final GeneratedColumn<String> partidaId = GeneratedColumn<String>(
    'partida_id',
    aliasedName,
    true,
    type: DriftSqlType.string,
    requiredDuringInsert: false,
  );
  @override
  List<GeneratedColumn> get $columns => [
    id,
    obraId,
    fecha,
    tipo,
    categoria,
    concepto,
    monto,
    metodoPago,
    referencia,
    nominaId,
    cotizacionId,
    seccionId,
    partidaId,
  ];
  @override
  String get aliasedName => _alias ?? actualTableName;
  @override
  String get actualTableName => $name;
  static const String $name = 'movimientos';
  @override
  VerificationContext validateIntegrity(
    Insertable<Movimiento> instance, {
    bool isInserting = false,
  }) {
    final context = VerificationContext();
    final data = instance.toColumns(true);
    if (data.containsKey('id')) {
      context.handle(_idMeta, id.isAcceptableOrUnknown(data['id']!, _idMeta));
    } else if (isInserting) {
      context.missing(_idMeta);
    }
    if (data.containsKey('obra_id')) {
      context.handle(
        _obraIdMeta,
        obraId.isAcceptableOrUnknown(data['obra_id']!, _obraIdMeta),
      );
    } else if (isInserting) {
      context.missing(_obraIdMeta);
    }
    if (data.containsKey('fecha')) {
      context.handle(
        _fechaMeta,
        fecha.isAcceptableOrUnknown(data['fecha']!, _fechaMeta),
      );
    } else if (isInserting) {
      context.missing(_fechaMeta);
    }
    if (data.containsKey('tipo')) {
      context.handle(
        _tipoMeta,
        tipo.isAcceptableOrUnknown(data['tipo']!, _tipoMeta),
      );
    } else if (isInserting) {
      context.missing(_tipoMeta);
    }
    if (data.containsKey('categoria')) {
      context.handle(
        _categoriaMeta,
        categoria.isAcceptableOrUnknown(data['categoria']!, _categoriaMeta),
      );
    } else if (isInserting) {
      context.missing(_categoriaMeta);
    }
    if (data.containsKey('concepto')) {
      context.handle(
        _conceptoMeta,
        concepto.isAcceptableOrUnknown(data['concepto']!, _conceptoMeta),
      );
    } else if (isInserting) {
      context.missing(_conceptoMeta);
    }
    if (data.containsKey('monto')) {
      context.handle(
        _montoMeta,
        monto.isAcceptableOrUnknown(data['monto']!, _montoMeta),
      );
    } else if (isInserting) {
      context.missing(_montoMeta);
    }
    if (data.containsKey('metodo_pago')) {
      context.handle(
        _metodoPagoMeta,
        metodoPago.isAcceptableOrUnknown(data['metodo_pago']!, _metodoPagoMeta),
      );
    } else if (isInserting) {
      context.missing(_metodoPagoMeta);
    }
    if (data.containsKey('referencia')) {
      context.handle(
        _referenciaMeta,
        referencia.isAcceptableOrUnknown(data['referencia']!, _referenciaMeta),
      );
    }
    if (data.containsKey('nomina_id')) {
      context.handle(
        _nominaIdMeta,
        nominaId.isAcceptableOrUnknown(data['nomina_id']!, _nominaIdMeta),
      );
    }
    if (data.containsKey('cotizacion_id')) {
      context.handle(
        _cotizacionIdMeta,
        cotizacionId.isAcceptableOrUnknown(
          data['cotizacion_id']!,
          _cotizacionIdMeta,
        ),
      );
    }
    if (data.containsKey('seccion_id')) {
      context.handle(
        _seccionIdMeta,
        seccionId.isAcceptableOrUnknown(data['seccion_id']!, _seccionIdMeta),
      );
    }
    if (data.containsKey('partida_id')) {
      context.handle(
        _partidaIdMeta,
        partidaId.isAcceptableOrUnknown(data['partida_id']!, _partidaIdMeta),
      );
    }
    return context;
  }

  @override
  Set<GeneratedColumn> get $primaryKey => {id};
  @override
  Movimiento map(Map<String, dynamic> data, {String? tablePrefix}) {
    final effectivePrefix = tablePrefix != null ? '$tablePrefix.' : '';
    return Movimiento(
      id: attachedDatabase.typeMapping.read(
        DriftSqlType.string,
        data['${effectivePrefix}id'],
      )!,
      obraId: attachedDatabase.typeMapping.read(
        DriftSqlType.string,
        data['${effectivePrefix}obra_id'],
      )!,
      fecha: attachedDatabase.typeMapping.read(
        DriftSqlType.int,
        data['${effectivePrefix}fecha'],
      )!,
      tipo: attachedDatabase.typeMapping.read(
        DriftSqlType.string,
        data['${effectivePrefix}tipo'],
      )!,
      categoria: attachedDatabase.typeMapping.read(
        DriftSqlType.string,
        data['${effectivePrefix}categoria'],
      )!,
      concepto: attachedDatabase.typeMapping.read(
        DriftSqlType.string,
        data['${effectivePrefix}concepto'],
      )!,
      monto: attachedDatabase.typeMapping.read(
        DriftSqlType.double,
        data['${effectivePrefix}monto'],
      )!,
      metodoPago: attachedDatabase.typeMapping.read(
        DriftSqlType.string,
        data['${effectivePrefix}metodo_pago'],
      )!,
      referencia: attachedDatabase.typeMapping.read(
        DriftSqlType.string,
        data['${effectivePrefix}referencia'],
      )!,
      nominaId: attachedDatabase.typeMapping.read(
        DriftSqlType.string,
        data['${effectivePrefix}nomina_id'],
      ),
      cotizacionId: attachedDatabase.typeMapping.read(
        DriftSqlType.string,
        data['${effectivePrefix}cotizacion_id'],
      ),
      seccionId: attachedDatabase.typeMapping.read(
        DriftSqlType.string,
        data['${effectivePrefix}seccion_id'],
      ),
      partidaId: attachedDatabase.typeMapping.read(
        DriftSqlType.string,
        data['${effectivePrefix}partida_id'],
      ),
    );
  }

  @override
  $MovimientosTable createAlias(String alias) {
    return $MovimientosTable(attachedDatabase, alias);
  }
}

class Movimiento extends DataClass implements Insertable<Movimiento> {
  final String id;
  final String obraId;
  final int fecha;
  final String tipo;
  final String categoria;
  final String concepto;
  final double monto;
  final String metodoPago;
  final String referencia;
  final String? nominaId;
  final String? cotizacionId;
  final String? seccionId;
  final String? partidaId;
  const Movimiento({
    required this.id,
    required this.obraId,
    required this.fecha,
    required this.tipo,
    required this.categoria,
    required this.concepto,
    required this.monto,
    required this.metodoPago,
    required this.referencia,
    this.nominaId,
    this.cotizacionId,
    this.seccionId,
    this.partidaId,
  });
  @override
  Map<String, Expression> toColumns(bool nullToAbsent) {
    final map = <String, Expression>{};
    map['id'] = Variable<String>(id);
    map['obra_id'] = Variable<String>(obraId);
    map['fecha'] = Variable<int>(fecha);
    map['tipo'] = Variable<String>(tipo);
    map['categoria'] = Variable<String>(categoria);
    map['concepto'] = Variable<String>(concepto);
    map['monto'] = Variable<double>(monto);
    map['metodo_pago'] = Variable<String>(metodoPago);
    map['referencia'] = Variable<String>(referencia);
    if (!nullToAbsent || nominaId != null) {
      map['nomina_id'] = Variable<String>(nominaId);
    }
    if (!nullToAbsent || cotizacionId != null) {
      map['cotizacion_id'] = Variable<String>(cotizacionId);
    }
    if (!nullToAbsent || seccionId != null) {
      map['seccion_id'] = Variable<String>(seccionId);
    }
    if (!nullToAbsent || partidaId != null) {
      map['partida_id'] = Variable<String>(partidaId);
    }
    return map;
  }

  MovimientosCompanion toCompanion(bool nullToAbsent) {
    return MovimientosCompanion(
      id: Value(id),
      obraId: Value(obraId),
      fecha: Value(fecha),
      tipo: Value(tipo),
      categoria: Value(categoria),
      concepto: Value(concepto),
      monto: Value(monto),
      metodoPago: Value(metodoPago),
      referencia: Value(referencia),
      nominaId: nominaId == null && nullToAbsent
          ? const Value.absent()
          : Value(nominaId),
      cotizacionId: cotizacionId == null && nullToAbsent
          ? const Value.absent()
          : Value(cotizacionId),
      seccionId: seccionId == null && nullToAbsent
          ? const Value.absent()
          : Value(seccionId),
      partidaId: partidaId == null && nullToAbsent
          ? const Value.absent()
          : Value(partidaId),
    );
  }

  factory Movimiento.fromJson(
    Map<String, dynamic> json, {
    ValueSerializer? serializer,
  }) {
    serializer ??= driftRuntimeOptions.defaultSerializer;
    return Movimiento(
      id: serializer.fromJson<String>(json['id']),
      obraId: serializer.fromJson<String>(json['obraId']),
      fecha: serializer.fromJson<int>(json['fecha']),
      tipo: serializer.fromJson<String>(json['tipo']),
      categoria: serializer.fromJson<String>(json['categoria']),
      concepto: serializer.fromJson<String>(json['concepto']),
      monto: serializer.fromJson<double>(json['monto']),
      metodoPago: serializer.fromJson<String>(json['metodoPago']),
      referencia: serializer.fromJson<String>(json['referencia']),
      nominaId: serializer.fromJson<String?>(json['nominaId']),
      cotizacionId: serializer.fromJson<String?>(json['cotizacionId']),
      seccionId: serializer.fromJson<String?>(json['seccionId']),
      partidaId: serializer.fromJson<String?>(json['partidaId']),
    );
  }
  @override
  Map<String, dynamic> toJson({ValueSerializer? serializer}) {
    serializer ??= driftRuntimeOptions.defaultSerializer;
    return <String, dynamic>{
      'id': serializer.toJson<String>(id),
      'obraId': serializer.toJson<String>(obraId),
      'fecha': serializer.toJson<int>(fecha),
      'tipo': serializer.toJson<String>(tipo),
      'categoria': serializer.toJson<String>(categoria),
      'concepto': serializer.toJson<String>(concepto),
      'monto': serializer.toJson<double>(monto),
      'metodoPago': serializer.toJson<String>(metodoPago),
      'referencia': serializer.toJson<String>(referencia),
      'nominaId': serializer.toJson<String?>(nominaId),
      'cotizacionId': serializer.toJson<String?>(cotizacionId),
      'seccionId': serializer.toJson<String?>(seccionId),
      'partidaId': serializer.toJson<String?>(partidaId),
    };
  }

  Movimiento copyWith({
    String? id,
    String? obraId,
    int? fecha,
    String? tipo,
    String? categoria,
    String? concepto,
    double? monto,
    String? metodoPago,
    String? referencia,
    Value<String?> nominaId = const Value.absent(),
    Value<String?> cotizacionId = const Value.absent(),
    Value<String?> seccionId = const Value.absent(),
    Value<String?> partidaId = const Value.absent(),
  }) => Movimiento(
    id: id ?? this.id,
    obraId: obraId ?? this.obraId,
    fecha: fecha ?? this.fecha,
    tipo: tipo ?? this.tipo,
    categoria: categoria ?? this.categoria,
    concepto: concepto ?? this.concepto,
    monto: monto ?? this.monto,
    metodoPago: metodoPago ?? this.metodoPago,
    referencia: referencia ?? this.referencia,
    nominaId: nominaId.present ? nominaId.value : this.nominaId,
    cotizacionId: cotizacionId.present ? cotizacionId.value : this.cotizacionId,
    seccionId: seccionId.present ? seccionId.value : this.seccionId,
    partidaId: partidaId.present ? partidaId.value : this.partidaId,
  );
  Movimiento copyWithCompanion(MovimientosCompanion data) {
    return Movimiento(
      id: data.id.present ? data.id.value : this.id,
      obraId: data.obraId.present ? data.obraId.value : this.obraId,
      fecha: data.fecha.present ? data.fecha.value : this.fecha,
      tipo: data.tipo.present ? data.tipo.value : this.tipo,
      categoria: data.categoria.present ? data.categoria.value : this.categoria,
      concepto: data.concepto.present ? data.concepto.value : this.concepto,
      monto: data.monto.present ? data.monto.value : this.monto,
      metodoPago: data.metodoPago.present
          ? data.metodoPago.value
          : this.metodoPago,
      referencia: data.referencia.present
          ? data.referencia.value
          : this.referencia,
      nominaId: data.nominaId.present ? data.nominaId.value : this.nominaId,
      cotizacionId: data.cotizacionId.present
          ? data.cotizacionId.value
          : this.cotizacionId,
      seccionId: data.seccionId.present ? data.seccionId.value : this.seccionId,
      partidaId: data.partidaId.present ? data.partidaId.value : this.partidaId,
    );
  }

  @override
  String toString() {
    return (StringBuffer('Movimiento(')
          ..write('id: $id, ')
          ..write('obraId: $obraId, ')
          ..write('fecha: $fecha, ')
          ..write('tipo: $tipo, ')
          ..write('categoria: $categoria, ')
          ..write('concepto: $concepto, ')
          ..write('monto: $monto, ')
          ..write('metodoPago: $metodoPago, ')
          ..write('referencia: $referencia, ')
          ..write('nominaId: $nominaId, ')
          ..write('cotizacionId: $cotizacionId, ')
          ..write('seccionId: $seccionId, ')
          ..write('partidaId: $partidaId')
          ..write(')'))
        .toString();
  }

  @override
  int get hashCode => Object.hash(
    id,
    obraId,
    fecha,
    tipo,
    categoria,
    concepto,
    monto,
    metodoPago,
    referencia,
    nominaId,
    cotizacionId,
    seccionId,
    partidaId,
  );
  @override
  bool operator ==(Object other) =>
      identical(this, other) ||
      (other is Movimiento &&
          other.id == this.id &&
          other.obraId == this.obraId &&
          other.fecha == this.fecha &&
          other.tipo == this.tipo &&
          other.categoria == this.categoria &&
          other.concepto == this.concepto &&
          other.monto == this.monto &&
          other.metodoPago == this.metodoPago &&
          other.referencia == this.referencia &&
          other.nominaId == this.nominaId &&
          other.cotizacionId == this.cotizacionId &&
          other.seccionId == this.seccionId &&
          other.partidaId == this.partidaId);
}

class MovimientosCompanion extends UpdateCompanion<Movimiento> {
  final Value<String> id;
  final Value<String> obraId;
  final Value<int> fecha;
  final Value<String> tipo;
  final Value<String> categoria;
  final Value<String> concepto;
  final Value<double> monto;
  final Value<String> metodoPago;
  final Value<String> referencia;
  final Value<String?> nominaId;
  final Value<String?> cotizacionId;
  final Value<String?> seccionId;
  final Value<String?> partidaId;
  final Value<int> rowid;
  const MovimientosCompanion({
    this.id = const Value.absent(),
    this.obraId = const Value.absent(),
    this.fecha = const Value.absent(),
    this.tipo = const Value.absent(),
    this.categoria = const Value.absent(),
    this.concepto = const Value.absent(),
    this.monto = const Value.absent(),
    this.metodoPago = const Value.absent(),
    this.referencia = const Value.absent(),
    this.nominaId = const Value.absent(),
    this.cotizacionId = const Value.absent(),
    this.seccionId = const Value.absent(),
    this.partidaId = const Value.absent(),
    this.rowid = const Value.absent(),
  });
  MovimientosCompanion.insert({
    required String id,
    required String obraId,
    required int fecha,
    required String tipo,
    required String categoria,
    required String concepto,
    required double monto,
    required String metodoPago,
    this.referencia = const Value.absent(),
    this.nominaId = const Value.absent(),
    this.cotizacionId = const Value.absent(),
    this.seccionId = const Value.absent(),
    this.partidaId = const Value.absent(),
    this.rowid = const Value.absent(),
  }) : id = Value(id),
       obraId = Value(obraId),
       fecha = Value(fecha),
       tipo = Value(tipo),
       categoria = Value(categoria),
       concepto = Value(concepto),
       monto = Value(monto),
       metodoPago = Value(metodoPago);
  static Insertable<Movimiento> custom({
    Expression<String>? id,
    Expression<String>? obraId,
    Expression<int>? fecha,
    Expression<String>? tipo,
    Expression<String>? categoria,
    Expression<String>? concepto,
    Expression<double>? monto,
    Expression<String>? metodoPago,
    Expression<String>? referencia,
    Expression<String>? nominaId,
    Expression<String>? cotizacionId,
    Expression<String>? seccionId,
    Expression<String>? partidaId,
    Expression<int>? rowid,
  }) {
    return RawValuesInsertable({
      if (id != null) 'id': id,
      if (obraId != null) 'obra_id': obraId,
      if (fecha != null) 'fecha': fecha,
      if (tipo != null) 'tipo': tipo,
      if (categoria != null) 'categoria': categoria,
      if (concepto != null) 'concepto': concepto,
      if (monto != null) 'monto': monto,
      if (metodoPago != null) 'metodo_pago': metodoPago,
      if (referencia != null) 'referencia': referencia,
      if (nominaId != null) 'nomina_id': nominaId,
      if (cotizacionId != null) 'cotizacion_id': cotizacionId,
      if (seccionId != null) 'seccion_id': seccionId,
      if (partidaId != null) 'partida_id': partidaId,
      if (rowid != null) 'rowid': rowid,
    });
  }

  MovimientosCompanion copyWith({
    Value<String>? id,
    Value<String>? obraId,
    Value<int>? fecha,
    Value<String>? tipo,
    Value<String>? categoria,
    Value<String>? concepto,
    Value<double>? monto,
    Value<String>? metodoPago,
    Value<String>? referencia,
    Value<String?>? nominaId,
    Value<String?>? cotizacionId,
    Value<String?>? seccionId,
    Value<String?>? partidaId,
    Value<int>? rowid,
  }) {
    return MovimientosCompanion(
      id: id ?? this.id,
      obraId: obraId ?? this.obraId,
      fecha: fecha ?? this.fecha,
      tipo: tipo ?? this.tipo,
      categoria: categoria ?? this.categoria,
      concepto: concepto ?? this.concepto,
      monto: monto ?? this.monto,
      metodoPago: metodoPago ?? this.metodoPago,
      referencia: referencia ?? this.referencia,
      nominaId: nominaId ?? this.nominaId,
      cotizacionId: cotizacionId ?? this.cotizacionId,
      seccionId: seccionId ?? this.seccionId,
      partidaId: partidaId ?? this.partidaId,
      rowid: rowid ?? this.rowid,
    );
  }

  @override
  Map<String, Expression> toColumns(bool nullToAbsent) {
    final map = <String, Expression>{};
    if (id.present) {
      map['id'] = Variable<String>(id.value);
    }
    if (obraId.present) {
      map['obra_id'] = Variable<String>(obraId.value);
    }
    if (fecha.present) {
      map['fecha'] = Variable<int>(fecha.value);
    }
    if (tipo.present) {
      map['tipo'] = Variable<String>(tipo.value);
    }
    if (categoria.present) {
      map['categoria'] = Variable<String>(categoria.value);
    }
    if (concepto.present) {
      map['concepto'] = Variable<String>(concepto.value);
    }
    if (monto.present) {
      map['monto'] = Variable<double>(monto.value);
    }
    if (metodoPago.present) {
      map['metodo_pago'] = Variable<String>(metodoPago.value);
    }
    if (referencia.present) {
      map['referencia'] = Variable<String>(referencia.value);
    }
    if (nominaId.present) {
      map['nomina_id'] = Variable<String>(nominaId.value);
    }
    if (cotizacionId.present) {
      map['cotizacion_id'] = Variable<String>(cotizacionId.value);
    }
    if (seccionId.present) {
      map['seccion_id'] = Variable<String>(seccionId.value);
    }
    if (partidaId.present) {
      map['partida_id'] = Variable<String>(partidaId.value);
    }
    if (rowid.present) {
      map['rowid'] = Variable<int>(rowid.value);
    }
    return map;
  }

  @override
  String toString() {
    return (StringBuffer('MovimientosCompanion(')
          ..write('id: $id, ')
          ..write('obraId: $obraId, ')
          ..write('fecha: $fecha, ')
          ..write('tipo: $tipo, ')
          ..write('categoria: $categoria, ')
          ..write('concepto: $concepto, ')
          ..write('monto: $monto, ')
          ..write('metodoPago: $metodoPago, ')
          ..write('referencia: $referencia, ')
          ..write('nominaId: $nominaId, ')
          ..write('cotizacionId: $cotizacionId, ')
          ..write('seccionId: $seccionId, ')
          ..write('partidaId: $partidaId, ')
          ..write('rowid: $rowid')
          ..write(')'))
        .toString();
  }
}

class $CatalogoConceptosTable extends CatalogoConceptos
    with TableInfo<$CatalogoConceptosTable, CatalogoConcepto> {
  @override
  final GeneratedDatabase attachedDatabase;
  final String? _alias;
  $CatalogoConceptosTable(this.attachedDatabase, [this._alias]);
  static const VerificationMeta _idMeta = const VerificationMeta('id');
  @override
  late final GeneratedColumn<String> id = GeneratedColumn<String>(
    'id',
    aliasedName,
    false,
    type: DriftSqlType.string,
    requiredDuringInsert: true,
  );
  static const VerificationMeta _claveMeta = const VerificationMeta('clave');
  @override
  late final GeneratedColumn<String> clave = GeneratedColumn<String>(
    'clave',
    aliasedName,
    false,
    type: DriftSqlType.string,
    requiredDuringInsert: true,
  );
  static const VerificationMeta _descripcionMeta = const VerificationMeta(
    'descripcion',
  );
  @override
  late final GeneratedColumn<String> descripcion = GeneratedColumn<String>(
    'descripcion',
    aliasedName,
    false,
    type: DriftSqlType.string,
    requiredDuringInsert: true,
  );
  static const VerificationMeta _unidadMeta = const VerificationMeta('unidad');
  @override
  late final GeneratedColumn<String> unidad = GeneratedColumn<String>(
    'unidad',
    aliasedName,
    false,
    type: DriftSqlType.string,
    requiredDuringInsert: true,
  );
  static const VerificationMeta _precioUnitarioDefaultMeta =
      const VerificationMeta('precioUnitarioDefault');
  @override
  late final GeneratedColumn<double> precioUnitarioDefault =
      GeneratedColumn<double>(
        'precio_unitario_default',
        aliasedName,
        false,
        type: DriftSqlType.double,
        requiredDuringInsert: false,
        defaultValue: const Constant(0.0),
      );
  static const VerificationMeta _categoriaMeta = const VerificationMeta(
    'categoria',
  );
  @override
  late final GeneratedColumn<String> categoria = GeneratedColumn<String>(
    'categoria',
    aliasedName,
    false,
    type: DriftSqlType.string,
    requiredDuringInsert: true,
  );
  static const VerificationMeta _esPersonalizadoMeta = const VerificationMeta(
    'esPersonalizado',
  );
  @override
  late final GeneratedColumn<bool> esPersonalizado = GeneratedColumn<bool>(
    'es_personalizado',
    aliasedName,
    false,
    type: DriftSqlType.bool,
    requiredDuringInsert: false,
    defaultConstraints: GeneratedColumn.constraintIsAlways(
      'CHECK ("es_personalizado" IN (0, 1))',
    ),
    defaultValue: const Constant(false),
  );
  @override
  List<GeneratedColumn> get $columns => [
    id,
    clave,
    descripcion,
    unidad,
    precioUnitarioDefault,
    categoria,
    esPersonalizado,
  ];
  @override
  String get aliasedName => _alias ?? actualTableName;
  @override
  String get actualTableName => $name;
  static const String $name = 'catalogo_conceptos';
  @override
  VerificationContext validateIntegrity(
    Insertable<CatalogoConcepto> instance, {
    bool isInserting = false,
  }) {
    final context = VerificationContext();
    final data = instance.toColumns(true);
    if (data.containsKey('id')) {
      context.handle(_idMeta, id.isAcceptableOrUnknown(data['id']!, _idMeta));
    } else if (isInserting) {
      context.missing(_idMeta);
    }
    if (data.containsKey('clave')) {
      context.handle(
        _claveMeta,
        clave.isAcceptableOrUnknown(data['clave']!, _claveMeta),
      );
    } else if (isInserting) {
      context.missing(_claveMeta);
    }
    if (data.containsKey('descripcion')) {
      context.handle(
        _descripcionMeta,
        descripcion.isAcceptableOrUnknown(
          data['descripcion']!,
          _descripcionMeta,
        ),
      );
    } else if (isInserting) {
      context.missing(_descripcionMeta);
    }
    if (data.containsKey('unidad')) {
      context.handle(
        _unidadMeta,
        unidad.isAcceptableOrUnknown(data['unidad']!, _unidadMeta),
      );
    } else if (isInserting) {
      context.missing(_unidadMeta);
    }
    if (data.containsKey('precio_unitario_default')) {
      context.handle(
        _precioUnitarioDefaultMeta,
        precioUnitarioDefault.isAcceptableOrUnknown(
          data['precio_unitario_default']!,
          _precioUnitarioDefaultMeta,
        ),
      );
    }
    if (data.containsKey('categoria')) {
      context.handle(
        _categoriaMeta,
        categoria.isAcceptableOrUnknown(data['categoria']!, _categoriaMeta),
      );
    } else if (isInserting) {
      context.missing(_categoriaMeta);
    }
    if (data.containsKey('es_personalizado')) {
      context.handle(
        _esPersonalizadoMeta,
        esPersonalizado.isAcceptableOrUnknown(
          data['es_personalizado']!,
          _esPersonalizadoMeta,
        ),
      );
    }
    return context;
  }

  @override
  Set<GeneratedColumn> get $primaryKey => {id};
  @override
  CatalogoConcepto map(Map<String, dynamic> data, {String? tablePrefix}) {
    final effectivePrefix = tablePrefix != null ? '$tablePrefix.' : '';
    return CatalogoConcepto(
      id: attachedDatabase.typeMapping.read(
        DriftSqlType.string,
        data['${effectivePrefix}id'],
      )!,
      clave: attachedDatabase.typeMapping.read(
        DriftSqlType.string,
        data['${effectivePrefix}clave'],
      )!,
      descripcion: attachedDatabase.typeMapping.read(
        DriftSqlType.string,
        data['${effectivePrefix}descripcion'],
      )!,
      unidad: attachedDatabase.typeMapping.read(
        DriftSqlType.string,
        data['${effectivePrefix}unidad'],
      )!,
      precioUnitarioDefault: attachedDatabase.typeMapping.read(
        DriftSqlType.double,
        data['${effectivePrefix}precio_unitario_default'],
      )!,
      categoria: attachedDatabase.typeMapping.read(
        DriftSqlType.string,
        data['${effectivePrefix}categoria'],
      )!,
      esPersonalizado: attachedDatabase.typeMapping.read(
        DriftSqlType.bool,
        data['${effectivePrefix}es_personalizado'],
      )!,
    );
  }

  @override
  $CatalogoConceptosTable createAlias(String alias) {
    return $CatalogoConceptosTable(attachedDatabase, alias);
  }
}

class CatalogoConcepto extends DataClass
    implements Insertable<CatalogoConcepto> {
  final String id;
  final String clave;
  final String descripcion;
  final String unidad;
  final double precioUnitarioDefault;
  final String categoria;
  final bool esPersonalizado;
  const CatalogoConcepto({
    required this.id,
    required this.clave,
    required this.descripcion,
    required this.unidad,
    required this.precioUnitarioDefault,
    required this.categoria,
    required this.esPersonalizado,
  });
  @override
  Map<String, Expression> toColumns(bool nullToAbsent) {
    final map = <String, Expression>{};
    map['id'] = Variable<String>(id);
    map['clave'] = Variable<String>(clave);
    map['descripcion'] = Variable<String>(descripcion);
    map['unidad'] = Variable<String>(unidad);
    map['precio_unitario_default'] = Variable<double>(precioUnitarioDefault);
    map['categoria'] = Variable<String>(categoria);
    map['es_personalizado'] = Variable<bool>(esPersonalizado);
    return map;
  }

  CatalogoConceptosCompanion toCompanion(bool nullToAbsent) {
    return CatalogoConceptosCompanion(
      id: Value(id),
      clave: Value(clave),
      descripcion: Value(descripcion),
      unidad: Value(unidad),
      precioUnitarioDefault: Value(precioUnitarioDefault),
      categoria: Value(categoria),
      esPersonalizado: Value(esPersonalizado),
    );
  }

  factory CatalogoConcepto.fromJson(
    Map<String, dynamic> json, {
    ValueSerializer? serializer,
  }) {
    serializer ??= driftRuntimeOptions.defaultSerializer;
    return CatalogoConcepto(
      id: serializer.fromJson<String>(json['id']),
      clave: serializer.fromJson<String>(json['clave']),
      descripcion: serializer.fromJson<String>(json['descripcion']),
      unidad: serializer.fromJson<String>(json['unidad']),
      precioUnitarioDefault: serializer.fromJson<double>(
        json['precioUnitarioDefault'],
      ),
      categoria: serializer.fromJson<String>(json['categoria']),
      esPersonalizado: serializer.fromJson<bool>(json['esPersonalizado']),
    );
  }
  @override
  Map<String, dynamic> toJson({ValueSerializer? serializer}) {
    serializer ??= driftRuntimeOptions.defaultSerializer;
    return <String, dynamic>{
      'id': serializer.toJson<String>(id),
      'clave': serializer.toJson<String>(clave),
      'descripcion': serializer.toJson<String>(descripcion),
      'unidad': serializer.toJson<String>(unidad),
      'precioUnitarioDefault': serializer.toJson<double>(precioUnitarioDefault),
      'categoria': serializer.toJson<String>(categoria),
      'esPersonalizado': serializer.toJson<bool>(esPersonalizado),
    };
  }

  CatalogoConcepto copyWith({
    String? id,
    String? clave,
    String? descripcion,
    String? unidad,
    double? precioUnitarioDefault,
    String? categoria,
    bool? esPersonalizado,
  }) => CatalogoConcepto(
    id: id ?? this.id,
    clave: clave ?? this.clave,
    descripcion: descripcion ?? this.descripcion,
    unidad: unidad ?? this.unidad,
    precioUnitarioDefault: precioUnitarioDefault ?? this.precioUnitarioDefault,
    categoria: categoria ?? this.categoria,
    esPersonalizado: esPersonalizado ?? this.esPersonalizado,
  );
  CatalogoConcepto copyWithCompanion(CatalogoConceptosCompanion data) {
    return CatalogoConcepto(
      id: data.id.present ? data.id.value : this.id,
      clave: data.clave.present ? data.clave.value : this.clave,
      descripcion: data.descripcion.present
          ? data.descripcion.value
          : this.descripcion,
      unidad: data.unidad.present ? data.unidad.value : this.unidad,
      precioUnitarioDefault: data.precioUnitarioDefault.present
          ? data.precioUnitarioDefault.value
          : this.precioUnitarioDefault,
      categoria: data.categoria.present ? data.categoria.value : this.categoria,
      esPersonalizado: data.esPersonalizado.present
          ? data.esPersonalizado.value
          : this.esPersonalizado,
    );
  }

  @override
  String toString() {
    return (StringBuffer('CatalogoConcepto(')
          ..write('id: $id, ')
          ..write('clave: $clave, ')
          ..write('descripcion: $descripcion, ')
          ..write('unidad: $unidad, ')
          ..write('precioUnitarioDefault: $precioUnitarioDefault, ')
          ..write('categoria: $categoria, ')
          ..write('esPersonalizado: $esPersonalizado')
          ..write(')'))
        .toString();
  }

  @override
  int get hashCode => Object.hash(
    id,
    clave,
    descripcion,
    unidad,
    precioUnitarioDefault,
    categoria,
    esPersonalizado,
  );
  @override
  bool operator ==(Object other) =>
      identical(this, other) ||
      (other is CatalogoConcepto &&
          other.id == this.id &&
          other.clave == this.clave &&
          other.descripcion == this.descripcion &&
          other.unidad == this.unidad &&
          other.precioUnitarioDefault == this.precioUnitarioDefault &&
          other.categoria == this.categoria &&
          other.esPersonalizado == this.esPersonalizado);
}

class CatalogoConceptosCompanion extends UpdateCompanion<CatalogoConcepto> {
  final Value<String> id;
  final Value<String> clave;
  final Value<String> descripcion;
  final Value<String> unidad;
  final Value<double> precioUnitarioDefault;
  final Value<String> categoria;
  final Value<bool> esPersonalizado;
  final Value<int> rowid;
  const CatalogoConceptosCompanion({
    this.id = const Value.absent(),
    this.clave = const Value.absent(),
    this.descripcion = const Value.absent(),
    this.unidad = const Value.absent(),
    this.precioUnitarioDefault = const Value.absent(),
    this.categoria = const Value.absent(),
    this.esPersonalizado = const Value.absent(),
    this.rowid = const Value.absent(),
  });
  CatalogoConceptosCompanion.insert({
    required String id,
    required String clave,
    required String descripcion,
    required String unidad,
    this.precioUnitarioDefault = const Value.absent(),
    required String categoria,
    this.esPersonalizado = const Value.absent(),
    this.rowid = const Value.absent(),
  }) : id = Value(id),
       clave = Value(clave),
       descripcion = Value(descripcion),
       unidad = Value(unidad),
       categoria = Value(categoria);
  static Insertable<CatalogoConcepto> custom({
    Expression<String>? id,
    Expression<String>? clave,
    Expression<String>? descripcion,
    Expression<String>? unidad,
    Expression<double>? precioUnitarioDefault,
    Expression<String>? categoria,
    Expression<bool>? esPersonalizado,
    Expression<int>? rowid,
  }) {
    return RawValuesInsertable({
      if (id != null) 'id': id,
      if (clave != null) 'clave': clave,
      if (descripcion != null) 'descripcion': descripcion,
      if (unidad != null) 'unidad': unidad,
      if (precioUnitarioDefault != null)
        'precio_unitario_default': precioUnitarioDefault,
      if (categoria != null) 'categoria': categoria,
      if (esPersonalizado != null) 'es_personalizado': esPersonalizado,
      if (rowid != null) 'rowid': rowid,
    });
  }

  CatalogoConceptosCompanion copyWith({
    Value<String>? id,
    Value<String>? clave,
    Value<String>? descripcion,
    Value<String>? unidad,
    Value<double>? precioUnitarioDefault,
    Value<String>? categoria,
    Value<bool>? esPersonalizado,
    Value<int>? rowid,
  }) {
    return CatalogoConceptosCompanion(
      id: id ?? this.id,
      clave: clave ?? this.clave,
      descripcion: descripcion ?? this.descripcion,
      unidad: unidad ?? this.unidad,
      precioUnitarioDefault:
          precioUnitarioDefault ?? this.precioUnitarioDefault,
      categoria: categoria ?? this.categoria,
      esPersonalizado: esPersonalizado ?? this.esPersonalizado,
      rowid: rowid ?? this.rowid,
    );
  }

  @override
  Map<String, Expression> toColumns(bool nullToAbsent) {
    final map = <String, Expression>{};
    if (id.present) {
      map['id'] = Variable<String>(id.value);
    }
    if (clave.present) {
      map['clave'] = Variable<String>(clave.value);
    }
    if (descripcion.present) {
      map['descripcion'] = Variable<String>(descripcion.value);
    }
    if (unidad.present) {
      map['unidad'] = Variable<String>(unidad.value);
    }
    if (precioUnitarioDefault.present) {
      map['precio_unitario_default'] = Variable<double>(
        precioUnitarioDefault.value,
      );
    }
    if (categoria.present) {
      map['categoria'] = Variable<String>(categoria.value);
    }
    if (esPersonalizado.present) {
      map['es_personalizado'] = Variable<bool>(esPersonalizado.value);
    }
    if (rowid.present) {
      map['rowid'] = Variable<int>(rowid.value);
    }
    return map;
  }

  @override
  String toString() {
    return (StringBuffer('CatalogoConceptosCompanion(')
          ..write('id: $id, ')
          ..write('clave: $clave, ')
          ..write('descripcion: $descripcion, ')
          ..write('unidad: $unidad, ')
          ..write('precioUnitarioDefault: $precioUnitarioDefault, ')
          ..write('categoria: $categoria, ')
          ..write('esPersonalizado: $esPersonalizado, ')
          ..write('rowid: $rowid')
          ..write(')'))
        .toString();
  }
}

class $ArchivosCotizacionTable extends ArchivosCotizacion
    with TableInfo<$ArchivosCotizacionTable, ArchivoCotizacion> {
  @override
  final GeneratedDatabase attachedDatabase;
  final String? _alias;
  $ArchivosCotizacionTable(this.attachedDatabase, [this._alias]);
  static const VerificationMeta _idMeta = const VerificationMeta('id');
  @override
  late final GeneratedColumn<String> id = GeneratedColumn<String>(
    'id',
    aliasedName,
    false,
    type: DriftSqlType.string,
    requiredDuringInsert: true,
  );
  static const VerificationMeta _cotizacionIdMeta = const VerificationMeta(
    'cotizacionId',
  );
  @override
  late final GeneratedColumn<String> cotizacionId = GeneratedColumn<String>(
    'cotizacion_id',
    aliasedName,
    false,
    type: DriftSqlType.string,
    requiredDuringInsert: true,
  );
  static const VerificationMeta _tipoMeta = const VerificationMeta('tipo');
  @override
  late final GeneratedColumn<String> tipo = GeneratedColumn<String>(
    'tipo',
    aliasedName,
    false,
    type: DriftSqlType.string,
    requiredDuringInsert: true,
  );
  static const VerificationMeta _nombreMeta = const VerificationMeta('nombre');
  @override
  late final GeneratedColumn<String> nombre = GeneratedColumn<String>(
    'nombre',
    aliasedName,
    false,
    type: DriftSqlType.string,
    requiredDuringInsert: true,
  );
  static const VerificationMeta _uriMeta = const VerificationMeta('uri');
  @override
  late final GeneratedColumn<String> uri = GeneratedColumn<String>(
    'uri',
    aliasedName,
    false,
    type: DriftSqlType.string,
    requiredDuringInsert: true,
  );
  static const VerificationMeta _fechaAgregadoMeta = const VerificationMeta(
    'fechaAgregado',
  );
  @override
  late final GeneratedColumn<int> fechaAgregado = GeneratedColumn<int>(
    'fecha_agregado',
    aliasedName,
    false,
    type: DriftSqlType.int,
    requiredDuringInsert: true,
  );
  @override
  List<GeneratedColumn> get $columns => [
    id,
    cotizacionId,
    tipo,
    nombre,
    uri,
    fechaAgregado,
  ];
  @override
  String get aliasedName => _alias ?? actualTableName;
  @override
  String get actualTableName => $name;
  static const String $name = 'archivos_cotizacion';
  @override
  VerificationContext validateIntegrity(
    Insertable<ArchivoCotizacion> instance, {
    bool isInserting = false,
  }) {
    final context = VerificationContext();
    final data = instance.toColumns(true);
    if (data.containsKey('id')) {
      context.handle(_idMeta, id.isAcceptableOrUnknown(data['id']!, _idMeta));
    } else if (isInserting) {
      context.missing(_idMeta);
    }
    if (data.containsKey('cotizacion_id')) {
      context.handle(
        _cotizacionIdMeta,
        cotizacionId.isAcceptableOrUnknown(
          data['cotizacion_id']!,
          _cotizacionIdMeta,
        ),
      );
    } else if (isInserting) {
      context.missing(_cotizacionIdMeta);
    }
    if (data.containsKey('tipo')) {
      context.handle(
        _tipoMeta,
        tipo.isAcceptableOrUnknown(data['tipo']!, _tipoMeta),
      );
    } else if (isInserting) {
      context.missing(_tipoMeta);
    }
    if (data.containsKey('nombre')) {
      context.handle(
        _nombreMeta,
        nombre.isAcceptableOrUnknown(data['nombre']!, _nombreMeta),
      );
    } else if (isInserting) {
      context.missing(_nombreMeta);
    }
    if (data.containsKey('uri')) {
      context.handle(
        _uriMeta,
        uri.isAcceptableOrUnknown(data['uri']!, _uriMeta),
      );
    } else if (isInserting) {
      context.missing(_uriMeta);
    }
    if (data.containsKey('fecha_agregado')) {
      context.handle(
        _fechaAgregadoMeta,
        fechaAgregado.isAcceptableOrUnknown(
          data['fecha_agregado']!,
          _fechaAgregadoMeta,
        ),
      );
    } else if (isInserting) {
      context.missing(_fechaAgregadoMeta);
    }
    return context;
  }

  @override
  Set<GeneratedColumn> get $primaryKey => {id};
  @override
  ArchivoCotizacion map(Map<String, dynamic> data, {String? tablePrefix}) {
    final effectivePrefix = tablePrefix != null ? '$tablePrefix.' : '';
    return ArchivoCotizacion(
      id: attachedDatabase.typeMapping.read(
        DriftSqlType.string,
        data['${effectivePrefix}id'],
      )!,
      cotizacionId: attachedDatabase.typeMapping.read(
        DriftSqlType.string,
        data['${effectivePrefix}cotizacion_id'],
      )!,
      tipo: attachedDatabase.typeMapping.read(
        DriftSqlType.string,
        data['${effectivePrefix}tipo'],
      )!,
      nombre: attachedDatabase.typeMapping.read(
        DriftSqlType.string,
        data['${effectivePrefix}nombre'],
      )!,
      uri: attachedDatabase.typeMapping.read(
        DriftSqlType.string,
        data['${effectivePrefix}uri'],
      )!,
      fechaAgregado: attachedDatabase.typeMapping.read(
        DriftSqlType.int,
        data['${effectivePrefix}fecha_agregado'],
      )!,
    );
  }

  @override
  $ArchivosCotizacionTable createAlias(String alias) {
    return $ArchivosCotizacionTable(attachedDatabase, alias);
  }
}

class ArchivoCotizacion extends DataClass
    implements Insertable<ArchivoCotizacion> {
  final String id;
  final String cotizacionId;
  final String tipo;
  final String nombre;
  final String uri;
  final int fechaAgregado;
  const ArchivoCotizacion({
    required this.id,
    required this.cotizacionId,
    required this.tipo,
    required this.nombre,
    required this.uri,
    required this.fechaAgregado,
  });
  @override
  Map<String, Expression> toColumns(bool nullToAbsent) {
    final map = <String, Expression>{};
    map['id'] = Variable<String>(id);
    map['cotizacion_id'] = Variable<String>(cotizacionId);
    map['tipo'] = Variable<String>(tipo);
    map['nombre'] = Variable<String>(nombre);
    map['uri'] = Variable<String>(uri);
    map['fecha_agregado'] = Variable<int>(fechaAgregado);
    return map;
  }

  ArchivosCotizacionCompanion toCompanion(bool nullToAbsent) {
    return ArchivosCotizacionCompanion(
      id: Value(id),
      cotizacionId: Value(cotizacionId),
      tipo: Value(tipo),
      nombre: Value(nombre),
      uri: Value(uri),
      fechaAgregado: Value(fechaAgregado),
    );
  }

  factory ArchivoCotizacion.fromJson(
    Map<String, dynamic> json, {
    ValueSerializer? serializer,
  }) {
    serializer ??= driftRuntimeOptions.defaultSerializer;
    return ArchivoCotizacion(
      id: serializer.fromJson<String>(json['id']),
      cotizacionId: serializer.fromJson<String>(json['cotizacionId']),
      tipo: serializer.fromJson<String>(json['tipo']),
      nombre: serializer.fromJson<String>(json['nombre']),
      uri: serializer.fromJson<String>(json['uri']),
      fechaAgregado: serializer.fromJson<int>(json['fechaAgregado']),
    );
  }
  @override
  Map<String, dynamic> toJson({ValueSerializer? serializer}) {
    serializer ??= driftRuntimeOptions.defaultSerializer;
    return <String, dynamic>{
      'id': serializer.toJson<String>(id),
      'cotizacionId': serializer.toJson<String>(cotizacionId),
      'tipo': serializer.toJson<String>(tipo),
      'nombre': serializer.toJson<String>(nombre),
      'uri': serializer.toJson<String>(uri),
      'fechaAgregado': serializer.toJson<int>(fechaAgregado),
    };
  }

  ArchivoCotizacion copyWith({
    String? id,
    String? cotizacionId,
    String? tipo,
    String? nombre,
    String? uri,
    int? fechaAgregado,
  }) => ArchivoCotizacion(
    id: id ?? this.id,
    cotizacionId: cotizacionId ?? this.cotizacionId,
    tipo: tipo ?? this.tipo,
    nombre: nombre ?? this.nombre,
    uri: uri ?? this.uri,
    fechaAgregado: fechaAgregado ?? this.fechaAgregado,
  );
  ArchivoCotizacion copyWithCompanion(ArchivosCotizacionCompanion data) {
    return ArchivoCotizacion(
      id: data.id.present ? data.id.value : this.id,
      cotizacionId: data.cotizacionId.present
          ? data.cotizacionId.value
          : this.cotizacionId,
      tipo: data.tipo.present ? data.tipo.value : this.tipo,
      nombre: data.nombre.present ? data.nombre.value : this.nombre,
      uri: data.uri.present ? data.uri.value : this.uri,
      fechaAgregado: data.fechaAgregado.present
          ? data.fechaAgregado.value
          : this.fechaAgregado,
    );
  }

  @override
  String toString() {
    return (StringBuffer('ArchivoCotizacion(')
          ..write('id: $id, ')
          ..write('cotizacionId: $cotizacionId, ')
          ..write('tipo: $tipo, ')
          ..write('nombre: $nombre, ')
          ..write('uri: $uri, ')
          ..write('fechaAgregado: $fechaAgregado')
          ..write(')'))
        .toString();
  }

  @override
  int get hashCode =>
      Object.hash(id, cotizacionId, tipo, nombre, uri, fechaAgregado);
  @override
  bool operator ==(Object other) =>
      identical(this, other) ||
      (other is ArchivoCotizacion &&
          other.id == this.id &&
          other.cotizacionId == this.cotizacionId &&
          other.tipo == this.tipo &&
          other.nombre == this.nombre &&
          other.uri == this.uri &&
          other.fechaAgregado == this.fechaAgregado);
}

class ArchivosCotizacionCompanion extends UpdateCompanion<ArchivoCotizacion> {
  final Value<String> id;
  final Value<String> cotizacionId;
  final Value<String> tipo;
  final Value<String> nombre;
  final Value<String> uri;
  final Value<int> fechaAgregado;
  final Value<int> rowid;
  const ArchivosCotizacionCompanion({
    this.id = const Value.absent(),
    this.cotizacionId = const Value.absent(),
    this.tipo = const Value.absent(),
    this.nombre = const Value.absent(),
    this.uri = const Value.absent(),
    this.fechaAgregado = const Value.absent(),
    this.rowid = const Value.absent(),
  });
  ArchivosCotizacionCompanion.insert({
    required String id,
    required String cotizacionId,
    required String tipo,
    required String nombre,
    required String uri,
    required int fechaAgregado,
    this.rowid = const Value.absent(),
  }) : id = Value(id),
       cotizacionId = Value(cotizacionId),
       tipo = Value(tipo),
       nombre = Value(nombre),
       uri = Value(uri),
       fechaAgregado = Value(fechaAgregado);
  static Insertable<ArchivoCotizacion> custom({
    Expression<String>? id,
    Expression<String>? cotizacionId,
    Expression<String>? tipo,
    Expression<String>? nombre,
    Expression<String>? uri,
    Expression<int>? fechaAgregado,
    Expression<int>? rowid,
  }) {
    return RawValuesInsertable({
      if (id != null) 'id': id,
      if (cotizacionId != null) 'cotizacion_id': cotizacionId,
      if (tipo != null) 'tipo': tipo,
      if (nombre != null) 'nombre': nombre,
      if (uri != null) 'uri': uri,
      if (fechaAgregado != null) 'fecha_agregado': fechaAgregado,
      if (rowid != null) 'rowid': rowid,
    });
  }

  ArchivosCotizacionCompanion copyWith({
    Value<String>? id,
    Value<String>? cotizacionId,
    Value<String>? tipo,
    Value<String>? nombre,
    Value<String>? uri,
    Value<int>? fechaAgregado,
    Value<int>? rowid,
  }) {
    return ArchivosCotizacionCompanion(
      id: id ?? this.id,
      cotizacionId: cotizacionId ?? this.cotizacionId,
      tipo: tipo ?? this.tipo,
      nombre: nombre ?? this.nombre,
      uri: uri ?? this.uri,
      fechaAgregado: fechaAgregado ?? this.fechaAgregado,
      rowid: rowid ?? this.rowid,
    );
  }

  @override
  Map<String, Expression> toColumns(bool nullToAbsent) {
    final map = <String, Expression>{};
    if (id.present) {
      map['id'] = Variable<String>(id.value);
    }
    if (cotizacionId.present) {
      map['cotizacion_id'] = Variable<String>(cotizacionId.value);
    }
    if (tipo.present) {
      map['tipo'] = Variable<String>(tipo.value);
    }
    if (nombre.present) {
      map['nombre'] = Variable<String>(nombre.value);
    }
    if (uri.present) {
      map['uri'] = Variable<String>(uri.value);
    }
    if (fechaAgregado.present) {
      map['fecha_agregado'] = Variable<int>(fechaAgregado.value);
    }
    if (rowid.present) {
      map['rowid'] = Variable<int>(rowid.value);
    }
    return map;
  }

  @override
  String toString() {
    return (StringBuffer('ArchivosCotizacionCompanion(')
          ..write('id: $id, ')
          ..write('cotizacionId: $cotizacionId, ')
          ..write('tipo: $tipo, ')
          ..write('nombre: $nombre, ')
          ..write('uri: $uri, ')
          ..write('fechaAgregado: $fechaAgregado, ')
          ..write('rowid: $rowid')
          ..write(')'))
        .toString();
  }
}

abstract class _$AppDatabase extends GeneratedDatabase {
  _$AppDatabase(QueryExecutor e) : super(e);
  $AppDatabaseManager get managers => $AppDatabaseManager(this);
  late final $ObrasTable obras = $ObrasTable(this);
  late final $PuestosTable puestos = $PuestosTable(this);
  late final $ColaboradoresTable colaboradores = $ColaboradoresTable(this);
  late final $ObraColaboradorTable obraColaborador = $ObraColaboradorTable(
    this,
  );
  late final $AsistenciasTable asistencias = $AsistenciasTable(this);
  late final $DestajosTable destajos = $DestajosTable(this);
  late final $CotizacionesTable cotizaciones = $CotizacionesTable(this);
  late final $SeccionesTable secciones = $SeccionesTable(this);
  late final $PartidasTable partidas = $PartidasTable(this);
  late final $PagosTable pagos = $PagosTable(this);
  late final $MovimientosTable movimientos = $MovimientosTable(this);
  late final $CatalogoConceptosTable catalogoConceptos =
      $CatalogoConceptosTable(this);
  late final $ArchivosCotizacionTable archivosCotizacion =
      $ArchivosCotizacionTable(this);
  @override
  Iterable<TableInfo<Table, Object?>> get allTables =>
      allSchemaEntities.whereType<TableInfo<Table, Object?>>();
  @override
  List<DatabaseSchemaEntity> get allSchemaEntities => [
    obras,
    puestos,
    colaboradores,
    obraColaborador,
    asistencias,
    destajos,
    cotizaciones,
    secciones,
    partidas,
    pagos,
    movimientos,
    catalogoConceptos,
    archivosCotizacion,
  ];
}

typedef $$ObrasTableCreateCompanionBuilder =
    ObrasCompanion Function({
      required String id,
      required String nombre,
      Value<String> cliente,
      Value<String> ubicacion,
      required int fechaInicio,
      Value<bool> activa,
      Value<String?> cotizacionOrigenId,
      Value<String?> pdfConfigJson,
      Value<int> rowid,
    });
typedef $$ObrasTableUpdateCompanionBuilder =
    ObrasCompanion Function({
      Value<String> id,
      Value<String> nombre,
      Value<String> cliente,
      Value<String> ubicacion,
      Value<int> fechaInicio,
      Value<bool> activa,
      Value<String?> cotizacionOrigenId,
      Value<String?> pdfConfigJson,
      Value<int> rowid,
    });

class $$ObrasTableFilterComposer extends Composer<_$AppDatabase, $ObrasTable> {
  $$ObrasTableFilterComposer({
    required super.$db,
    required super.$table,
    super.joinBuilder,
    super.$addJoinBuilderToRootComposer,
    super.$removeJoinBuilderFromRootComposer,
  });
  ColumnFilters<String> get id => $composableBuilder(
    column: $table.id,
    builder: (column) => ColumnFilters(column),
  );

  ColumnFilters<String> get nombre => $composableBuilder(
    column: $table.nombre,
    builder: (column) => ColumnFilters(column),
  );

  ColumnFilters<String> get cliente => $composableBuilder(
    column: $table.cliente,
    builder: (column) => ColumnFilters(column),
  );

  ColumnFilters<String> get ubicacion => $composableBuilder(
    column: $table.ubicacion,
    builder: (column) => ColumnFilters(column),
  );

  ColumnFilters<int> get fechaInicio => $composableBuilder(
    column: $table.fechaInicio,
    builder: (column) => ColumnFilters(column),
  );

  ColumnFilters<bool> get activa => $composableBuilder(
    column: $table.activa,
    builder: (column) => ColumnFilters(column),
  );

  ColumnFilters<String> get cotizacionOrigenId => $composableBuilder(
    column: $table.cotizacionOrigenId,
    builder: (column) => ColumnFilters(column),
  );

  ColumnFilters<String> get pdfConfigJson => $composableBuilder(
    column: $table.pdfConfigJson,
    builder: (column) => ColumnFilters(column),
  );
}

class $$ObrasTableOrderingComposer
    extends Composer<_$AppDatabase, $ObrasTable> {
  $$ObrasTableOrderingComposer({
    required super.$db,
    required super.$table,
    super.joinBuilder,
    super.$addJoinBuilderToRootComposer,
    super.$removeJoinBuilderFromRootComposer,
  });
  ColumnOrderings<String> get id => $composableBuilder(
    column: $table.id,
    builder: (column) => ColumnOrderings(column),
  );

  ColumnOrderings<String> get nombre => $composableBuilder(
    column: $table.nombre,
    builder: (column) => ColumnOrderings(column),
  );

  ColumnOrderings<String> get cliente => $composableBuilder(
    column: $table.cliente,
    builder: (column) => ColumnOrderings(column),
  );

  ColumnOrderings<String> get ubicacion => $composableBuilder(
    column: $table.ubicacion,
    builder: (column) => ColumnOrderings(column),
  );

  ColumnOrderings<int> get fechaInicio => $composableBuilder(
    column: $table.fechaInicio,
    builder: (column) => ColumnOrderings(column),
  );

  ColumnOrderings<bool> get activa => $composableBuilder(
    column: $table.activa,
    builder: (column) => ColumnOrderings(column),
  );

  ColumnOrderings<String> get cotizacionOrigenId => $composableBuilder(
    column: $table.cotizacionOrigenId,
    builder: (column) => ColumnOrderings(column),
  );

  ColumnOrderings<String> get pdfConfigJson => $composableBuilder(
    column: $table.pdfConfigJson,
    builder: (column) => ColumnOrderings(column),
  );
}

class $$ObrasTableAnnotationComposer
    extends Composer<_$AppDatabase, $ObrasTable> {
  $$ObrasTableAnnotationComposer({
    required super.$db,
    required super.$table,
    super.joinBuilder,
    super.$addJoinBuilderToRootComposer,
    super.$removeJoinBuilderFromRootComposer,
  });
  GeneratedColumn<String> get id =>
      $composableBuilder(column: $table.id, builder: (column) => column);

  GeneratedColumn<String> get nombre =>
      $composableBuilder(column: $table.nombre, builder: (column) => column);

  GeneratedColumn<String> get cliente =>
      $composableBuilder(column: $table.cliente, builder: (column) => column);

  GeneratedColumn<String> get ubicacion =>
      $composableBuilder(column: $table.ubicacion, builder: (column) => column);

  GeneratedColumn<int> get fechaInicio => $composableBuilder(
    column: $table.fechaInicio,
    builder: (column) => column,
  );

  GeneratedColumn<bool> get activa =>
      $composableBuilder(column: $table.activa, builder: (column) => column);

  GeneratedColumn<String> get cotizacionOrigenId => $composableBuilder(
    column: $table.cotizacionOrigenId,
    builder: (column) => column,
  );

  GeneratedColumn<String> get pdfConfigJson => $composableBuilder(
    column: $table.pdfConfigJson,
    builder: (column) => column,
  );
}

class $$ObrasTableTableManager
    extends
        RootTableManager<
          _$AppDatabase,
          $ObrasTable,
          Obra,
          $$ObrasTableFilterComposer,
          $$ObrasTableOrderingComposer,
          $$ObrasTableAnnotationComposer,
          $$ObrasTableCreateCompanionBuilder,
          $$ObrasTableUpdateCompanionBuilder,
          (Obra, BaseReferences<_$AppDatabase, $ObrasTable, Obra>),
          Obra,
          PrefetchHooks Function()
        > {
  $$ObrasTableTableManager(_$AppDatabase db, $ObrasTable table)
    : super(
        TableManagerState(
          db: db,
          table: table,
          createFilteringComposer: () =>
              $$ObrasTableFilterComposer($db: db, $table: table),
          createOrderingComposer: () =>
              $$ObrasTableOrderingComposer($db: db, $table: table),
          createComputedFieldComposer: () =>
              $$ObrasTableAnnotationComposer($db: db, $table: table),
          updateCompanionCallback:
              ({
                Value<String> id = const Value.absent(),
                Value<String> nombre = const Value.absent(),
                Value<String> cliente = const Value.absent(),
                Value<String> ubicacion = const Value.absent(),
                Value<int> fechaInicio = const Value.absent(),
                Value<bool> activa = const Value.absent(),
                Value<String?> cotizacionOrigenId = const Value.absent(),
                Value<String?> pdfConfigJson = const Value.absent(),
                Value<int> rowid = const Value.absent(),
              }) => ObrasCompanion(
                id: id,
                nombre: nombre,
                cliente: cliente,
                ubicacion: ubicacion,
                fechaInicio: fechaInicio,
                activa: activa,
                cotizacionOrigenId: cotizacionOrigenId,
                pdfConfigJson: pdfConfigJson,
                rowid: rowid,
              ),
          createCompanionCallback:
              ({
                required String id,
                required String nombre,
                Value<String> cliente = const Value.absent(),
                Value<String> ubicacion = const Value.absent(),
                required int fechaInicio,
                Value<bool> activa = const Value.absent(),
                Value<String?> cotizacionOrigenId = const Value.absent(),
                Value<String?> pdfConfigJson = const Value.absent(),
                Value<int> rowid = const Value.absent(),
              }) => ObrasCompanion.insert(
                id: id,
                nombre: nombre,
                cliente: cliente,
                ubicacion: ubicacion,
                fechaInicio: fechaInicio,
                activa: activa,
                cotizacionOrigenId: cotizacionOrigenId,
                pdfConfigJson: pdfConfigJson,
                rowid: rowid,
              ),
          withReferenceMapper: (p0) => p0
              .map((e) => (e.readTable(table), BaseReferences(db, table, e)))
              .toList(),
          prefetchHooksCallback: null,
        ),
      );
}

typedef $$ObrasTableProcessedTableManager =
    ProcessedTableManager<
      _$AppDatabase,
      $ObrasTable,
      Obra,
      $$ObrasTableFilterComposer,
      $$ObrasTableOrderingComposer,
      $$ObrasTableAnnotationComposer,
      $$ObrasTableCreateCompanionBuilder,
      $$ObrasTableUpdateCompanionBuilder,
      (Obra, BaseReferences<_$AppDatabase, $ObrasTable, Obra>),
      Obra,
      PrefetchHooks Function()
    >;
typedef $$PuestosTableCreateCompanionBuilder =
    PuestosCompanion Function({
      required String id,
      required String nombre,
      Value<double> salarioDiaDefault,
      Value<int> rowid,
    });
typedef $$PuestosTableUpdateCompanionBuilder =
    PuestosCompanion Function({
      Value<String> id,
      Value<String> nombre,
      Value<double> salarioDiaDefault,
      Value<int> rowid,
    });

class $$PuestosTableFilterComposer
    extends Composer<_$AppDatabase, $PuestosTable> {
  $$PuestosTableFilterComposer({
    required super.$db,
    required super.$table,
    super.joinBuilder,
    super.$addJoinBuilderToRootComposer,
    super.$removeJoinBuilderFromRootComposer,
  });
  ColumnFilters<String> get id => $composableBuilder(
    column: $table.id,
    builder: (column) => ColumnFilters(column),
  );

  ColumnFilters<String> get nombre => $composableBuilder(
    column: $table.nombre,
    builder: (column) => ColumnFilters(column),
  );

  ColumnFilters<double> get salarioDiaDefault => $composableBuilder(
    column: $table.salarioDiaDefault,
    builder: (column) => ColumnFilters(column),
  );
}

class $$PuestosTableOrderingComposer
    extends Composer<_$AppDatabase, $PuestosTable> {
  $$PuestosTableOrderingComposer({
    required super.$db,
    required super.$table,
    super.joinBuilder,
    super.$addJoinBuilderToRootComposer,
    super.$removeJoinBuilderFromRootComposer,
  });
  ColumnOrderings<String> get id => $composableBuilder(
    column: $table.id,
    builder: (column) => ColumnOrderings(column),
  );

  ColumnOrderings<String> get nombre => $composableBuilder(
    column: $table.nombre,
    builder: (column) => ColumnOrderings(column),
  );

  ColumnOrderings<double> get salarioDiaDefault => $composableBuilder(
    column: $table.salarioDiaDefault,
    builder: (column) => ColumnOrderings(column),
  );
}

class $$PuestosTableAnnotationComposer
    extends Composer<_$AppDatabase, $PuestosTable> {
  $$PuestosTableAnnotationComposer({
    required super.$db,
    required super.$table,
    super.joinBuilder,
    super.$addJoinBuilderToRootComposer,
    super.$removeJoinBuilderFromRootComposer,
  });
  GeneratedColumn<String> get id =>
      $composableBuilder(column: $table.id, builder: (column) => column);

  GeneratedColumn<String> get nombre =>
      $composableBuilder(column: $table.nombre, builder: (column) => column);

  GeneratedColumn<double> get salarioDiaDefault => $composableBuilder(
    column: $table.salarioDiaDefault,
    builder: (column) => column,
  );
}

class $$PuestosTableTableManager
    extends
        RootTableManager<
          _$AppDatabase,
          $PuestosTable,
          Puesto,
          $$PuestosTableFilterComposer,
          $$PuestosTableOrderingComposer,
          $$PuestosTableAnnotationComposer,
          $$PuestosTableCreateCompanionBuilder,
          $$PuestosTableUpdateCompanionBuilder,
          (Puesto, BaseReferences<_$AppDatabase, $PuestosTable, Puesto>),
          Puesto,
          PrefetchHooks Function()
        > {
  $$PuestosTableTableManager(_$AppDatabase db, $PuestosTable table)
    : super(
        TableManagerState(
          db: db,
          table: table,
          createFilteringComposer: () =>
              $$PuestosTableFilterComposer($db: db, $table: table),
          createOrderingComposer: () =>
              $$PuestosTableOrderingComposer($db: db, $table: table),
          createComputedFieldComposer: () =>
              $$PuestosTableAnnotationComposer($db: db, $table: table),
          updateCompanionCallback:
              ({
                Value<String> id = const Value.absent(),
                Value<String> nombre = const Value.absent(),
                Value<double> salarioDiaDefault = const Value.absent(),
                Value<int> rowid = const Value.absent(),
              }) => PuestosCompanion(
                id: id,
                nombre: nombre,
                salarioDiaDefault: salarioDiaDefault,
                rowid: rowid,
              ),
          createCompanionCallback:
              ({
                required String id,
                required String nombre,
                Value<double> salarioDiaDefault = const Value.absent(),
                Value<int> rowid = const Value.absent(),
              }) => PuestosCompanion.insert(
                id: id,
                nombre: nombre,
                salarioDiaDefault: salarioDiaDefault,
                rowid: rowid,
              ),
          withReferenceMapper: (p0) => p0
              .map((e) => (e.readTable(table), BaseReferences(db, table, e)))
              .toList(),
          prefetchHooksCallback: null,
        ),
      );
}

typedef $$PuestosTableProcessedTableManager =
    ProcessedTableManager<
      _$AppDatabase,
      $PuestosTable,
      Puesto,
      $$PuestosTableFilterComposer,
      $$PuestosTableOrderingComposer,
      $$PuestosTableAnnotationComposer,
      $$PuestosTableCreateCompanionBuilder,
      $$PuestosTableUpdateCompanionBuilder,
      (Puesto, BaseReferences<_$AppDatabase, $PuestosTable, Puesto>),
      Puesto,
      PrefetchHooks Function()
    >;
typedef $$ColaboradoresTableCreateCompanionBuilder =
    ColaboradoresCompanion Function({
      required String id,
      required String nombre,
      required String puestoId,
      required String tipoPago,
      Value<String> telefono,
      Value<String> contactoNombre,
      Value<String> contactoTelefono,
      Value<String> contactoParentesco,
      Value<bool> activo,
      Value<double?> salarioPersonalizado,
      Value<int> rowid,
    });
typedef $$ColaboradoresTableUpdateCompanionBuilder =
    ColaboradoresCompanion Function({
      Value<String> id,
      Value<String> nombre,
      Value<String> puestoId,
      Value<String> tipoPago,
      Value<String> telefono,
      Value<String> contactoNombre,
      Value<String> contactoTelefono,
      Value<String> contactoParentesco,
      Value<bool> activo,
      Value<double?> salarioPersonalizado,
      Value<int> rowid,
    });

class $$ColaboradoresTableFilterComposer
    extends Composer<_$AppDatabase, $ColaboradoresTable> {
  $$ColaboradoresTableFilterComposer({
    required super.$db,
    required super.$table,
    super.joinBuilder,
    super.$addJoinBuilderToRootComposer,
    super.$removeJoinBuilderFromRootComposer,
  });
  ColumnFilters<String> get id => $composableBuilder(
    column: $table.id,
    builder: (column) => ColumnFilters(column),
  );

  ColumnFilters<String> get nombre => $composableBuilder(
    column: $table.nombre,
    builder: (column) => ColumnFilters(column),
  );

  ColumnFilters<String> get puestoId => $composableBuilder(
    column: $table.puestoId,
    builder: (column) => ColumnFilters(column),
  );

  ColumnFilters<String> get tipoPago => $composableBuilder(
    column: $table.tipoPago,
    builder: (column) => ColumnFilters(column),
  );

  ColumnFilters<String> get telefono => $composableBuilder(
    column: $table.telefono,
    builder: (column) => ColumnFilters(column),
  );

  ColumnFilters<String> get contactoNombre => $composableBuilder(
    column: $table.contactoNombre,
    builder: (column) => ColumnFilters(column),
  );

  ColumnFilters<String> get contactoTelefono => $composableBuilder(
    column: $table.contactoTelefono,
    builder: (column) => ColumnFilters(column),
  );

  ColumnFilters<String> get contactoParentesco => $composableBuilder(
    column: $table.contactoParentesco,
    builder: (column) => ColumnFilters(column),
  );

  ColumnFilters<bool> get activo => $composableBuilder(
    column: $table.activo,
    builder: (column) => ColumnFilters(column),
  );

  ColumnFilters<double> get salarioPersonalizado => $composableBuilder(
    column: $table.salarioPersonalizado,
    builder: (column) => ColumnFilters(column),
  );
}

class $$ColaboradoresTableOrderingComposer
    extends Composer<_$AppDatabase, $ColaboradoresTable> {
  $$ColaboradoresTableOrderingComposer({
    required super.$db,
    required super.$table,
    super.joinBuilder,
    super.$addJoinBuilderToRootComposer,
    super.$removeJoinBuilderFromRootComposer,
  });
  ColumnOrderings<String> get id => $composableBuilder(
    column: $table.id,
    builder: (column) => ColumnOrderings(column),
  );

  ColumnOrderings<String> get nombre => $composableBuilder(
    column: $table.nombre,
    builder: (column) => ColumnOrderings(column),
  );

  ColumnOrderings<String> get puestoId => $composableBuilder(
    column: $table.puestoId,
    builder: (column) => ColumnOrderings(column),
  );

  ColumnOrderings<String> get tipoPago => $composableBuilder(
    column: $table.tipoPago,
    builder: (column) => ColumnOrderings(column),
  );

  ColumnOrderings<String> get telefono => $composableBuilder(
    column: $table.telefono,
    builder: (column) => ColumnOrderings(column),
  );

  ColumnOrderings<String> get contactoNombre => $composableBuilder(
    column: $table.contactoNombre,
    builder: (column) => ColumnOrderings(column),
  );

  ColumnOrderings<String> get contactoTelefono => $composableBuilder(
    column: $table.contactoTelefono,
    builder: (column) => ColumnOrderings(column),
  );

  ColumnOrderings<String> get contactoParentesco => $composableBuilder(
    column: $table.contactoParentesco,
    builder: (column) => ColumnOrderings(column),
  );

  ColumnOrderings<bool> get activo => $composableBuilder(
    column: $table.activo,
    builder: (column) => ColumnOrderings(column),
  );

  ColumnOrderings<double> get salarioPersonalizado => $composableBuilder(
    column: $table.salarioPersonalizado,
    builder: (column) => ColumnOrderings(column),
  );
}

class $$ColaboradoresTableAnnotationComposer
    extends Composer<_$AppDatabase, $ColaboradoresTable> {
  $$ColaboradoresTableAnnotationComposer({
    required super.$db,
    required super.$table,
    super.joinBuilder,
    super.$addJoinBuilderToRootComposer,
    super.$removeJoinBuilderFromRootComposer,
  });
  GeneratedColumn<String> get id =>
      $composableBuilder(column: $table.id, builder: (column) => column);

  GeneratedColumn<String> get nombre =>
      $composableBuilder(column: $table.nombre, builder: (column) => column);

  GeneratedColumn<String> get puestoId =>
      $composableBuilder(column: $table.puestoId, builder: (column) => column);

  GeneratedColumn<String> get tipoPago =>
      $composableBuilder(column: $table.tipoPago, builder: (column) => column);

  GeneratedColumn<String> get telefono =>
      $composableBuilder(column: $table.telefono, builder: (column) => column);

  GeneratedColumn<String> get contactoNombre => $composableBuilder(
    column: $table.contactoNombre,
    builder: (column) => column,
  );

  GeneratedColumn<String> get contactoTelefono => $composableBuilder(
    column: $table.contactoTelefono,
    builder: (column) => column,
  );

  GeneratedColumn<String> get contactoParentesco => $composableBuilder(
    column: $table.contactoParentesco,
    builder: (column) => column,
  );

  GeneratedColumn<bool> get activo =>
      $composableBuilder(column: $table.activo, builder: (column) => column);

  GeneratedColumn<double> get salarioPersonalizado => $composableBuilder(
    column: $table.salarioPersonalizado,
    builder: (column) => column,
  );
}

class $$ColaboradoresTableTableManager
    extends
        RootTableManager<
          _$AppDatabase,
          $ColaboradoresTable,
          Colaborador,
          $$ColaboradoresTableFilterComposer,
          $$ColaboradoresTableOrderingComposer,
          $$ColaboradoresTableAnnotationComposer,
          $$ColaboradoresTableCreateCompanionBuilder,
          $$ColaboradoresTableUpdateCompanionBuilder,
          (
            Colaborador,
            BaseReferences<_$AppDatabase, $ColaboradoresTable, Colaborador>,
          ),
          Colaborador,
          PrefetchHooks Function()
        > {
  $$ColaboradoresTableTableManager(_$AppDatabase db, $ColaboradoresTable table)
    : super(
        TableManagerState(
          db: db,
          table: table,
          createFilteringComposer: () =>
              $$ColaboradoresTableFilterComposer($db: db, $table: table),
          createOrderingComposer: () =>
              $$ColaboradoresTableOrderingComposer($db: db, $table: table),
          createComputedFieldComposer: () =>
              $$ColaboradoresTableAnnotationComposer($db: db, $table: table),
          updateCompanionCallback:
              ({
                Value<String> id = const Value.absent(),
                Value<String> nombre = const Value.absent(),
                Value<String> puestoId = const Value.absent(),
                Value<String> tipoPago = const Value.absent(),
                Value<String> telefono = const Value.absent(),
                Value<String> contactoNombre = const Value.absent(),
                Value<String> contactoTelefono = const Value.absent(),
                Value<String> contactoParentesco = const Value.absent(),
                Value<bool> activo = const Value.absent(),
                Value<double?> salarioPersonalizado = const Value.absent(),
                Value<int> rowid = const Value.absent(),
              }) => ColaboradoresCompanion(
                id: id,
                nombre: nombre,
                puestoId: puestoId,
                tipoPago: tipoPago,
                telefono: telefono,
                contactoNombre: contactoNombre,
                contactoTelefono: contactoTelefono,
                contactoParentesco: contactoParentesco,
                activo: activo,
                salarioPersonalizado: salarioPersonalizado,
                rowid: rowid,
              ),
          createCompanionCallback:
              ({
                required String id,
                required String nombre,
                required String puestoId,
                required String tipoPago,
                Value<String> telefono = const Value.absent(),
                Value<String> contactoNombre = const Value.absent(),
                Value<String> contactoTelefono = const Value.absent(),
                Value<String> contactoParentesco = const Value.absent(),
                Value<bool> activo = const Value.absent(),
                Value<double?> salarioPersonalizado = const Value.absent(),
                Value<int> rowid = const Value.absent(),
              }) => ColaboradoresCompanion.insert(
                id: id,
                nombre: nombre,
                puestoId: puestoId,
                tipoPago: tipoPago,
                telefono: telefono,
                contactoNombre: contactoNombre,
                contactoTelefono: contactoTelefono,
                contactoParentesco: contactoParentesco,
                activo: activo,
                salarioPersonalizado: salarioPersonalizado,
                rowid: rowid,
              ),
          withReferenceMapper: (p0) => p0
              .map((e) => (e.readTable(table), BaseReferences(db, table, e)))
              .toList(),
          prefetchHooksCallback: null,
        ),
      );
}

typedef $$ColaboradoresTableProcessedTableManager =
    ProcessedTableManager<
      _$AppDatabase,
      $ColaboradoresTable,
      Colaborador,
      $$ColaboradoresTableFilterComposer,
      $$ColaboradoresTableOrderingComposer,
      $$ColaboradoresTableAnnotationComposer,
      $$ColaboradoresTableCreateCompanionBuilder,
      $$ColaboradoresTableUpdateCompanionBuilder,
      (
        Colaborador,
        BaseReferences<_$AppDatabase, $ColaboradoresTable, Colaborador>,
      ),
      Colaborador,
      PrefetchHooks Function()
    >;
typedef $$ObraColaboradorTableCreateCompanionBuilder =
    ObraColaboradorCompanion Function({
      required String obraId,
      required String colaboradorId,
      required int fechaIngreso,
      Value<int?> fechaSalida,
      Value<double?> salarioDiaOverride,
      Value<int> rowid,
    });
typedef $$ObraColaboradorTableUpdateCompanionBuilder =
    ObraColaboradorCompanion Function({
      Value<String> obraId,
      Value<String> colaboradorId,
      Value<int> fechaIngreso,
      Value<int?> fechaSalida,
      Value<double?> salarioDiaOverride,
      Value<int> rowid,
    });

class $$ObraColaboradorTableFilterComposer
    extends Composer<_$AppDatabase, $ObraColaboradorTable> {
  $$ObraColaboradorTableFilterComposer({
    required super.$db,
    required super.$table,
    super.joinBuilder,
    super.$addJoinBuilderToRootComposer,
    super.$removeJoinBuilderFromRootComposer,
  });
  ColumnFilters<String> get obraId => $composableBuilder(
    column: $table.obraId,
    builder: (column) => ColumnFilters(column),
  );

  ColumnFilters<String> get colaboradorId => $composableBuilder(
    column: $table.colaboradorId,
    builder: (column) => ColumnFilters(column),
  );

  ColumnFilters<int> get fechaIngreso => $composableBuilder(
    column: $table.fechaIngreso,
    builder: (column) => ColumnFilters(column),
  );

  ColumnFilters<int> get fechaSalida => $composableBuilder(
    column: $table.fechaSalida,
    builder: (column) => ColumnFilters(column),
  );

  ColumnFilters<double> get salarioDiaOverride => $composableBuilder(
    column: $table.salarioDiaOverride,
    builder: (column) => ColumnFilters(column),
  );
}

class $$ObraColaboradorTableOrderingComposer
    extends Composer<_$AppDatabase, $ObraColaboradorTable> {
  $$ObraColaboradorTableOrderingComposer({
    required super.$db,
    required super.$table,
    super.joinBuilder,
    super.$addJoinBuilderToRootComposer,
    super.$removeJoinBuilderFromRootComposer,
  });
  ColumnOrderings<String> get obraId => $composableBuilder(
    column: $table.obraId,
    builder: (column) => ColumnOrderings(column),
  );

  ColumnOrderings<String> get colaboradorId => $composableBuilder(
    column: $table.colaboradorId,
    builder: (column) => ColumnOrderings(column),
  );

  ColumnOrderings<int> get fechaIngreso => $composableBuilder(
    column: $table.fechaIngreso,
    builder: (column) => ColumnOrderings(column),
  );

  ColumnOrderings<int> get fechaSalida => $composableBuilder(
    column: $table.fechaSalida,
    builder: (column) => ColumnOrderings(column),
  );

  ColumnOrderings<double> get salarioDiaOverride => $composableBuilder(
    column: $table.salarioDiaOverride,
    builder: (column) => ColumnOrderings(column),
  );
}

class $$ObraColaboradorTableAnnotationComposer
    extends Composer<_$AppDatabase, $ObraColaboradorTable> {
  $$ObraColaboradorTableAnnotationComposer({
    required super.$db,
    required super.$table,
    super.joinBuilder,
    super.$addJoinBuilderToRootComposer,
    super.$removeJoinBuilderFromRootComposer,
  });
  GeneratedColumn<String> get obraId =>
      $composableBuilder(column: $table.obraId, builder: (column) => column);

  GeneratedColumn<String> get colaboradorId => $composableBuilder(
    column: $table.colaboradorId,
    builder: (column) => column,
  );

  GeneratedColumn<int> get fechaIngreso => $composableBuilder(
    column: $table.fechaIngreso,
    builder: (column) => column,
  );

  GeneratedColumn<int> get fechaSalida => $composableBuilder(
    column: $table.fechaSalida,
    builder: (column) => column,
  );

  GeneratedColumn<double> get salarioDiaOverride => $composableBuilder(
    column: $table.salarioDiaOverride,
    builder: (column) => column,
  );
}

class $$ObraColaboradorTableTableManager
    extends
        RootTableManager<
          _$AppDatabase,
          $ObraColaboradorTable,
          ObraColaboradorData,
          $$ObraColaboradorTableFilterComposer,
          $$ObraColaboradorTableOrderingComposer,
          $$ObraColaboradorTableAnnotationComposer,
          $$ObraColaboradorTableCreateCompanionBuilder,
          $$ObraColaboradorTableUpdateCompanionBuilder,
          (
            ObraColaboradorData,
            BaseReferences<
              _$AppDatabase,
              $ObraColaboradorTable,
              ObraColaboradorData
            >,
          ),
          ObraColaboradorData,
          PrefetchHooks Function()
        > {
  $$ObraColaboradorTableTableManager(
    _$AppDatabase db,
    $ObraColaboradorTable table,
  ) : super(
        TableManagerState(
          db: db,
          table: table,
          createFilteringComposer: () =>
              $$ObraColaboradorTableFilterComposer($db: db, $table: table),
          createOrderingComposer: () =>
              $$ObraColaboradorTableOrderingComposer($db: db, $table: table),
          createComputedFieldComposer: () =>
              $$ObraColaboradorTableAnnotationComposer($db: db, $table: table),
          updateCompanionCallback:
              ({
                Value<String> obraId = const Value.absent(),
                Value<String> colaboradorId = const Value.absent(),
                Value<int> fechaIngreso = const Value.absent(),
                Value<int?> fechaSalida = const Value.absent(),
                Value<double?> salarioDiaOverride = const Value.absent(),
                Value<int> rowid = const Value.absent(),
              }) => ObraColaboradorCompanion(
                obraId: obraId,
                colaboradorId: colaboradorId,
                fechaIngreso: fechaIngreso,
                fechaSalida: fechaSalida,
                salarioDiaOverride: salarioDiaOverride,
                rowid: rowid,
              ),
          createCompanionCallback:
              ({
                required String obraId,
                required String colaboradorId,
                required int fechaIngreso,
                Value<int?> fechaSalida = const Value.absent(),
                Value<double?> salarioDiaOverride = const Value.absent(),
                Value<int> rowid = const Value.absent(),
              }) => ObraColaboradorCompanion.insert(
                obraId: obraId,
                colaboradorId: colaboradorId,
                fechaIngreso: fechaIngreso,
                fechaSalida: fechaSalida,
                salarioDiaOverride: salarioDiaOverride,
                rowid: rowid,
              ),
          withReferenceMapper: (p0) => p0
              .map((e) => (e.readTable(table), BaseReferences(db, table, e)))
              .toList(),
          prefetchHooksCallback: null,
        ),
      );
}

typedef $$ObraColaboradorTableProcessedTableManager =
    ProcessedTableManager<
      _$AppDatabase,
      $ObraColaboradorTable,
      ObraColaboradorData,
      $$ObraColaboradorTableFilterComposer,
      $$ObraColaboradorTableOrderingComposer,
      $$ObraColaboradorTableAnnotationComposer,
      $$ObraColaboradorTableCreateCompanionBuilder,
      $$ObraColaboradorTableUpdateCompanionBuilder,
      (
        ObraColaboradorData,
        BaseReferences<
          _$AppDatabase,
          $ObraColaboradorTable,
          ObraColaboradorData
        >,
      ),
      ObraColaboradorData,
      PrefetchHooks Function()
    >;
typedef $$AsistenciasTableCreateCompanionBuilder =
    AsistenciasCompanion Function({
      required String id,
      required String colaboradorId,
      required String obraId,
      required int fecha,
      required double fraccion,
      Value<int> rowid,
    });
typedef $$AsistenciasTableUpdateCompanionBuilder =
    AsistenciasCompanion Function({
      Value<String> id,
      Value<String> colaboradorId,
      Value<String> obraId,
      Value<int> fecha,
      Value<double> fraccion,
      Value<int> rowid,
    });

class $$AsistenciasTableFilterComposer
    extends Composer<_$AppDatabase, $AsistenciasTable> {
  $$AsistenciasTableFilterComposer({
    required super.$db,
    required super.$table,
    super.joinBuilder,
    super.$addJoinBuilderToRootComposer,
    super.$removeJoinBuilderFromRootComposer,
  });
  ColumnFilters<String> get id => $composableBuilder(
    column: $table.id,
    builder: (column) => ColumnFilters(column),
  );

  ColumnFilters<String> get colaboradorId => $composableBuilder(
    column: $table.colaboradorId,
    builder: (column) => ColumnFilters(column),
  );

  ColumnFilters<String> get obraId => $composableBuilder(
    column: $table.obraId,
    builder: (column) => ColumnFilters(column),
  );

  ColumnFilters<int> get fecha => $composableBuilder(
    column: $table.fecha,
    builder: (column) => ColumnFilters(column),
  );

  ColumnFilters<double> get fraccion => $composableBuilder(
    column: $table.fraccion,
    builder: (column) => ColumnFilters(column),
  );
}

class $$AsistenciasTableOrderingComposer
    extends Composer<_$AppDatabase, $AsistenciasTable> {
  $$AsistenciasTableOrderingComposer({
    required super.$db,
    required super.$table,
    super.joinBuilder,
    super.$addJoinBuilderToRootComposer,
    super.$removeJoinBuilderFromRootComposer,
  });
  ColumnOrderings<String> get id => $composableBuilder(
    column: $table.id,
    builder: (column) => ColumnOrderings(column),
  );

  ColumnOrderings<String> get colaboradorId => $composableBuilder(
    column: $table.colaboradorId,
    builder: (column) => ColumnOrderings(column),
  );

  ColumnOrderings<String> get obraId => $composableBuilder(
    column: $table.obraId,
    builder: (column) => ColumnOrderings(column),
  );

  ColumnOrderings<int> get fecha => $composableBuilder(
    column: $table.fecha,
    builder: (column) => ColumnOrderings(column),
  );

  ColumnOrderings<double> get fraccion => $composableBuilder(
    column: $table.fraccion,
    builder: (column) => ColumnOrderings(column),
  );
}

class $$AsistenciasTableAnnotationComposer
    extends Composer<_$AppDatabase, $AsistenciasTable> {
  $$AsistenciasTableAnnotationComposer({
    required super.$db,
    required super.$table,
    super.joinBuilder,
    super.$addJoinBuilderToRootComposer,
    super.$removeJoinBuilderFromRootComposer,
  });
  GeneratedColumn<String> get id =>
      $composableBuilder(column: $table.id, builder: (column) => column);

  GeneratedColumn<String> get colaboradorId => $composableBuilder(
    column: $table.colaboradorId,
    builder: (column) => column,
  );

  GeneratedColumn<String> get obraId =>
      $composableBuilder(column: $table.obraId, builder: (column) => column);

  GeneratedColumn<int> get fecha =>
      $composableBuilder(column: $table.fecha, builder: (column) => column);

  GeneratedColumn<double> get fraccion =>
      $composableBuilder(column: $table.fraccion, builder: (column) => column);
}

class $$AsistenciasTableTableManager
    extends
        RootTableManager<
          _$AppDatabase,
          $AsistenciasTable,
          Asistencia,
          $$AsistenciasTableFilterComposer,
          $$AsistenciasTableOrderingComposer,
          $$AsistenciasTableAnnotationComposer,
          $$AsistenciasTableCreateCompanionBuilder,
          $$AsistenciasTableUpdateCompanionBuilder,
          (
            Asistencia,
            BaseReferences<_$AppDatabase, $AsistenciasTable, Asistencia>,
          ),
          Asistencia,
          PrefetchHooks Function()
        > {
  $$AsistenciasTableTableManager(_$AppDatabase db, $AsistenciasTable table)
    : super(
        TableManagerState(
          db: db,
          table: table,
          createFilteringComposer: () =>
              $$AsistenciasTableFilterComposer($db: db, $table: table),
          createOrderingComposer: () =>
              $$AsistenciasTableOrderingComposer($db: db, $table: table),
          createComputedFieldComposer: () =>
              $$AsistenciasTableAnnotationComposer($db: db, $table: table),
          updateCompanionCallback:
              ({
                Value<String> id = const Value.absent(),
                Value<String> colaboradorId = const Value.absent(),
                Value<String> obraId = const Value.absent(),
                Value<int> fecha = const Value.absent(),
                Value<double> fraccion = const Value.absent(),
                Value<int> rowid = const Value.absent(),
              }) => AsistenciasCompanion(
                id: id,
                colaboradorId: colaboradorId,
                obraId: obraId,
                fecha: fecha,
                fraccion: fraccion,
                rowid: rowid,
              ),
          createCompanionCallback:
              ({
                required String id,
                required String colaboradorId,
                required String obraId,
                required int fecha,
                required double fraccion,
                Value<int> rowid = const Value.absent(),
              }) => AsistenciasCompanion.insert(
                id: id,
                colaboradorId: colaboradorId,
                obraId: obraId,
                fecha: fecha,
                fraccion: fraccion,
                rowid: rowid,
              ),
          withReferenceMapper: (p0) => p0
              .map((e) => (e.readTable(table), BaseReferences(db, table, e)))
              .toList(),
          prefetchHooksCallback: null,
        ),
      );
}

typedef $$AsistenciasTableProcessedTableManager =
    ProcessedTableManager<
      _$AppDatabase,
      $AsistenciasTable,
      Asistencia,
      $$AsistenciasTableFilterComposer,
      $$AsistenciasTableOrderingComposer,
      $$AsistenciasTableAnnotationComposer,
      $$AsistenciasTableCreateCompanionBuilder,
      $$AsistenciasTableUpdateCompanionBuilder,
      (
        Asistencia,
        BaseReferences<_$AppDatabase, $AsistenciasTable, Asistencia>,
      ),
      Asistencia,
      PrefetchHooks Function()
    >;
typedef $$DestajosTableCreateCompanionBuilder =
    DestajosCompanion Function({
      required String id,
      required String colaboradorId,
      required String obraId,
      required int fecha,
      required String concepto,
      required double monto,
      Value<int> rowid,
    });
typedef $$DestajosTableUpdateCompanionBuilder =
    DestajosCompanion Function({
      Value<String> id,
      Value<String> colaboradorId,
      Value<String> obraId,
      Value<int> fecha,
      Value<String> concepto,
      Value<double> monto,
      Value<int> rowid,
    });

class $$DestajosTableFilterComposer
    extends Composer<_$AppDatabase, $DestajosTable> {
  $$DestajosTableFilterComposer({
    required super.$db,
    required super.$table,
    super.joinBuilder,
    super.$addJoinBuilderToRootComposer,
    super.$removeJoinBuilderFromRootComposer,
  });
  ColumnFilters<String> get id => $composableBuilder(
    column: $table.id,
    builder: (column) => ColumnFilters(column),
  );

  ColumnFilters<String> get colaboradorId => $composableBuilder(
    column: $table.colaboradorId,
    builder: (column) => ColumnFilters(column),
  );

  ColumnFilters<String> get obraId => $composableBuilder(
    column: $table.obraId,
    builder: (column) => ColumnFilters(column),
  );

  ColumnFilters<int> get fecha => $composableBuilder(
    column: $table.fecha,
    builder: (column) => ColumnFilters(column),
  );

  ColumnFilters<String> get concepto => $composableBuilder(
    column: $table.concepto,
    builder: (column) => ColumnFilters(column),
  );

  ColumnFilters<double> get monto => $composableBuilder(
    column: $table.monto,
    builder: (column) => ColumnFilters(column),
  );
}

class $$DestajosTableOrderingComposer
    extends Composer<_$AppDatabase, $DestajosTable> {
  $$DestajosTableOrderingComposer({
    required super.$db,
    required super.$table,
    super.joinBuilder,
    super.$addJoinBuilderToRootComposer,
    super.$removeJoinBuilderFromRootComposer,
  });
  ColumnOrderings<String> get id => $composableBuilder(
    column: $table.id,
    builder: (column) => ColumnOrderings(column),
  );

  ColumnOrderings<String> get colaboradorId => $composableBuilder(
    column: $table.colaboradorId,
    builder: (column) => ColumnOrderings(column),
  );

  ColumnOrderings<String> get obraId => $composableBuilder(
    column: $table.obraId,
    builder: (column) => ColumnOrderings(column),
  );

  ColumnOrderings<int> get fecha => $composableBuilder(
    column: $table.fecha,
    builder: (column) => ColumnOrderings(column),
  );

  ColumnOrderings<String> get concepto => $composableBuilder(
    column: $table.concepto,
    builder: (column) => ColumnOrderings(column),
  );

  ColumnOrderings<double> get monto => $composableBuilder(
    column: $table.monto,
    builder: (column) => ColumnOrderings(column),
  );
}

class $$DestajosTableAnnotationComposer
    extends Composer<_$AppDatabase, $DestajosTable> {
  $$DestajosTableAnnotationComposer({
    required super.$db,
    required super.$table,
    super.joinBuilder,
    super.$addJoinBuilderToRootComposer,
    super.$removeJoinBuilderFromRootComposer,
  });
  GeneratedColumn<String> get id =>
      $composableBuilder(column: $table.id, builder: (column) => column);

  GeneratedColumn<String> get colaboradorId => $composableBuilder(
    column: $table.colaboradorId,
    builder: (column) => column,
  );

  GeneratedColumn<String> get obraId =>
      $composableBuilder(column: $table.obraId, builder: (column) => column);

  GeneratedColumn<int> get fecha =>
      $composableBuilder(column: $table.fecha, builder: (column) => column);

  GeneratedColumn<String> get concepto =>
      $composableBuilder(column: $table.concepto, builder: (column) => column);

  GeneratedColumn<double> get monto =>
      $composableBuilder(column: $table.monto, builder: (column) => column);
}

class $$DestajosTableTableManager
    extends
        RootTableManager<
          _$AppDatabase,
          $DestajosTable,
          Destajo,
          $$DestajosTableFilterComposer,
          $$DestajosTableOrderingComposer,
          $$DestajosTableAnnotationComposer,
          $$DestajosTableCreateCompanionBuilder,
          $$DestajosTableUpdateCompanionBuilder,
          (Destajo, BaseReferences<_$AppDatabase, $DestajosTable, Destajo>),
          Destajo,
          PrefetchHooks Function()
        > {
  $$DestajosTableTableManager(_$AppDatabase db, $DestajosTable table)
    : super(
        TableManagerState(
          db: db,
          table: table,
          createFilteringComposer: () =>
              $$DestajosTableFilterComposer($db: db, $table: table),
          createOrderingComposer: () =>
              $$DestajosTableOrderingComposer($db: db, $table: table),
          createComputedFieldComposer: () =>
              $$DestajosTableAnnotationComposer($db: db, $table: table),
          updateCompanionCallback:
              ({
                Value<String> id = const Value.absent(),
                Value<String> colaboradorId = const Value.absent(),
                Value<String> obraId = const Value.absent(),
                Value<int> fecha = const Value.absent(),
                Value<String> concepto = const Value.absent(),
                Value<double> monto = const Value.absent(),
                Value<int> rowid = const Value.absent(),
              }) => DestajosCompanion(
                id: id,
                colaboradorId: colaboradorId,
                obraId: obraId,
                fecha: fecha,
                concepto: concepto,
                monto: monto,
                rowid: rowid,
              ),
          createCompanionCallback:
              ({
                required String id,
                required String colaboradorId,
                required String obraId,
                required int fecha,
                required String concepto,
                required double monto,
                Value<int> rowid = const Value.absent(),
              }) => DestajosCompanion.insert(
                id: id,
                colaboradorId: colaboradorId,
                obraId: obraId,
                fecha: fecha,
                concepto: concepto,
                monto: monto,
                rowid: rowid,
              ),
          withReferenceMapper: (p0) => p0
              .map((e) => (e.readTable(table), BaseReferences(db, table, e)))
              .toList(),
          prefetchHooksCallback: null,
        ),
      );
}

typedef $$DestajosTableProcessedTableManager =
    ProcessedTableManager<
      _$AppDatabase,
      $DestajosTable,
      Destajo,
      $$DestajosTableFilterComposer,
      $$DestajosTableOrderingComposer,
      $$DestajosTableAnnotationComposer,
      $$DestajosTableCreateCompanionBuilder,
      $$DestajosTableUpdateCompanionBuilder,
      (Destajo, BaseReferences<_$AppDatabase, $DestajosTable, Destajo>),
      Destajo,
      PrefetchHooks Function()
    >;
typedef $$CotizacionesTableCreateCompanionBuilder =
    CotizacionesCompanion Function({
      required String id,
      required String cliente,
      required String nombreProyecto,
      Value<String> ubicacion,
      required int fecha,
      Value<String> estado,
      Value<bool> ivaEnabled,
      Value<double> descuento,
      Value<String> notas,
      Value<String?> obraId,
      Value<String?> pdfConfigJson,
      Value<int> rowid,
    });
typedef $$CotizacionesTableUpdateCompanionBuilder =
    CotizacionesCompanion Function({
      Value<String> id,
      Value<String> cliente,
      Value<String> nombreProyecto,
      Value<String> ubicacion,
      Value<int> fecha,
      Value<String> estado,
      Value<bool> ivaEnabled,
      Value<double> descuento,
      Value<String> notas,
      Value<String?> obraId,
      Value<String?> pdfConfigJson,
      Value<int> rowid,
    });

class $$CotizacionesTableFilterComposer
    extends Composer<_$AppDatabase, $CotizacionesTable> {
  $$CotizacionesTableFilterComposer({
    required super.$db,
    required super.$table,
    super.joinBuilder,
    super.$addJoinBuilderToRootComposer,
    super.$removeJoinBuilderFromRootComposer,
  });
  ColumnFilters<String> get id => $composableBuilder(
    column: $table.id,
    builder: (column) => ColumnFilters(column),
  );

  ColumnFilters<String> get cliente => $composableBuilder(
    column: $table.cliente,
    builder: (column) => ColumnFilters(column),
  );

  ColumnFilters<String> get nombreProyecto => $composableBuilder(
    column: $table.nombreProyecto,
    builder: (column) => ColumnFilters(column),
  );

  ColumnFilters<String> get ubicacion => $composableBuilder(
    column: $table.ubicacion,
    builder: (column) => ColumnFilters(column),
  );

  ColumnFilters<int> get fecha => $composableBuilder(
    column: $table.fecha,
    builder: (column) => ColumnFilters(column),
  );

  ColumnFilters<String> get estado => $composableBuilder(
    column: $table.estado,
    builder: (column) => ColumnFilters(column),
  );

  ColumnFilters<bool> get ivaEnabled => $composableBuilder(
    column: $table.ivaEnabled,
    builder: (column) => ColumnFilters(column),
  );

  ColumnFilters<double> get descuento => $composableBuilder(
    column: $table.descuento,
    builder: (column) => ColumnFilters(column),
  );

  ColumnFilters<String> get notas => $composableBuilder(
    column: $table.notas,
    builder: (column) => ColumnFilters(column),
  );

  ColumnFilters<String> get obraId => $composableBuilder(
    column: $table.obraId,
    builder: (column) => ColumnFilters(column),
  );

  ColumnFilters<String> get pdfConfigJson => $composableBuilder(
    column: $table.pdfConfigJson,
    builder: (column) => ColumnFilters(column),
  );
}

class $$CotizacionesTableOrderingComposer
    extends Composer<_$AppDatabase, $CotizacionesTable> {
  $$CotizacionesTableOrderingComposer({
    required super.$db,
    required super.$table,
    super.joinBuilder,
    super.$addJoinBuilderToRootComposer,
    super.$removeJoinBuilderFromRootComposer,
  });
  ColumnOrderings<String> get id => $composableBuilder(
    column: $table.id,
    builder: (column) => ColumnOrderings(column),
  );

  ColumnOrderings<String> get cliente => $composableBuilder(
    column: $table.cliente,
    builder: (column) => ColumnOrderings(column),
  );

  ColumnOrderings<String> get nombreProyecto => $composableBuilder(
    column: $table.nombreProyecto,
    builder: (column) => ColumnOrderings(column),
  );

  ColumnOrderings<String> get ubicacion => $composableBuilder(
    column: $table.ubicacion,
    builder: (column) => ColumnOrderings(column),
  );

  ColumnOrderings<int> get fecha => $composableBuilder(
    column: $table.fecha,
    builder: (column) => ColumnOrderings(column),
  );

  ColumnOrderings<String> get estado => $composableBuilder(
    column: $table.estado,
    builder: (column) => ColumnOrderings(column),
  );

  ColumnOrderings<bool> get ivaEnabled => $composableBuilder(
    column: $table.ivaEnabled,
    builder: (column) => ColumnOrderings(column),
  );

  ColumnOrderings<double> get descuento => $composableBuilder(
    column: $table.descuento,
    builder: (column) => ColumnOrderings(column),
  );

  ColumnOrderings<String> get notas => $composableBuilder(
    column: $table.notas,
    builder: (column) => ColumnOrderings(column),
  );

  ColumnOrderings<String> get obraId => $composableBuilder(
    column: $table.obraId,
    builder: (column) => ColumnOrderings(column),
  );

  ColumnOrderings<String> get pdfConfigJson => $composableBuilder(
    column: $table.pdfConfigJson,
    builder: (column) => ColumnOrderings(column),
  );
}

class $$CotizacionesTableAnnotationComposer
    extends Composer<_$AppDatabase, $CotizacionesTable> {
  $$CotizacionesTableAnnotationComposer({
    required super.$db,
    required super.$table,
    super.joinBuilder,
    super.$addJoinBuilderToRootComposer,
    super.$removeJoinBuilderFromRootComposer,
  });
  GeneratedColumn<String> get id =>
      $composableBuilder(column: $table.id, builder: (column) => column);

  GeneratedColumn<String> get cliente =>
      $composableBuilder(column: $table.cliente, builder: (column) => column);

  GeneratedColumn<String> get nombreProyecto => $composableBuilder(
    column: $table.nombreProyecto,
    builder: (column) => column,
  );

  GeneratedColumn<String> get ubicacion =>
      $composableBuilder(column: $table.ubicacion, builder: (column) => column);

  GeneratedColumn<int> get fecha =>
      $composableBuilder(column: $table.fecha, builder: (column) => column);

  GeneratedColumn<String> get estado =>
      $composableBuilder(column: $table.estado, builder: (column) => column);

  GeneratedColumn<bool> get ivaEnabled => $composableBuilder(
    column: $table.ivaEnabled,
    builder: (column) => column,
  );

  GeneratedColumn<double> get descuento =>
      $composableBuilder(column: $table.descuento, builder: (column) => column);

  GeneratedColumn<String> get notas =>
      $composableBuilder(column: $table.notas, builder: (column) => column);

  GeneratedColumn<String> get obraId =>
      $composableBuilder(column: $table.obraId, builder: (column) => column);

  GeneratedColumn<String> get pdfConfigJson => $composableBuilder(
    column: $table.pdfConfigJson,
    builder: (column) => column,
  );
}

class $$CotizacionesTableTableManager
    extends
        RootTableManager<
          _$AppDatabase,
          $CotizacionesTable,
          Cotizacion,
          $$CotizacionesTableFilterComposer,
          $$CotizacionesTableOrderingComposer,
          $$CotizacionesTableAnnotationComposer,
          $$CotizacionesTableCreateCompanionBuilder,
          $$CotizacionesTableUpdateCompanionBuilder,
          (
            Cotizacion,
            BaseReferences<_$AppDatabase, $CotizacionesTable, Cotizacion>,
          ),
          Cotizacion,
          PrefetchHooks Function()
        > {
  $$CotizacionesTableTableManager(_$AppDatabase db, $CotizacionesTable table)
    : super(
        TableManagerState(
          db: db,
          table: table,
          createFilteringComposer: () =>
              $$CotizacionesTableFilterComposer($db: db, $table: table),
          createOrderingComposer: () =>
              $$CotizacionesTableOrderingComposer($db: db, $table: table),
          createComputedFieldComposer: () =>
              $$CotizacionesTableAnnotationComposer($db: db, $table: table),
          updateCompanionCallback:
              ({
                Value<String> id = const Value.absent(),
                Value<String> cliente = const Value.absent(),
                Value<String> nombreProyecto = const Value.absent(),
                Value<String> ubicacion = const Value.absent(),
                Value<int> fecha = const Value.absent(),
                Value<String> estado = const Value.absent(),
                Value<bool> ivaEnabled = const Value.absent(),
                Value<double> descuento = const Value.absent(),
                Value<String> notas = const Value.absent(),
                Value<String?> obraId = const Value.absent(),
                Value<String?> pdfConfigJson = const Value.absent(),
                Value<int> rowid = const Value.absent(),
              }) => CotizacionesCompanion(
                id: id,
                cliente: cliente,
                nombreProyecto: nombreProyecto,
                ubicacion: ubicacion,
                fecha: fecha,
                estado: estado,
                ivaEnabled: ivaEnabled,
                descuento: descuento,
                notas: notas,
                obraId: obraId,
                pdfConfigJson: pdfConfigJson,
                rowid: rowid,
              ),
          createCompanionCallback:
              ({
                required String id,
                required String cliente,
                required String nombreProyecto,
                Value<String> ubicacion = const Value.absent(),
                required int fecha,
                Value<String> estado = const Value.absent(),
                Value<bool> ivaEnabled = const Value.absent(),
                Value<double> descuento = const Value.absent(),
                Value<String> notas = const Value.absent(),
                Value<String?> obraId = const Value.absent(),
                Value<String?> pdfConfigJson = const Value.absent(),
                Value<int> rowid = const Value.absent(),
              }) => CotizacionesCompanion.insert(
                id: id,
                cliente: cliente,
                nombreProyecto: nombreProyecto,
                ubicacion: ubicacion,
                fecha: fecha,
                estado: estado,
                ivaEnabled: ivaEnabled,
                descuento: descuento,
                notas: notas,
                obraId: obraId,
                pdfConfigJson: pdfConfigJson,
                rowid: rowid,
              ),
          withReferenceMapper: (p0) => p0
              .map((e) => (e.readTable(table), BaseReferences(db, table, e)))
              .toList(),
          prefetchHooksCallback: null,
        ),
      );
}

typedef $$CotizacionesTableProcessedTableManager =
    ProcessedTableManager<
      _$AppDatabase,
      $CotizacionesTable,
      Cotizacion,
      $$CotizacionesTableFilterComposer,
      $$CotizacionesTableOrderingComposer,
      $$CotizacionesTableAnnotationComposer,
      $$CotizacionesTableCreateCompanionBuilder,
      $$CotizacionesTableUpdateCompanionBuilder,
      (
        Cotizacion,
        BaseReferences<_$AppDatabase, $CotizacionesTable, Cotizacion>,
      ),
      Cotizacion,
      PrefetchHooks Function()
    >;
typedef $$SeccionesTableCreateCompanionBuilder =
    SeccionesCompanion Function({
      required String id,
      required String cotizacionId,
      required String nombre,
      Value<int> orden,
      Value<int> rowid,
    });
typedef $$SeccionesTableUpdateCompanionBuilder =
    SeccionesCompanion Function({
      Value<String> id,
      Value<String> cotizacionId,
      Value<String> nombre,
      Value<int> orden,
      Value<int> rowid,
    });

class $$SeccionesTableFilterComposer
    extends Composer<_$AppDatabase, $SeccionesTable> {
  $$SeccionesTableFilterComposer({
    required super.$db,
    required super.$table,
    super.joinBuilder,
    super.$addJoinBuilderToRootComposer,
    super.$removeJoinBuilderFromRootComposer,
  });
  ColumnFilters<String> get id => $composableBuilder(
    column: $table.id,
    builder: (column) => ColumnFilters(column),
  );

  ColumnFilters<String> get cotizacionId => $composableBuilder(
    column: $table.cotizacionId,
    builder: (column) => ColumnFilters(column),
  );

  ColumnFilters<String> get nombre => $composableBuilder(
    column: $table.nombre,
    builder: (column) => ColumnFilters(column),
  );

  ColumnFilters<int> get orden => $composableBuilder(
    column: $table.orden,
    builder: (column) => ColumnFilters(column),
  );
}

class $$SeccionesTableOrderingComposer
    extends Composer<_$AppDatabase, $SeccionesTable> {
  $$SeccionesTableOrderingComposer({
    required super.$db,
    required super.$table,
    super.joinBuilder,
    super.$addJoinBuilderToRootComposer,
    super.$removeJoinBuilderFromRootComposer,
  });
  ColumnOrderings<String> get id => $composableBuilder(
    column: $table.id,
    builder: (column) => ColumnOrderings(column),
  );

  ColumnOrderings<String> get cotizacionId => $composableBuilder(
    column: $table.cotizacionId,
    builder: (column) => ColumnOrderings(column),
  );

  ColumnOrderings<String> get nombre => $composableBuilder(
    column: $table.nombre,
    builder: (column) => ColumnOrderings(column),
  );

  ColumnOrderings<int> get orden => $composableBuilder(
    column: $table.orden,
    builder: (column) => ColumnOrderings(column),
  );
}

class $$SeccionesTableAnnotationComposer
    extends Composer<_$AppDatabase, $SeccionesTable> {
  $$SeccionesTableAnnotationComposer({
    required super.$db,
    required super.$table,
    super.joinBuilder,
    super.$addJoinBuilderToRootComposer,
    super.$removeJoinBuilderFromRootComposer,
  });
  GeneratedColumn<String> get id =>
      $composableBuilder(column: $table.id, builder: (column) => column);

  GeneratedColumn<String> get cotizacionId => $composableBuilder(
    column: $table.cotizacionId,
    builder: (column) => column,
  );

  GeneratedColumn<String> get nombre =>
      $composableBuilder(column: $table.nombre, builder: (column) => column);

  GeneratedColumn<int> get orden =>
      $composableBuilder(column: $table.orden, builder: (column) => column);
}

class $$SeccionesTableTableManager
    extends
        RootTableManager<
          _$AppDatabase,
          $SeccionesTable,
          Seccion,
          $$SeccionesTableFilterComposer,
          $$SeccionesTableOrderingComposer,
          $$SeccionesTableAnnotationComposer,
          $$SeccionesTableCreateCompanionBuilder,
          $$SeccionesTableUpdateCompanionBuilder,
          (Seccion, BaseReferences<_$AppDatabase, $SeccionesTable, Seccion>),
          Seccion,
          PrefetchHooks Function()
        > {
  $$SeccionesTableTableManager(_$AppDatabase db, $SeccionesTable table)
    : super(
        TableManagerState(
          db: db,
          table: table,
          createFilteringComposer: () =>
              $$SeccionesTableFilterComposer($db: db, $table: table),
          createOrderingComposer: () =>
              $$SeccionesTableOrderingComposer($db: db, $table: table),
          createComputedFieldComposer: () =>
              $$SeccionesTableAnnotationComposer($db: db, $table: table),
          updateCompanionCallback:
              ({
                Value<String> id = const Value.absent(),
                Value<String> cotizacionId = const Value.absent(),
                Value<String> nombre = const Value.absent(),
                Value<int> orden = const Value.absent(),
                Value<int> rowid = const Value.absent(),
              }) => SeccionesCompanion(
                id: id,
                cotizacionId: cotizacionId,
                nombre: nombre,
                orden: orden,
                rowid: rowid,
              ),
          createCompanionCallback:
              ({
                required String id,
                required String cotizacionId,
                required String nombre,
                Value<int> orden = const Value.absent(),
                Value<int> rowid = const Value.absent(),
              }) => SeccionesCompanion.insert(
                id: id,
                cotizacionId: cotizacionId,
                nombre: nombre,
                orden: orden,
                rowid: rowid,
              ),
          withReferenceMapper: (p0) => p0
              .map((e) => (e.readTable(table), BaseReferences(db, table, e)))
              .toList(),
          prefetchHooksCallback: null,
        ),
      );
}

typedef $$SeccionesTableProcessedTableManager =
    ProcessedTableManager<
      _$AppDatabase,
      $SeccionesTable,
      Seccion,
      $$SeccionesTableFilterComposer,
      $$SeccionesTableOrderingComposer,
      $$SeccionesTableAnnotationComposer,
      $$SeccionesTableCreateCompanionBuilder,
      $$SeccionesTableUpdateCompanionBuilder,
      (Seccion, BaseReferences<_$AppDatabase, $SeccionesTable, Seccion>),
      Seccion,
      PrefetchHooks Function()
    >;
typedef $$PartidasTableCreateCompanionBuilder =
    PartidasCompanion Function({
      required String id,
      required String seccionId,
      Value<String> clave,
      required String descripcion,
      Value<String> unidad,
      required double cantidad,
      required double precioUnitario,
      Value<int> orden,
      Value<int> rowid,
    });
typedef $$PartidasTableUpdateCompanionBuilder =
    PartidasCompanion Function({
      Value<String> id,
      Value<String> seccionId,
      Value<String> clave,
      Value<String> descripcion,
      Value<String> unidad,
      Value<double> cantidad,
      Value<double> precioUnitario,
      Value<int> orden,
      Value<int> rowid,
    });

class $$PartidasTableFilterComposer
    extends Composer<_$AppDatabase, $PartidasTable> {
  $$PartidasTableFilterComposer({
    required super.$db,
    required super.$table,
    super.joinBuilder,
    super.$addJoinBuilderToRootComposer,
    super.$removeJoinBuilderFromRootComposer,
  });
  ColumnFilters<String> get id => $composableBuilder(
    column: $table.id,
    builder: (column) => ColumnFilters(column),
  );

  ColumnFilters<String> get seccionId => $composableBuilder(
    column: $table.seccionId,
    builder: (column) => ColumnFilters(column),
  );

  ColumnFilters<String> get clave => $composableBuilder(
    column: $table.clave,
    builder: (column) => ColumnFilters(column),
  );

  ColumnFilters<String> get descripcion => $composableBuilder(
    column: $table.descripcion,
    builder: (column) => ColumnFilters(column),
  );

  ColumnFilters<String> get unidad => $composableBuilder(
    column: $table.unidad,
    builder: (column) => ColumnFilters(column),
  );

  ColumnFilters<double> get cantidad => $composableBuilder(
    column: $table.cantidad,
    builder: (column) => ColumnFilters(column),
  );

  ColumnFilters<double> get precioUnitario => $composableBuilder(
    column: $table.precioUnitario,
    builder: (column) => ColumnFilters(column),
  );

  ColumnFilters<int> get orden => $composableBuilder(
    column: $table.orden,
    builder: (column) => ColumnFilters(column),
  );
}

class $$PartidasTableOrderingComposer
    extends Composer<_$AppDatabase, $PartidasTable> {
  $$PartidasTableOrderingComposer({
    required super.$db,
    required super.$table,
    super.joinBuilder,
    super.$addJoinBuilderToRootComposer,
    super.$removeJoinBuilderFromRootComposer,
  });
  ColumnOrderings<String> get id => $composableBuilder(
    column: $table.id,
    builder: (column) => ColumnOrderings(column),
  );

  ColumnOrderings<String> get seccionId => $composableBuilder(
    column: $table.seccionId,
    builder: (column) => ColumnOrderings(column),
  );

  ColumnOrderings<String> get clave => $composableBuilder(
    column: $table.clave,
    builder: (column) => ColumnOrderings(column),
  );

  ColumnOrderings<String> get descripcion => $composableBuilder(
    column: $table.descripcion,
    builder: (column) => ColumnOrderings(column),
  );

  ColumnOrderings<String> get unidad => $composableBuilder(
    column: $table.unidad,
    builder: (column) => ColumnOrderings(column),
  );

  ColumnOrderings<double> get cantidad => $composableBuilder(
    column: $table.cantidad,
    builder: (column) => ColumnOrderings(column),
  );

  ColumnOrderings<double> get precioUnitario => $composableBuilder(
    column: $table.precioUnitario,
    builder: (column) => ColumnOrderings(column),
  );

  ColumnOrderings<int> get orden => $composableBuilder(
    column: $table.orden,
    builder: (column) => ColumnOrderings(column),
  );
}

class $$PartidasTableAnnotationComposer
    extends Composer<_$AppDatabase, $PartidasTable> {
  $$PartidasTableAnnotationComposer({
    required super.$db,
    required super.$table,
    super.joinBuilder,
    super.$addJoinBuilderToRootComposer,
    super.$removeJoinBuilderFromRootComposer,
  });
  GeneratedColumn<String> get id =>
      $composableBuilder(column: $table.id, builder: (column) => column);

  GeneratedColumn<String> get seccionId =>
      $composableBuilder(column: $table.seccionId, builder: (column) => column);

  GeneratedColumn<String> get clave =>
      $composableBuilder(column: $table.clave, builder: (column) => column);

  GeneratedColumn<String> get descripcion => $composableBuilder(
    column: $table.descripcion,
    builder: (column) => column,
  );

  GeneratedColumn<String> get unidad =>
      $composableBuilder(column: $table.unidad, builder: (column) => column);

  GeneratedColumn<double> get cantidad =>
      $composableBuilder(column: $table.cantidad, builder: (column) => column);

  GeneratedColumn<double> get precioUnitario => $composableBuilder(
    column: $table.precioUnitario,
    builder: (column) => column,
  );

  GeneratedColumn<int> get orden =>
      $composableBuilder(column: $table.orden, builder: (column) => column);
}

class $$PartidasTableTableManager
    extends
        RootTableManager<
          _$AppDatabase,
          $PartidasTable,
          Partida,
          $$PartidasTableFilterComposer,
          $$PartidasTableOrderingComposer,
          $$PartidasTableAnnotationComposer,
          $$PartidasTableCreateCompanionBuilder,
          $$PartidasTableUpdateCompanionBuilder,
          (Partida, BaseReferences<_$AppDatabase, $PartidasTable, Partida>),
          Partida,
          PrefetchHooks Function()
        > {
  $$PartidasTableTableManager(_$AppDatabase db, $PartidasTable table)
    : super(
        TableManagerState(
          db: db,
          table: table,
          createFilteringComposer: () =>
              $$PartidasTableFilterComposer($db: db, $table: table),
          createOrderingComposer: () =>
              $$PartidasTableOrderingComposer($db: db, $table: table),
          createComputedFieldComposer: () =>
              $$PartidasTableAnnotationComposer($db: db, $table: table),
          updateCompanionCallback:
              ({
                Value<String> id = const Value.absent(),
                Value<String> seccionId = const Value.absent(),
                Value<String> clave = const Value.absent(),
                Value<String> descripcion = const Value.absent(),
                Value<String> unidad = const Value.absent(),
                Value<double> cantidad = const Value.absent(),
                Value<double> precioUnitario = const Value.absent(),
                Value<int> orden = const Value.absent(),
                Value<int> rowid = const Value.absent(),
              }) => PartidasCompanion(
                id: id,
                seccionId: seccionId,
                clave: clave,
                descripcion: descripcion,
                unidad: unidad,
                cantidad: cantidad,
                precioUnitario: precioUnitario,
                orden: orden,
                rowid: rowid,
              ),
          createCompanionCallback:
              ({
                required String id,
                required String seccionId,
                Value<String> clave = const Value.absent(),
                required String descripcion,
                Value<String> unidad = const Value.absent(),
                required double cantidad,
                required double precioUnitario,
                Value<int> orden = const Value.absent(),
                Value<int> rowid = const Value.absent(),
              }) => PartidasCompanion.insert(
                id: id,
                seccionId: seccionId,
                clave: clave,
                descripcion: descripcion,
                unidad: unidad,
                cantidad: cantidad,
                precioUnitario: precioUnitario,
                orden: orden,
                rowid: rowid,
              ),
          withReferenceMapper: (p0) => p0
              .map((e) => (e.readTable(table), BaseReferences(db, table, e)))
              .toList(),
          prefetchHooksCallback: null,
        ),
      );
}

typedef $$PartidasTableProcessedTableManager =
    ProcessedTableManager<
      _$AppDatabase,
      $PartidasTable,
      Partida,
      $$PartidasTableFilterComposer,
      $$PartidasTableOrderingComposer,
      $$PartidasTableAnnotationComposer,
      $$PartidasTableCreateCompanionBuilder,
      $$PartidasTableUpdateCompanionBuilder,
      (Partida, BaseReferences<_$AppDatabase, $PartidasTable, Partida>),
      Partida,
      PrefetchHooks Function()
    >;
typedef $$PagosTableCreateCompanionBuilder =
    PagosCompanion Function({
      required String id,
      required String cotizacionId,
      required int fecha,
      required double monto,
      required String metodo,
      required String concepto,
      Value<String?> referencia,
      Value<int> rowid,
    });
typedef $$PagosTableUpdateCompanionBuilder =
    PagosCompanion Function({
      Value<String> id,
      Value<String> cotizacionId,
      Value<int> fecha,
      Value<double> monto,
      Value<String> metodo,
      Value<String> concepto,
      Value<String?> referencia,
      Value<int> rowid,
    });

class $$PagosTableFilterComposer extends Composer<_$AppDatabase, $PagosTable> {
  $$PagosTableFilterComposer({
    required super.$db,
    required super.$table,
    super.joinBuilder,
    super.$addJoinBuilderToRootComposer,
    super.$removeJoinBuilderFromRootComposer,
  });
  ColumnFilters<String> get id => $composableBuilder(
    column: $table.id,
    builder: (column) => ColumnFilters(column),
  );

  ColumnFilters<String> get cotizacionId => $composableBuilder(
    column: $table.cotizacionId,
    builder: (column) => ColumnFilters(column),
  );

  ColumnFilters<int> get fecha => $composableBuilder(
    column: $table.fecha,
    builder: (column) => ColumnFilters(column),
  );

  ColumnFilters<double> get monto => $composableBuilder(
    column: $table.monto,
    builder: (column) => ColumnFilters(column),
  );

  ColumnFilters<String> get metodo => $composableBuilder(
    column: $table.metodo,
    builder: (column) => ColumnFilters(column),
  );

  ColumnFilters<String> get concepto => $composableBuilder(
    column: $table.concepto,
    builder: (column) => ColumnFilters(column),
  );

  ColumnFilters<String> get referencia => $composableBuilder(
    column: $table.referencia,
    builder: (column) => ColumnFilters(column),
  );
}

class $$PagosTableOrderingComposer
    extends Composer<_$AppDatabase, $PagosTable> {
  $$PagosTableOrderingComposer({
    required super.$db,
    required super.$table,
    super.joinBuilder,
    super.$addJoinBuilderToRootComposer,
    super.$removeJoinBuilderFromRootComposer,
  });
  ColumnOrderings<String> get id => $composableBuilder(
    column: $table.id,
    builder: (column) => ColumnOrderings(column),
  );

  ColumnOrderings<String> get cotizacionId => $composableBuilder(
    column: $table.cotizacionId,
    builder: (column) => ColumnOrderings(column),
  );

  ColumnOrderings<int> get fecha => $composableBuilder(
    column: $table.fecha,
    builder: (column) => ColumnOrderings(column),
  );

  ColumnOrderings<double> get monto => $composableBuilder(
    column: $table.monto,
    builder: (column) => ColumnOrderings(column),
  );

  ColumnOrderings<String> get metodo => $composableBuilder(
    column: $table.metodo,
    builder: (column) => ColumnOrderings(column),
  );

  ColumnOrderings<String> get concepto => $composableBuilder(
    column: $table.concepto,
    builder: (column) => ColumnOrderings(column),
  );

  ColumnOrderings<String> get referencia => $composableBuilder(
    column: $table.referencia,
    builder: (column) => ColumnOrderings(column),
  );
}

class $$PagosTableAnnotationComposer
    extends Composer<_$AppDatabase, $PagosTable> {
  $$PagosTableAnnotationComposer({
    required super.$db,
    required super.$table,
    super.joinBuilder,
    super.$addJoinBuilderToRootComposer,
    super.$removeJoinBuilderFromRootComposer,
  });
  GeneratedColumn<String> get id =>
      $composableBuilder(column: $table.id, builder: (column) => column);

  GeneratedColumn<String> get cotizacionId => $composableBuilder(
    column: $table.cotizacionId,
    builder: (column) => column,
  );

  GeneratedColumn<int> get fecha =>
      $composableBuilder(column: $table.fecha, builder: (column) => column);

  GeneratedColumn<double> get monto =>
      $composableBuilder(column: $table.monto, builder: (column) => column);

  GeneratedColumn<String> get metodo =>
      $composableBuilder(column: $table.metodo, builder: (column) => column);

  GeneratedColumn<String> get concepto =>
      $composableBuilder(column: $table.concepto, builder: (column) => column);

  GeneratedColumn<String> get referencia => $composableBuilder(
    column: $table.referencia,
    builder: (column) => column,
  );
}

class $$PagosTableTableManager
    extends
        RootTableManager<
          _$AppDatabase,
          $PagosTable,
          Pago,
          $$PagosTableFilterComposer,
          $$PagosTableOrderingComposer,
          $$PagosTableAnnotationComposer,
          $$PagosTableCreateCompanionBuilder,
          $$PagosTableUpdateCompanionBuilder,
          (Pago, BaseReferences<_$AppDatabase, $PagosTable, Pago>),
          Pago,
          PrefetchHooks Function()
        > {
  $$PagosTableTableManager(_$AppDatabase db, $PagosTable table)
    : super(
        TableManagerState(
          db: db,
          table: table,
          createFilteringComposer: () =>
              $$PagosTableFilterComposer($db: db, $table: table),
          createOrderingComposer: () =>
              $$PagosTableOrderingComposer($db: db, $table: table),
          createComputedFieldComposer: () =>
              $$PagosTableAnnotationComposer($db: db, $table: table),
          updateCompanionCallback:
              ({
                Value<String> id = const Value.absent(),
                Value<String> cotizacionId = const Value.absent(),
                Value<int> fecha = const Value.absent(),
                Value<double> monto = const Value.absent(),
                Value<String> metodo = const Value.absent(),
                Value<String> concepto = const Value.absent(),
                Value<String?> referencia = const Value.absent(),
                Value<int> rowid = const Value.absent(),
              }) => PagosCompanion(
                id: id,
                cotizacionId: cotizacionId,
                fecha: fecha,
                monto: monto,
                metodo: metodo,
                concepto: concepto,
                referencia: referencia,
                rowid: rowid,
              ),
          createCompanionCallback:
              ({
                required String id,
                required String cotizacionId,
                required int fecha,
                required double monto,
                required String metodo,
                required String concepto,
                Value<String?> referencia = const Value.absent(),
                Value<int> rowid = const Value.absent(),
              }) => PagosCompanion.insert(
                id: id,
                cotizacionId: cotizacionId,
                fecha: fecha,
                monto: monto,
                metodo: metodo,
                concepto: concepto,
                referencia: referencia,
                rowid: rowid,
              ),
          withReferenceMapper: (p0) => p0
              .map((e) => (e.readTable(table), BaseReferences(db, table, e)))
              .toList(),
          prefetchHooksCallback: null,
        ),
      );
}

typedef $$PagosTableProcessedTableManager =
    ProcessedTableManager<
      _$AppDatabase,
      $PagosTable,
      Pago,
      $$PagosTableFilterComposer,
      $$PagosTableOrderingComposer,
      $$PagosTableAnnotationComposer,
      $$PagosTableCreateCompanionBuilder,
      $$PagosTableUpdateCompanionBuilder,
      (Pago, BaseReferences<_$AppDatabase, $PagosTable, Pago>),
      Pago,
      PrefetchHooks Function()
    >;
typedef $$MovimientosTableCreateCompanionBuilder =
    MovimientosCompanion Function({
      required String id,
      required String obraId,
      required int fecha,
      required String tipo,
      required String categoria,
      required String concepto,
      required double monto,
      required String metodoPago,
      Value<String> referencia,
      Value<String?> nominaId,
      Value<String?> cotizacionId,
      Value<String?> seccionId,
      Value<String?> partidaId,
      Value<int> rowid,
    });
typedef $$MovimientosTableUpdateCompanionBuilder =
    MovimientosCompanion Function({
      Value<String> id,
      Value<String> obraId,
      Value<int> fecha,
      Value<String> tipo,
      Value<String> categoria,
      Value<String> concepto,
      Value<double> monto,
      Value<String> metodoPago,
      Value<String> referencia,
      Value<String?> nominaId,
      Value<String?> cotizacionId,
      Value<String?> seccionId,
      Value<String?> partidaId,
      Value<int> rowid,
    });

class $$MovimientosTableFilterComposer
    extends Composer<_$AppDatabase, $MovimientosTable> {
  $$MovimientosTableFilterComposer({
    required super.$db,
    required super.$table,
    super.joinBuilder,
    super.$addJoinBuilderToRootComposer,
    super.$removeJoinBuilderFromRootComposer,
  });
  ColumnFilters<String> get id => $composableBuilder(
    column: $table.id,
    builder: (column) => ColumnFilters(column),
  );

  ColumnFilters<String> get obraId => $composableBuilder(
    column: $table.obraId,
    builder: (column) => ColumnFilters(column),
  );

  ColumnFilters<int> get fecha => $composableBuilder(
    column: $table.fecha,
    builder: (column) => ColumnFilters(column),
  );

  ColumnFilters<String> get tipo => $composableBuilder(
    column: $table.tipo,
    builder: (column) => ColumnFilters(column),
  );

  ColumnFilters<String> get categoria => $composableBuilder(
    column: $table.categoria,
    builder: (column) => ColumnFilters(column),
  );

  ColumnFilters<String> get concepto => $composableBuilder(
    column: $table.concepto,
    builder: (column) => ColumnFilters(column),
  );

  ColumnFilters<double> get monto => $composableBuilder(
    column: $table.monto,
    builder: (column) => ColumnFilters(column),
  );

  ColumnFilters<String> get metodoPago => $composableBuilder(
    column: $table.metodoPago,
    builder: (column) => ColumnFilters(column),
  );

  ColumnFilters<String> get referencia => $composableBuilder(
    column: $table.referencia,
    builder: (column) => ColumnFilters(column),
  );

  ColumnFilters<String> get nominaId => $composableBuilder(
    column: $table.nominaId,
    builder: (column) => ColumnFilters(column),
  );

  ColumnFilters<String> get cotizacionId => $composableBuilder(
    column: $table.cotizacionId,
    builder: (column) => ColumnFilters(column),
  );

  ColumnFilters<String> get seccionId => $composableBuilder(
    column: $table.seccionId,
    builder: (column) => ColumnFilters(column),
  );

  ColumnFilters<String> get partidaId => $composableBuilder(
    column: $table.partidaId,
    builder: (column) => ColumnFilters(column),
  );
}

class $$MovimientosTableOrderingComposer
    extends Composer<_$AppDatabase, $MovimientosTable> {
  $$MovimientosTableOrderingComposer({
    required super.$db,
    required super.$table,
    super.joinBuilder,
    super.$addJoinBuilderToRootComposer,
    super.$removeJoinBuilderFromRootComposer,
  });
  ColumnOrderings<String> get id => $composableBuilder(
    column: $table.id,
    builder: (column) => ColumnOrderings(column),
  );

  ColumnOrderings<String> get obraId => $composableBuilder(
    column: $table.obraId,
    builder: (column) => ColumnOrderings(column),
  );

  ColumnOrderings<int> get fecha => $composableBuilder(
    column: $table.fecha,
    builder: (column) => ColumnOrderings(column),
  );

  ColumnOrderings<String> get tipo => $composableBuilder(
    column: $table.tipo,
    builder: (column) => ColumnOrderings(column),
  );

  ColumnOrderings<String> get categoria => $composableBuilder(
    column: $table.categoria,
    builder: (column) => ColumnOrderings(column),
  );

  ColumnOrderings<String> get concepto => $composableBuilder(
    column: $table.concepto,
    builder: (column) => ColumnOrderings(column),
  );

  ColumnOrderings<double> get monto => $composableBuilder(
    column: $table.monto,
    builder: (column) => ColumnOrderings(column),
  );

  ColumnOrderings<String> get metodoPago => $composableBuilder(
    column: $table.metodoPago,
    builder: (column) => ColumnOrderings(column),
  );

  ColumnOrderings<String> get referencia => $composableBuilder(
    column: $table.referencia,
    builder: (column) => ColumnOrderings(column),
  );

  ColumnOrderings<String> get nominaId => $composableBuilder(
    column: $table.nominaId,
    builder: (column) => ColumnOrderings(column),
  );

  ColumnOrderings<String> get cotizacionId => $composableBuilder(
    column: $table.cotizacionId,
    builder: (column) => ColumnOrderings(column),
  );

  ColumnOrderings<String> get seccionId => $composableBuilder(
    column: $table.seccionId,
    builder: (column) => ColumnOrderings(column),
  );

  ColumnOrderings<String> get partidaId => $composableBuilder(
    column: $table.partidaId,
    builder: (column) => ColumnOrderings(column),
  );
}

class $$MovimientosTableAnnotationComposer
    extends Composer<_$AppDatabase, $MovimientosTable> {
  $$MovimientosTableAnnotationComposer({
    required super.$db,
    required super.$table,
    super.joinBuilder,
    super.$addJoinBuilderToRootComposer,
    super.$removeJoinBuilderFromRootComposer,
  });
  GeneratedColumn<String> get id =>
      $composableBuilder(column: $table.id, builder: (column) => column);

  GeneratedColumn<String> get obraId =>
      $composableBuilder(column: $table.obraId, builder: (column) => column);

  GeneratedColumn<int> get fecha =>
      $composableBuilder(column: $table.fecha, builder: (column) => column);

  GeneratedColumn<String> get tipo =>
      $composableBuilder(column: $table.tipo, builder: (column) => column);

  GeneratedColumn<String> get categoria =>
      $composableBuilder(column: $table.categoria, builder: (column) => column);

  GeneratedColumn<String> get concepto =>
      $composableBuilder(column: $table.concepto, builder: (column) => column);

  GeneratedColumn<double> get monto =>
      $composableBuilder(column: $table.monto, builder: (column) => column);

  GeneratedColumn<String> get metodoPago => $composableBuilder(
    column: $table.metodoPago,
    builder: (column) => column,
  );

  GeneratedColumn<String> get referencia => $composableBuilder(
    column: $table.referencia,
    builder: (column) => column,
  );

  GeneratedColumn<String> get nominaId =>
      $composableBuilder(column: $table.nominaId, builder: (column) => column);

  GeneratedColumn<String> get cotizacionId => $composableBuilder(
    column: $table.cotizacionId,
    builder: (column) => column,
  );

  GeneratedColumn<String> get seccionId =>
      $composableBuilder(column: $table.seccionId, builder: (column) => column);

  GeneratedColumn<String> get partidaId =>
      $composableBuilder(column: $table.partidaId, builder: (column) => column);
}

class $$MovimientosTableTableManager
    extends
        RootTableManager<
          _$AppDatabase,
          $MovimientosTable,
          Movimiento,
          $$MovimientosTableFilterComposer,
          $$MovimientosTableOrderingComposer,
          $$MovimientosTableAnnotationComposer,
          $$MovimientosTableCreateCompanionBuilder,
          $$MovimientosTableUpdateCompanionBuilder,
          (
            Movimiento,
            BaseReferences<_$AppDatabase, $MovimientosTable, Movimiento>,
          ),
          Movimiento,
          PrefetchHooks Function()
        > {
  $$MovimientosTableTableManager(_$AppDatabase db, $MovimientosTable table)
    : super(
        TableManagerState(
          db: db,
          table: table,
          createFilteringComposer: () =>
              $$MovimientosTableFilterComposer($db: db, $table: table),
          createOrderingComposer: () =>
              $$MovimientosTableOrderingComposer($db: db, $table: table),
          createComputedFieldComposer: () =>
              $$MovimientosTableAnnotationComposer($db: db, $table: table),
          updateCompanionCallback:
              ({
                Value<String> id = const Value.absent(),
                Value<String> obraId = const Value.absent(),
                Value<int> fecha = const Value.absent(),
                Value<String> tipo = const Value.absent(),
                Value<String> categoria = const Value.absent(),
                Value<String> concepto = const Value.absent(),
                Value<double> monto = const Value.absent(),
                Value<String> metodoPago = const Value.absent(),
                Value<String> referencia = const Value.absent(),
                Value<String?> nominaId = const Value.absent(),
                Value<String?> cotizacionId = const Value.absent(),
                Value<String?> seccionId = const Value.absent(),
                Value<String?> partidaId = const Value.absent(),
                Value<int> rowid = const Value.absent(),
              }) => MovimientosCompanion(
                id: id,
                obraId: obraId,
                fecha: fecha,
                tipo: tipo,
                categoria: categoria,
                concepto: concepto,
                monto: monto,
                metodoPago: metodoPago,
                referencia: referencia,
                nominaId: nominaId,
                cotizacionId: cotizacionId,
                seccionId: seccionId,
                partidaId: partidaId,
                rowid: rowid,
              ),
          createCompanionCallback:
              ({
                required String id,
                required String obraId,
                required int fecha,
                required String tipo,
                required String categoria,
                required String concepto,
                required double monto,
                required String metodoPago,
                Value<String> referencia = const Value.absent(),
                Value<String?> nominaId = const Value.absent(),
                Value<String?> cotizacionId = const Value.absent(),
                Value<String?> seccionId = const Value.absent(),
                Value<String?> partidaId = const Value.absent(),
                Value<int> rowid = const Value.absent(),
              }) => MovimientosCompanion.insert(
                id: id,
                obraId: obraId,
                fecha: fecha,
                tipo: tipo,
                categoria: categoria,
                concepto: concepto,
                monto: monto,
                metodoPago: metodoPago,
                referencia: referencia,
                nominaId: nominaId,
                cotizacionId: cotizacionId,
                seccionId: seccionId,
                partidaId: partidaId,
                rowid: rowid,
              ),
          withReferenceMapper: (p0) => p0
              .map((e) => (e.readTable(table), BaseReferences(db, table, e)))
              .toList(),
          prefetchHooksCallback: null,
        ),
      );
}

typedef $$MovimientosTableProcessedTableManager =
    ProcessedTableManager<
      _$AppDatabase,
      $MovimientosTable,
      Movimiento,
      $$MovimientosTableFilterComposer,
      $$MovimientosTableOrderingComposer,
      $$MovimientosTableAnnotationComposer,
      $$MovimientosTableCreateCompanionBuilder,
      $$MovimientosTableUpdateCompanionBuilder,
      (
        Movimiento,
        BaseReferences<_$AppDatabase, $MovimientosTable, Movimiento>,
      ),
      Movimiento,
      PrefetchHooks Function()
    >;
typedef $$CatalogoConceptosTableCreateCompanionBuilder =
    CatalogoConceptosCompanion Function({
      required String id,
      required String clave,
      required String descripcion,
      required String unidad,
      Value<double> precioUnitarioDefault,
      required String categoria,
      Value<bool> esPersonalizado,
      Value<int> rowid,
    });
typedef $$CatalogoConceptosTableUpdateCompanionBuilder =
    CatalogoConceptosCompanion Function({
      Value<String> id,
      Value<String> clave,
      Value<String> descripcion,
      Value<String> unidad,
      Value<double> precioUnitarioDefault,
      Value<String> categoria,
      Value<bool> esPersonalizado,
      Value<int> rowid,
    });

class $$CatalogoConceptosTableFilterComposer
    extends Composer<_$AppDatabase, $CatalogoConceptosTable> {
  $$CatalogoConceptosTableFilterComposer({
    required super.$db,
    required super.$table,
    super.joinBuilder,
    super.$addJoinBuilderToRootComposer,
    super.$removeJoinBuilderFromRootComposer,
  });
  ColumnFilters<String> get id => $composableBuilder(
    column: $table.id,
    builder: (column) => ColumnFilters(column),
  );

  ColumnFilters<String> get clave => $composableBuilder(
    column: $table.clave,
    builder: (column) => ColumnFilters(column),
  );

  ColumnFilters<String> get descripcion => $composableBuilder(
    column: $table.descripcion,
    builder: (column) => ColumnFilters(column),
  );

  ColumnFilters<String> get unidad => $composableBuilder(
    column: $table.unidad,
    builder: (column) => ColumnFilters(column),
  );

  ColumnFilters<double> get precioUnitarioDefault => $composableBuilder(
    column: $table.precioUnitarioDefault,
    builder: (column) => ColumnFilters(column),
  );

  ColumnFilters<String> get categoria => $composableBuilder(
    column: $table.categoria,
    builder: (column) => ColumnFilters(column),
  );

  ColumnFilters<bool> get esPersonalizado => $composableBuilder(
    column: $table.esPersonalizado,
    builder: (column) => ColumnFilters(column),
  );
}

class $$CatalogoConceptosTableOrderingComposer
    extends Composer<_$AppDatabase, $CatalogoConceptosTable> {
  $$CatalogoConceptosTableOrderingComposer({
    required super.$db,
    required super.$table,
    super.joinBuilder,
    super.$addJoinBuilderToRootComposer,
    super.$removeJoinBuilderFromRootComposer,
  });
  ColumnOrderings<String> get id => $composableBuilder(
    column: $table.id,
    builder: (column) => ColumnOrderings(column),
  );

  ColumnOrderings<String> get clave => $composableBuilder(
    column: $table.clave,
    builder: (column) => ColumnOrderings(column),
  );

  ColumnOrderings<String> get descripcion => $composableBuilder(
    column: $table.descripcion,
    builder: (column) => ColumnOrderings(column),
  );

  ColumnOrderings<String> get unidad => $composableBuilder(
    column: $table.unidad,
    builder: (column) => ColumnOrderings(column),
  );

  ColumnOrderings<double> get precioUnitarioDefault => $composableBuilder(
    column: $table.precioUnitarioDefault,
    builder: (column) => ColumnOrderings(column),
  );

  ColumnOrderings<String> get categoria => $composableBuilder(
    column: $table.categoria,
    builder: (column) => ColumnOrderings(column),
  );

  ColumnOrderings<bool> get esPersonalizado => $composableBuilder(
    column: $table.esPersonalizado,
    builder: (column) => ColumnOrderings(column),
  );
}

class $$CatalogoConceptosTableAnnotationComposer
    extends Composer<_$AppDatabase, $CatalogoConceptosTable> {
  $$CatalogoConceptosTableAnnotationComposer({
    required super.$db,
    required super.$table,
    super.joinBuilder,
    super.$addJoinBuilderToRootComposer,
    super.$removeJoinBuilderFromRootComposer,
  });
  GeneratedColumn<String> get id =>
      $composableBuilder(column: $table.id, builder: (column) => column);

  GeneratedColumn<String> get clave =>
      $composableBuilder(column: $table.clave, builder: (column) => column);

  GeneratedColumn<String> get descripcion => $composableBuilder(
    column: $table.descripcion,
    builder: (column) => column,
  );

  GeneratedColumn<String> get unidad =>
      $composableBuilder(column: $table.unidad, builder: (column) => column);

  GeneratedColumn<double> get precioUnitarioDefault => $composableBuilder(
    column: $table.precioUnitarioDefault,
    builder: (column) => column,
  );

  GeneratedColumn<String> get categoria =>
      $composableBuilder(column: $table.categoria, builder: (column) => column);

  GeneratedColumn<bool> get esPersonalizado => $composableBuilder(
    column: $table.esPersonalizado,
    builder: (column) => column,
  );
}

class $$CatalogoConceptosTableTableManager
    extends
        RootTableManager<
          _$AppDatabase,
          $CatalogoConceptosTable,
          CatalogoConcepto,
          $$CatalogoConceptosTableFilterComposer,
          $$CatalogoConceptosTableOrderingComposer,
          $$CatalogoConceptosTableAnnotationComposer,
          $$CatalogoConceptosTableCreateCompanionBuilder,
          $$CatalogoConceptosTableUpdateCompanionBuilder,
          (
            CatalogoConcepto,
            BaseReferences<
              _$AppDatabase,
              $CatalogoConceptosTable,
              CatalogoConcepto
            >,
          ),
          CatalogoConcepto,
          PrefetchHooks Function()
        > {
  $$CatalogoConceptosTableTableManager(
    _$AppDatabase db,
    $CatalogoConceptosTable table,
  ) : super(
        TableManagerState(
          db: db,
          table: table,
          createFilteringComposer: () =>
              $$CatalogoConceptosTableFilterComposer($db: db, $table: table),
          createOrderingComposer: () =>
              $$CatalogoConceptosTableOrderingComposer($db: db, $table: table),
          createComputedFieldComposer: () =>
              $$CatalogoConceptosTableAnnotationComposer(
                $db: db,
                $table: table,
              ),
          updateCompanionCallback:
              ({
                Value<String> id = const Value.absent(),
                Value<String> clave = const Value.absent(),
                Value<String> descripcion = const Value.absent(),
                Value<String> unidad = const Value.absent(),
                Value<double> precioUnitarioDefault = const Value.absent(),
                Value<String> categoria = const Value.absent(),
                Value<bool> esPersonalizado = const Value.absent(),
                Value<int> rowid = const Value.absent(),
              }) => CatalogoConceptosCompanion(
                id: id,
                clave: clave,
                descripcion: descripcion,
                unidad: unidad,
                precioUnitarioDefault: precioUnitarioDefault,
                categoria: categoria,
                esPersonalizado: esPersonalizado,
                rowid: rowid,
              ),
          createCompanionCallback:
              ({
                required String id,
                required String clave,
                required String descripcion,
                required String unidad,
                Value<double> precioUnitarioDefault = const Value.absent(),
                required String categoria,
                Value<bool> esPersonalizado = const Value.absent(),
                Value<int> rowid = const Value.absent(),
              }) => CatalogoConceptosCompanion.insert(
                id: id,
                clave: clave,
                descripcion: descripcion,
                unidad: unidad,
                precioUnitarioDefault: precioUnitarioDefault,
                categoria: categoria,
                esPersonalizado: esPersonalizado,
                rowid: rowid,
              ),
          withReferenceMapper: (p0) => p0
              .map((e) => (e.readTable(table), BaseReferences(db, table, e)))
              .toList(),
          prefetchHooksCallback: null,
        ),
      );
}

typedef $$CatalogoConceptosTableProcessedTableManager =
    ProcessedTableManager<
      _$AppDatabase,
      $CatalogoConceptosTable,
      CatalogoConcepto,
      $$CatalogoConceptosTableFilterComposer,
      $$CatalogoConceptosTableOrderingComposer,
      $$CatalogoConceptosTableAnnotationComposer,
      $$CatalogoConceptosTableCreateCompanionBuilder,
      $$CatalogoConceptosTableUpdateCompanionBuilder,
      (
        CatalogoConcepto,
        BaseReferences<
          _$AppDatabase,
          $CatalogoConceptosTable,
          CatalogoConcepto
        >,
      ),
      CatalogoConcepto,
      PrefetchHooks Function()
    >;
typedef $$ArchivosCotizacionTableCreateCompanionBuilder =
    ArchivosCotizacionCompanion Function({
      required String id,
      required String cotizacionId,
      required String tipo,
      required String nombre,
      required String uri,
      required int fechaAgregado,
      Value<int> rowid,
    });
typedef $$ArchivosCotizacionTableUpdateCompanionBuilder =
    ArchivosCotizacionCompanion Function({
      Value<String> id,
      Value<String> cotizacionId,
      Value<String> tipo,
      Value<String> nombre,
      Value<String> uri,
      Value<int> fechaAgregado,
      Value<int> rowid,
    });

class $$ArchivosCotizacionTableFilterComposer
    extends Composer<_$AppDatabase, $ArchivosCotizacionTable> {
  $$ArchivosCotizacionTableFilterComposer({
    required super.$db,
    required super.$table,
    super.joinBuilder,
    super.$addJoinBuilderToRootComposer,
    super.$removeJoinBuilderFromRootComposer,
  });
  ColumnFilters<String> get id => $composableBuilder(
    column: $table.id,
    builder: (column) => ColumnFilters(column),
  );

  ColumnFilters<String> get cotizacionId => $composableBuilder(
    column: $table.cotizacionId,
    builder: (column) => ColumnFilters(column),
  );

  ColumnFilters<String> get tipo => $composableBuilder(
    column: $table.tipo,
    builder: (column) => ColumnFilters(column),
  );

  ColumnFilters<String> get nombre => $composableBuilder(
    column: $table.nombre,
    builder: (column) => ColumnFilters(column),
  );

  ColumnFilters<String> get uri => $composableBuilder(
    column: $table.uri,
    builder: (column) => ColumnFilters(column),
  );

  ColumnFilters<int> get fechaAgregado => $composableBuilder(
    column: $table.fechaAgregado,
    builder: (column) => ColumnFilters(column),
  );
}

class $$ArchivosCotizacionTableOrderingComposer
    extends Composer<_$AppDatabase, $ArchivosCotizacionTable> {
  $$ArchivosCotizacionTableOrderingComposer({
    required super.$db,
    required super.$table,
    super.joinBuilder,
    super.$addJoinBuilderToRootComposer,
    super.$removeJoinBuilderFromRootComposer,
  });
  ColumnOrderings<String> get id => $composableBuilder(
    column: $table.id,
    builder: (column) => ColumnOrderings(column),
  );

  ColumnOrderings<String> get cotizacionId => $composableBuilder(
    column: $table.cotizacionId,
    builder: (column) => ColumnOrderings(column),
  );

  ColumnOrderings<String> get tipo => $composableBuilder(
    column: $table.tipo,
    builder: (column) => ColumnOrderings(column),
  );

  ColumnOrderings<String> get nombre => $composableBuilder(
    column: $table.nombre,
    builder: (column) => ColumnOrderings(column),
  );

  ColumnOrderings<String> get uri => $composableBuilder(
    column: $table.uri,
    builder: (column) => ColumnOrderings(column),
  );

  ColumnOrderings<int> get fechaAgregado => $composableBuilder(
    column: $table.fechaAgregado,
    builder: (column) => ColumnOrderings(column),
  );
}

class $$ArchivosCotizacionTableAnnotationComposer
    extends Composer<_$AppDatabase, $ArchivosCotizacionTable> {
  $$ArchivosCotizacionTableAnnotationComposer({
    required super.$db,
    required super.$table,
    super.joinBuilder,
    super.$addJoinBuilderToRootComposer,
    super.$removeJoinBuilderFromRootComposer,
  });
  GeneratedColumn<String> get id =>
      $composableBuilder(column: $table.id, builder: (column) => column);

  GeneratedColumn<String> get cotizacionId => $composableBuilder(
    column: $table.cotizacionId,
    builder: (column) => column,
  );

  GeneratedColumn<String> get tipo =>
      $composableBuilder(column: $table.tipo, builder: (column) => column);

  GeneratedColumn<String> get nombre =>
      $composableBuilder(column: $table.nombre, builder: (column) => column);

  GeneratedColumn<String> get uri =>
      $composableBuilder(column: $table.uri, builder: (column) => column);

  GeneratedColumn<int> get fechaAgregado => $composableBuilder(
    column: $table.fechaAgregado,
    builder: (column) => column,
  );
}

class $$ArchivosCotizacionTableTableManager
    extends
        RootTableManager<
          _$AppDatabase,
          $ArchivosCotizacionTable,
          ArchivoCotizacion,
          $$ArchivosCotizacionTableFilterComposer,
          $$ArchivosCotizacionTableOrderingComposer,
          $$ArchivosCotizacionTableAnnotationComposer,
          $$ArchivosCotizacionTableCreateCompanionBuilder,
          $$ArchivosCotizacionTableUpdateCompanionBuilder,
          (
            ArchivoCotizacion,
            BaseReferences<
              _$AppDatabase,
              $ArchivosCotizacionTable,
              ArchivoCotizacion
            >,
          ),
          ArchivoCotizacion,
          PrefetchHooks Function()
        > {
  $$ArchivosCotizacionTableTableManager(
    _$AppDatabase db,
    $ArchivosCotizacionTable table,
  ) : super(
        TableManagerState(
          db: db,
          table: table,
          createFilteringComposer: () =>
              $$ArchivosCotizacionTableFilterComposer($db: db, $table: table),
          createOrderingComposer: () =>
              $$ArchivosCotizacionTableOrderingComposer($db: db, $table: table),
          createComputedFieldComposer: () =>
              $$ArchivosCotizacionTableAnnotationComposer(
                $db: db,
                $table: table,
              ),
          updateCompanionCallback:
              ({
                Value<String> id = const Value.absent(),
                Value<String> cotizacionId = const Value.absent(),
                Value<String> tipo = const Value.absent(),
                Value<String> nombre = const Value.absent(),
                Value<String> uri = const Value.absent(),
                Value<int> fechaAgregado = const Value.absent(),
                Value<int> rowid = const Value.absent(),
              }) => ArchivosCotizacionCompanion(
                id: id,
                cotizacionId: cotizacionId,
                tipo: tipo,
                nombre: nombre,
                uri: uri,
                fechaAgregado: fechaAgregado,
                rowid: rowid,
              ),
          createCompanionCallback:
              ({
                required String id,
                required String cotizacionId,
                required String tipo,
                required String nombre,
                required String uri,
                required int fechaAgregado,
                Value<int> rowid = const Value.absent(),
              }) => ArchivosCotizacionCompanion.insert(
                id: id,
                cotizacionId: cotizacionId,
                tipo: tipo,
                nombre: nombre,
                uri: uri,
                fechaAgregado: fechaAgregado,
                rowid: rowid,
              ),
          withReferenceMapper: (p0) => p0
              .map((e) => (e.readTable(table), BaseReferences(db, table, e)))
              .toList(),
          prefetchHooksCallback: null,
        ),
      );
}

typedef $$ArchivosCotizacionTableProcessedTableManager =
    ProcessedTableManager<
      _$AppDatabase,
      $ArchivosCotizacionTable,
      ArchivoCotizacion,
      $$ArchivosCotizacionTableFilterComposer,
      $$ArchivosCotizacionTableOrderingComposer,
      $$ArchivosCotizacionTableAnnotationComposer,
      $$ArchivosCotizacionTableCreateCompanionBuilder,
      $$ArchivosCotizacionTableUpdateCompanionBuilder,
      (
        ArchivoCotizacion,
        BaseReferences<
          _$AppDatabase,
          $ArchivosCotizacionTable,
          ArchivoCotizacion
        >,
      ),
      ArchivoCotizacion,
      PrefetchHooks Function()
    >;

class $AppDatabaseManager {
  final _$AppDatabase _db;
  $AppDatabaseManager(this._db);
  $$ObrasTableTableManager get obras =>
      $$ObrasTableTableManager(_db, _db.obras);
  $$PuestosTableTableManager get puestos =>
      $$PuestosTableTableManager(_db, _db.puestos);
  $$ColaboradoresTableTableManager get colaboradores =>
      $$ColaboradoresTableTableManager(_db, _db.colaboradores);
  $$ObraColaboradorTableTableManager get obraColaborador =>
      $$ObraColaboradorTableTableManager(_db, _db.obraColaborador);
  $$AsistenciasTableTableManager get asistencias =>
      $$AsistenciasTableTableManager(_db, _db.asistencias);
  $$DestajosTableTableManager get destajos =>
      $$DestajosTableTableManager(_db, _db.destajos);
  $$CotizacionesTableTableManager get cotizaciones =>
      $$CotizacionesTableTableManager(_db, _db.cotizaciones);
  $$SeccionesTableTableManager get secciones =>
      $$SeccionesTableTableManager(_db, _db.secciones);
  $$PartidasTableTableManager get partidas =>
      $$PartidasTableTableManager(_db, _db.partidas);
  $$PagosTableTableManager get pagos =>
      $$PagosTableTableManager(_db, _db.pagos);
  $$MovimientosTableTableManager get movimientos =>
      $$MovimientosTableTableManager(_db, _db.movimientos);
  $$CatalogoConceptosTableTableManager get catalogoConceptos =>
      $$CatalogoConceptosTableTableManager(_db, _db.catalogoConceptos);
  $$ArchivosCotizacionTableTableManager get archivosCotizacion =>
      $$ArchivosCotizacionTableTableManager(_db, _db.archivosCotizacion);
}
