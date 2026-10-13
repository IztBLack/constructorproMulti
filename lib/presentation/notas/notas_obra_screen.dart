import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/format/format.dart';
import '../../core/sync/cloud_providers.dart';
import '../../core/widgets_inicio/widgets_inicio_service.dart';
import '../../data/providers.dart';
import '../../data/repositories_nota_obra.dart';
import '../../domain/logic/notas_obra_calculo.dart';
import '../common/empty_state_view.dart';
import '../common/error_state_view.dart';
import '../common/sync_status_action.dart';
import 'campo_a_nombre_de.dart';
import 'nota_obra_detail_screen.dart';
import '../common/esqueleto.dart';
import '../common/hoja_formulario.dart';
import '../common/app_snackbar.dart';

/// Listado de NOTAS DE OBRA: las cuentas de los tratos de palabra con socios
/// que no están en el sistema. Gemela de `/admin/obras/[id]/notas` en la web.
///
/// Una nota por socio dentro de la obra. El alta pide solo el nombre y la
/// fecha; los renglones se capturan dentro, porque crear la nota vacía no es la
/// meta de nadie: es el paso previo a apuntar el trato.
class NotasObraScreen extends ConsumerStatefulWidget {
  const NotasObraScreen({
    super.key,
    required this.obraId,
    required this.obraNombre,
    this.crearAlAbrir = false,
  });

  final String obraId;
  final String obraNombre;

  /// Abre de una vez el alta (atajo «Nota nueva» de la pantalla de inicio).
  final bool crearAlAbrir;

  @override
  ConsumerState<NotasObraScreen> createState() => _NotasObraScreenState();
}

class _NotasObraScreenState extends ConsumerState<NotasObraScreen> {
  String get obraId => widget.obraId;
  String get obraNombre => widget.obraNombre;

  @override
  void initState() {
    super.initState();
    // Lo que el widget de avisos marcaba como «nuevo» ya se vio.
    unawaited(ref.read(widgetsInicioProvider).marcarAvisosVistos());
    if (widget.crearAlAbrir) {
      WidgetsBinding.instance.addPostFrameCallback((_) {
        if (mounted) _nuevaNota(context, ref);
      });
    }
  }

  @override
  Widget build(BuildContext context) {
    final notasAsync = ref.watch(notasDeObraProvider(obraId));

    return Scaffold(
      appBar: AppBar(
        title: Text('Notas · $obraNombre'),
        actions: const [SyncStatusAction()],
      ),
      body: notasAsync.when(
        loading: () => const EsqueletoLista(filas: 3),
        error: (e, _) => ErrorStateView(
          message: 'No se pudieron cargar las notas.',
          onRetry: () => ref.invalidate(notasDeObraProvider(obraId)),
        ),
        data: (notas) {
          if (notas.isEmpty) {
            return const EmptyStateView(
              icon: Icons.handshake_outlined,
              title: 'Sin notas todavía.',
              hint:
                  'Aquí van las cuentas de los tratos de esta obra: cuánto se '
                  'acordó por cada trabajo, qué se ha pagado y qué falta.',
            );
          }
          return ListView.separated(
            padding: const EdgeInsets.fromLTRB(12, 12, 12, 88),
            itemCount: notas.length,
            separatorBuilder: (_, _) => const SizedBox(height: 8),
            itemBuilder: (_, i) =>
                _TarjetaNota(notas[i], obraNombre: obraNombre),
          );
        },
      ),
      floatingActionButton: FloatingActionButton.extended(
        heroTag: 'fabNota',
        onPressed: () => _nuevaNota(context, ref),
        icon: const Icon(Icons.note_add_outlined),
        label: const Text('Nueva nota'),
      ),
    );
  }

