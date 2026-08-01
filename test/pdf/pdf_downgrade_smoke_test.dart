// Throwaway smoke test: verifies PdfService still produces valid, non-empty
// PDF bytes after downgrading `pdf` 3.13->3.12 and `printing` 5.15->5.12 to
// unblock the `excel` package. Delete after confirming (see QA task).
import 'package:flutter_test/flutter_test.dart';
import 'package:intl/date_symbol_data_local.dart';
import 'package:constructorpro/pdf/pdf_service.dart';
import 'package:constructorpro/domain/logic/flujo_calculator.dart';

void main() {
  // `estadoCuentaCliente` formatea fechas con `Fmt.date` (locale es_MX), que
  // exige inicializar los datos de locale antes de usarse.
  setUpAll(() => initializeDateFormatting('es_MX'));

  test('flujoCajaGlobal produce bytes PDF válidos y no vacíos', () async {
    final bytes = await PdfService.flujoCajaGlobal(
      porObra: const [
        (
          obra: 'Obra Demo',
          resumen: ResumenCaja(totalEntradas: 1000, totalSalidas: 400),
        ),
      ],
      global: const ResumenCaja(totalEntradas: 1000, totalSalidas: 400),
    );

    expect(bytes, isNotEmpty);
    // Firma de cabecera de un PDF válido.
    final header = String.fromCharCodes(bytes.take(5));
    expect(header, '%PDF-');
  });

  test('estadoCuentaCliente produce bytes PDF válidos y no vacíos', () async {
    final bytes = await PdfService.estadoCuentaCliente(
      obraNombre: 'Casa Bienestar',
      cliente: 'Juan Pérez',
      costoTotal: 100000,
      recibido: 60000,
      pendiente: 40000,
      // Solo entradas (pagos recibidos): el método no admite salidas.
      pagos: const [
        (fecha: 1704067200000, concepto: 'Anticipo', monto: 40000),
        (fecha: 1706745600000, concepto: 'Segundo pago', monto: 20000),
      ],
    );

    expect(bytes, isNotEmpty);
    final header = String.fromCharCodes(bytes.take(5));
    expect(header, '%PDF-');
  });
}
