import 'dart:async';
import 'dart:io';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:image_picker/image_picker.dart';
import 'package:intl/intl.dart';

import '../../core/db/app_database.dart';
import '../../core/sync/bitacora_avisos.dart';
import '../../core/sync/bitacora_remoto.dart';
import '../../core/sync/bitacora_sync.dart';
import '../../core/sync/cloud_providers.dart';
import '../../core/sync/rol_provider.dart';
import '../../core/theme/app_colors.dart';
import '../../core/theme/app_theme.dart';
import '../../data/providers.dart';
import '../../data/repositories_bitacora.dart';
import '../../domain/bitacora/bitacora_reglas.dart';
import '../../domain/import/mx_time.dart' show claveDiaMx, fechaMxDe;
import '../common/app_badge.dart';
import '../common/app_card.dart';
import '../common/app_snackbar.dart';
import '../common/confirm_dialog.dart';
import '../common/empty_state_view.dart';
import '../common/error_state_view.dart';
import '../common/esqueleto.dart';
import '../common/sync_status_action.dart';
import 'bitacora_fotos.dart';
import 'entrada_form_screen.dart';

/// BITÁCORA DE OBRA: lo que pasó cada día, con fotos, clima y quién estuvo.
/// Gemela de `/admin/obras/[id]/bitacora` en la web (mismas etiquetas y
/// mensajes; ver `timeline-bitacora.tsx`).
///
/// Todo se lee de la base local y se escribe ahí primero: la bitácora se
/// captura en la obra, muchas veces sin señal. Lo único que va EN LÍNEA es
/// mostrar o quitar una entrada del portal del cliente. Los permisos de cada
/// botón salen de las reglas puras de `bitacora_reglas.dart`; quien manda de
/// verdad es el servidor, y lo que rechaza llega aquí como un aviso.
class BitacoraScreen extends ConsumerStatefulWidget {
  const BitacoraScreen({
    super.key,
    required this.obraId,
    required this.obraNombre,
  });

  final String obraId;
  final String obraNombre;

  @override
  ConsumerState<BitacoraScreen> createState() => _BitacoraScreenState();
}

class _BitacoraScreenState extends ConsumerState<BitacoraScreen> {
  /// Reloj de la pantalla. Se mueve cada minuto para que "Se cierra en…" y los
  /// botones de editar se apaguen solos cuando la entrada cierra.
  int _ahora = DateTime.now().millisecondsSinceEpoch;
  Timer? _reloj;

  @override
  void initState() {
    super.initState();
    _reloj = Timer.periodic(const Duration(minutes: 1), (_) {
      if (mounted) {
        setState(() => _ahora = DateTime.now().millisecondsSinceEpoch);
      }
    });
  }

  @override
  void dispose() {
    _reloj?.cancel();
    super.dispose();
  }

  void _nuevaEntrada() {
    Navigator.of(context).push(MaterialPageRoute(
      builder: (_) => EntradaFormScreen(obraId: widget.obraId),
    ));
  }

  void _explicar() {
    showDialog<void>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: const Text('Cómo funciona la bitácora'),
        content: const Text(
          'Lo que pasa cada día en la obra, con fotos. Cada entrada se cierra '
          '24 horas después de registrarse: así sirve de evidencia. Lo marcado '
          'para el cliente aparece en su portal.\n\n'
          'Todo se guarda primero en el teléfono, aunque no haya señal, y se '
          'sube solo cuando hay internet. Mostrar una entrada al cliente sí '
          'necesita señal.',
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(ctx),
            child: const Text('Entendido'),
          ),
        ],
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    // Mientras el rol carga se trata como "sin cuenta" (acceso de dueño), igual
    // que el resto de los gates de rol: esconderle botones a un admin porque la
    // red tarda sería peor, y el servidor rechaza lo que no toca.
    final rol = ref.watch(rolUsuarioProvider).asData?.value;
    final miUid = ref.watch(currentUserProvider)?.id;
    final avisos = ref.watch(avisosBitacoraProvider);
    final async = ref.watch(bitacoraDeObraProvider(widget.obraId));
    final captura = puedeCapturar(rol);

