import 'package:flutter/material.dart';

import 'app_badge.dart';

/// Insignias de "¿ya llegó a la nube?" para un registro capturado en el
/// teléfono. Nacieron en la bitácora (la pantalla que mejor le habla al usuario
/// cuando no hay señal) y se sacaron aquí para que el pase de lista diga lo
/// mismo con las mismas palabras y colores.
///
/// Son [AppBadge] con tono e ícono fijos: el color avisa de lejos, el ícono
/// lo dice a quien no distingue colores y el TEXTO es lo que lee TalkBack.
abstract final class InsigniaSync {
  /// Guardado en el teléfono, esperando subir. Ámbar: no está mal, pero
  /// todavía no lo ve nadie más. [texto] permite la versión larga del pase de
  /// lista ("Guardado en el teléfono · se sube después").
  static Widget porSubir({String texto = 'Por subir'}) => AppBadge(texto,
      tone: BadgeTone.warning, icon: Icons.cloud_upload_outlined);

  /// Ya está en la nube.
  static Widget subido({String texto = 'Subido'}) =>
      AppBadge(texto, tone: BadgeTone.success, icon: Icons.cloud_done_outlined);

  /// El servidor no lo aceptó y no se va a reintentar solo.
  static Widget noSeSubio({String texto = 'No se subió'}) =>
      AppBadge(texto, tone: BadgeTone.danger, icon: Icons.cloud_off_outlined);
}
