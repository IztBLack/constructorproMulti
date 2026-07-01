import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:supabase_flutter/supabase_flutter.dart';

import '../../core/settings/settings_provider.dart';
import '../../core/sync/cloud_providers.dart';
import '../../core/sync/supabase_config.dart';
import '../../core/sync/sync_service.dart';
import '../../data/providers.dart';

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

class _CloudSyncScreenState extends ConsumerState<CloudSyncScreen> {
  final _email = TextEditingController();
  final _password = TextEditingController();
  final _codigoCtrl = TextEditingController();

  bool _loading = false;
  String? _error;

  // Estado explícito de la pantalla para manejar la vista de vinculación sin
  // depender únicamente de los providers reactivos.
  _PantallaEstado _estado = _PantallaEstado.login;

  @override
  void dispose() {
    _email.dispose();
    _password.dispose();
    _codigoCtrl.dispose();
    super.dispose();
  }

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
      final empresaId = await resolverEmpresaYsellar(ref);
      if (!mounted) return;
      if (empresaId == null) {
        // Usuario autenticado pero sin empresa vinculada → vista de vinculación.
        setState(() => _estado = _PantallaEstado.vinculacion);
      } else {
        setState(() => _estado = _PantallaEstado.conectado);
      }
    } on AuthException catch (e) {
      if (mounted) setState(() => _error = e.message);
    } catch (e) {
      if (mounted) setState(() => _error = 'No se pudo conectar: $e');
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  Future<void> _vincular() async {
    final codigo = _codigoCtrl.text.trim();
    if (codigo.length != 6) {
      setState(() => _error = 'El código debe tener exactamente 6 dígitos.');
      return;
    }

    setState(() {
      _loading = true;
      _error = null;
    });

    try {
      final response = await SupabaseConfig.client.rpc(
        'canjear_codigo_vinculacion',
        params: {'p_code': codigo},
      );

      if (!mounted) return;

      final Map<String, dynamic> resultado =
          Map<String, dynamic>.from(response as Map);

      if (resultado['ok'] == true) {
        final empresaId = resultado['empresa_id'] as String;

        // 1. Persiste empresa_id en SharedPreferences (misma key que
        //    resolverEmpresaYsellar usa: 'empresa_id').
        await ref
            .read(sharedPreferencesProvider)
            .setString('empresa_id', empresaId);

        // 2. Sella todas las filas locales offline con el empresa_id.
        await ref.read(databaseProvider).sellarEmpresaId(empresaId);

        // Invalida el provider para que la UI reactiva se actualice.
        ref.invalidate(empresaIdProvider);

        // 3. Sube los datos offline.
        final syncOutcome =
            await ref.read(syncServiceProvider).syncAll();

        if (!mounted) return;

        setState(() {
          _estado = _PantallaEstado.conectado;
          _codigoCtrl.clear();
        });

        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text(syncOutcome == SyncOutcome.ok
                ? '¡Vinculado! Datos sincronizados correctamente.'
                : '¡Vinculado! Subiendo datos...'),
          ),
        );
      } else {
        final mensajeError = resultado['error'] as String? ??
            'Código inválido o expirado. Solicita uno nuevo al administrador.';
        setState(() => _error = mensajeError);
      }
    } catch (_) {
      if (mounted) {
        setState(() => _error = 'Error de conexión, intenta de nuevo.');
      }
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  Future<void> _cerrarSesion() async {
    await SupabaseConfig.client.auth.signOut();
    if (mounted) {
      setState(() {
        _estado = _PantallaEstado.login;
        _error = null;
        _codigoCtrl.clear();
      });
    }
  }

  Future<void> _sincronizar() async {
    final messenger = ScaffoldMessenger.of(context);
    setState(() => _loading = true);
    final outcome = await ref.read(syncServiceProvider).syncAll();
    if (!mounted) return;
    setState(() => _loading = false);
    messenger.showSnackBar(SnackBar(content: Text(_mensajeOutcome(outcome))));
  }

  String _mensajeOutcome(SyncOutcome o) {
    switch (o) {
      case SyncOutcome.ok:
        return 'Sincronizado.';
      case SyncOutcome.sinSesion:
        return 'Inicia sesión para sincronizar.';
      case SyncOutcome.sinRed:
        return 'Sin conexión. Se reintentará al reconectar.';
      case SyncOutcome.sinEmpresa:
        return 'Tu usuario no está vinculado a ninguna empresa.';
      case SyncOutcome.error:
        return 'Error al sincronizar. Revisa la conexión e inténtalo de nuevo.';
    }
  }

  @override
  Widget build(BuildContext context) {
    final user = ref.watch(currentUserProvider);
    final empresaId = ref.watch(empresaIdProvider);

    // Sincroniza el estado local con los providers reactivos cuando Riverpod
    // detecta un cambio de sesión externo (por ejemplo, expiración de token).
    if (user == null && _estado != _PantallaEstado.login) {
      // Programar fuera del build para no llamar setState dentro de build.
      WidgetsBinding.instance.addPostFrameCallback((_) {
        if (mounted) setState(() => _estado = _PantallaEstado.login);
      });
    } else if (user != null &&
        empresaId != null &&
        _estado == _PantallaEstado.login) {
      WidgetsBinding.instance.addPostFrameCallback((_) {
        if (mounted) setState(() => _estado = _PantallaEstado.conectado);
      });
    }

    return Scaffold(
      appBar: AppBar(title: const Text('Nube y sincronización')),
      body: switch (_estado) {
        _PantallaEstado.login => _loginForm(),
        _PantallaEstado.vinculacion => _vinculacionForm(user),
        _PantallaEstado.conectado => _connectedView(user, empresaId),
      },
    );
  }

  // ---------------------------------------------------------------------------
  // Vista 1: Login
  // ---------------------------------------------------------------------------
  Widget _loginForm() {
    return ListView(
      padding: const EdgeInsets.all(16),
      children: [
        const Text(
          'Conecta tu cuenta para sincronizar tus obras con la nube y la versión web. '
          'La app sigue funcionando sin conexión.',
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
          Text(_error!,
              style:
                  TextStyle(color: Theme.of(context).colorScheme.error)),
        ],
        const SizedBox(height: 20),
        FilledButton.icon(
          onPressed: _loading ? null : _conectar,
          icon: _loading
              ? const SizedBox(
                  width: 18,
                  height: 18,
                  child: CircularProgressIndicator(strokeWidth: 2))
              : const Icon(Icons.cloud_outlined),
          label: Text(_loading ? 'Conectando…' : 'Conectar'),
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
        const Icon(Icons.link_off_outlined, size: 48, color: Colors.orange),
        const SizedBox(height: 16),
        const Text(
          'Tu cuenta no está vinculada a ninguna empresa.',
          style: TextStyle(fontSize: 16, fontWeight: FontWeight.w600),
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
          style: const TextStyle(fontSize: 24, letterSpacing: 8),
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
          icon: const Icon(Icons.logout, color: Colors.red),
          label: const Text('Cerrar sesión',
              style: TextStyle(color: Colors.red)),
        ),
        if (user != null) ...[
          const SizedBox(height: 16),
          Text(
            'Cuenta: ${user.email ?? user.id}',
            textAlign: TextAlign.center,
            style: TextStyle(
                fontSize: 12,
                color: Theme.of(context).colorScheme.onSurfaceVariant),
          ),
        ],
      ],
    );
  }

  // ---------------------------------------------------------------------------
  // Vista 3: Conectado con empresa
  // ---------------------------------------------------------------------------
  Widget _connectedView(User? user, String? empresaId) {
    return ListView(
      children: [
        ListTile(
          leading: const Icon(Icons.cloud_done_outlined, color: Colors.green),
          title: const Text('Conectado'),
          subtitle: Text(user?.email ?? user?.id ?? ''),
        ),
        ListTile(
          leading: const Icon(Icons.apartment_outlined),
          title: const Text('Empresa'),
          subtitle: Text(empresaId ?? 'Sin empresa vinculada'),
        ),
        const Divider(),
        ListTile(
          leading: const Icon(Icons.sync),
          title: const Text('Sincronizar ahora'),
          enabled: !_loading,
          onTap: _loading ? null : _sincronizar,
        ),
        ListTile(
          leading: const Icon(Icons.logout, color: Colors.red),
          title: const Text('Cerrar sesión'),
          onTap: _cerrarSesion,
        ),
      ],
    );
  }
}