    return Scaffold(
      appBar: AppBar(
        title: Text('Bitácora · ${widget.obraNombre}'),
        actions: [
          const SyncStatusAction(),
          IconButton(
            icon: const Icon(Icons.info_outline),
            tooltip: 'Cómo funciona la bitácora',
            onPressed: _explicar,
          ),
        ],
      ),
      body: async.when(
        loading: () => const EsqueletoLista(filas: 3),
        error: (e, _) => ErrorStateView(
          message: 'No se pudo cargar la bitácora.',
          onRetry: () => ref.invalidate(bitacoraDeObraProvider(widget.obraId)),
        ),
        // Los avisos viven en preferencias, no en la base: se vuelven a leer
        // cada vez que el sync agrega uno o la persona lo quita.
        data: (entradas) => StreamBuilder<void>(
          stream: avisos.cambios,
          builder: (context, _) => _LineaDeTiempo(
            entradas: entradas,
            avisos: avisos.deObra(widget.obraId),
            permisos: _Permisos(rol: rol, miUid: miUid, ahora: _ahora),
          ),
        ),
      ),
      floatingActionButton: captura
          ? FloatingActionButton.extended(
              heroTag: 'fabBitacora',
              onPressed: _nuevaEntrada,
              icon: const Icon(Icons.add),
              label: const Text('Nueva entrada'),
            )
          : null,
    );
  }
}

/// Quién mira y a qué hora: lo que necesitan las reglas puras para decidir qué
/// botones pintar.
class _Permisos {
  const _Permisos({required this.rol, required this.miUid, required this.ahora});

  final String? rol;
  final String? miUid;
  final int ahora;
}

// ── Días ──────────────────────────────────────────────────────────────────

/// Un día de la línea de tiempo.
class DiaBitacora {
  DiaBitacora(this.clave, this.fecha);

  /// 'YYYY-MM-DD' del día en la Ciudad de México.
  final String clave;

  /// Medianoche de ese día (epoch ms), la `fecha` de su primera entrada.
  final int fecha;
  final List<EntradaConDetalle> entradas = [];
}

/// Agrupa por día de CALENDARIO en México (igual que la web), del más reciente
/// al más antiguo. Dentro del día se respeta el orden que ya trae el
/// repositorio (en el que llegaron, lo que aún no sube al final).
List<DiaBitacora> agruparPorDia(List<EntradaConDetalle> entradas) {
  final dias = <String, DiaBitacora>{};
  for (final e in entradas) {
    final clave = claveDiaMx(e.entrada.fecha);
    (dias[clave] ??= DiaBitacora(clave, e.entrada.fecha)).entradas.add(e);
  }
  return dias.values.toList()..sort((a, b) => b.clave.compareTo(a.clave));
}

/// "lunes, 6 de octubre de 2026": el día de una `fecha` (medianoche de México)
/// leído en México, como el `fmtDia` de la web, sin importar la zona del
/// teléfono.
String _diaLargo(int fechaMs) {
  final f = fechaMxDe(fechaMs);
  return DateFormat("EEEE, d 'de' MMMM 'de' y", 'es_MX')
      .format(DateTime(f.year, f.month, f.day));
}

/// Encabezado del día, con mayúscula inicial ("Lunes, 6 de octubre de 2026").
String etiquetaDiaBitacora(int fechaMs) {
  final s = _diaLargo(fechaMs);
  return s.isEmpty ? s : s[0].toUpperCase() + s.substring(1);
}

/// Hora del teléfono a la que llegó al servidor.
String _hora(int ms) =>
    DateFormat('HH:mm').format(DateTime.fromMillisecondsSinceEpoch(ms));

String _fechaHora(int ms) => DateFormat("d MMM y, HH:mm", 'es_MX')
    .format(DateTime.fromMillisecondsSinceEpoch(ms));

BadgeTone _tonoTipo(String tipo) => switch (tipo) {
      'AVANCE' => BadgeTone.success,
      'INCIDENCIA' => BadgeTone.danger,
      'INSTRUCCION' => BadgeTone.info,
      'VISITA' => BadgeTone.warning,
      _ => BadgeTone.neutral,
    };

class _LineaDeTiempo extends StatelessWidget {
  const _LineaDeTiempo({
    required this.entradas,
    required this.avisos,
    required this.permisos,
  });

  final List<EntradaConDetalle> entradas;
  final List<AvisoBitacora> avisos;
  final _Permisos permisos;

