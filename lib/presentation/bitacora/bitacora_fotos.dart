import 'dart:io';

import 'package:flutter/material.dart';
import 'package:flutter/services.dart' show SystemUiOverlayStyle;
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:image_picker/image_picker.dart';
import 'package:share_plus/share_plus.dart';

import '../../core/db/app_database.dart';
import '../../core/storage/fotos_bitacora_storage.dart';
import '../../core/sync/bitacora_remoto.dart';
import '../../core/sync/cloud_providers.dart';
import '../../core/theme/app_colors.dart';
import '../../core/theme/app_theme.dart';
import '../../data/providers.dart';
import '../../domain/bitacora/bitacora_reglas.dart';

// FOTOS de la bitácora en pantalla: tomarlas, verlas y compartirlas.
//
// La foto vive en el teléfono (`FotosBitacoraStorage`) desde que se toma hasta
// que se sube, y después se sigue viendo sin señal. Las que llegan de otro
// dispositivo se bajan la primera vez que se ven y se guardan en el MISMO
// lugar: la segunda vez ya no hace falta red (docs/PLAN_BITACORA_MOVIL.md §2.1).

/// Lado mayor y calidad JPEG con que se reducen, igual que la web
/// (`comprimirFoto`): una foto de 12 MP pesa ~4 MB y por datos móviles no sube.
const _ladoMaximo = 1600.0;
const _calidadJpeg = 80;

/// Toma una foto con la cámara o elige de la galería, ya reducida. Devuelve a lo
/// más [restantes] fotos; si la persona cancela, una lista vacía.
///
/// `pickMultiImage` exige un tope de 2 o más: cuando solo cabe una se usa el
/// selector de una sola foto.
Future<List<XFile>> elegirFotosBitacora(
  ImageSource origen, {
  required int restantes,
}) async {
  if (restantes <= 0) return const [];
  final picker = ImagePicker();
  if (origen == ImageSource.camera || restantes == 1) {
    final foto = await picker.pickImage(
      source: origen,
      maxWidth: _ladoMaximo,
      maxHeight: _ladoMaximo,
      imageQuality: _calidadJpeg,
    );
    return foto == null ? const [] : [foto];
  }
  final varias = await picker.pickMultiImage(
    maxWidth: _ladoMaximo,
    maxHeight: _ladoMaximo,
    imageQuality: _calidadJpeg,
    limit: restantes,
  );
  // El tope de la galería no lo respetan todas las versiones de Android.
  return varias.take(restantes).toList();
}

/// Hoja para escoger de dónde sale la foto. Null si se cierra sin elegir.
Future<ImageSource?> preguntarOrigenFoto(BuildContext context) {
  return showModalBottomSheet<ImageSource>(
    context: context,
    showDragHandle: true,
    builder: (ctx) => SafeArea(
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          ListTile(
            leading: const Icon(Icons.photo_camera_outlined),
            title: const Text('Tomar foto'),
            onTap: () => Navigator.pop(ctx, ImageSource.camera),
          ),
          ListTile(
            leading: const Icon(Icons.photo_library_outlined),
            title: const Text('Elegir de la galería'),
            onTap: () => Navigator.pop(ctx, ImageSource.gallery),
          ),
        ],
      ),
    ),
  );
}

/// El archivo de una foto en el teléfono, o null si no está (o el id no es
/// válido: un id raro que bajó del servidor no debe tirar la pantalla).
Future<File?> archivoLocalDeFoto(
  FotosBitacoraStorage storage,
  String fotoId,
  String mime,
) async {
  try {
    final f = await storage.archivo(fotoId, mime);
    return await f.exists() ? f : null;
  } catch (_) {
    return null;
  }
}

/// Descargas en curso por id de foto: la miniatura y el visor pueden pedir la
/// misma foto a la vez y no tiene caso bajarla dos veces.
final _descargas = <String, Future<File?>>{};

/// El archivo de la foto: el del teléfono si está; si no, y el servidor ya la
/// tiene, la baja y la guarda en el mismo lugar para verla después sin señal.
/// Null si no está aquí y no se pudo bajar (sin red, sin permiso).
///
/// [remoto] se pide como función para no construir el cliente de Supabase
/// cuando la foto ya está en el teléfono, que es el caso común.
Future<File?> obtenerFotoBitacora({
  required FotosBitacoraStorage storage,
  required BitacoraRemoto Function() remoto,
  required BitacoraFotoRow foto,
}) async {
  final local = await archivoLocalDeFoto(storage, foto.id, foto.mime);
  if (local != null) return local;
  // Nunca llegó al servidor: no hay de dónde bajarla.
  if (foto.serverUpdatedAt == null) return null;

  return _descargas[foto.id] ??= () async {
    try {
      final bytes = await remoto().descargarArchivo(foto.path);
      final destino = await storage.archivo(foto.id, foto.mime);
      await destino.parent.create(recursive: true);
      // A un temporal y luego se renombra, como `guardarCopia`: una descarga
      // cortada a la mitad nunca queda con el nombre de la foto.
      final temporal = File('${destino.path}.descarga');
      await temporal.writeAsBytes(bytes, flush: true);
      return await temporal.rename(destino.path);
    } catch (_) {
      return null;
    } finally {
      _descargas.remove(foto.id);
    }
  }();
}

