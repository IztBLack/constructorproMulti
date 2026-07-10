import 'dart:convert';
import 'dart:typed_data';

import 'package:drift/drift.dart' show Value;
import 'package:file_picker/file_picker.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:uuid/uuid.dart';

import '../../core/db/app_database.dart';
import '../../core/format/format.dart';
import '../../data/providers.dart';
import '../../domain/import/dedup_movimientos.dart';
import '../../domain/import/estado_cuenta_parser.dart';
import '../../domain/import/import_models.dart';
import '../../domain/import/presupuesto_reconciliation.dart';
import '../common/app_spacing.dart';

/// Flujo de importación de un estado de cuenta (Excel/CSV) hacia la caja de
/// una obra EXISTENTE. Consume el parser + clasificador de duplicados +
/// reconciliación de presupuesto de `lib/domain/import/*`.
///
/// Pasos: (1) elegir archivo → parsear; (2) preview de movimientos con estado
/// Nuevo/Duplicado + advertencias; (3) opcional: reconciliar presupuesto con
/// elección por conflicto y costo total en vivo; (4) confirmar → insertBatch
/// (solo Nuevos por defecto, o todos con "Importar todo") + aplicar cambios de
/// presupuesto.
class ImportarMovimientosScreen extends ConsumerStatefulWidget {
  final Obra obra;
  const ImportarMovimientosScreen({super.key, required this.obra});

  @override
  ConsumerState<ImportarMovimientosScreen> createState() =>
      _ImportarMovimientosScreenState();
}