  @override
  Widget build(BuildContext context) {
    final c = context.colores;
    final textTheme = Theme.of(context).textTheme;
    // El motivo de cada fila que no subió (el último aviso de esa fila gana,
    // como `AvisosBitacora.deFila`). Se arma una vez y no por tarjeta.
    final avisoDeFila = {for (final a in avisos) a.filaId: a};

    // Lista plana para construir solo lo que está a la vista: una obra larga
    // junta cientos de entradas.
    final items = <WidgetBuilder>[
      for (final a in avisos)
        (_) => Padding(
              key: ValueKey('aviso-${a.id}'),
              padding: const EdgeInsets.only(bottom: 8),
              child: _TarjetaAviso(
                  aviso: a, entradas: entradas, rol: permisos.rol),
            ),
      if (entradas.isEmpty)
        (_) => EmptyStateView(
              icon: Icons.menu_book_outlined,
              title: 'Sin entradas todavía.',
              hint: puedeCapturar(permisos.rol)
                  ? 'Anota lo que pasó hoy: avance, incidencias, instrucciones '
                      'o visitas, con fotos.'
                  : 'Todavía no hay nada anotado.',
            ),
      for (final d in agruparPorDia(entradas)) ...[
        (_) => Padding(
              key: ValueKey('dia-${d.clave}'),
              padding: const EdgeInsets.fromLTRB(4, 12, 4, 8),
              child: Semantics(
                header: true,
                child: Text(
                  etiquetaDiaBitacora(d.fecha),
                  style: textTheme.titleSmall?.copyWith(color: c.textStrong),
                ),
              ),
            ),
        for (final e in d.entradas)
          (_) => Padding(
                key: ValueKey('entrada-${e.entrada.id}'),
                padding: const EdgeInsets.only(bottom: 8),
                child: _TarjetaEntrada(
                  detalle: e,
                  permisos: permisos,
                  avisoDeFila: avisoDeFila,
                ),
              ),
      ],
    ];

    return ListView.builder(
      // Abajo deja lugar al botón flotante.
      padding: const EdgeInsets.fromLTRB(12, 8, 12, 96),
      itemCount: items.length,
      itemBuilder: (context, i) => items[i](context),
    );
  }
}

// ── Una entrada ───────────────────────────────────────────────────────────

enum _Accion { editar, fotos, aclarar, publicar, borrar }

class _TarjetaEntrada extends ConsumerWidget {
  const _TarjetaEntrada({
    required this.detalle,
    required this.permisos,
    required this.avisoDeFila,
  });

  final EntradaConDetalle detalle;
  final _Permisos permisos;
  final Map<String, AvisoBitacora> avisoDeFila;

  BitacoraEntradaRow get _e => detalle.entrada;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final c = context.colores;
    final textTheme = Theme.of(context).textTheme;
    final e = _e;
    final confirmada = detalle.confirmadaEnServidor;
    final abierta =
        estaAbierta(registradaEn: e.registradaEn, ahoraMs: permisos.ahora);
    final editable = puedeEditarEntrada(
      rol: permisos.rol,
      autorId: e.autorId,
      miUid: permisos.miUid,
      abierta: abierta,
      confirmadaEnServidor: confirmada,
    );
    final masFotos = puedeAgregarFotos(
      rol: permisos.rol,
      autorId: e.autorId,
      miUid: permisos.miUid,
      abierta: abierta,
      confirmadaEnServidor: confirmada,
      fotosVivas: detalle.fotos.length,
    );
    final noSubio = e.syncStatus == 'skipped';
    // Una aclaración en una entrada que el servidor no aceptó nunca subiría:
    // esperaría para siempre a una entrada que no va a llegar.
    final aclara = puedeAclarar(permisos.rol) && !noSubio;
    final publica = puedePublicarAlCliente(
      rol: permisos.rol,
      autorId: e.autorId,
      miUid: permisos.miUid,
      confirmadaEnServidor: confirmada,
    );
    final porSubir = !noSubio &&
        (e.syncStatus == 'pending' ||
            e.syncStatus == 'error' ||
            e.registradaEn == 0);

    final acciones = <PopupMenuEntry<_Accion>>[
      if (editable) _item(_Accion.editar, Icons.edit_outlined, 'Editar'),
      if (masFotos)
        _item(_Accion.fotos, Icons.add_a_photo_outlined, 'Agregar fotos'),
      if (aclara)
        _item(_Accion.aclarar, Icons.comment_outlined, 'Agregar aclaración'),
      if (publica)
        e.visibleCliente
            ? _item(_Accion.publicar, Icons.visibility_off_outlined,
                'Quitar del portal')
            : _item(_Accion.publicar, Icons.visibility_outlined,
                'Mostrar al cliente'),
      if (editable) _item(_Accion.borrar, Icons.delete_outline, 'Borrar'),
    ];

