import 'package:constructorpro/domain/numeros.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  test('lo que escribe la gente en México', () {
    expect(leerNumero('1500'), 1500);
    expect(leerNumero('1,500'), 1500);
    expect(leerNumero(r'$1,500.50'), 1500.5);
    expect(leerNumero(r' $ 12,345,678 '), 12345678);
    expect(leerNumero('16 %'), 16);
    expect(leerNumero('0.5'), 0.5);
    expect(leerNumero('-250'), -250);
  });

  test('coma decimal de teclado en otro idioma', () {
    expect(leerNumero('12,5'), 12.5);
    expect(leerNumero('3,75'), 3.75);
  });

  test('lo que no es un número da null (no 0)', () {
    for (final malo in ['', '   ', 'abc', '1,5,0', '12,34,567', '1.2.3', r'$', null]) {
      expect(leerNumero(malo), isNull, reason: '«$malo»');
    }
  });

  test('número para editar sin «.0»', () {
    expect(numeroParaEditar(3500), '3500');
    expect(numeroParaEditar(583.33), '583.33');
    expect(numeroParaEditar(12.5), '12.5');
    expect(numeroParaEditar(null), '');
  });
}
