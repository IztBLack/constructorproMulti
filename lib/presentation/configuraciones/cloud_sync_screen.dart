import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:intl/intl.dart';
import 'package:supabase_flutter/supabase_flutter.dart';

import '../../core/settings/settings_provider.dart';
import '../../core/theme/app_colors.dart';
import '../../core/sync/cloud_providers.dart';
import '../../core/sync/cuenta_local.dart';
import '../../core/sync/supabase_config.dart';
import '../../core/sync/sync_service.dart';
import '../../core/sync/sync_status.dart';
import '../../data/providers.dart';
import '../../domain/sync/rechazos_sync.dart';
import '../common/error_state_view.dart';
import 'conflictos_screen.dart';

/// Pantalla de conexión a la nube (Fase 2). Sin sesión muestra el login; con
/// sesión y empresa muestra el estado y el botón de sincronizar; con sesión pero
/// sin empresa vinculada muestra el campo para ingresar el código de vinculación.
/// La app sigue siendo offline-first: esto solo habilita el sync.
class CloudSyncScreen extends ConsumerStatefulWidget {
  const CloudSyncScreen({super.key});

  @override
  ConsumerState<CloudSyncScreen> createState() => _CloudSyncScreenState();
}

enum _PantallaEstado { login, vinculacion, conectado }

/// Respuesta del diálogo de "Cerrar sesión".
enum _AlCerrar { cancelar, sincronizar, cerrar, cerrarYBorrar }

class _CloudSyncScreenState extends ConsumerState<CloudSyncScreen> {
  final _email = TextEditingController();
  final _password = TextEditingController();
  final _codigoCtrl = TextEditingController();

  bool _loading = false;
  String? _error;

  /// El contenedor de providers de la APP, no el `ref` de esta pantalla: las
  /// acciones de cuenta esperan red y diálogos, y si la persona sale de la
  /// pantalla a la mitad, un `ref` muerto lanzaría en pleno vaciado.
  late final ProviderContainer _app =
      ProviderScope.containerOf(context, listen: false);

  /// Indicación (no error) para el login, p. ej. con qué cuenta volver a
  /// entrar para no perder cambios sin subir.
  String? _aviso;

  /// Cuando es true, el formulario de login opera en modo "Crear cuenta".
  bool _modoRegistro = false;

  // Estado explícito de la pantalla para manejar la vista de vinculación sin
  // depender únicamente de los providers reactivos.
  _PantallaEstado _estado = _PantallaEstado.login;

  /// True mientras validamos contra el servidor una sesión ya restaurada.
  bool _validando = false;

  /// True cuando la validación inicial no pudo completarse (timeout o error de
  /// red). No sabemos si la cuenta está vinculada o no, así que mostramos un
  /// estado de reintento en vez de arrastrar al usuario a una vista engañosa.
  bool _falloValidacion = false;

  @override
  void initState() {
    super.initState();
    // Si al abrir la pantalla ya hay una sesión restaurada, NO confíes en el
    // empresa_id de prefs (puede estar viejo tras un reset). Valida contra el
    // servidor para decidir si va a "conectado" o a la pantalla de vinculación.
    if (SupabaseConfig.currentUser != null) {
      _validando = true;
      WidgetsBinding.instance.addPostFrameCallback((_) => _validarSesion());
    }
  }

  Future<void> _validarSesion() async {
    try {
      // `resolverEmpresaYsellar` hace una consulta de RED a Supabase. Su
      // try/catch interno devuelve null solo ante un ERROR real; un cuelgue de
      // red (nunca responde) no es un error, así que sin timeout la pantalla
      // giraría para siempre. El timeout convierte el cuelgue en algo manejable.
      final empresaId = await resolverEmpresaYsellar(
        _app,
        confirmarCambio: _confirmarCambioDeCuenta,
        timeout: const Duration(seconds: 12),
      );
      if (!mounted) return;
      setState(() {
        _validando = false;
        _falloValidacion = false;
        _estado = empresaId == null
            ? _PantallaEstado.vinculacion
            : _PantallaEstado.conectado;
      });
    } on CambioDeCuentaCancelado {
      if (mounted) setState(() => _validando = false);
      await _volverACuentaAnterior();
    } on TimeoutException catch (_) {
      // La red no respondió a tiempo. NO caemos a la vista de vinculación: no
      // sabemos si la cuenta está vinculada, y mandarla a "ingresa código"
      // sería engañoso. Los datos locales siguen intactos en el teléfono.
      if (!mounted) return;
      setState(() {
        _validando = false;
        _falloValidacion = true;
      });
    } catch (e) {
      // Cualquier otro fallo (red caída, error inesperado): mismo criterio, no
      // asumimos que falta vinculación. Mostramos el estado de reintento.
      debugPrint('[CloudSyncScreen] _validarSesion error: $e');
      if (!mounted) return;
      setState(() {
        _validando = false;
        _falloValidacion = true;
      });
    }
  }

  /// Reintenta la validación inicial tras un fallo de red.
  void _reintentarValidacion() {
    setState(() {
      _validando = true;
      _falloValidacion = false;
    });
    _validarSesion();
  }

  @override
  void dispose() {
    _email.dispose();
    _password.dispose();
    _codigoCtrl.dispose();
    super.dispose();
  }