    // Personal: con nombres, su número; sin ellos, el conteo anotado.
    final nombres = detalle.nombres;
    final personal = e.personalPresente ?? (nombres.isEmpty ? null : nombres.length);

    final autor = e.autorNombre.isNotEmpty
        ? 'Registró ${e.autorNombre}'
        : e.registradaEn == 0
            ? 'Registrada en este teléfono'
            : 'Registró alguien del equipo';
    final pie = [
      autor,
      if (e.registradaEn > 0) _hora(e.registradaEn),
      // Sin hora del servidor la ventana de 24 h todavía no corre: ya lo dice
      // la insignia "Por subir".
      if (e.registradaEn > 0)
        textoCierre(registradaEn: e.registradaEn, ahoraMs: permisos.ahora),
      if (!e.visibleCliente) 'Solo interna',
    ].join(' · ');

    final aviso = avisoDeFila[e.id];

    return AppCard(
      padding: CardPadding.md,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Expanded(
                child: Padding(
                  padding: const EdgeInsets.only(top: 4),
                  child: Wrap(
                    spacing: 6,
                    runSpacing: 6,
                    children: [
                      AppBadge(tiposEntrada[e.tipo] ?? e.tipo,
                          tone: _tonoTipo(e.tipo)),
                      if (e.visibleCliente)
                        const AppBadge('La ve el cliente',
                            tone: BadgeTone.info,
                            icon: Icons.visibility_outlined),
                      if (porSubir)
                        const AppBadge('Por subir',
                            tone: BadgeTone.warning,
                            icon: Icons.cloud_upload_outlined),
                      if (noSubio)
                        const AppBadge('No se subió',
                            tone: BadgeTone.danger,
                            icon: Icons.cloud_off_outlined),
                    ],
                  ),
                ),
              ),
              if (acciones.isNotEmpty)
                PopupMenuButton<_Accion>(
                  tooltip: 'Acciones de la entrada',
                  icon: const Icon(Icons.more_vert),
                  onSelected: (a) => _accion(context, ref, a),
                  itemBuilder: (_) => acciones,
                ),
            ],
          ),
          const SizedBox(height: 8),
          Text(e.texto,
              style: textTheme.bodyMedium?.copyWith(color: c.textStrong)),
          if (e.clima.isNotEmpty) ...[
            const SizedBox(height: 6),
            Text('Clima: ${climas[e.clima] ?? e.clima}',
                style: textTheme.bodySmall?.copyWith(color: c.text)),
          ],
          if (personal != null) ...[
            const SizedBox(height: 6),
            Text(
              'Personal: $personal ${personal == 1 ? 'persona' : 'personas'}',
              style: textTheme.bodySmall
                  ?.copyWith(color: c.text, fontWeight: FontWeight.w600),
            ),
            if (nombres.isNotEmpty) ...[
              const SizedBox(height: 4),
              Wrap(
                spacing: 4,
                runSpacing: 4,
                children: [for (final n in nombres) AppBadge(n)],
              ),
            ],
          ],
          if (detalle.fotos.isNotEmpty) ...[
            const SizedBox(height: 10),
            _CuadriculaFotos(
              fotos: detalle.fotos,
              onQuitar: editable ? (f) => _quitarFoto(context, ref, f) : null,
            ),
          ],
          const SizedBox(height: 10),
          Text(pie, style: textTheme.bodySmall?.copyWith(color: c.textMuted)),
          if (noSubio) ...[
            const SizedBox(height: 6),
            Text(
              aviso != null
                  ? explicarRechazo(aviso.rechazo)
                  : 'El servidor no la aceptó y ya no se vuelve a intentar.',
              style: textTheme.bodySmall?.copyWith(color: c.danger),
            ),
          ],
          if (detalle.aclaraciones.isNotEmpty) ...[
            const SizedBox(height: 12),
            _Aclaraciones(
                aclaraciones: detalle.aclaraciones, avisoDeFila: avisoDeFila),
          ],
        ],
      ),
    );
  }

  static PopupMenuItem<_Accion> _item(_Accion a, IconData icono, String texto) =>
      PopupMenuItem(
        value: a,
        child: ListTile(
          contentPadding: EdgeInsets.zero,
          leading: Icon(icono),
          title: Text(texto),
        ),
      );

  Future<void> _accion(BuildContext context, WidgetRef ref, _Accion a) {
    return switch (a) {
      _Accion.editar => Navigator.of(context).push(MaterialPageRoute(
          builder: (_) =>
              EntradaFormScreen(obraId: _e.obraId, inicial: detalle),
        )),
      _Accion.fotos => _agregarFotos(context, ref),
      _Accion.aclarar => _aclarar(context, ref),
      _Accion.publicar => _publicar(context, ref),
      _Accion.borrar => _borrar(context, ref),
    };
  }

  Future<void> _agregarFotos(BuildContext context, WidgetRef ref) async {
    // Todo lo de `ref` antes del primer `await`: la tarjeta puede reconstruirse
    // mientras la cámara está abierta.
    final repo = ref.read(bitacoraRepositoryProvider);
    final empresaId = ref.read(empresaIdProvider) ?? '';
    final origen = await preguntarOrigenFoto(context);
    if (origen == null) return;

    final List<XFile> elegidas;
    try {
      elegidas = await elegirFotosBitacora(origen,
          restantes: fotosRestantes(detalle.fotos.length));
    } catch (_) {
      if (context.mounted) {
        showAppSnack(
          context,
          origen == ImageSource.camera
              ? 'No se pudo abrir la cámara. Revisa que la app tenga permiso.'
              : 'No se pudo abrir la galería. Revisa que la app tenga permiso.',
          tone: SnackTone.danger,
        );
      }
      return;
    }
    if (elegidas.isEmpty) return;

    var guardadas = 0;
    // El primer motivo concreto (foto vacía o de más de 10 MB); si no hay,
    // lo que falló fue el máximo de fotos.
    String? motivo;
    for (final f in elegidas) {
      try {
        await repo.agregarFoto(
          entradaId: _e.id,
          obraId: _e.obraId,
          empresaId: empresaId,
          origen: f.path,
        );
        guardadas++;
      } on ArgumentError catch (e) {
        motivo ??= '${e.message}';
      } catch (_) {
        // Se cuenta abajo y se avisa.
      }
    }
    if (!context.mounted) return;
    if (guardadas == elegidas.length) {
      showAppSnack(
        context,
        guardadas == 1 ? 'Foto agregada.' : '$guardadas fotos agregadas.',
        tone: SnackTone.success,
      );
    } else {
      showAppSnack(
        context,
        'Se agregaron $guardadas de ${elegidas.length} fotos. '
        '${motivo ?? 'Una entrada lleva máximo $maxFotosPorEntrada.'}',
        tone: SnackTone.warning,
      );
    }
  }

  Future<void> _aclarar(BuildContext context, WidgetRef ref) async {
    final repo = ref.read(bitacoraRepositoryProvider);
    final empresaId = ref.read(empresaIdProvider) ?? '';
    final texto = await showDialog<String>(
      context: context,
      builder: (_) => const _DialogoAclaracion(),
    );
    if (texto == null) return;
    try {
      await repo.agregarAclaracion(
          entradaId: _e.id, empresaId: empresaId, texto: texto);
      if (context.mounted) {
        showAppSnack(context, 'Aclaración guardada.', tone: SnackTone.success);
      }
    } on ArgumentError catch (err) {
      if (context.mounted) {
        showAppSnack(context, '${err.message}', tone: SnackTone.danger);
      }
    }
  }

  Future<void> _publicar(BuildContext context, WidgetRef ref) async {
    const sinSenal = 'Necesitas señal para cambiar lo que ve el cliente. '
        'Inténtalo cuando haya internet.';
    final visible = !_e.visibleCliente;
    try {
      // Va EN LÍNEA y solo manda `visible_cliente` (docs/PLAN_BITACORA_MOVIL.md
      // §2.2): nunca arrastra una edición que todavía no sube.
      await ref.read(bitacoraSyncProvider).publicar(_e.id, visible);
      if (!context.mounted) return;
      showAppSnack(
        context,
        visible
            ? 'Listo: el cliente ya la ve en su portal.'
            : 'Listo: se quitó del portal del cliente.',
        tone: SnackTone.success,
      );
    } on RemotoError catch (err) {
      if (!context.mounted) return;
      final rechazo = clasificarRechazo(code: err.code, message: err.message);
      showAppSnack(
        context,
        rechazo != null ? explicarRechazo(rechazo) : sinSenal,
        tone: SnackTone.danger,
      );
    } catch (_) {
      if (context.mounted) {
        showAppSnack(context, sinSenal, tone: SnackTone.danger);
      }
    }
  }

  Future<void> _borrar(BuildContext context, WidgetRef ref) async {
    final repo = ref.read(bitacoraRepositoryProvider);
    final ok = await confirmDialog(
      context,
      title: 'Borrar entrada',
      message: '¿Borrar esta entrada? Solo se puede mientras no pasen 24 horas.',
      actionLabel: 'Borrar',
    );
    if (!ok) return;
    await repo.borrarEntrada(_e.id);
    if (context.mounted) {
      showAppSnack(context, 'Entrada borrada.', tone: SnackTone.success);
    }
  }

  Future<void> _quitarFoto(
      BuildContext context, WidgetRef ref, BitacoraFotoRow foto) async {
    final repo = ref.read(bitacoraRepositoryProvider);
    final ok = await confirmDialog(
      context,
      title: 'Quitar foto',
      message: '¿Quitar esta foto de la entrada?',
      actionLabel: 'Quitar',
    );
    if (!ok) return;
    await repo.quitarFoto(foto.id);
    if (context.mounted) {
      showAppSnack(context, 'Foto quitada.', tone: SnackTone.success);
    }
  }
}