class _ImportarMovimientosScreenState
    extends ConsumerState<ImportarMovimientosScreen> {
  static const _uuid = Uuid();

  bool _cargando = false;
  String? _error;
  String? _nombreArchivo;

  ParsedObraData? _parsed;
  List<MovimientoClasificado> _movimientos = const [];
  List<PartidaReconciliada> _reconciliacion = const [];

  /// Insertar TODOS los movimientos (incluidos duplicados), no solo los Nuevos.
  bool _importarTodo = false;

  /// Aplicar el presupuesto del archivo (OFF por defecto).
  bool _actualizarPresupuesto = false;

  /// Por concepto normalizado de partida en Conflicto: true = usar archivo,
  /// false (default) = mantener portal.
  final Map<String, bool> _usarArchivo = {};

  String get _obraId => widget.obra.id;

  bool get _hayPresupuestoArchivo =>
      _parsed != null && _parsed!.partidas.isNotEmpty;

  Future<void> _elegirArchivo() async {
    setState(() {
      _cargando = true;
      _error = null;
    });
    try {
      final res = await FilePicker.platform.pickFiles(
        type: FileType.custom,
        allowedExtensions: ['xlsx', 'csv'],
        withData: true,
      );
      if (res == null || res.files.isEmpty) {
        setState(() => _cargando = false);
        return;
      }
      final file = res.files.single;
      final nombre = file.name;
      final bytes = file.bytes;
      if (bytes == null) {
        throw const FormatoImportNoSoportado(
            'No se pudo leer el contenido del archivo.');
      }

      final ParsedObraData parsed;
      if (nombre.toLowerCase().endsWith('.csv')) {
        parsed = parsearCsvObra(_decodificar(bytes));
      } else {
        parsed = parsearXlsxObra(bytes);
      }

      // Trae los existentes de la obra para clasificar/reconciliar.
      final existentesMov =
          await ref.read(movimientoRepositoryProvider).watchByObra(_obraId).first;
      final existentesPart = await ref
          .read(obraPresupuestoRepositoryProvider)
          .getByObra(_obraId);

      final clasificados = clasificarMovimientos(
        existentes: existentesMov,
        parsed: parsed.movimientos,
      );
      final reconciliacion = reconciliarPresupuesto(
        existentes: existentesPart,
        parsed: parsed.partidas,
      );

      setState(() {
        _cargando = false;
        _nombreArchivo = nombre;
        _parsed = parsed;
        _movimientos = clasificados;
        _reconciliacion = reconciliacion;
        _usarArchivo.clear();
      });
    } catch (e) {
      setState(() {
        _cargando = false;
        _error = e.toString();
      });
    }
  }

  /// Decodifica bytes de CSV como UTF-8 (con fallback a latin1 si trae bytes
  /// inválidos, común en exports de Excel en Windows).
  String _decodificar(Uint8List bytes) {
    try {
      return utf8.decode(bytes);
    } catch (_) {
      return latin1.decode(bytes);
    }
  }

  int get _nNuevos =>
      _movimientos.where((m) => m.esNuevo).length;
  int get _nDuplicados =>
      _movimientos.where((m) => m.esDuplicado).length;

  /// Costo total resultante si se aplicara el presupuesto según las
  /// elecciones actuales (mantener portal / usar archivo por conflicto).
  double get _costoTotalResultante {
    var total = 0.0;
    for (final p in _reconciliacion) {
      switch (p.estado) {
        case EstadoPartida.igual:
        case EstadoPartida.soloPortal:
          final o = p.deObra;
          if (o != null) total += o.cantidad * o.precioUnitario;
        case EstadoPartida.nueva:
          final a = p.deArchivo;
          if (a != null) total += a.total;
        case EstadoPartida.conflicto:
          final usarArch = _usarArchivo[_clave(p.concepto)] ?? false;
          if (usarArch && p.deArchivo != null) {
            total += p.deArchivo!.total;
          } else if (p.deObra != null) {
            total += p.deObra!.cantidad * p.deObra!.precioUnitario;
          }
      }
    }
    return total;
  }

  String _clave(String s) =>
      s.trim().replaceAll(RegExp(r'\s+'), ' ').toUpperCase();

  Future<void> _confirmar() async {
    final aInsertar = _importarTodo
        ? _movimientos.map((m) => m.movimiento).toList()
        : _movimientos.where((m) => m.esNuevo).map((m) => m.movimiento).toList();

    if (aInsertar.isEmpty && !_debeAplicarPresupuesto) {
      _snack('No hay nada que importar.');
      return;
    }

    setState(() => _cargando = true);
    try {
      if (aInsertar.isNotEmpty) {
        await ref
            .read(movimientoRepositoryProvider)
            .insertBatch(_obraId, aInsertar);
      }
      if (_debeAplicarPresupuesto) {
        await _aplicarPresupuesto();
      }
      if (!mounted) return;
      _snack('Importación completada: ${aInsertar.length} movimiento(s).');
      Navigator.of(context).pop(true);
    } catch (e) {
      setState(() {
        _cargando = false;
        _error = e.toString();
      });
    }
  }

  bool get _debeAplicarPresupuesto =>
      _actualizarPresupuesto && _hayPresupuestoArchivo;

  /// Aplica los cambios de presupuesto: agrega las Nuevas y, por cada
  /// Conflicto elegido "usar archivo", actualiza cantidad/precio. Igual y
  /// SoloPortal se dejan intactas.
  Future<void> _aplicarPresupuesto() async {
    final repo = ref.read(obraPresupuestoRepositoryProvider);
    final companions = <ObraPresupuestoCompanion>[];
    // Igual que el web (actions.ts): siguiente orden = máximo existente + 1,
    // no el conteo de filas reconciliadas — evita chocar con partidas que
    // ya tengan un `orden` disperso (ej. reordenadas a mano previamente).
    var orden = 1 +
        _reconciliacion.fold<int>(
            0, (max, p) => p.deObra != null && p.deObra!.orden > max ? p.deObra!.orden : max);
    for (final p in _reconciliacion) {
      switch (p.estado) {
        case EstadoPartida.nueva:
          final a = p.deArchivo!;
          companions.add(ObraPresupuestoCompanion.insert(
            id: _uuid.v4(),
            obraId: _obraId,
            concepto: Value(a.concepto),
            unidad: Value(a.unidad),
            cantidad: Value(a.cantidad),
            precioUnitario: Value(a.precioUnitario),
            orden: Value(orden++),
          ));
        case EstadoPartida.conflicto:
          final usarArch = _usarArchivo[_clave(p.concepto)] ?? false;
          if (usarArch) {
            final a = p.deArchivo!;
            final o = p.deObra!;
            companions.add(ObraPresupuestoCompanion(
              id: Value(o.id),
              obraId: Value(_obraId),
              concepto: Value(o.concepto),
              unidad: Value(a.unidad),
              cantidad: Value(a.cantidad),
              precioUnitario: Value(a.precioUnitario),
              orden: Value(o.orden),
            ));
          }
        case EstadoPartida.igual:
        case EstadoPartida.soloPortal:
          break; // sin cambios
      }
    }
    await repo.upsertBatch(companions);
  }

  void _snack(String msg) => ScaffoldMessenger.of(context)
      .showSnackBar(SnackBar(content: Text(msg)));

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('Importar movimientos')),
      body: _cargando
          ? const Center(child: CircularProgressIndicator())
          : _parsed == null
              ? _vistaInicial()
              : _vistaPreview(),
      bottomNavigationBar: _parsed == null ? null : _barraConfirmar(),
    );
  }

  // ── Vista inicial: elegir archivo ──────────────────────────────────────
  Widget _vistaInicial() {
    return Center(
      child: Padding(
        padding: AppSpacing.allLg,
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Icon(Icons.upload_file,
                size: 64, color: Theme.of(context).colorScheme.primary),
            AppSpacing.gapMd,
            Text(
              'Asociar a obra existente',
              style: Theme.of(context).textTheme.titleMedium,
            ),
            AppSpacing.gapXs,
            Text(
              widget.obra.nombre,
              style: Theme.of(context).textTheme.bodyMedium?.copyWith(
                  color: Theme.of(context).colorScheme.primary,
                  fontWeight: FontWeight.bold),
              textAlign: TextAlign.center,
            ),
            AppSpacing.gapMd,
            const Text(
              'Selecciona un archivo .xlsx o .csv con el estado de cuenta.',
              textAlign: TextAlign.center,
            ),
            AppSpacing.gapMd,
            FilledButton.icon(
              onPressed: _elegirArchivo,
              icon: const Icon(Icons.folder_open),
              label: const Text('Elegir archivo'),
            ),
            if (_error != null) ...[
              AppSpacing.gapMd,
              Text(_error!,
                  style: TextStyle(
                      color: Theme.of(context).colorScheme.error),
                  textAlign: TextAlign.center),
            ],
          ],
        ),
      ),
    );
  }

  // ── Vista preview ──────────────────────────────────────────────────────
  Widget _vistaPreview() {
    final total = _movimientos.length;
    final cs = Theme.of(context).colorScheme;
    return ListView(
      padding: AppSpacing.allMd,
      children: [
        // Destino
        Card(
          child: ListTile(
            leading: const Icon(Icons.engineering),
            title: Text('Asociar a obra existente · ${widget.obra.nombre}'),
            subtitle: Text(_nombreArchivo ?? ''),
          ),
        ),
        AppSpacing.gapSm,
        // Pills / contadores
        Wrap(
          spacing: AppSpacing.sm,
          runSpacing: AppSpacing.xs,
          children: [
            _pill('$total en el archivo', cs.secondaryContainer,
                cs.onSecondaryContainer),
            _pill('$_nNuevos nuevos', Colors.green.shade100,
                Colors.green.shade900),
            _pill('$_nDuplicados duplicados', Colors.amber.shade100,
                Colors.amber.shade900),
          ],
        ),
        AppSpacing.gapSm,
        _advertencias(),
        AppSpacing.gapSm,
        // Tabla de movimientos
        Text('Movimientos', style: Theme.of(context).textTheme.titleSmall),
        AppSpacing.gapXs,
        if (_movimientos.isEmpty)
          const Padding(
            padding: EdgeInsets.symmetric(vertical: 16),
            child: Text('El archivo no contiene movimientos válidos.'),
          )
        else
          ..._movimientos.map(_filaMovimiento),
        AppSpacing.gapMd,
        // Presupuesto
        _seccionPresupuesto(),
      ],
    );
  }

  Widget _pill(String texto, Color bg, Color fg) => Container(
        padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
        decoration: BoxDecoration(
          color: bg,
          borderRadius: BorderRadius.circular(16),
        ),
        child: Text(texto,
            style: TextStyle(color: fg, fontWeight: FontWeight.w600)),
      );

  Widget _advertencias() {
    final avisos = <String>[];
    if (_nDuplicados > 0 && !_importarTodo) {
      avisos.add(
          '$_nDuplicados duplicado(s) se omitirán (ya existen en la obra).');
    }
    final sinBeneficiario = _movimientos
        .where((m) => m.movimiento.tipo == 'SALIDA' &&
            m.movimiento.nombre.trim().isEmpty)
        .length;
    if (sinBeneficiario > 0) {
      avisos.add('$sinBeneficiario salida(s) sin beneficiario.');
    }
    avisos.addAll(_parsed?.advertencias ?? const []);
    if (avisos.isEmpty) return const SizedBox.shrink();
    return Container(
      width: double.infinity,
      padding: AppSpacing.allSm,
      decoration: BoxDecoration(
        color: Colors.amber.shade50,
        borderRadius: BorderRadius.circular(8),
        border: Border.all(color: Colors.amber.shade300),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(children: [
            Icon(Icons.warning_amber, size: 18, color: Colors.amber.shade900),
            const SizedBox(width: 6),
            Text('Advertencias',
                style: TextStyle(
                    fontWeight: FontWeight.bold,
                    color: Colors.amber.shade900)),
          ]),
          const SizedBox(height: 4),
          ...avisos.map((a) => Padding(
                padding: const EdgeInsets.only(top: 2),
                child: Text('• $a',
                    style: TextStyle(color: Colors.amber.shade900)),
              )),
        ],
      ),
    );
  }

  Widget _filaMovimiento(MovimientoClasificado mc) {
    final m = mc.movimiento;
    final entrada = m.tipo == 'ENTRADA';
    final dup = mc.esDuplicado;
    return ListTile(
      dense: true,
      leading: Icon(
        entrada ? Icons.south_west : Icons.north_east,
        color: entrada ? Colors.green : Colors.red,
      ),
      title: Text(_prettify(m.categoria),
          maxLines: 1, overflow: TextOverflow.ellipsis),
      subtitle: Text(
        '${Fmt.date(m.fecha)}'
        '${m.nombre.trim().isEmpty ? '' : ' · ${_prettify(m.nombre)}'}',
      ),
      trailing: Column(
        mainAxisAlignment: MainAxisAlignment.center,
        crossAxisAlignment: CrossAxisAlignment.end,
        children: [
          Text('${entrada ? '+' : '-'}${Fmt.money(m.monto)}',
              style: TextStyle(
                  color: entrada ? Colors.green : Colors.red,
                  fontWeight: FontWeight.bold)),
          _estadoChip(dup),
        ],
      ),
    );
  }

  Widget _estadoChip(bool dup) => Container(
        padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 1),
        decoration: BoxDecoration(
          color: dup ? Colors.amber.shade100 : Colors.green.shade100,
          borderRadius: BorderRadius.circular(6),
        ),
        child: Text(dup ? 'Duplicado' : 'Nuevo',
            style: TextStyle(
                fontSize: 11,
                fontWeight: FontWeight.w600,
                color: dup ? Colors.amber.shade900 : Colors.green.shade900)),
      );

  // ── Sección presupuesto ────────────────────────────────────────────────
  Widget _seccionPresupuesto() {
    if (!_hayPresupuestoArchivo) {
      return Card(
        child: Padding(
          padding: AppSpacing.allMd,
          child: Row(
            children: [
              const Icon(Icons.info_outline, size: 18),
              const SizedBox(width: 8),
              Expanded(
                child: Text(
                  'El archivo no trae presupuesto — sin cambios.',
                  style: Theme.of(context).textTheme.bodyMedium,
                ),
              ),
            ],
          ),
        ),
      );
    }

    return Card(
      child: Padding(
        padding: AppSpacing.allMd,
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            CheckboxListTile(
              contentPadding: EdgeInsets.zero,
              controlAffinity: ListTileControlAffinity.leading,
              value: _actualizarPresupuesto,
              onChanged: (v) =>
                  setState(() => _actualizarPresupuesto = v ?? false),
              title: const Text('Actualizar presupuesto con el del archivo'),
            ),
            if (_actualizarPresupuesto) ...[
              const Divider(),
              ..._reconciliacion.map(_filaReconciliacion),
              const Divider(),
              Row(
                mainAxisAlignment: MainAxisAlignment.spaceBetween,
                children: [
                  const Text('Costo total resultante',
                      style: TextStyle(fontWeight: FontWeight.bold)),
                  Text(Fmt.money(_costoTotalResultante),
                      style: const TextStyle(
                          fontWeight: FontWeight.bold, fontSize: 16)),
                ],
              ),
            ],
          ],
        ),
      ),
    );
  }

  Widget _filaReconciliacion(PartidaReconciliada p) {
    switch (p.estado) {
      case EstadoPartida.igual:
        return _partidaSimple(p.concepto, 'Igual', Colors.grey,
            p.deObra != null ? p.deObra!.cantidad * p.deObra!.precioUnitario : 0);
      case EstadoPartida.nueva:
        return _partidaSimple(p.concepto, 'Nueva (se agrega)', Colors.green,
            p.deArchivo?.total ?? 0);
      case EstadoPartida.soloPortal:
        return _partidaSimple(p.concepto, 'Se conserva', Colors.blueGrey,
            p.deObra != null ? p.deObra!.cantidad * p.deObra!.precioUnitario : 0);
      case EstadoPartida.conflicto:
        return _partidaConflicto(p);
    }
  }

  Widget _partidaSimple(
      String concepto, String etiqueta, Color color, double total) {
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 4),
      child: Row(
        children: [
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(_prettify(concepto),
                    maxLines: 1, overflow: TextOverflow.ellipsis),
                Text(etiqueta,
                    style: TextStyle(fontSize: 12, color: color)),
              ],
            ),
          ),
          Text(Fmt.money(total)),
        ],
      ),
    );
  }

  Widget _partidaConflicto(PartidaReconciliada p) {
    final clave = _clave(p.concepto);
    final usarArch = _usarArchivo[clave] ?? false;
    final o = p.deObra!;
    final a = p.deArchivo!;
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 6),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Expanded(
                child: Text(_prettify(p.concepto),
                    style: const TextStyle(fontWeight: FontWeight.w600)),
              ),
              Container(
                padding:
                    const EdgeInsets.symmetric(horizontal: 6, vertical: 1),
                decoration: BoxDecoration(
                  color: Colors.orange.shade100,
                  borderRadius: BorderRadius.circular(6),
                ),
                child: Text('Conflicto',
                    style: TextStyle(
                        fontSize: 11,
                        fontWeight: FontWeight.w600,
                        color: Colors.orange.shade900)),
              ),
            ],
          ),
          const SizedBox(height: 4),
          SegmentedButton<bool>(
            style: const ButtonStyle(
                visualDensity: VisualDensity.compact),
            segments: [
              ButtonSegment(
                value: false,
                label: Text(
                    'Mantener · ${Fmt.money(o.cantidad * o.precioUnitario)}',
                    style: const TextStyle(fontSize: 11)),
              ),
              ButtonSegment(
                value: true,
                label: Text('Usar · ${Fmt.money(a.total)}',
                    style: const TextStyle(fontSize: 11)),
              ),
            ],
            selected: {usarArch},
            onSelectionChanged: (s) =>
                setState(() => _usarArchivo[clave] = s.first),
          ),
        ],
      ),
    );
  }

  // ── Barra confirmar ────────────────────────────────────────────────────
  Widget _barraConfirmar() {
    final n = _importarTodo ? _movimientos.length : _nNuevos;
    return SafeArea(
      child: Padding(
        padding: AppSpacing.allMd,
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            SwitchListTile(
              contentPadding: EdgeInsets.zero,
              dense: true,
              value: _importarTodo,
              onChanged: (v) => setState(() => _importarTodo = v),
              title: const Text('Importar todo (incluye duplicados)'),
            ),
            SizedBox(
              width: double.infinity,
              child: FilledButton.icon(
                onPressed:
                    (n == 0 && !_debeAplicarPresupuesto) ? null : _confirmar,
                icon: const Icon(Icons.check),
                label: Text(_importarTodo
                    ? 'Agregar $n movimiento(s)'
                    : 'Agregar $n movimiento(s) nuevo(s)'),
              ),
            ),
          ],
        ),
      ),
    );
  }

  /// Prettify para MOSTRAR: capitaliza la primera letra de cada palabra sin
  /// alterar el valor almacenado (que se usa para agrupar/comparar).
  String _prettify(String raw) {
    final s = raw.trim();
    if (s.isEmpty) return s;
    return s
        .split(' ')
        .map((w) => w.isEmpty
            ? w
            : '${w[0].toUpperCase()}${w.substring(1).toLowerCase()}')
        .join(' ');
  }
}
