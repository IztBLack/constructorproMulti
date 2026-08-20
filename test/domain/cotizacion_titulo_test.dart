import 'package:constructorpro/domain/cotizacion_titulo.dart';
import 'package:flutter_test/flutter_test.dart';

/// Espejo de `web/src/lib/cotizacion/titulo.test.ts`: los mismos casos, para que
/// la cascada de respaldo no se separe entre las dos plataformas.
void main() {
  test('usa el nombre del proyecto cuando lo hay', () {
    expect(
      tituloCotizacion(
          nombreProyecto: 'Casa 2 recámaras', ubicacion: 'Santa Rita'),
      'Casa 2 recámaras',
    );
  });

  test('cae a la ubicación cuando el proyecto va sin nombre', () {
    expect(
      tituloCotizacion(nombreProyecto: '', ubicacion: 'Santa Rita'),
      'Santa Rita',
    );
  });

  test('cae al cliente cuando no hay proyecto ni ubicación', () {
    expect(
      tituloCotizacion(nombreProyecto: '', ubicacion: '', cliente: 'Sra. Pérez'),
      'Sra. Pérez',
    );
  });

  test('trata los espacios en blanco como vacío', () {
    expect(
      tituloCotizacion(nombreProyecto: '   ', ubicacion: 'Santa Rita'),
      'Santa Rita',
    );
  });

  test('sin ningún dato, rótulo genérico', () {
    expect(tituloCotizacion(), 'Cotización sin nombre');
  });
}