/// Las fotos de una entrada, en cuadrícula de tres.
class _CuadriculaFotos extends StatelessWidget {
  const _CuadriculaFotos({required this.fotos, required this.onQuitar});

  final List<BitacoraFotoRow> fotos;
  final void Function(BitacoraFotoRow)? onQuitar;

  @override
  Widget build(BuildContext context) {
    return Semantics(
      label: 'Fotos de la entrada',
      container: true,
      child: GridView.count(
        crossAxisCount: 3,
        mainAxisSpacing: 6,
        crossAxisSpacing: 6,
        shrinkWrap: true,
        physics: const NeverScrollableScrollPhysics(),
        padding: EdgeInsets.zero,
        children: [
          for (var i = 0; i < fotos.length; i++)
            MiniaturaFotoBitacora(
              key: ValueKey(fotos[i].id),
              foto: fotos[i],
              etiqueta: 'Foto ${i + 1} de la entrada',
              onAbrir: () => Navigator.of(context).push(MaterialPageRoute(
                builder: (_) => VisorFotosBitacora(fotos: fotos, inicial: i),
              )),
              onQuitar: onQuitar == null ? null : () => onQuitar!(fotos[i]),
            ),
        ],
      ),
    );
  }
}

/// Notas fechadas debajo de la entrada. No se editan ni se borran nunca.
class _Aclaraciones extends StatelessWidget {
  const _Aclaraciones({required this.aclaraciones, required this.avisoDeFila});

