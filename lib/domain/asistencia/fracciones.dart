/// Vocabulario ÚNICO para marcar asistencia en el móvil.
///
/// Antes cada pantalla tenía el suyo: el pase de lista decía `F ½ ¾ ✓`, el
/// detalle de la obra `Falta ½ ¾ Completo`, la tabla semanal `— ½ ¾ 1` y los
/// diálogos `Falta / ½ día / ¾ día / Día completo`. Quien pasaba de una pantalla
/// a otra tenía que volver a aprender qué significaba cada botón, y TalkBack
/// leía "efe" en vez de "Falta".
///
/// ESPEJO de `web/src/lib/asistencia/fracciones.ts` (`OPCIONES` y
/// `etiquetaFraccion`). `test/domain/asistencia/fracciones_test.dart` lee ese
/// archivo y falla si los valores, los símbolos o las etiquetas dejan de
/// coincidir: el residente tiene que leer lo mismo en el celular que en la
/// oficina.
///
/// Módulo PURO (sin Flutter ni Drift).
library;

/// Una de las cuatro formas de marcar el día de una persona.
class OpcionFraccion {
  const OpcionFraccion({
    required this.valor,
    required this.simbolo,
    required this.etiqueta,
  });

  /// Lo que se guarda en `asistencias.fraccion` y suma la nómina.
  final double valor;

  /// Lo que cabe en un botón o en una celda de la tabla semanal.
  final String simbolo;

  /// Lo que se lee en voz alta y en los textos largos.
  final String etiqueta;
}

/// Las opciones en el orden en que se dibujan (de menos a más jornada).
const List<OpcionFraccion> opcionesFraccion = [
  OpcionFraccion(valor: 0, simbolo: '·', etiqueta: 'Falta'),
  OpcionFraccion(valor: 0.5, simbolo: '½', etiqueta: 'Medio'),
  OpcionFraccion(valor: 0.75, simbolo: '¾', etiqueta: 'Tres cuartos'),
  OpcionFraccion(valor: 1, simbolo: '1', etiqueta: 'Completo'),
];

/// La opción de [f]. Un valor fuera del catálogo (no debería existir: el
/// servidor solo acepta estos cuatro) cae en "Falta", igual que
/// `etiquetaFraccion` de la web.
OpcionFraccion opcionDeFraccion(double f) => opcionesFraccion.firstWhere(
      (o) => o.valor == f,
      orElse: () => opcionesFraccion.first,
    );

/// Símbolo corto de [f] (`·`, `½`, `¾`, `1`). Gemelo de `etiquetaFraccion` de la web.
String simboloFraccion(double f) => opcionDeFraccion(f).simbolo;

/// Nombre legible de [f] (`Falta`, `Medio`, `Tres cuartos`, `Completo`): el
/// que va en textos largos y en la etiqueta del lector de pantalla. (No se
/// llama `etiquetaFraccion` porque en la web ese nombre devuelve el SÍMBOLO.)
String nombreFraccion(double f) => opcionDeFraccion(f).etiqueta;