  // ---------------------------------------------------------------------------
  // Acción: Iniciar sesión
  // ---------------------------------------------------------------------------
  Future<void> _conectar() async {
    setState(() {
      _loading = true;
      _error = null;
    });
    try {
      await SupabaseConfig.client.auth.signInWithPassword(
        email: _email.text.trim(),
        password: _password.text,
      );
      final empresaId = await resolverEmpresaYsellar(_app,
          confirmarCambio: _confirmarCambioDeCuenta);
      if (!mounted) return;
      if (empresaId == null) {
        // Usuario autenticado pero sin empresa vinculada → vista de vinculación.
        setState(() => _estado = _PantallaEstado.vinculacion);
      } else {
        setState(() => _estado = _PantallaEstado.conectado);
      }
    } on CambioDeCuentaCancelado {
      await _volverACuentaAnterior();
    } on AuthException catch (e) {
      if (mounted) setState(() => _error = _traducirError(e.message));
    } catch (e) {
      debugPrint('[CloudSyncScreen] _conectar error: $e');
      if (mounted) setState(() => _error = 'No se pudo conectar. Revisa tu conexión e intenta de nuevo.');
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  // ---------------------------------------------------------------------------
  // Acción: Crear cuenta (signUp)
  // ---------------------------------------------------------------------------
  Future<void> _registrar() async {
    setState(() {
      _loading = true;
      _error = null;
    });
    try {
      final resp = await SupabaseConfig.client.auth.signUp(
        email: _email.text.trim(),
        password: _password.text,
      );

      if (!mounted) return;

      if (resp.session != null) {
        // Sesión activa inmediatamente (confirmación de email desactivada en proyecto).
        final empresaId = await resolverEmpresaYsellar(_app,
            confirmarCambio: _confirmarCambioDeCuenta);
        if (!mounted) return;
        if (empresaId == null) {
          setState(() => _estado = _PantallaEstado.vinculacion);
        } else {
          setState(() => _estado = _PantallaEstado.conectado);
        }
      } else {
        // Supabase requiere confirmación por correo antes de dar sesión.
        setState(() => _error =
            'Revisa tu correo para confirmar tu cuenta y luego inicia sesión.');
      }
    } on CambioDeCuentaCancelado {
      await _volverACuentaAnterior();
    } on AuthException catch (e) {
      if (mounted) setState(() => _error = _traducirError(e.message));
    } catch (e) {
      debugPrint('[CloudSyncScreen] _registrar error: $e');
      if (mounted) {
        setState(() => _error = 'No se pudo crear la cuenta. Verifica los datos e intenta de nuevo.');
      }
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  // ---------------------------------------------------------------------------
  // Acción: Vincular con código
  // ---------------------------------------------------------------------------
  Future<void> _vincular() async {
    final codigo = _codigoCtrl.text.trim();
    // Se acepta 6 o más para no volver a quedar acoplado a un largo exacto: la
    // web genera 6, pero si algún día cambia, la validación real del código la
    // hace el servidor (`canjear_codigo_vinculacion`), no esta longitud. Antes
    // era `!= 6`, que rechazaba de entrada cualquier código de otro largo.
    if (codigo.length < 6) {
      setState(() => _error = 'El código debe tener al menos 6 dígitos.');
      return;
    }

    setState(() {
      _loading = true;
      _error = null;
    });

    try {
      final dynamic response = await SupabaseConfig.client.rpc(
        'canjear_codigo_vinculacion',
        params: {'p_code': codigo},
      );

      if (!mounted) return;

      Map<String, dynamic> resultado;
      if (response is List && response.isNotEmpty) {
        resultado = Map<String, dynamic>.from(response.first as Map);
      } else if (response is Map) {
        resultado = Map<String, dynamic>.from(response);
      } else {
        throw Exception('Respuesta inesperada del servidor: $response');
      }

      if (resultado['ok'] == true) {
        final empresaId = resultado['empresa_id'] as String;

        // 1-2. Mismo camino que el login: revisa si el teléfono tiene datos de
        //      otra cuenta ANTES de sellar, persiste la empresa y sella las
        //      filas capturadas sin cuenta.
        await adoptarEmpresa(_app, empresaId,
            confirmarCambio: _confirmarCambioDeCuenta);

        // 3. Sube los datos offline. El guard en SyncService evita concurrencia.
        final syncOutcome =
            await _app.read(syncServiceProvider).syncAll();

        if (!mounted) return;

        setState(() {
          _estado = _PantallaEstado.conectado;
          _codigoCtrl.clear();
        });

        // Feedback honesto según el resultado real del sync.
        final mensaje = switch (syncOutcome) {
          SyncOutcome.ok =>
            '¡Vinculado! Datos sincronizados.',
          SyncOutcome.sinRed =>
            'Vinculado. Se subirán los datos al reconectar.',
          _ =>
            'Vinculado, pero no se pudieron subir los datos. '
                'Usa "Sincronizar ahora" para reintentar.',
        };

        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text(mensaje)),
        );
      } else {
        final mensajeError = resultado['error'] as String? ??
            'Código inválido o expirado. Solicita uno nuevo al administrador.';
        setState(() => _error = mensajeError);
      }
    } on CambioDeCuentaCancelado {
      await _volverACuentaAnterior();
    } catch (e, st) {
      debugPrint('[CloudSyncScreen] _vincular error: $e\n$st');
      if (mounted) {
        setState(() => _error = 'No se pudo vincular. Revisa tu conexión e '
            'intenta de nuevo; tus datos siguen a salvo en el teléfono.');
      }
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  // ---------------------------------------------------------------------------
  // Acción: Cerrar sesión (avisa si hay cambios sin subir)
  // ---------------------------------------------------------------------------
  Future<void> _cerrarSesion() async {
    final sinSubir = await _app.read(databaseProvider).contarSinSubir();
    if (!mounted) return;
    final c = context.colores;
    final decision = await showDialog<_AlCerrar>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: const Text('Cerrar sesión'),
        content: Text(sinSubir > 0
            ? 'Hay $sinSubir cambio(s) que todavía no suben a la nube. Se '
                'quedan guardados en este teléfono y subirán cuando vuelvas a '
                'entrar con esta cuenta.\n\n'
                'Si alguien entra con otra cuenta en este teléfono, tendrá que '
                'decidir si los descarta.'
            : 'Todo lo de este teléfono ya está en la nube. Para volver a '
                'sincronizar tendrás que iniciar sesión otra vez.\n\n'
                'Si el teléfono lo va a usar otra persona, borra también los '
                'datos: sin sesión, la app los sigue mostrando.'),
        actions: [
          TextButton(
            onPressed: () => Navigator.of(ctx).pop(_AlCerrar.cancelar),
            child: const Text('Cancelar'),
          ),
          if (sinSubir > 0)
            TextButton(
              onPressed: () => Navigator.of(ctx).pop(_AlCerrar.sincronizar),
              child: const Text('Sincronizar primero'),
            ),
          if (sinSubir == 0)
            TextButton(
              style: TextButton.styleFrom(foregroundColor: c.danger),
              onPressed: () => Navigator.of(ctx).pop(_AlCerrar.cerrarYBorrar),
              child: const Text('Cerrar y borrar datos'),
            ),
          FilledButton(
            style: FilledButton.styleFrom(backgroundColor: c.danger),
            onPressed: () => Navigator.of(ctx).pop(_AlCerrar.cerrar),
            child: const Text('Cerrar sesión'),
          ),
        ],
      ),
    );
    if (!mounted) return;
    switch (decision) {
      case _AlCerrar.sincronizar:
        await _sincronizar();
      case _AlCerrar.cerrar:
      case _AlCerrar.cerrarYBorrar:
        setState(() => _loading = true);
        final cerrada = await _salirDeLaSesion();
        if (cerrada && decision == _AlCerrar.cerrarYBorrar) {
          // Ya no hay sesión: el teléfono queda como recién instalado.
          await vaciarCopiaLocal(_app);
        }
        if (!mounted) return;
        setState(() => _loading = false);
        if (!cerrada) {
          ScaffoldMessenger.of(context).showSnackBar(const SnackBar(
            content: Text('No se pudo cerrar la sesión. Revisa tu conexión e '
                'intenta de nuevo.'),
          ));
          return;
        }
        _irAlLogin();
      case _AlCerrar.cancelar:
      case null:
        break;
    }
  }

  /// Cierra la sesión y SOLO después limpia lo de la sesión en el teléfono.
  /// Antes se limpiaba primero: si `signOut` fallaba sin red, la app se quedaba
  /// sin empresa pero con la sesión abierta.
  ///
  /// Los datos locales y su dueño ([CuentaLocal]) NO se tocan: lo que no ha
  /// subido sube cuando vuelva esta cuenta, y si entra otra, el dueño es lo
  /// que permite detectar el cambio de cuenta.
  Future<bool> _salirDeLaSesion() async {
    try {
      await SupabaseConfig.client.auth.signOut();
    } catch (e) {
      // Supabase borra la sesión local antes de avisar al servidor; sin red,
      // ese aviso falla pero la sesión ya se cerró aquí. Solo si sigue
      // abierta es un fallo real.
      debugPrint('[CloudSyncScreen] signOut: $e');
      if (SupabaseConfig.currentUser != null) return false;
    }
    final prefs = _app.read(sharedPreferencesProvider);
    await prefs.remove('empresa_id');
    // También el nombre en caché: si no, la siguiente cuenta que entre en este
    // dispositivo vería el nombre de la empresa anterior mientras el suyo carga.
    await prefs.remove('empresa_nombre');
    await _app.read(syncMetadataProvider).resetAll();
    _app.invalidate(empresaIdProvider);
    return true;
  }

  void _irAlLogin({String? aviso}) {
    if (!mounted) return;
    setState(() {
      _estado = _PantallaEstado.login;
      _error = null;
      _aviso = aviso;
      _modoRegistro = false;
      _codigoCtrl.clear();
      _password.clear();
    });
  }

  // ---------------------------------------------------------------------------
  // Cambio de cuenta con cambios sin subir (decisión D1: avisar y elegir)
  // ---------------------------------------------------------------------------
  Future<bool> _confirmarCambioDeCuenta(CambioDeCuenta info) async {
    if (!mounted) return false;
    final c = context.colores;
    final de = info.empresaAnteriorNombre != null
        ? 'de ${info.empresaAnteriorNombre}'
        : 'de otra cuenta';
    final entra = info.correoAnterior != null
        ? 'entra con ${info.correoAnterior}'
        : 'entra con esa cuenta';
    final descartar = await showDialog<bool>(
      context: context,
      barrierDismissible: false,
      builder: (ctx) => AlertDialog(
        title: const Text('Hay cambios sin subir de otra cuenta'),
        content: Text(
          'Este teléfono tiene ${info.sinSubir} cambio(s) que todavía no '
          'llegan a la nube ($de, o capturados sin cuenta).\n\n'
          'Para no perderlos, $entra y sincroniza. Si los descartas, se '
          'borran de este teléfono y no se pueden recuperar.',
        ),
        actions: [
          TextButton(
            style: TextButton.styleFrom(foregroundColor: c.danger),
            onPressed: () => Navigator.of(ctx).pop(true),
            child: const Text('Descartar y continuar'),
          ),
          FilledButton(
            onPressed: () => Navigator.of(ctx).pop(false),
            child: const Text('Volver a esa cuenta'),
          ),
        ],
      ),
    );
    return descartar ?? false;
  }

  /// La persona eligió no descartar: se cierra la sesión nueva sin tocar la
  /// base y se deja el login listo para la cuenta dueña de los datos.
  Future<void> _volverACuentaAnterior() async {
    final correo = _app.read(cuentaLocalProvider).duenoCorreo;
    await _salirDeLaSesion();
    if (!mounted) return;
    if (correo != null) _email.text = correo;
    _irAlLogin(
      aviso: 'Entra con ${correo ?? 'la cuenta anterior'} y sincroniza. '
          'Después podrás cambiar de cuenta sin perder nada.',
    );
  }

  // ---------------------------------------------------------------------------
  // Acción: Rehacer la copia del teléfono (decisión D2)
  // ---------------------------------------------------------------------------
  Future<void> _rehacerCopia() async {
    // Sin señal, vaciar dejaría el teléfono sin datos hasta que vuelva la red.
    if (!await _app.read(syncServiceProvider).hayRed) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(const SnackBar(
        content: Text('Necesitas señal para rehacer la copia. Tus datos siguen '
            'a salvo en el teléfono.'),
      ));
      return;
    }
    final sinSubir = await _app.read(databaseProvider).contarSinSubir();
    if (!mounted) return;
    final c = context.colores;
    final ok = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: const Text('Rehacer la copia de este teléfono'),
        content: Text(
          'Se borra lo que hay en este teléfono y se vuelve a bajar todo de la '
          'nube. Sirve cuando el teléfono tiene datos de otra cuenta o algo '
          'quedó atorado.'
          '${sinSubir > 0 ? '\n\nOjo: hay $sinSubir cambio(s) que todavía no '
              'suben y se perderían. Si son tuyos, cancela y toca '
              '"Sincronizar ahora" primero.' : ''}',
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.of(ctx).pop(false),
            child: const Text('Cancelar'),
          ),
          FilledButton(
            style: FilledButton.styleFrom(backgroundColor: c.danger),
            onPressed: () => Navigator.of(ctx).pop(true),
            child: Text(sinSubir > 0
                ? 'Descartar $sinSubir y rehacer'
                : 'Rehacer la copia'),
          ),
        ],
      ),
    );
    if (ok != true || !mounted) return;

    final messenger = ScaffoldMessenger.of(context);
    setState(() => _loading = true);
    try {
      // Misma empresa: la configuración local de los PDF no está en la nube y
      // se conserva.
      await vaciarCopiaLocal(_app, otraEmpresa: false);
      final empresaId = _app.read(sharedPreferencesProvider).getString('empresa_id');
      // La base quedó vacía y sin dueño: esta cuenta la adopta de nuevo.
      if (empresaId != null) await adoptarEmpresa(_app, empresaId);
      final sync = _app.read(syncServiceProvider);
      final outcome = await sync.syncAll();
      if (!mounted) return;
      messenger.showSnackBar(SnackBar(
        content: Text(outcome == SyncOutcome.ok
            ? 'Listo: este teléfono tiene ahora solo lo de la nube.'
            : _mensajeOutcome(outcome, sync.ultimoError)),
      ));
    } catch (e) {
      debugPrint('[CloudSyncScreen] _rehacerCopia error: $e');
      messenger.showSnackBar(const SnackBar(
        content: Text('No se pudo rehacer la copia. Intenta de nuevo con señal.'),
      ));
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  // ---------------------------------------------------------------------------
  // Acción: Sincronizar manualmente
  // ---------------------------------------------------------------------------
  Future<void> _sincronizar() async {
    final messenger = ScaffoldMessenger.of(context);
    setState(() => _loading = true);
    final syncService = _app.read(syncServiceProvider);
    final outcome = await syncService.syncAll();
    if (!mounted) return;
    setState(() => _loading = false);
    // El sync se detuvo porque la base es de otra cuenta: en vez de solo
    // decirlo, se repasa la entrada, que es la que pregunta qué hacer.
    if (outcome == SyncOutcome.cuentaPorConfirmar) {
      _reintentarValidacion();
      return;
    }
    messenger.showSnackBar(SnackBar(
      content: Text(_mensajeOutcome(outcome, syncService.ultimoError)),
      duration: outcome == SyncOutcome.error
          ? const Duration(seconds: 8)
          : const Duration(seconds: 4),
    ));
  }

  // ---------------------------------------------------------------------------
  // Acción: Forzar re-sync completo (reinicia cursores sin cerrar sesión)
  // ---------------------------------------------------------------------------
  Future<void> _forzarResyncCompleto() async {
    final confirmar = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: const Text('Forzar re-sync completo'),
        content: const Text(
          'Esto reinicia los cursores de sincronización y vuelve a traer '
          'TODOS los datos del servidor desde cero. No cierra tu sesión ni '
          'borra datos locales, pero puede tardar más de lo normal. '
          '¿Deseas continuar?',
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.of(ctx).pop(false),
            child: const Text('Cancelar'),
          ),
          FilledButton(
            onPressed: () => Navigator.of(ctx).pop(true),
            child: const Text('Continuar'),
          ),
        ],
      ),
    );
    if (confirmar != true || !mounted) return;

    final messenger = ScaffoldMessenger.of(context);
    setState(() => _loading = true);

    final metadata = _app.read(syncMetadataProvider);
    await metadata.resetAll();

    final syncService = _app.read(syncServiceProvider);
    final outcome = await syncService.syncAll();

    if (!mounted) return;
    setState(() => _loading = false);
    messenger.showSnackBar(SnackBar(
      content: Text(_mensajeOutcome(outcome, syncService.ultimoError)),
      duration: outcome == SyncOutcome.error
          ? const Duration(seconds: 8)
          : const Duration(seconds: 4),
    ));
  }

  // ---------------------------------------------------------------------------
  // Aviso de filas atoradas en `error`, con el MOTIVO real del servidor. Sin
  // esto, el usuario solo veía un ícono rojo sin explicación y sin salida.
  // ---------------------------------------------------------------------------
  //
  // U1 de la auditoría de UX: el motivo crudo de Postgres ya no va al frente.
  // Primero qué pasó y qué hacer en palabras de obra; el detalle técnico queda
  // plegado, con "Copiar para soporte". Se distingue lo que se reintenta solo
  // (ámbar) de lo que necesita que alguien haga algo (rojo).
  // ---------------------------------------------------------------------------
  Widget _avisoErrores(int errores) {
    final c = context.colores;
    final texto = Theme.of(context).textTheme;
    final sync = _app.read(syncServiceProvider);
    final rechazo = sync.ultimoRechazo;
    final causa = rechazo?.causa;
    final seReintenta = rechazo?.seReintenta ?? true;
    final tinta = seReintenta ? c.warning : c.danger;
    final detalle = rechazo?.detalleTecnico ?? sync.ultimoErrorPush;

    final (explicacion, accion) = causa != null
        ? (explicarRechazoSync(causa), accionRechazoSync(causa))
        : (
            'Algo falló al subir (puede ser la señal).',
            'No tienes que hacer nada: se reintenta solo. Si no se resuelve, '
                'comparte el detalle con soporte.',
          );

    return Container(
      margin: const EdgeInsets.fromLTRB(16, 8, 16, 4),
      padding: const EdgeInsets.fromLTRB(12, 12, 12, 4),
      decoration: BoxDecoration(
        color: seReintenta ? c.warningSoft : c.dangerSoft,
        borderRadius: BorderRadius.circular(12),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Icon(seReintenta ? Icons.schedule : Icons.error_outline,
                  color: tinta),
              const SizedBox(width: 12),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      '$errores cambio(s) no se pudieron subir',
                      style: texto.titleSmall?.copyWith(
                          color: tinta, fontWeight: FontWeight.w600),
                    ),
                    const SizedBox(height: 4),
                    Text(
                      rechazo != null
                          ? 'En ${nombreTablaSync(rechazo.tabla)}: $explicacion'
                          : explicacion,
                      style: texto.bodyMedium,
                    ),
                    const SizedBox(height: 4),
                    Text(accion,
                        style: texto.bodyMedium
                            ?.copyWith(fontWeight: FontWeight.w600)),
                  ],
                ),
              ),
            ],
          ),
          if (detalle != null && detalle.isNotEmpty)
            Theme(
              // Sin las líneas que ExpansionTile dibuja al abrirse: dentro de
              // la tarjeta de color se ven como un corte.
              data: Theme.of(context)
                  .copyWith(dividerColor: Colors.transparent),
              child: ExpansionTile(
                tilePadding: EdgeInsets.zero,
                title: Text('Detalle técnico', style: texto.bodyMedium),
                childrenPadding: const EdgeInsets.only(bottom: 8),
                expandedCrossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  SelectableText(detalle, style: texto.bodySmall),
                  TextButton.icon(
                    onPressed: () async {
                      final messenger = ScaffoldMessenger.of(context);
                      await Clipboard.setData(ClipboardData(text: detalle));
                      messenger.showSnackBar(const SnackBar(
                          content: Text('Detalle copiado. Pégalo en tu '
                              'mensaje a soporte.')));
                    },
                    icon: const Icon(Icons.copy),
                    label: const Text('Copiar para soporte'),
                  ),
                ],
              ),
            ),
        ],
      ),
    );
  }

  // ---------------------------------------------------------------------------
  // Aviso de filas de otra cuenta apartadas por el sync (decisión D2)
  // ---------------------------------------------------------------------------
  Widget _avisoOtraCuenta(int filas) {
    final c = context.colores;
    final texto = Theme.of(context).textTheme;
    return Container(
      margin: const EdgeInsets.fromLTRB(16, 8, 16, 4),
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(
        color: c.warningSoft,
        borderRadius: BorderRadius.circular(12),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Icon(Icons.people_outline, color: c.warning),
              const SizedBox(width: 12),
              Expanded(
                child: Text(
                  'Este teléfono tiene $filas registro(s) que la nube no acepta '
                  'para esta cuenta: son de otra cuenta que se usó antes aquí, '
                  'o de algo a lo que ya no tienes acceso. Ya no se reintentan, '
                  'pero siguen viéndose en el teléfono.',
                  style: texto.bodyMedium,
                ),
              ),
            ],
          ),
          const SizedBox(height: 8),
          Align(
            alignment: Alignment.centerRight,
            child: FilledButton.icon(
              onPressed: _loading ? null : _rehacerCopia,
              icon: const Icon(Icons.cloud_download_outlined),
              label: const Text('Rehacer la copia'),
            ),
          ),
        ],
      ),
    );
  }

  /// "hoy 14:32", "ayer 09:10" o "6 oct 14:32".
  static String _cuando(DateTime t) {
    final hoy = DateTime.now();
    final dia = DateTime(t.year, t.month, t.day);
    final diferencia = DateTime(hoy.year, hoy.month, hoy.day).difference(dia).inDays;
    final hora = DateFormat('HH:mm').format(t);
    if (diferencia == 0) return 'hoy $hora';
    if (diferencia == 1) return 'ayer $hora';
    return '${DateFormat('d MMM', 'es_MX').format(t)} $hora';
  }

  // ---------------------------------------------------------------------------
  // Helpers
  // ---------------------------------------------------------------------------
  String _mensajeOutcome(SyncOutcome o, [String? detalle]) {
    switch (o) {
      case SyncOutcome.ok:
        return 'Sincronizado.';
      case SyncOutcome.parcial:
        final base = 'Sincronizado con errores parciales.';
        if (detalle != null && detalle.isNotEmpty) {
          return '$base\n$detalle';
        }
        return base;
      case SyncOutcome.sinSesion:
        return 'Inicia sesión para sincronizar.';
      case SyncOutcome.sinRed:
        return 'Sin conexión. Se reintentará al reconectar.';
      case SyncOutcome.sinEmpresa:
        return 'Tu usuario no está vinculado a ninguna empresa.';
      case SyncOutcome.cuentaPorConfirmar:
        return 'Este teléfono tiene datos de otra cuenta: hay que decidir qué '
            'hacer con ellos antes de sincronizar.';
      case SyncOutcome.error:
        final base = 'Error al sincronizar.';
        if (detalle != null && detalle.isNotEmpty) {
          return '$base\n$detalle';
        }
        return '$base Revisa la conexión e inténtalo de nuevo.';
    }
  }

  /// Traduce mensajes de error de Supabase Auth a español.
  String _traducirError(String message) {
    final m = message.toLowerCase();
    if (m.contains('invalid login credentials') ||
        m.contains('invalid email or password')) {
      return 'Correo o contraseña incorrectos.';
    }
    if (m.contains('email not confirmed')) {
      return 'Confirma tu correo antes de iniciar sesión.';
    }
    if (m.contains('user already registered') ||
        m.contains('already been registered')) {
      return 'Ya existe una cuenta con ese correo. Inicia sesión.';
    }
    if (m.contains('password should be at least')) {
      return 'La contraseña debe tener al menos 6 caracteres.';
    }
    if (m.contains('unable to validate email address')) {
      return 'El formato del correo no es válido.';
    }
    return message; // devuelve el original si no se reconoce
  }

  @override
  Widget build(BuildContext context) {
    final user = ref.watch(currentUserProvider);
    final empresaId = ref.watch(empresaIdProvider);

    // Si Riverpod detecta que se cerró la sesión (expiración/logout externo),
    // vuelve al login. La validación inicial y _conectar/_vincular se encargan
    // del resto (no confiamos ciegamente en el empresa_id de prefs).
    if (user == null && _estado != _PantallaEstado.login && !_validando) {
      WidgetsBinding.instance.addPostFrameCallback((_) {
        if (mounted) setState(() => _estado = _PantallaEstado.login);
      });
    }

    // Tres casos en el arranque con sesión restaurada:
    //  - _validando: girando mientras consultamos al servidor.
    //  - _falloValidacion: no se pudo verificar (timeout/red). Reintentar.
    //  - normal: mostramos la vista según el estado resuelto.
    final Widget body;
    if (_validando) {
      body = const Center(child: CircularProgressIndicator());
    } else if (_falloValidacion) {
      body = ErrorStateView(
        message:
            'No se pudo verificar la conexión con la nube. Revisa tu internet '
            'e intenta de nuevo. Tus datos siguen a salvo en el teléfono.',
        onRetry: _reintentarValidacion,
      );
    } else {
      body = switch (_estado) {
        _PantallaEstado.login => _loginForm(),
        _PantallaEstado.vinculacion => _vinculacionForm(user),
        _PantallaEstado.conectado => _connectedView(user, empresaId),
      };
    }

    // Mientras se cierra sesión, se cambia de cuenta o se rehace la copia, no
    // se sale de la pantalla: la operación seguiría, pero sin quien la cuente.
    return PopScope(
      canPop: !_loading,
      child: Scaffold(
        appBar: AppBar(title: const Text('Nube y sincronización')),
        body: body,
      ),
    );
  }

  // ---------------------------------------------------------------------------
  // Vista 1: Login / Registro
  // ---------------------------------------------------------------------------
  Widget _loginForm() {
    return ListView(
      padding: const EdgeInsets.all(16),
      children: [
        const Text(
          'Conecta tu cuenta para sincronizar tus obras con la nube y la versión web. '
          'La app sigue funcionando sin conexión.',
        ),
        if (_aviso != null) ...[
          const SizedBox(height: 12),
          Container(
            padding: const EdgeInsets.all(12),
            decoration: BoxDecoration(
              color: context.colores.infoSoft,
              borderRadius: BorderRadius.circular(12),
            ),
            child: Row(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Icon(Icons.info_outline, color: context.colores.info),
                const SizedBox(width: 12),
                Expanded(child: Text(_aviso!)),
              ],
            ),
          ),
        ],
        const SizedBox(height: 20),

        // Toggle Iniciar sesión / Crear cuenta
        SegmentedButton<bool>(
          segments: const [
            ButtonSegment(value: false, label: Text('Iniciar sesión')),
            ButtonSegment(value: true, label: Text('Crear cuenta')),
          ],
          selected: {_modoRegistro},
          onSelectionChanged: (s) => setState(() {
            _modoRegistro = s.first;
            _error = null;
          }),
        ),
        const SizedBox(height: 20),

        TextField(
          controller: _email,
          keyboardType: TextInputType.emailAddress,
          autocorrect: false,
          decoration: const InputDecoration(
            labelText: 'Correo',
            border: OutlineInputBorder(),
          ),
        ),
        const SizedBox(height: 12),
        TextField(
          controller: _password,
          obscureText: true,
          decoration: const InputDecoration(
            labelText: 'Contraseña',
            border: OutlineInputBorder(),
          ),
        ),
        if (_error != null) ...[
          const SizedBox(height: 12),
          Text(
            _error!,
            style: TextStyle(color: Theme.of(context).colorScheme.error),
          ),
        ],
        const SizedBox(height: 20),
        FilledButton.icon(
          onPressed: _loading ? null : (_modoRegistro ? _registrar : _conectar),
          icon: _loading
              ? const SizedBox(
                  width: 18,
                  height: 18,
                  child: CircularProgressIndicator(strokeWidth: 2))
              : Icon(_modoRegistro ? Icons.person_add_outlined : Icons.cloud_outlined),
          label: Text(_loading
              ? (_modoRegistro ? 'Creando cuenta…' : 'Conectando…')
              : (_modoRegistro ? 'Crear cuenta' : 'Conectar')),
        ),
      ],
    );
  }

  // ---------------------------------------------------------------------------
  // Vista 2: Vinculación (logueado pero sin empresa)
  // ---------------------------------------------------------------------------
  Widget _vinculacionForm(User? user) {
    return ListView(
      padding: const EdgeInsets.all(16),
      children: [
        Icon(Icons.link_off_outlined, size: 48, color: context.colores.warning),
        const SizedBox(height: 16),
        Text(
          'Tu cuenta no está vinculada a ninguna empresa.',
          style: Theme.of(context).textTheme.titleMedium,
          textAlign: TextAlign.center,
        ),
        const SizedBox(height: 8),
        Text(
          'Pide al administrador que genere un código de vinculación '
          '(válido por 10 minutos) e ingrésalo aquí.',
          textAlign: TextAlign.center,
          style: TextStyle(color: Theme.of(context).colorScheme.onSurfaceVariant),
        ),
        const SizedBox(height: 24),
        TextField(
          controller: _codigoCtrl,
          keyboardType: TextInputType.number,
          maxLength: 6,
          textAlign: TextAlign.center,
          style: Theme.of(context)
              .textTheme
              .headlineSmall
              ?.copyWith(letterSpacing: 8),
          inputFormatters: [FilteringTextInputFormatter.digitsOnly],
          decoration: const InputDecoration(
            labelText: 'Código de vinculación',
            hintText: '000000',
            border: OutlineInputBorder(),
            counterText: '',
          ),
        ),
        if (_error != null) ...[
          const SizedBox(height: 12),
          Text(
            _error!,
            style: TextStyle(color: Theme.of(context).colorScheme.error),
            textAlign: TextAlign.center,
          ),
        ],
        const SizedBox(height: 20),
        FilledButton.icon(
          onPressed: _loading ? null : _vincular,
          icon: _loading
              ? const SizedBox(
                  width: 18,
                  height: 18,
                  child: CircularProgressIndicator(strokeWidth: 2))
              : const Icon(Icons.link),
          label: Text(_loading ? 'Vinculando…' : 'Vincular'),
        ),
        const SizedBox(height: 12),
        OutlinedButton.icon(
          onPressed: _loading ? null : _cerrarSesion,
          style: OutlinedButton.styleFrom(
            foregroundColor: context.colores.danger,
          ),
          icon: const Icon(Icons.logout),
          label: const Text('Cerrar sesión'),
        ),
        if (user != null) ...[
          const SizedBox(height: 16),
          Text(
            'Cuenta: ${user.email ?? user.id}',
            textAlign: TextAlign.center,
            style: Theme.of(context).textTheme.bodySmall,
          ),
        ],
      ],
    );
  }

  // ---------------------------------------------------------------------------
  // Vista 3: Conectado con empresa
  // ---------------------------------------------------------------------------
  Widget _connectedView(User? user, String? empresaId) {
    final estado = ref.watch(syncStatusProvider);
    // Se reconstruye al terminar cada sync (también los automáticos) para que
    // la última subida y el aviso de otra cuenta estén al día.
    ref.watch(syncEnCursoProvider);
    final ultimaSubida = ref.read(syncMetadataProvider).ultimaSubidaCompleta;
    final filasAjenas = ref.watch(filasApartadasProvider).asData?.value ?? 0;
    final rechazo = ref.read(syncServiceProvider).ultimoRechazo;
    final reintentarNoBasta =
        estado.errores > 0 && rechazo != null && !rechazo.seReintenta;
    return ListView(
      children: [
        // Se encabeza con el NOMBRE de la persona y el correo baja a segundo
        // plano: al abrir esta pantalla la pregunta es "¿con qué cuenta estoy?",
        // y un nombre la responde antes que una dirección de correo.
        ListTile(
          leading:
              Icon(Icons.cloud_done_outlined, color: context.colores.success),
          title: Text(ref.watch(cuentaNombreProvider) ?? 'Conectado'),
          subtitle: Text(user?.email ?? user?.id ?? ''),
        ),
        // Nombre, no UUID: el identificador solo servía para depurar y no le
        // decía nada al usuario. Si aún no llega del servidor se usa el último
        // conocido; el UUID queda como último recurso para poder dar soporte.
        ListTile(
          leading: const Icon(Icons.apartment_outlined),
          title: const Text('Empresa'),
          subtitle: Text(
            ref.watch(empresaNombreProvider).asData?.value ??
                ref.watch(empresaNombreCacheProvider) ??
                empresaId ??
                'Sin empresa vinculada',
          ),
        ),
        const Divider(),
        // Diagnóstico: solo aparece si hay filas atoradas. Muestra el MOTIVO
        // real del servidor (RLS, FK, columna…) para no dejar al usuario a
        // ciegas con un ícono rojo. El botón de abajo ya reintenta estas filas.
        if (estado.errores > 0) _avisoErrores(estado.errores),
        if (filasAjenas > 0) _avisoOtraCuenta(filasAjenas),
        // Conflictos de jornada: no son un fallo, esperan una decisión. Van
        // antes que "Sincronizar ahora" porque sincronizar no los resuelve.
        if (estado.conflictos > 0)
          ListTile(
            leading: Icon(Icons.rule, color: context.colores.warning),
            title: Text('${estado.conflictos} conflicto(s) por resolver'),
            subtitle: const Text('Doble jornada el mismo día: elige cuál se queda'),
            trailing: const Icon(Icons.chevron_right),
            onTap: () => Navigator.of(context).push(
              MaterialPageRoute(builder: (_) => const ConflictosScreen()),
            ),
          ),
        ListTile(
          leading: const Icon(Icons.sync),
          title: const Text('Sincronizar ahora'),
          // Lo que importa en la obra es hasta cuándo el trabajo está a salvo
          // en la nube; y si reintentar no va a resolver los errores, decirlo
          // en vez de dejar que se toque el botón una y otra vez.
          subtitle: Text([
            if (reintentarNoBasta)
              'Reintentar no resolverá los cambios con error: mira arriba qué '
                  'hacer.'
            else if (estado.errores > 0)
              'Reintenta también los cambios con error.',
            ultimaSubida != null
                ? 'Última subida completa: ${_cuando(ultimaSubida)}'
                : 'Aún no hay una subida completa en este teléfono.',
          ].join('\n')),
          enabled: !_loading,
          onTap: _loading ? null : _sincronizar,
        ),
        ListTile(
          leading: const Icon(Icons.restart_alt),
          title: const Text('Forzar re-sync completo'),
          subtitle: const Text(
              'Reinicia los cursores y vuelve a traer todo del servidor'),
          enabled: !_loading,
          onTap: _loading ? null : _forzarResyncCompleto,
        ),
        ListTile(
          leading: const Icon(Icons.cloud_download_outlined),
          title: const Text('Rehacer la copia de este teléfono'),
          subtitle: const Text(
              'Borra lo de este teléfono y vuelve a bajar todo de la nube'),
          enabled: !_loading,
          onTap: _loading ? null : _rehacerCopia,
        ),
        // Cerrar sesión va al final y en rojo: es la única acción de esta
        // pantalla que se lleva el acceso a los datos de la nube, y debe
        // distinguirse de las de sincronizar (regla
        // `destructive-nav-separation`).
        ListTile(
          leading: Icon(Icons.logout, color: context.colores.danger),
          title: Text('Cerrar sesión',
              style: TextStyle(color: context.colores.danger)),
          onTap: _cerrarSesion,
        ),
      ],
    );
  }
}