  final List<BitacoraAclaracionRow> aclaraciones;
  final Map<String, AvisoBitacora> avisoDeFila;

  @override
  Widget build(BuildContext context) {
    final c = context.colores;
    final textTheme = Theme.of(context).textTheme;

    return Semantics(
      label: 'Aclaraciones',
      container: true,
      child: DecoratedBox(
        decoration: BoxDecoration(
          border: Border(left: BorderSide(color: c.warning, width: 3)),
        ),
        child: Padding(
          padding: const EdgeInsets.only(left: 10),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text('Aclaraciones',
                  style: textTheme.labelLarge?.copyWith(color: c.text)),
              for (final a in aclaraciones) ...[
                const SizedBox(height: 6),
                Text(a.texto,
                    style: textTheme.bodyMedium?.copyWith(color: c.textStrong)),
                Text(
                  [
                    a.autorNombre.isNotEmpty
                        ? a.autorNombre
                        : a.registradaEn == 0
                            ? 'Tú, en este teléfono'
                            : 'Alguien del equipo',
                    if (a.registradaEn > 0)
                      _fechaHora(a.registradaEn)
                    else if (a.syncStatus == 'skipped')
                      'No se subió'
                    else
                      'Por subir',
                  ].join(' · '),
                  style: textTheme.bodySmall?.copyWith(color: c.textMuted),
                ),
                if (a.syncStatus == 'skipped' && avisoDeFila[a.id] != null)
                  Text(explicarRechazo(avisoDeFila[a.id]!.rechazo),
                      style: textTheme.bodySmall?.copyWith(color: c.danger)),
              ],
            ],
          ),
        ),
      ),
    );
  }
}