  Future<void> _nuevaNota(BuildContext context, WidgetRef ref) async {
    final destinatario = TextEditingController();
    final titulo = TextEditingController();
    final colaboradores =
        ref.read(colaboradoresProvider).asData?.value ?? const [];
    // Mutables porque los escribe el campo desde adentro del diálogo; solo se
    // leen al aceptar.
    String? colaboradorId;
    var mostrarPara = true;

    final ok = await mostrarHojaFormulario(
      context,
      builder: (ctx) => HojaFormulario(
        titulo: 'Nueva nota',
        subtitulo: obraNombre,
        textoGuardar: 'Crear y capturar',
        campos: [
          CampoANombreDe(
            controller: destinatario,
            colaboradores: colaboradores,
            autofocus: true,
            onColaborador: (id) => colaboradorId = id,
            mostrarParaInicial: mostrarPara,
            onMostrarPara: (v) => mostrarPara = v,
          ),
          TextFormField(
            controller: titulo,
            textCapitalization: TextCapitalization.sentences,
            decoration: const InputDecoration(
              labelText: 'Título (opcional)',
              hintText: 'Ej. MZ 2 LT 1',
            ),
          ),
        ],
        onGuardar: () => true,
      ),
    );

    // El nombre ya NO es obligatorio (0034): la nota se abre y se le pone
    // después, o nunca. Lo que se captura es el trato, no la ficha del socio.
    if (!ok) return;

    final empresaId = ref.read(empresaIdProvider);
    if (empresaId == null) {
      // Antes se salía sin decir nada: tocabas «Crear» y no pasaba nada.
      if (context.mounted) {
        showAppSnack(
          context,
          'Inicia sesión con tu empresa para crear notas.',
          tone: SnackTone.danger,
        );
      }
      return;
    }

    final cuantas =
        ref.read(notasDeObraProvider(obraId)).asData?.value.length ?? 0;
    final id = await ref
        .read(notaObraRepositoryProvider)
        .crear(
          obraId: obraId,
          empresaId: empresaId,
          destinatario: destinatario.text.trim(),
          colaboradorId: colaboradorId,
          mostrarPara: mostrarPara,
          titulo: titulo.text.trim(),
          orden: (cuantas + 1) * pasoOrdenRenglon,
        );

    if (!context.mounted) return;
    // Se entra directo a capturar: es lo que sigue siempre.
    await Navigator.of(context).push(
      MaterialPageRoute(
        builder: (_) =>
            NotaObraDetailScreen(notaId: id, obraNombre: obraNombre),
      ),
    );
  }
}

class _TarjetaNota extends StatelessWidget {
  const _TarjetaNota(this.nota, {required this.obraNombre});

  final NotaConRenglones nota;
  final String obraNombre;

  @override
  Widget build(BuildContext context) {
    final cs = Theme.of(context).colorScheme;
    final t = nota.totales;
    final liquidada =
        estadoNotaDeCadena(nota.nota.estado) == EstadoNota.liquidada;

    return Card(
      margin: EdgeInsets.zero,
      child: ListTile(
        contentPadding: const EdgeInsets.fromLTRB(16, 10, 12, 10),
        title: Row(
          children: [
            Expanded(
              child: NombreDeNota(
                nota.nota.destinatario,
                style: const TextStyle(fontWeight: FontWeight.bold),
              ),
            ),
            Chip(
              label: Text(
                liquidada ? 'Liquidada' : 'Abierta',
                style: Theme.of(context).textTheme.labelSmall,
              ),
              visualDensity: VisualDensity.compact,
              materialTapTargetSize: MaterialTapTargetSize.shrinkWrap,
              backgroundColor: liquidada
                  ? cs.tertiaryContainer
                  : cs.secondaryContainer,
              side: BorderSide.none,
            ),
          ],
        ),
        subtitle: Padding(
          padding: const EdgeInsets.only(top: 6),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              if (nota.nota.titulo.isNotEmpty) Text(nota.nota.titulo),
              const SizedBox(height: 4),
              Row(
                children: [
                  Expanded(child: Text('Total ${Fmt.money(t.total)}')),
                  Text(
                    'Saldo ${Fmt.money(t.saldo)}',
                    style: TextStyle(
                      fontWeight: FontWeight.bold,
                      color: t.saldo > 0 ? cs.error : cs.primary,
                    ),
                  ),
                ],
              ),
            ],
          ),
        ),
        onTap: () => Navigator.of(context).push(
          MaterialPageRoute(
            builder: (_) => NotaObraDetailScreen(
              notaId: nota.nota.id,
              obraNombre: obraNombre,
            ),
          ),
        ),
      ),
    );
  }
}