/// El acceso al servidor de las fotos, o null si no se puede armar (Supabase
/// sin iniciar): sin él las fotos que no están en el teléfono solo no se bajan.
BitacoraRemoto? leerRemotoBitacora(WidgetRef ref) {
  try {
    return ref.read(bitacoraRemotoProvider);
  } catch (_) {
    return null;
  }
}

/// Comparte el archivo de una foto (WhatsApp, correo…). Es la salida para una
/// foto que el servidor ya no aceptó: sigue siendo evidencia.
Future<void> compartirFotoBitacora(File archivo, String mime) async {
  await Share.shareXFiles([XFile(archivo.path, mimeType: mime)]);
}

/// Miniatura cuadrada de una foto de la bitácora.
///
/// Busca el archivo en el teléfono y, si no está, lo baja. Sin archivo y sin
/// señal enseña un ícono; tocarlo vuelve a intentar.
class MiniaturaFotoBitacora extends ConsumerStatefulWidget {
  const MiniaturaFotoBitacora({
    super.key,
    required this.foto,
    required this.etiqueta,
    required this.onAbrir,
    this.onQuitar,
  });

  final BitacoraFotoRow foto;

  /// Lo que lee el lector de pantalla ("Foto 2 de la entrada").
  final String etiqueta;
  final VoidCallback onAbrir;

  /// Long-press: quitar la foto. Null si esta persona no puede.
  final VoidCallback? onQuitar;

  @override
  ConsumerState<MiniaturaFotoBitacora> createState() =>
      _MiniaturaFotoBitacoraState();
}

class _MiniaturaFotoBitacoraState extends ConsumerState<MiniaturaFotoBitacora> {
  File? _archivo;
  bool _buscando = true;

  @override
  void initState() {
    super.initState();
    _cargar();
  }

  Future<void> _cargar() async {
    // Desde initState ya vale true: ahí no se puede llamar a setState.
    if (!_buscando) setState(() => _buscando = true);
    // Todo lo de `ref` se lee ANTES del primer `await`: después la miniatura
    // pudo haberse desmontado y `ref` ya no sirve.
    final storage = ref.read(fotosBitacoraStorageProvider);
    final remoto = leerRemotoBitacora(ref);
    final f = remoto == null
        ? await archivoLocalDeFoto(storage, widget.foto.id, widget.foto.mime)
        : await obtenerFotoBitacora(
            storage: storage, remoto: () => remoto, foto: widget.foto);
    if (!mounted) return;
    setState(() {
      _archivo = f;
      _buscando = false;
    });
  }

  @override
  Widget build(BuildContext context) {
    final c = context.colores;
    final archivo = _archivo;
    final foto = widget.foto;

    final Widget contenido;
    if (_buscando) {
      contenido = const Center(
        child: SizedBox(
          width: 20,
          height: 20,
          child: CircularProgressIndicator(strokeWidth: 2),
        ),
      );
    } else if (archivo != null) {
      contenido = Image.file(
        archivo,
        fit: BoxFit.cover,
        // Una miniatura no necesita la foto entera en memoria.
        cacheWidth: 360,
        errorBuilder: (_, _, _) =>
            Icon(Icons.broken_image_outlined, color: c.textMuted),
      );
    } else {
      contenido = Icon(Icons.image_outlined, color: c.textMuted, size: 28);
    }

    // Estado de subida de la foto en la esquina: el color solo no basta, el
    // ícono cambia y el lector de pantalla lo lee en la etiqueta.
    final (IconData? iconoEstado, Color? colorEstado, String estado) =
        switch (foto.syncStatus) {
      'skipped' => (Icons.cloud_off_outlined, c.danger, ', no se subió'),
      'pending' || 'error' => (
          Icons.cloud_upload_outlined,
          c.warning,
          ', por subir'
        ),
      _ => (null, null, ''),
    };
    final sinArchivo =
        !_buscando && archivo == null ? ', no está en el teléfono' : '';

    return Semantics(
      label: '${widget.etiqueta}$estado$sinArchivo',
      button: true,
      onLongPressHint: widget.onQuitar == null ? null : 'Quitar la foto',
      excludeSemantics: true,
      child: Material(
        color: c.surfaceMuted,
        clipBehavior: Clip.antiAlias,
        shape: RoundedRectangleBorder(
          borderRadius: BorderRadius.circular(AppTheme.radiusMd),
          side: BorderSide(color: c.border),
        ),
        child: InkWell(
          // Sin archivo, tocar vuelve a intentar la descarga.
          onTap: _buscando ? null : (archivo != null ? widget.onAbrir : _cargar),
          onLongPress: widget.onQuitar,
          child: Stack(
            fit: StackFit.expand,
            children: [
              Center(child: contenido),
              if (iconoEstado != null)
                Positioned(
                  right: 4,
                  bottom: 4,
                  child: DecoratedBox(
                    decoration: BoxDecoration(
                      color: c.surface,
                      shape: BoxShape.circle,
                    ),
                    child: Padding(
                      padding: const EdgeInsets.all(3),
                      child: Icon(iconoEstado, size: 14, color: colorEstado),
                    ),
                  ),
                ),
            ],
          ),
        ),
      ),
    );
  }
}