class _DialogoAclaracion extends StatefulWidget {
  const _DialogoAclaracion();

  @override
  State<_DialogoAclaracion> createState() => _DialogoAclaracionState();
}

class _DialogoAclaracionState extends State<_DialogoAclaracion> {
  final _texto = TextEditingController();
  String? _error;

  @override
  void dispose() {
    _texto.dispose();
    super.dispose();
  }

  /// Un doble toque haría dos `pop`: el segundo sacaría la bitácora.
  bool _cerrado = false;

  void _guardar() {
    if (_cerrado) return;
    final error = validarAclaracion(_texto.text);
    if (error != null) {
      setState(() => _error = error);
      return;
    }
    _cerrado = true;
    Navigator.pop(context, _texto.text.trim());
  }

  @override
  Widget build(BuildContext context) {
    return AlertDialog(
      title: const Text('Agregar aclaración'),
      content: SizedBox(
        width: double.maxFinite,
        child: TextField(
          controller: _texto,
          autofocus: true,
          minLines: 3,
          maxLines: 8,
          maxLength: maxLargoTexto,
          textCapitalization: TextCapitalization.sentences,
          onChanged: (_) {
            if (_error != null) setState(() => _error = null);
          },
          decoration: InputDecoration(
            labelText: 'Aclaración',
            hintText: 'Ej.: Fueron 3 m³, no 4. Se corrige lo anotado.',
            helperText: 'Una aclaración ya no se edita ni se borra.',
            helperMaxLines: 2,
            errorText: _error,
          ),
        ),
      ),
      actions: [
        TextButton(
          onPressed: () => Navigator.pop(context),
          child: const Text('Cancelar'),
        ),
        FilledButton(
          onPressed: _guardar,
          child: const Text('Guardar aclaración'),
        ),
      ],
    );
  }
}

// ── Avisos de lo que el servidor no aceptó ────────────────────────────────

/// Un rechazo que ya no se reintenta (docs/PLAN_BITACORA_MOVIL.md §2.3): qué
/// pasó, lo que no subió y qué se puede hacer con eso.
class _TarjetaAviso extends ConsumerStatefulWidget {
  const _TarjetaAviso({
    required this.aviso,
    required this.entradas,
    required this.rol,
  });

  final AvisoBitacora aviso;
  final List<EntradaConDetalle> entradas;
  final String? rol;

  @override
  ConsumerState<_TarjetaAviso> createState() => _TarjetaAvisoState();
}

class _TarjetaAvisoState extends ConsumerState<_TarjetaAviso> {
  /// El archivo de la foto rechazada, si sigue en el teléfono.
  Future<File?>? _archivoFoto;

  bool get _esFoto => widget.aviso.tabla == BitacoraSync.fotos;

  @override
  void initState() {
    super.initState();
    if (_esFoto) _archivoFoto = _buscarArchivoFoto();
  }

  BitacoraFotoRow? get _foto {
    for (final e in widget.entradas) {
      for (final f in e.fotos) {
        if (f.id == widget.aviso.filaId) return f;
      }
    }
    return null;
  }

  Future<File?> _buscarArchivoFoto() async {
    final storage = ref.read(fotosBitacoraStorageProvider);
    final foto = _foto;
    // Sin la fila no se sabe el tipo: se prueba con los tres que acepta el
    // bucket (el nombre del archivo es el id de la foto).
    final mimes = foto != null
        ? [foto.mime]
        : const ['image/jpeg', 'image/png', 'image/webp'];
    for (final m in mimes) {
      final f = await archivoLocalDeFoto(storage, widget.aviso.filaId, m);
      if (f != null) return f;
    }
    return null;
  }

  Future<void> _quitar() async {
    await ref.read(avisosBitacoraProvider).quitar(widget.aviso.id);
  }

  /// Evita que un doble toque cree la aclaración dos veces.
  bool _enviando = false;

