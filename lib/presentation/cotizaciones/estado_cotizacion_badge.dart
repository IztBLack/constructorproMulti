import 'package:flutter/material.dart';

import '../common/app_badge.dart';

/// Etiqueta y tono de cada estado de cotización, portados 1:1 de
/// `web/src/app/admin/cotizaciones/filtro-estado.tsx`.
///
/// Que la tabla viva en un solo lugar es lo que evita que "Enviada" salga
/// naranja en la lista y azul en el detalle —que es lo que pasaba cuando cada
/// pantalla elegía su propio `Colors.*`— y lo que hace que el mismo estado se
/// vea igual en el teléfono y en la computadora.
const _etiquetas = <String, String>{
  'BORRADOR': 'Borrador',
  'ENVIADA': 'Enviada',
  'ACEPTADA': 'Aceptada',
  'RECHAZADA': 'Rechazada',
  'CONVERTIDA': 'Convertida',
};

const _tonos = <String, BadgeTone>{
  'BORRADOR': BadgeTone.neutral,
  'ENVIADA': BadgeTone.info,
  'ACEPTADA': BadgeTone.success,
  'RECHAZADA': BadgeTone.danger,
  'CONVERTIDA': BadgeTone.accent,
};

/// Ícono de refuerzo para los estados que cierran el ciclo. Los intermedios van
/// sin ícono a propósito: marcarlos todos quita peso justo a los dos que el
/// usuario necesita distinguir de un vistazo.
const _iconos = <String, IconData>{
  'ACEPTADA': Icons.check_circle_outline,
  'RECHAZADA': Icons.cancel_outlined,
  'CONVERTIDA': Icons.swap_horiz,
};

/// Estados en el orden en que avanza una cotización, idéntico al arreglo
/// `ESTADOS` de la web. El orden es el del ciclo de vida y no alfabético: el
/// filtro de la lista se lee como una línea de tiempo, no como un diccionario.
const estadosCotizacion = <String>[
  'BORRADOR',
  'ENVIADA',
  'ACEPTADA',
  'RECHAZADA',
  'CONVERTIDA',
];

/// Nombre legible del estado. Expuesto —en vez de dejar la tabla encerrada en
/// el badge— para que el filtro de la lista no tenga que escribir "Borrador"
/// por su cuenta: dos copias de la misma tabla se desincronizan a la primera.
String etiquetaEstadoCotizacion(String estado) => _etiquetas[estado] ?? estado;

/// Insignia del estado de una cotización.
class EstadoCotizacionBadge extends StatelessWidget {
  const EstadoCotizacionBadge(this.estado, {super.key});

  final String estado;

  @override
  Widget build(BuildContext context) {
    return AppBadge(
      _etiquetas[estado] ?? estado,
      tone: _tonos[estado] ?? BadgeTone.neutral,
      icon: _iconos[estado],
    );
  }
}
