// Throwaway smoke test: verifies PdfService still produces valid, non-empty
// PDF bytes after downgrading `pdf` 3.13->3.12 and `printing` 5.15->5.12 to
// unblock the `excel` package. Delete after confirming (see QA task).
import 'package:flutter_test/flutter_test.dart';
import 'package:constructorpro/pdf/pdf_service.dart';
import 'package:constructorpro/domain/logic/flujo_calculator.dart';

void main() {
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
}