  Future<void> _agregarComoAclaracion() async {
    if (_enviando) return;
    _enviando = true;
    final repo = ref.read(bitacoraRepositoryProvider);
    final avisos = ref.read(avisosBitacoraProvider);
    final empresaId = ref.read(empresaIdProvider) ?? '';
    try {
      await repo.agregarAclaracion(
        entradaId: widget.aviso.entradaId,
        empresaId: empresaId,
        texto: widget.aviso.texto ?? '',
      );
      await avisos.quitar(widget.aviso.id);
      if (mounted) {
        showAppSnack(context, 'Se agregó como aclaración.',
            tone: SnackTone.success);
      }
    } on ArgumentError catch (err) {
      _enviando = false;
      if (mounted) {
        showAppSnack(context, '${err.message}', tone: SnackTone.danger);
      }
    } catch (_) {
      _enviando = false;
      if (mounted) {
        showAppSnack(context, 'No se pudo agregar. Intenta de nuevo.',
            tone: SnackTone.danger);
      }
    }
  }

  Future<void> _compartir(File archivo) async {
    try {
      await compartirFotoBitacora(archivo, _foto?.mime ?? 'image/jpeg');
    } catch (_) {
      if (mounted) {
        showAppSnack(context, 'No se pudo compartir la foto.',
            tone: SnackTone.danger);
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    final c = context.colores;
    final textTheme = Theme.of(context).textTheme;
    final a = widget.aviso;
    final texto = a.texto?.trim() ?? '';

    EntradaConDetalle? destino;
    for (final e in widget.entradas) {
      if (e.entrada.id == a.entradaId) destino = e;
    }
    final esAclaracion = a.tabla == BitacoraSync.aclaraciones;
    // La aclaración se cuelga de la entrada del aviso: tiene que estar aquí,
    // ya en el servidor y viva para el sync; si no, nunca subiría.
    final destinoAcepta = destino != null &&
        destino.confirmadaEnServidor &&
        destino.entrada.syncStatus != 'skipped';
    final ofrecerAclaracion =
        !_esFoto && texto.isNotEmpty && puedeAclarar(widget.rol) && destinoAcepta;

    final titulo = _esFoto
        ? 'Una foto no se subió'
        : esAclaracion
            ? 'Una aclaración no se subió'
            : destino?.confirmadaEnServidor == true
                ? 'Tu cambio no se subió'
                : 'La entrada no se subió';

    return AppCard(
      borderColor: c.warning,
      child: Semantics(
        liveRegion: true,
        container: true,
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(children: [
              Icon(Icons.report_problem_outlined, color: c.warning, size: 20),
              const SizedBox(width: 8),
              Expanded(
                child: Text(titulo,
                    style: textTheme.titleSmall?.copyWith(color: c.textStrong)),
              ),
            ]),
            const SizedBox(height: 6),
            Text(explicarRechazo(a.rechazo),
                style: textTheme.bodyMedium?.copyWith(color: c.text)),
            if (a.fechaEntrada != null) ...[
              const SizedBox(height: 4),
              Text('Entrada del ${_diaLargo(a.fechaEntrada!)}',
                  style: textTheme.bodySmall?.copyWith(color: c.textMuted)),
            ],
            if (texto.isNotEmpty) ...[
              const SizedBox(height: 8),
              Text('Lo que no se subió:',
                  style: textTheme.labelMedium?.copyWith(color: c.text)),
              const SizedBox(height: 4),
              DecoratedBox(
                decoration: BoxDecoration(
                  color: c.surfaceMuted,
                  borderRadius: BorderRadius.circular(AppTheme.radiusMd),
                ),
                child: Padding(
                  padding: const EdgeInsets.all(10),
                  child: Text(texto,
                      style:
                          textTheme.bodyMedium?.copyWith(color: c.textStrong)),
                ),
              ),
            ],
            const SizedBox(height: 8),
            Wrap(
              spacing: 8,
              runSpacing: 4,
              children: _esFoto
                  ? [
                      FilledButton.tonal(
                        onPressed: _quitar,
                        child: const Text('Entendido'),
                      ),
                      FutureBuilder<File?>(
                        future: _archivoFoto,
                        builder: (context, snap) {
                          final archivo = snap.data;
                          if (archivo == null) return const SizedBox.shrink();
                          return OutlinedButton.icon(
                            onPressed: () => _compartir(archivo),
                            icon: const Icon(Icons.share_outlined),
                            label: const Text('Compartir foto'),
                          );
                        },
                      ),
                    ]
                  : [
                      if (ofrecerAclaracion)
                        FilledButton(
                          onPressed: _agregarComoAclaracion,
                          child: const Text('Agregar como aclaración'),
                        ),
                      TextButton(
                        onPressed: _quitar,
                        child: const Text('Descartar'),
                      ),
                    ],
            ),
          ],
        ),
      ),
    );
  }
}