/// Visor a pantalla completa de las fotos de una entrada: se desliza entre
/// ellas, se hace zoom con dos dedos y se comparte la que está a la vista.
class VisorFotosBitacora extends ConsumerStatefulWidget {
  const VisorFotosBitacora({
    super.key,
    required this.fotos,
    this.inicial = 0,
  });

  final List<BitacoraFotoRow> fotos;
  final int inicial;

  @override
  ConsumerState<VisorFotosBitacora> createState() => _VisorFotosBitacoraState();
}

class _VisorFotosBitacoraState extends ConsumerState<VisorFotosBitacora> {
  late final PageController _paginas =
      PageController(initialPage: widget.inicial);
  late int _actual = widget.inicial;

  /// id de foto → archivo (null = no está y no se pudo bajar). Sin llave =
  /// todavía buscándolo.
  final Map<String, File?> _archivos = {};

  @override
  void initState() {
    super.initState();
    final storage = ref.read(fotosBitacoraStorageProvider);
    final remoto = leerRemotoBitacora(ref);
    for (final f in widget.fotos) {
      final buscar = remoto == null
          ? archivoLocalDeFoto(storage, f.id, f.mime)
          : obtenerFotoBitacora(storage: storage, remoto: () => remoto, foto: f);
      buscar.then((archivo) {
        if (mounted) setState(() => _archivos[f.id] = archivo);
      });
    }
  }

  @override
  void dispose() {
    _paginas.dispose();
    super.dispose();
  }

  Future<void> _compartir(BitacoraFotoRow foto, File archivo) async {
    try {
      await compartirFotoBitacora(archivo, foto.mime);
    } catch (_) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('No se pudo compartir la foto.')),
      );
    }
  }

  @override
  Widget build(BuildContext context) {
    final c = context.colores;
    final total = widget.fotos.length;
    final foto = widget.fotos[_actual.clamp(0, total - 1)];
    final archivo = _archivos[foto.id];
    final estiloTitulo = Theme.of(context)
        .textTheme
        .titleMedium
        ?.copyWith(color: c.alwaysLight);

    // Fondo oscuro fijo en los dos temas: una foto se ve mejor sobre negro, y
    // `alwaysLight`/`alwaysDark` son justo las escotillas para esto.
    return Scaffold(
      backgroundColor: c.alwaysDark,
      appBar: AppBar(
        backgroundColor: c.alwaysDark,
        surfaceTintColor: c.alwaysDark,
        iconTheme: IconThemeData(color: c.alwaysLight),
        actionsIconTheme: IconThemeData(color: c.alwaysLight),
        titleTextStyle: estiloTitulo,
        systemOverlayStyle: SystemUiOverlayStyle.light,
        title: Text(total == 1 ? 'Foto' : 'Foto ${_actual + 1} de $total'),
        actions: [
          IconButton(
            icon: const Icon(Icons.share_outlined),
            tooltip: 'Compartir',
            onPressed: archivo == null ? null : () => _compartir(foto, archivo),
          ),
        ],
      ),
      body: PageView.builder(
        controller: _paginas,
        itemCount: total,
        onPageChanged: (i) => setState(() => _actual = i),
        itemBuilder: (context, i) {
          final f = widget.fotos[i];
          if (!_archivos.containsKey(f.id)) {
            return Center(
              child: CircularProgressIndicator(color: c.alwaysLight),
            );
          }
          final archivo = _archivos[f.id];
          if (archivo == null) {
            return Center(
              child: Padding(
                padding: const EdgeInsets.all(24),
                child: Column(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    Icon(Icons.image_not_supported_outlined,
                        size: 48, color: c.alwaysLight),
                    const SizedBox(height: 12),
                    Text(
                      'Esta foto no está en el teléfono. Se podrá ver cuando '
                      'haya señal.',
                      textAlign: TextAlign.center,
                      style: TextStyle(color: c.alwaysLight),
                    ),
                  ],
                ),
              ),
            );
          }
          return InteractiveViewer(
            minScale: 1,
            maxScale: 5,
            child: Center(
              child: Semantics(
                image: true,
                label: 'Foto ${i + 1} de $total',
                child: Image.file(
                  archivo,
                  fit: BoxFit.contain,
                  errorBuilder: (_, _, _) => Icon(Icons.broken_image_outlined,
                      size: 48, color: c.alwaysLight),
                ),
              ),
            ),
          );
        },
      ),
    );
  }
}

/// Cuántas fotos más le caben a una entrada con [vivas] fotos.
int fotosRestantes(int vivas) =>
    (maxFotosPorEntrada - vivas).clamp(0, maxFotosPorEntrada);
